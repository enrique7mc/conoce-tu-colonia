#!/usr/bin/env python3
"""Aggregate FGJ carpetas into per-colonia crime features.

Input:   data/raw/safety/carpetas_fgj/carpetasFGJ_acumulado_2025_01.csv  (~2.1M rows)
Spine:   data/processed/colonias_base.geojson
Output:  data/processed/crime_by_colonia.csv        (one row per colonia_id)

Design notes
------------
* Date field = ``fecha_inicio`` (case opened).  ``fecha_hecho`` is dirty —
  year values leak back to 1906 and earlier — whereas ``fecha_inicio`` is
  clean (3 nulls out of 2.1M, range 2016-01 .. 2024-10).
* Anchor = max(fecha_inicio).  "Last 12 months" is computed relative to the
  data's own most recent date, not today's calendar date — the FGJ data
  currently stops on 2024-10-25.
* Join key = (normalized ``alcaldia_hecho``, ``colonia_catalogo``) pair.
  ``alcaldia_catalogo`` is 99% null and unusable.  For the ~10% of pairs
  where the FGJ alcaldía conflicts with the spine alcaldía for a given
  colonia name (e.g. Tacubaya lives in Miguel Hidalgo in the catálogo but
  crimes there are logged under Benito Juárez), we fall back to
  unique-name match.
* Tags are overlapping facets, not exclusive buckets.  "ROBO DE VEHICULO"
  tags both ``robbery`` and ``property``.  ``DELITO DE BAJO IMPACTO`` is
  ~81% of all rows, so ``crime_total`` is dominated by low-impact entries;
  use ``crime_violent`` or the specific tag columns for severity-weighted
  scoring.

Run:
    python3 scripts/03_process_crime.py
"""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "safety" / "carpetas_fgj" / "carpetasFGJ_acumulado_2025_01.csv"
SPINE = ROOT / "data" / "processed" / "colonias_base.geojson"
OUT = ROOT / "data" / "processed" / "crime_by_colonia.csv"

READ_COLUMNS = [
    "fecha_inicio", "delito", "categoria_delito",
    "colonia_catalogo", "alcaldia_hecho",
]

# Tags are matched against the joined, unaccented, upper-cased text of
# ``categoria_delito`` + ``delito``.  We must check both because each field
# captures different things:
#   * ``categoria_delito`` is the clean FGJ classification — it has the exact
#     labels ``HOMICIDIO DOLOSO``, ``LESIONES DOLOSAS``, etc.
#   * ``delito`` has the granular crime subtype — "HOMICIDIO POR ARMA DE
#     FUEGO", "ROBO A TRANSEUNTE EN VIA PUBLICA CON VIOLENCIA", etc.  It's
#     where we discriminate robbery subtypes, fraud variants, and so on.
#
# NOTE: culposo (manslaughter / negligent) homicide is intentionally excluded
# from ``violent`` and ``homicide``.  The delito strings ``HOMICIDIO POR
# ARMA DE FUEGO`` / ``HOMICIDIO POR ARMA BLANCA`` are intentional — but we
# anchor on ``categoria_delito == HOMICIDIO DOLOSO`` to be unambiguous.
TAG_RULES = {
    "robbery":  r"\bROBO\b",
    "theft":    r"ROBO (?:A TRANSE|A NEGOCIO|DE OBJETOS)",
    "violent":  r"(?:HOMICIDIO DOLOSO|FEMINICIDIO|LESIONES DOLOSAS|VIOLACION|SECUESTRO)",
    "homicide": r"(?:HOMICIDIO DOLOSO|\bFEMINICIDIO\b)",
    "property": r"(?:DANO EN PROPIEDAD|ROBO DE VEHICULO|ROBO DE MOTOCICLETA|"
                r"ROBO A CASA HABITACION|ROBO DE ACCESORIOS|"
                r"ROBO DE OBJETOS DEL INTERIOR)",
    "fraud":    r"(?:FRAUDE|EXTORSION|ABUSO DE CONFIANZA|USURPACION DE IDENTIDAD)",
    "sexual":   r"(?:VIOLACION|ABUSO SEXUAL|ACOSO SEXUAL|HOSTIGAMIENTO SEXUAL|PEDERAST)",
    "domestic": r"VIOLENCIA FAMILIAR",
    "threats":  r"AMENAZAS",
    "drugs":    r"NARCOMENUDEO",
}


def unaccent(s: str) -> str:
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode("ascii")


def norm_alc(s) -> str | None:
    if pd.isna(s):
        return None
    return unaccent(str(s)).upper().strip()


def build_spine_lookups(base: gpd.GeoDataFrame) -> tuple[dict, dict]:
    alc_key = base["alcaldia_name"].map(norm_alc)
    col_key = base["colonia_name"].str.strip()
    pair_to_id = dict(zip(zip(alc_key, col_key), base["colonia_id"]))
    # Unique-name fallback: only colonias whose name is unique citywide.
    counts = col_key.value_counts()
    unique_names = counts[counts == 1].index
    unique_to_id = (
        base.set_index(col_key)
            .loc[unique_names, "colonia_id"]
            .to_dict()
    )
    return pair_to_id, unique_to_id


def resolve_colonia_ids(df: pd.DataFrame, pair_to_id, unique_to_id) -> pd.Series:
    alc = df["alcaldia_hecho"].map(norm_alc)
    col = df["colonia_catalogo"].astype("string").str.strip()
    keys = list(zip(alc, col))
    ids = pd.Series([pair_to_id.get(k) for k in keys], index=df.index, dtype="object")
    miss = ids.isna() & col.notna()
    ids.loc[miss] = col.loc[miss].map(unique_to_id)
    return ids


def tag_by_category(delito: pd.Series, categoria: pd.Series) -> pd.DataFrame:
    """Apply tag rules to the joined ``categoria_delito`` + ``delito`` text.

    Applying ~10 regexes over 2M rows directly is slow.  We build a composite
    string per row, categoricalise it (~400 distinct combinations), run each
    regex once per category, then gather back onto row indices.
    """
    def _norm(s: pd.Series) -> pd.Series:
        return s.fillna("").astype("string").map(lambda v: unaccent(v).upper())

    combined = _norm(categoria) + " | " + _norm(delito)
    cat = pd.Categorical(combined)
    cat_names = pd.Series(cat.categories, dtype="string")
    codes = cat.codes

    out = {}
    for tag, pattern in TAG_RULES.items():
        per_cat = cat_names.str.contains(pattern, regex=True, na=False).to_numpy()
        out[f"tag_{tag}"] = per_cat[codes].astype(np.uint8)
    return pd.DataFrame(out)


def aggregate_window(df: pd.DataFrame, lo, hi, suffix: str) -> pd.DataFrame:
    mask = (df["fecha_inicio"] >= lo) & (df["fecha_inicio"] < hi) & df["colonia_id"].notna()
    sub = df.loc[mask]
    agg_cols = {"total": ("delito", "size")}
    for c in sub.columns:
        if c.startswith("tag_"):
            agg_cols[c[len("tag_"):]] = (c, "sum")
    grouped = sub.groupby("colonia_id").agg(**agg_cols)
    grouped.columns = [f"crime_{c}_{suffix}" for c in grouped.columns]
    return grouped


def main() -> int:
    print("loading spine ...")
    base = gpd.read_file(SPINE)
    pair_to_id, unique_to_id = build_spine_lookups(base)
    print(f"  spine        : {len(base):,} colonias")
    print(f"  unique names : {len(unique_to_id):,}  (available for fallback)")

    print("loading carpetas ...")
    df = pd.read_csv(RAW, usecols=READ_COLUMNS, low_memory=False)
    print(f"  rows : {len(df):,}")

    df["fecha_inicio"] = pd.to_datetime(df["fecha_inicio"], errors="coerce")
    df = df.dropna(subset=["fecha_inicio"]).reset_index(drop=True)
    anchor = df["fecha_inicio"].max().normalize()
    last12 = anchor - pd.Timedelta(days=365)
    prior12 = anchor - pd.Timedelta(days=730)
    print(f"  anchor (max fecha_inicio) : {anchor.date()}")
    print(f"  last 12mo  : [{last12.date()}, {anchor.date()})")
    print(f"  prior 12mo : [{prior12.date()}, {last12.date()})")

    print("resolving colonia IDs ...")
    df["colonia_id"] = resolve_colonia_ids(df, pair_to_id, unique_to_id)
    resolved = df["colonia_id"].notna()
    null_col = df["colonia_catalogo"].isna()
    print(f"  resolved   : {resolved.sum():,} / {len(df):,}  "
          f"({resolved.mean()*100:.1f}%)")
    print(f"  null colonia_catalogo : {null_col.sum():,}")
    print(f"  unmatched name        : {(~resolved & ~null_col).sum():,}")

    print("tagging delito categories ...")
    df = pd.concat(
        [df, tag_by_category(df["delito"], df["categoria_delito"])],
        axis=1,
    )

    print("aggregating windows ...")
    last = aggregate_window(df, last12, anchor, "last12mo")
    prior = aggregate_window(df, prior12, last12, "prior12mo")
    joined = last.join(prior, how="outer")

    # For colonias with zero in the prior window, trend_pct is undefined.
    prior_total = joined.get("crime_total_prior12mo", pd.Series(0, index=joined.index))
    last_total = joined.get("crime_total_last12mo", pd.Series(0, index=joined.index))
    joined["crime_trend_pct"] = np.where(
        prior_total > 0,
        ((last_total - prior_total) / prior_total) * 100,
        np.nan,
    )

    # Full-outer join to the spine so every colonia gets a row (zero-filled).
    spine_cols = base[["colonia_id", "colonia_name", "alcaldia_name"]].set_index("colonia_id")
    full = spine_cols.join(joined, how="left")
    zero_cols = [c for c in full.columns if c.startswith("crime_") and c != "crime_trend_pct"]
    full[zero_cols] = full[zero_cols].fillna(0).astype(int)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    full.to_csv(OUT)
    print(f"\nwrote {OUT.relative_to(ROOT)}  "
          f"({OUT.stat().st_size/1024:.1f} KB, {len(full)} rows)\n")

    print("=== sanity ===")
    print(f"colonias in output         : {len(full):,}")
    print(f"colonias with 0 crime l12m : {(full['crime_total_last12mo'] == 0).sum():,}")
    print(f"citywide crime l12m        : {full['crime_total_last12mo'].sum():,}")
    print(f"citywide violent l12m      : {full['crime_violent_last12mo'].sum():,}")
    print(f"citywide homicide l12m     : {full['crime_homicide_last12mo'].sum():,}")
    print(f"citywide sexual l12m       : {full['crime_sexual_last12mo'].sum():,}")

    print("\ntop 5 by total crime (last 12mo):")
    top = full.nlargest(5, "crime_total_last12mo")[
        ["colonia_name", "alcaldia_name", "crime_total_last12mo",
         "crime_violent_last12mo", "crime_trend_pct"]
    ]
    print(top.to_string())

    print("\ntop 5 by violent crime (last 12mo):")
    vtop = full.nlargest(5, "crime_violent_last12mo")[
        ["colonia_name", "alcaldia_name", "crime_violent_last12mo",
         "crime_homicide_last12mo", "crime_total_last12mo"]
    ]
    print(vtop.to_string())

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
