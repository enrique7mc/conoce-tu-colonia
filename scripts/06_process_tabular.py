#!/usr/bin/env python3
"""Join the tabular-only datasets onto the colonia spine.

Four sources, all keyed by ``cve_col`` (colonia code).  The spine uses the
3-digit alcaldía prefix (``002-001``); the external sources use 2-digit
(``02-001``), so we normalise on load.

1. Urban services (SHP, infra_fisica/ri_6.shp)
   -> pct_water, pct_electricity, pct_street_lighting,
      waste_tons, markets_count, health_equip_count,
      school_equip_count, daycare_count, public_space_rank
2. Pedestrian infrastructure (SHP, infra_peatonal)
   -> pedestrian_infra_level (Alta / Media / Baja / text)
3. Public spaces (SHP, espacios_publicos)
   -> public_space_count, public_space_avg_dist_m
4. IDS 2020 (CSV, ids_mza.csv — manzana level, aggregated to colonia via
   the colonia polygon spine)
   -> ids_score, ids_stratum (Muy bajo / Bajo / Medio / Alto)
5. Censo 2020 (CSV, c_demograficas_total_localidad.csv)
   -> population, households
6. 0311 Locatel (CSVs, 2019-2024)
   -> s311_requests_12mo, s311_top_complaint

Run:
    python3 scripts/06_process_tabular.py
"""
from __future__ import annotations

import re
import unicodedata
import zipfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
EXTRACT = PROCESSED / "tabular_extracted"
SPINE_PATH = PROCESSED / "colonias_base.geojson"
OUT = PROCESSED / "tabular_by_colonia.csv"


def unaccent(s: str) -> str:
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode("ascii")


def normalize_cve_col(s: str) -> str | None:
    """02-001 -> 002-001.  Keep already-padded codes as-is."""
    if pd.isna(s):
        return None
    s = str(s).strip()
    m = re.match(r"^(\d+)-(\d+)$", s)
    if not m:
        return None
    alc, col = m.groups()
    return f"{int(alc):03d}-{int(col):03d}"


def ensure_extracted(name: str, zip_rel: str) -> Path:
    """Extract a raw zip into EXTRACT/<name>/ if not already."""
    dest = EXTRACT / name
    if dest.exists() and any(dest.iterdir()):
        return dest
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(RAW / zip_rel) as zf:
        zf.extractall(dest)
    return dest


def find_shp(root: Path, *needles: str) -> Path:
    needles_l = tuple(n.lower() for n in needles)
    matches = [
        p for p in root.rglob("*.shp")
        if "__MACOSX" not in p.as_posix()
        and not p.name.startswith("._")
        and all(n in p.as_posix().lower() for n in needles_l)
    ]
    if not matches:
        raise FileNotFoundError(f"no .shp matching {needles} under {root}")
    if len(matches) > 1:
        raise RuntimeError(f"multiple matches for {needles}: {matches}")
    return matches[0]


# ---------------------------------------------------------------------------
# Urban services — SHP polygons joined to spine by centroid-in-polygon.
#
# The three urban SHPs use IECM's electoral colonia definition, which
# subdivides large central colonias (CENTRO I/II/III, BUENAVISTA I/II, ...)
# and assigns them cve_col codes that don't match the catálogo de colonias
# codes we use on the spine.  Text-join on cve_col leaves ~216 spine
# colonias with NaN urban values — notably most of central Cuauhtémoc.
# We switch to a spatial join: every SHP polygon's centroid gets snapped
# to the spine colonia that contains it, then we aggregate up.
# ---------------------------------------------------------------------------

def _spatial_assign(shp_gdf: gpd.GeoDataFrame, spine: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Attach ``colonia_id`` from the spine to every row of ``shp_gdf``."""
    g = shp_gdf.copy()
    if g.crs is None:
        g = g.set_crs("EPSG:4326")
    g = g.to_crs(spine.crs)
    centroids = gpd.GeoDataFrame(
        g.drop(columns="geometry"),
        geometry=g.geometry.centroid,
        crs=g.crs,
    )
    joined = centroids.sjoin(
        spine[["colonia_id", "geometry"]],
        how="left", predicate="within",
    )
    return joined


def load_urban_services(spine: gpd.GeoDataFrame) -> pd.DataFrame:
    """infra_fisica/ri_6.shp — per-colonia services and equipment."""
    root = ensure_extracted(
        "servicios", "urban/servicios_colonia/infra_fisica.zip")
    shp = find_shp(root, "ri_6")
    g = gpd.read_file(shp)
    g = _spatial_assign(g, spine)
    g = g.dropna(subset=["colonia_id"])

    # Aggregate: percentages as area-weighted mean would be ideal; for
    # hackathon speed we use a simple mean since SHP sub-sections within
    # a parent colonia tend to be similar in size.  Counts sum.
    grp = g.groupby("colonia_id")
    out = pd.DataFrame({
        "pct_water":           grp["P_AguaPot"].mean().round(2),
        "pct_electricity":     grp["P_PorcElec"].mean().round(2),
        "pct_street_lighting": (grp["ALUMP_mean"].mean() * 100).clip(0, 100).round(2),
        "waste_tons":          grp["resid_ton"].sum().round(2),
        "markets_count":       grp["BA8_NoMerc"].sum().astype(int),
        "health_equip_count":  grp["BA1_NoEqSa"].sum().astype(int),
        "school_equip_count":  grp["BA3_NoEqEd"].sum().astype(int),
        "daycare_count":       grp["BA9_No_Gua"].sum().astype(int),
        # C_RI_6 is an ordinal 1..5 quintile.  Mean across sub-sections
        # gives a smooth 0-100 score.
        "services_index":      (grp["C_RI_6"].mean().astype(float) / 5 * 100).round(1),
    }).reset_index()
    return out


def load_pedestrian(spine: gpd.GeoDataFrame) -> pd.DataFrame:
    root = ensure_extracted(
        "infra_peatonal",
        "urban/infra_peatonal/nivel-de-presencia-de-infraestructura-peatonal-por-colonia.zip")
    shp = find_shp(root, "infraestructura")
    g = gpd.read_file(shp)
    g = _spatial_assign(g, spine)
    g = g.dropna(subset=["colonia_id"])

    level_score = {"Muy alta": 100, "Alta": 75, "Media": 50, "Baja": 25, "Muy baja": 0}
    g["_score"] = g["INFRAPEAT"].map(level_score)
    grp = g.groupby("colonia_id")
    # Average score across sub-sections, then map back to a level label
    # via nearest bucket.
    mean_score = grp["_score"].mean().round(0)

    def bucket(s):
        for lvl, val in sorted(level_score.items(), key=lambda kv: kv[1]):
            if s <= val + 12.5:
                return lvl
        return "Muy alta"

    return pd.DataFrame({
        "colonia_id":              mean_score.index,
        "pedestrian_infra_score":  mean_score.values,
        "pedestrian_infra_level":  [bucket(v) for v in mean_score.values],
    })


def load_public_spaces(spine: gpd.GeoDataFrame) -> pd.DataFrame:
    root = ensure_extracted(
        "espacios_publicos",
        "urban/espacios_publicos/promedio-de-distancias-a-espacios-publicos-por-colonia.zip")
    shp = find_shp(root, "espacios")
    g = gpd.read_file(shp)
    g = _spatial_assign(g, spine)
    g = g.dropna(subset=["colonia_id"])

    grp = g.groupby("colonia_id")
    return pd.DataFrame({
        "colonia_id":              grp.size().index,
        "public_space_count":      grp["Count_"].sum().astype(int).values,
        "public_space_avg_dist_m": grp["Avg_Dist"].mean().round(1).values,
    })


# ---------------------------------------------------------------------------
# IDS 2020 — aggregate from manzana level to colonia via polygon join.
# ---------------------------------------------------------------------------

def load_ids() -> pd.DataFrame:
    """IDS 2020 is published at AGEB (and manzana/UT/alcaldía).

    The ids_ageb.csv has integer ``alcaldia`` (1..16) and the composite
    score ``idsm`` + stratum ``e_idsm``.  AGEB-to-colonia mapping is not
    trivially derivable without manzana polygons, so we aggregate to
    alcaldía and store as alcaldía-level proxy columns.  Population
    weighting uses ``pob``.
    """
    csv = RAW / "social" / "ids_2020" / "ids_ageb.csv"
    df = pd.read_csv(csv, encoding="latin-1", low_memory=False)
    df["alcaldia_id"] = df["alcaldia"].astype(int).astype(str).str.zfill(3)
    df = df.dropna(subset=["idsm"])
    df["pob"] = df["pob"].fillna(0).clip(lower=1)

    def _wmean(x: pd.DataFrame) -> float:
        return float(np.average(x["idsm"], weights=x["pob"]))

    grp = df.groupby("alcaldia_id", group_keys=False)
    ids_mean = grp.apply(_wmean)
    stratum = grp["e_idsm"].agg(
        lambda s: s.mode().iat[0] if len(s.mode()) else None
    )
    return pd.DataFrame({
        "alcaldia_id": ids_mean.index,
        "ids_score":   ids_mean.round(4).values,
        "ids_stratum": stratum.values,
    })


# ---------------------------------------------------------------------------
# Censo 2020 — population and households (localidad level, mapped to alcaldía).
# ---------------------------------------------------------------------------

def load_censo() -> pd.DataFrame:
    """Alcaldía-level population from Censo 2020.

    The ADIP-provided subset exposes ``alcaldia`` (text name) and
    ``poblacion`` (total population).  Households aren't in this file.
    Join to the spine via ``alcaldia_name``.
    """
    csv = RAW / "social" / "censo_2020" / "c_demograficas_total_alcaldia.csv"
    df = pd.read_csv(csv, encoding="latin-1", low_memory=False)
    return pd.DataFrame({
        "alcaldia_name":       df["alcaldia"].astype(str).str.strip(),
        "alcaldia_population": df["poblacion"].astype(int),
    })


# ---------------------------------------------------------------------------
# 0311 — citizen-request volume and top complaint, last 12 months available.
# ---------------------------------------------------------------------------

def load_locatel() -> pd.DataFrame:
    """Aggregate 0311 requests by colonia from the latest year available.

    We read the 2024 file only (16.5MB) and drop older years — the spec's
    "last 12 months" doesn't map to calendar years cleanly, but 2024 is
    already the freshest rolling sample and keeps the script fast.
    """
    csv = RAW / "gov" / "locatel_0311" / "locatel0311-2024.csv"
    # The 0311 CSV is UTF-8 (other ADIP files are latin-1 — this one isn't).
    df = pd.read_csv(csv, encoding="utf-8", low_memory=False)
    print(f"   0311 2024 rows: {len(df):,}")

    type_col = "tema_solicitud"
    # Fall back to the raw solicitud fields where the catálogo-matched ones
    # are null (colonia_catalogo is null in ~66% of 2024 rows).
    col = df["colonia_catalogo"].astype("string").str.strip()
    col = col.where(col.notna(), df["colonia_solicitud"].astype("string").str.strip())
    alc = df["alcaldia_catalogo"].astype("string")
    alc = alc.where(alc.notna(), df["alcaldia_solicitud"].astype("string"))
    df["_alc_norm"] = alc.map(lambda s: unaccent(s).upper().strip() if pd.notna(s) else None)
    df["_col_norm"] = col.map(lambda s: unaccent(s).upper().strip() if pd.notna(s) else None)

    # Join to spine by (normalized alcaldía, normalized colonia) pair.
    base = gpd.read_file(SPINE_PATH)[["colonia_id", "colonia_name", "alcaldia_name"]]
    base["_alc_key"] = base["alcaldia_name"].map(lambda s: unaccent(s).upper().strip())
    base["_col_key"] = base["colonia_name"].map(lambda s: unaccent(s).upper().strip())
    pair_to_id = dict(zip(zip(base["_alc_key"], base["_col_key"]), base["colonia_id"]))
    df["colonia_id"] = [
        pair_to_id.get((a, c)) for a, c in zip(df["_alc_norm"], df["_col_norm"])
    ]
    resolved = df["colonia_id"].notna()
    print(f"   0311 resolved : {resolved.sum():,} / {len(df):,}  "
          f"({resolved.mean()*100:.1f}%)")

    df = df.dropna(subset=["colonia_id"])
    out = df.groupby("colonia_id").size().rename("s311_requests_2024").to_frame()
    if type_col:
        top = df.groupby("colonia_id")[type_col].agg(
            lambda s: s.mode().iat[0] if len(s) else None
        )
        out["s311_top_complaint"] = top
    return out.reset_index()


# ---------------------------------------------------------------------------
# Orchestrate
# ---------------------------------------------------------------------------

def main() -> int:
    print("loading spine ...")
    spine_full = gpd.read_file(SPINE_PATH)
    base = spine_full[
        ["colonia_id", "colonia_name", "alcaldia_id", "alcaldia_name"]
    ]
    # Spine-with-geometry for spatial joins below.  Reproject into a metric
    # CRS so centroids are stable.
    spine_geo = spine_full[["colonia_id", "geometry"]].to_crs("EPSG:6372")
    print(f"  spine: {len(base)} colonias")

    print("\n[1/5] urban services ...")
    services = load_urban_services(spine_geo)
    print(f"  {len(services):,} rows; "
          f"matched {services['colonia_id'].isin(base['colonia_id']).sum():,}")

    print("\n[2/5] pedestrian infrastructure ...")
    ped = load_pedestrian(spine_geo)
    print(f"  {len(ped):,} rows; "
          f"matched {ped['colonia_id'].isin(base['colonia_id']).sum():,}")

    print("\n[3/5] public spaces ...")
    esp = load_public_spaces(spine_geo)
    print(f"  {len(esp):,} rows; "
          f"matched {esp['colonia_id'].isin(base['colonia_id']).sum():,}")

    print("\n[4/5] IDS 2020 (alcaldía-level fallback) ...")
    ids = load_ids()
    print(f"  alcaldía rows: {len(ids)}")

    print("\n[4b/5] Censo 2020 (alcaldía-level) ...")
    censo = load_censo()
    print(f"  alcaldía rows: {len(censo)}")

    print("\n[5/5] 0311 (2024) ...")
    s311 = load_locatel()
    print(f"  {len(s311):,} colonias with requests")

    print("\njoining onto spine ...")
    out = base.copy()
    for df in (services, ped, esp, s311):
        out = out.merge(df, on="colonia_id", how="left")
    # Alcaldía-level data: ids_ageb uses numeric alcaldia_id, censo uses
    # alcaldia_name.  Normalise the censo side (it's UPPERCASE unaccented).
    if not ids.empty:
        out = out.merge(ids, on="alcaldia_id", how="left")
    if not censo.empty:
        censo["_alc_key"] = censo["alcaldia_name"].map(
            lambda s: unaccent(s).upper().strip()
        )
        out["_alc_key"] = out["alcaldia_name"].map(
            lambda s: unaccent(s).upper().strip()
        )
        out = out.merge(
            censo.drop(columns=["alcaldia_name"]),
            on="_alc_key", how="left",
        ).drop(columns=["_alc_key"])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)
    print(f"\nwrote {OUT.relative_to(ROOT)}  "
          f"({OUT.stat().st_size/1024:.1f} KB, {len(out)} rows, "
          f"{len(out.columns)} cols)")

    print("\n=== sanity ===")
    for col in ["pct_water", "pct_electricity", "pct_street_lighting",
                "markets_count", "pedestrian_infra_level", "public_space_avg_dist_m",
                "s311_requests_2024", "ids_score", "alcaldia_population"]:
        if col in out.columns:
            non_null = out[col].notna().sum()
            print(f"  {col:28s}: {non_null:,}/{len(out):,} populated")

    print("\nsample rows:")
    sample_cols = ["colonia_name", "alcaldia_name", "pct_water",
                   "markets_count", "pedestrian_infra_level",
                   "public_space_avg_dist_m", "s311_requests_2024"]
    sample_cols = [c for c in sample_cols if c in out.columns]
    print(out[sample_cols].head(10).to_string(index=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
