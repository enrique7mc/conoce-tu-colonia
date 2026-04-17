#!/usr/bin/env python3
"""Build the colonia spine for Conoce tu Colonia.

Reads the raw Catálogo de colonias GeoJSON and produces a normalized
GeoDataFrame — one row per colonia, stable ID, clean column names,
area in m^2 — then writes it to data/processed/colonias_base.geojson.

Every later step (crime aggregation, transit buffers, tabular joins)
left-joins onto this spine using colonia_id.

Run:
    python3 scripts/02_build_base.py
"""
from __future__ import annotations

from pathlib import Path

import geopandas as gpd
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "spatial" / "catalogo_colonias" / "catlogo-de-colonias.json"
OUT_DIR = ROOT / "data" / "processed"
OUT = OUT_DIR / "colonias_base.geojson"

# EPSG:6372 — Mexican Datum of 1988 / LCC.  Metre-based, accurate for the
# whole of Mexico.  Good enough for colonia-scale area and buffer work.
METRIC_CRS = "EPSG:6372"


def build() -> gpd.GeoDataFrame:
    gdf = gpd.read_file(RAW)

    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    else:
        gdf = gdf.to_crs("EPSG:4326")

    invalid = ~gdf.geometry.is_valid
    if invalid.any():
        gdf.loc[invalid, "geometry"] = gdf.loc[invalid, "geometry"].apply(make_valid)

    # Compute area in a metric projection, then return to lon/lat for storage.
    area_m2 = gdf.to_crs(METRIC_CRS).geometry.area

    base = gpd.GeoDataFrame(
        {
            "colonia_id":    gdf["cve_col"],
            "colonia_name":  gdf["colonia"],
            "alcaldia_id":   gdf["cve_alc"],
            "alcaldia_name": gdf["alc"],
            "clasif":        gdf["clasif"],
            "area_m2":       area_m2.round(1),
            "geometry":      gdf.geometry,
        },
        crs="EPSG:4326",
    )

    # Stable ordering: alcaldia then colonia name.
    base = base.sort_values(["alcaldia_name", "colonia_name"]).reset_index(drop=True)
    return base


def report(base: gpd.GeoDataFrame) -> None:
    print(f"colonias:           {len(base):,}")
    print(f"unique colonia_id:  {base['colonia_id'].nunique():,}")
    print(f"alcaldias:          {base['alcaldia_name'].nunique()}  "
          f"(expected 16)")
    print(f"crs:                {base.crs}")
    print(f"total area:         {base['area_m2'].sum() / 1e6:,.1f} km^2  "
          f"(CDMX ~1,495 km^2)")

    print("\nclasif distribution:")
    for k, v in base["clasif"].value_counts().items():
        print(f"  {k:30s} {v:>5}")

    dup_names = base["colonia_name"].value_counts()
    dup_names = dup_names[dup_names > 1]
    print(f"\nduplicate colonia names:   {len(dup_names)}  "
          f"(expected — same name repeats across alcaldías)")
    print("  top 5 collisions:")
    for name, n in dup_names.head(5).items():
        print(f"    {name:30s} {n} times")

    print("\nper-alcaldia counts:")
    per_alc = base.groupby("alcaldia_name").size().sort_values(ascending=False)
    for name, n in per_alc.items():
        print(f"  {name:30s} {n:>4}")


def main() -> int:
    if not RAW.exists():
        raise SystemExit(f"missing raw input: {RAW}")
    base = build()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    base.to_file(OUT, driver="GeoJSON")
    print(f"wrote {OUT.relative_to(ROOT)}  "
          f"({OUT.stat().st_size / 1e6:.1f} MB)\n")
    report(base)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
