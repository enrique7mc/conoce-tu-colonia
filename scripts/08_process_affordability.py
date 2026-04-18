#!/usr/bin/env python3
"""Join CDMX "Valores Unitarios del Suelo" zones onto the colonia spine.

The raw shapefile contains 5 multipolygons — one per tier (Muy bajo, Bajo,
Medio, Alto, Muy alto) — published in the Código Fiscal CDMX.  Each tier
ships with a MXN/m² range in the ``VALOR`` field.  We:

1. Parse the range text into numeric low/high bounds.
2. Reproject to EPSG:32614 (UTM 14N, metric) so overlay areas are real m².
3. Intersect each tier polygon with every colonia polygon and measure the
   overlap area.
4. Per colonia, compute the area-weighted mean of the midpoint MXN/m².
   Also record the dominant tier (largest overlap area).

Colonias that don't overlap the zonal map at all (rural fringe, sparsely
surveyed parts of the south) come out NaN and the scoring script will
skip them.

Output
------
    data/processed/affordability_by_colonia.csv
    columns: colonia_id, land_value_mxn_per_m2, land_value_tier,
             land_value_coverage_pct

Run:
    python3 scripts/08_process_affordability.py
"""
from __future__ import annotations

import re
import tempfile
import zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW_ZIP = ROOT / "data" / "raw" / "urban" / "valores_suelo" / "vus_promedio-2.zip"
SPINE_PATH = ROOT / "data" / "processed" / "colonias_base.geojson"
EXTRACT = ROOT / "data" / "processed" / "valores_suelo_extracted"
OUT = ROOT / "data" / "processed" / "affordability_by_colonia.csv"

# Metric CRS for overlay area math (same zone used for metric buffers elsewhere).
METRIC_CRS = "EPSG:32614"

TIER_ORDER = ["Muy bajo", "Bajo", "Medio", "Alto", "Muy alto"]


def ensure_extracted() -> Path:
    if EXTRACT.exists() and any(EXTRACT.rglob("*.shp")):
        return EXTRACT
    EXTRACT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(RAW_ZIP) as zf:
        zf.extractall(EXTRACT)
    return EXTRACT


def parse_valor(text: str) -> tuple[float, float, float]:
    """'415 - 1,367' -> (415.0, 1367.0, 891.0)."""
    nums = re.findall(r"[\d,]+", str(text))
    if len(nums) < 2:
        raise ValueError(f"unparseable VALOR: {text!r}")
    lo = float(nums[0].replace(",", ""))
    hi = float(nums[1].replace(",", ""))
    return lo, hi, (lo + hi) / 2


def load_zones() -> gpd.GeoDataFrame:
    ensure_extracted()
    shp = next(
        p for p in EXTRACT.rglob("*.shp")
        if "__MACOSX" not in p.as_posix() and not p.name.startswith("._")
    )
    g = gpd.read_file(shp).to_crs(METRIC_CRS)
    lo, hi, mid = zip(*(parse_valor(v) for v in g["VALOR"]))
    g["value_low"] = lo
    g["value_high"] = hi
    g["value_mid"] = mid
    return g[["RANGOS", "VALOR", "value_low", "value_high", "value_mid", "geometry"]]


def main() -> int:
    print("loading zones ...")
    zones = load_zones()
    print(f"  {len(zones)} tiers: {list(zones['RANGOS'])}")
    print(f"  ranges MXN/m²: "
          + ", ".join(f"{t}=[{lo:.0f},{hi:.0f}]"
                      for t, lo, hi in zip(zones["RANGOS"], zones["value_low"], zones["value_high"])))

    print("loading spine ...")
    spine = gpd.read_file(SPINE_PATH).to_crs(METRIC_CRS)
    spine["_col_area_m2"] = spine.geometry.area
    print(f"  {len(spine)} colonias")

    print("overlaying ...")
    # GeoPandas overlay gives one row per (colonia × tier) intersection.
    parts = gpd.overlay(
        spine[["colonia_id", "_col_area_m2", "geometry"]],
        zones,
        how="intersection",
        keep_geom_type=True,
    )
    parts["_overlap_m2"] = parts.geometry.area
    print(f"  {len(parts):,} overlap pieces")

    # Weighted mean MXN/m² per colonia.
    parts["_weighted"] = parts["_overlap_m2"] * parts["value_mid"]
    grp = parts.groupby("colonia_id", as_index=False).agg(
        _weighted_sum=("_weighted", "sum"),
        _overlap_total=("_overlap_m2", "sum"),
        _col_area_m2=("_col_area_m2", "first"),
    )
    grp["land_value_mxn_per_m2"] = (grp["_weighted_sum"] / grp["_overlap_total"]).round(0)
    grp["land_value_coverage_pct"] = (
        grp["_overlap_total"] / grp["_col_area_m2"] * 100
    ).round(1)

    # Dominant tier = tier with the largest overlap area per colonia.
    tier_area = (
        parts.groupby(["colonia_id", "RANGOS"])["_overlap_m2"].sum().reset_index()
    )
    tier_area["_rank"] = tier_area.groupby("colonia_id")["_overlap_m2"].rank(
        method="first", ascending=False
    )
    dominant = tier_area[tier_area["_rank"] == 1][["colonia_id", "RANGOS"]]
    dominant = dominant.rename(columns={"RANGOS": "land_value_tier"})

    out = grp.merge(dominant, on="colonia_id", how="left")[
        ["colonia_id", "land_value_mxn_per_m2",
         "land_value_tier", "land_value_coverage_pct"]
    ]

    # Re-attach missing colonias as NaN so downstream merges stay aligned.
    missing = set(spine["colonia_id"]) - set(out["colonia_id"])
    if missing:
        pad = pd.DataFrame({
            "colonia_id": sorted(missing),
            "land_value_mxn_per_m2": pd.Series([pd.NA] * len(missing), dtype=out["land_value_mxn_per_m2"].dtype),
            "land_value_tier": pd.Series([pd.NA] * len(missing), dtype=object),
            "land_value_coverage_pct": [0.0] * len(missing),
        })
        out = pd.concat([out, pad], ignore_index=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)
    print(f"\nwrote {OUT.relative_to(ROOT)}  "
          f"({OUT.stat().st_size/1024:.1f} KB, {len(out)} rows)")

    # --- sanity ---
    print("\n=== sanity ===")
    filled = out["land_value_mxn_per_m2"].notna().sum()
    print(f"  populated: {filled:,}/{len(out):,} "
          f"({filled/len(out)*100:.1f}%)")
    vals = out["land_value_mxn_per_m2"].dropna()
    if not vals.empty:
        print(f"  MXN/m²   min={vals.min():.0f}  median={vals.median():.0f}  "
              f"mean={vals.mean():.0f}  max={vals.max():.0f}")
    print(f"  tier distribution:")
    print(out["land_value_tier"].value_counts(dropna=False).to_string())

    print("\nspot-check: well-known colonias")
    base = gpd.read_file(SPINE_PATH)[
        ["colonia_id", "colonia_name", "alcaldia_name"]
    ]
    check = base.merge(out, on="colonia_id", how="left")
    watch = [
        ("Roma Norte", "Cuauhtémoc"),
        ("Condesa", "Cuauhtémoc"),
        ("Polanco V Seccion", "Miguel Hidalgo"),
        ("Del Valle Centro", "Benito Juárez"),
        ("Centro", "Cuauhtémoc"),
        ("Doctores", "Cuauhtémoc"),
        ("Santa Fe", "Álvaro Obregón"),
        ("Iztapalapa", "Iztapalapa"),
    ]
    rows = []
    for cname, aname in watch:
        m = check[(check["colonia_name"] == cname) & (check["alcaldia_name"] == aname)]
        if not m.empty:
            rows.append(m.iloc[0])
    if rows:
        spot = pd.DataFrame(rows)[[
            "colonia_name", "alcaldia_name", "land_value_mxn_per_m2",
            "land_value_tier", "land_value_coverage_pct"
        ]]
        print(spot.to_string(index=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
