#!/usr/bin/env python3
"""Download raw datasets for Conoce tu Colonia from datos.cdmx.gob.mx.

Resolves each entry in the manifest below via the CKAN API
(either by known slug or by free-text search), picks the resources whose
format matches the filter, and downloads them to
    data/raw/<category>/<key>/<filename>

Zero external dependencies (stdlib only). Run:
    python3 scripts/01_download.py                    # everything
    python3 scripts/01_download.py --category safety  # one category
    python3 scripts/01_download.py --only ids_2020    # one or more keys
    python3 scripts/01_download.py --list             # print plan, no downloads

Metrobus GTFS static data already lives at data/raw/Metrobus_GTFS_ESTATICO_*/
and is intentionally not re-downloaded here (see the Metrobus en Vivo spec).
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

CKAN_BASE = "https://datos.cdmx.gob.mx/api/3/action"
ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
USER_AGENT = "conoce-tu-colonia-hackathon/1.0 (+https://datos.cdmx.gob.mx)"
REQUEST_TIMEOUT = 60          # seconds for CKAN metadata calls
DOWNLOAD_TIMEOUT = 600        # seconds for large file downloads
POLITE_DELAY = 0.3            # seconds between resource downloads


@dataclass
class Dataset:
    key: str
    category: str
    slug: str | None = None
    search: str | None = None
    # Resource format whitelist (uppercase). Empty means "take them all".
    formats: tuple[str, ...] = ()
    # Optional: substrings that must appear in resource name (lowercase match).
    name_hints: tuple[str, ...] = ()
    notes: str = ""


# Slugs below come from the URLs in CLAUDE_CODE_BRIEF.md.
# Where the brief said "search ...", we use the `search` field and resolve via
# CKAN package_search at runtime so we don't guess URLs.
MANIFEST: list[Dataset] = [
    # --- SPATIAL FOUNDATION ---
    Dataset(key="catalogo_colonias", category="spatial",
            slug="catalogo-de-colonias-datos-abiertos",
            formats=("GEOJSON", "SHP", "ZIP")),
    Dataset(key="alcaldias", category="spatial",
            search="alcaldias division geografica cdmx",
            formats=("GEOJSON", "SHP", "ZIP")),
    Dataset(key="manzanas", category="spatial",
            search="manzanas marco geoestadistico cdmx",
            formats=("GEOJSON", "SHP", "ZIP"),
            notes="Optional — large file, only needed for block-level heatmaps"),

    # --- SAFETY ---
    Dataset(key="carpetas_fgj", category="safety",
            slug="carpetas-de-investigacion-fgj-de-la-ciudad-de-mexico",
            formats=("CSV",)),
    Dataset(key="victimas_fgj", category="safety",
            slug="victimas-en-carpetas-de-investigacion-fgj",
            formats=("CSV",)),
    Dataset(key="hechos_transito_2024", category="safety",
            slug="hechos-de-transito-registrados-por-la-ssc-2024-serie-de-datos-ampliada-no-comparativa",
            formats=("CSV",)),
    Dataset(key="incidentes_viales_c5", category="safety",
            search="incidentes viales c5",
            formats=("CSV",)),

    # --- TRANSIT ---
    Dataset(key="metro_stations", category="transit",
            slug="lineas-y-estaciones-del-metro",
            formats=("SHP", "KMZ", "GEOJSON", "ZIP")),
    Dataset(key="metrobus_stations", category="transit",
            slug="geolocalizacion-metrobus",
            formats=("SHP", "GEOJSON", "ZIP")),
    Dataset(key="ste_stations", category="transit",
            slug="geolocalizacion-de-lineas-y-estaciones-paradas-del-servicio-de-transportes-electricos",
            formats=("SHP", "GEOJSON", "ZIP")),
    Dataset(key="ecobici_stations", category="transit",
            slug="cicloestaciones-ecobici-nuevo-sistema",
            formats=("SHP", "CSV", "GEOJSON", "ZIP")),
    Dataset(key="infra_ciclista", category="transit",
            slug="infraestructura-vial-ciclista",
            formats=("GEOJSON", "SHP", "ZIP")),

    # --- URBAN QUALITY & SERVICES ---
    Dataset(key="servicios_colonia", category="urban",
            slug="porcentaje-de-viviendas-con-servicios-basicos-y-numero-de-elementos-de-equipamiento-de-primer-nivel",
            formats=("CSV", "SHP", "GEOJSON", "ZIP"),
            notes="Data lives in the SHP zip (infra_fisica.zip); the CSV is only a dictionary"),
    Dataset(key="infra_peatonal", category="urban",
            search="infraestructura peatonal colonia",
            formats=("GEOJSON", "CSV", "SHP", "ZIP")),
    Dataset(key="espacios_publicos", category="urban",
            search="espacios publicos colonia",
            formats=("GEOJSON", "CSV", "SHP", "ZIP")),
    Dataset(key="valores_suelo", category="urban",
            slug="valores-unitarios-del-suelo-habitacional-habitacional-comercial-en-pesos-valor-promedio",
            formats=("SHP", "ZIP", "CSV"),
            notes="Código Fiscal CDMX zones with avg MXN/m² (5 tiers: Muy bajo..Muy alto) — affordability proxy"),

    # --- SOCIAL DEVELOPMENT ---
    Dataset(key="ids_2020", category="social",
            slug="indice-de-desarrollo-social-de-la-ciudad-de-mexico-2020",
            formats=("CSV",)),
    Dataset(key="censo_2020", category="social",
            search="censo 2020 poblacion cdmx",
            formats=("CSV",)),

    # --- GOVERNMENT RESPONSIVENESS ---
    Dataset(key="locatel_0311", category="gov",
            slug="0311",
            formats=("CSV",)),
]


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

_ssl_ctx = ssl.create_default_context()


def _open(url: str, *, timeout: int):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    return urllib.request.urlopen(req, timeout=timeout, context=_ssl_ctx)


def ckan_call(endpoint: str, params: dict) -> dict:
    qs = urllib.parse.urlencode(params)
    url = f"{CKAN_BASE}/{endpoint}?{qs}"
    with _open(url, timeout=REQUEST_TIMEOUT) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    if not body.get("success"):
        raise RuntimeError(f"CKAN {endpoint} failed: {body.get('error')}")
    return body["result"]


def resolve_package(ds: Dataset) -> dict:
    if ds.slug:
        try:
            return ckan_call("package_show", {"id": ds.slug})
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                raise
            print(f"  slug '{ds.slug}' returned 404, falling back to search")
    query = ds.search or ds.key.replace("_", " ")
    result = ckan_call("package_search", {"q": query, "rows": 5})
    hits = result.get("results") or []
    if not hits:
        raise LookupError(f"no CKAN match for query '{query}'")
    # Prefer the hit whose name most closely matches the query tokens.
    tokens = {t for t in re.split(r"\W+", query.lower()) if t}
    hits.sort(
        key=lambda p: sum(t in p.get("name", "") for t in tokens),
        reverse=True,
    )
    chosen = hits[0]
    print(f"  search '{query}' -> {chosen.get('name')}")
    return chosen


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

_SLUG_RE = re.compile(r"[^A-Za-z0-9._-]+")


def safe_filename(name: str) -> str:
    name = _SLUG_RE.sub("_", name).strip("._")
    return name or "file"


def filename_for(resource: dict) -> str:
    url = resource.get("url") or ""
    from_url = urllib.parse.urlparse(url).path.rsplit("/", 1)[-1]
    if from_url and "." in from_url:
        return safe_filename(urllib.parse.unquote(from_url))
    fmt = (resource.get("format") or "bin").lower()
    name = resource.get("name") or resource.get("id") or "resource"
    return f"{safe_filename(name)}.{fmt}"


def download(url: str, dest: Path) -> int:
    if dest.exists() and dest.stat().st_size > 0:
        return dest.stat().st_size
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with _open(url, timeout=DOWNLOAD_TIMEOUT) as resp, tmp.open("wb") as fh:
        shutil.copyfileobj(resp, fh, length=1 << 16)
    tmp.rename(dest)
    return dest.stat().st_size


def select_resources(pkg: dict, ds: Dataset) -> list[dict]:
    resources = pkg.get("resources") or []
    if ds.formats:
        allowed = {f.upper() for f in ds.formats}
        resources = [r for r in resources if (r.get("format") or "").upper() in allowed]
    if ds.name_hints:
        hints = [h.lower() for h in ds.name_hints]
        resources = [
            r for r in resources
            if any(h in (r.get("name") or "").lower() for h in hints)
        ]
    return resources


def human_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}TB"


def process(ds: Dataset) -> dict:
    print(f"\n[{ds.category}] {ds.key}")
    entry: dict = {"key": ds.key, "category": ds.category}
    try:
        pkg = resolve_package(ds)
    except Exception as exc:
        print(f"  !! resolve failed: {exc}")
        entry["status"] = "resolve_failed"
        entry["error"] = str(exc)
        return entry
    entry["slug"] = pkg.get("name")
    entry["title"] = pkg.get("title")
    entry["organization"] = (pkg.get("organization") or {}).get("title")
    print(f"  package: {pkg.get('name')} — {pkg.get('title')}")

    resources = select_resources(pkg, ds)
    if not resources:
        print(f"  !! no resources matched format filter {ds.formats}; listing all "
              f"{len(pkg.get('resources') or [])} available formats:")
        for r in pkg.get("resources") or []:
            print(f"      - {r.get('format')}: {r.get('name')}")
        entry["status"] = "no_matching_resources"
        return entry

    dest_dir = RAW_DIR / ds.category / ds.key
    downloaded: list[dict] = []
    for res in resources:
        url = res.get("url")
        if not url:
            continue
        fname = filename_for(res)
        dest = dest_dir / fname
        try:
            size = download(url, dest)
            rel = dest.relative_to(ROOT)
            print(f"    ok  {rel}  ({human_bytes(size)})  [{res.get('format')}]")
            downloaded.append({"url": url, "path": str(rel), "bytes": size,
                               "format": res.get("format"), "name": res.get("name")})
        except Exception as exc:
            print(f"    !!  {url}: {exc}")
            downloaded.append({"url": url, "error": str(exc),
                               "format": res.get("format"), "name": res.get("name")})
        time.sleep(POLITE_DELAY)
    entry["status"] = "ok"
    entry["resources"] = downloaded
    return entry


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n", 1)[0])
    ap.add_argument("--only", nargs="+", metavar="KEY",
                    help="Limit to these dataset keys")
    ap.add_argument("--category", choices=sorted({d.category for d in MANIFEST}),
                    help="Limit to a single category")
    ap.add_argument("--list", action="store_true",
                    help="Print the plan and exit without downloading")
    return ap.parse_args()


def select_targets(args: argparse.Namespace) -> list[Dataset]:
    targets = MANIFEST
    if args.category:
        targets = [d for d in targets if d.category == args.category]
    if args.only:
        wanted = set(args.only)
        targets = [d for d in targets if d.key in wanted]
        missing = wanted - {d.key for d in targets}
        if missing:
            sys.exit(f"unknown keys: {sorted(missing)}")
    return targets


def main() -> int:
    args = parse_args()
    targets = select_targets(args)
    if not targets:
        print("nothing to do")
        return 0
    if args.list:
        for d in targets:
            ident = d.slug or f"search: {d.search!r}"
            print(f"  [{d.category}] {d.key} <- {ident}")
        return 0

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    started = time.time()
    manifest_out = [process(d) for d in targets]
    elapsed = time.time() - started

    out_path = RAW_DIR / "_manifest.json"
    out_path.write_text(json.dumps(manifest_out, ensure_ascii=False, indent=2))

    ok = sum(1 for e in manifest_out if e.get("status") == "ok")
    failed = [e for e in manifest_out if e.get("status") != "ok"]
    print(f"\ndone in {elapsed:.1f}s — {ok}/{len(manifest_out)} datasets ok")
    if failed:
        print("unresolved:")
        for e in failed:
            print(f"  - {e['key']}: {e.get('status')} {e.get('error','')}")
    print(f"manifest: {out_path.relative_to(ROOT)}")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
