#!/usr/bin/env python3
"""Aggregate Inside Airbnb listings onto the colonia spine.

Inside Airbnb publishes a per-city quarterly snapshot of active listings
with lat/lng + price.  It's not long-term rent, but Airbnb density is a
strong correlate of "tourist pressure" and Airbnb-ification — the second
axis of the affordability story (the first being cadastral land value).

Filters applied before aggregation:
    * minimum_nights <= 30   (exclude stealth long-term rentals)
    * availability_365 > 0   (exclude ghost listings)
    * price not null

The price field ships as a currency string ("$3,673.00"); we strip the
symbol and commas.

Output
------
    data/processed/airbnb_by_colonia.csv
    columns:
        colonia_id
        airbnb_listings_count              int
        airbnb_density_per_km2             float  (listings / km²)
        airbnb_median_nightly_mxn          float
        airbnb_p25_nightly_mxn             float  (affordable end)
        airbnb_p75_nightly_mxn             float  (premium end)
        airbnb_entire_home_pct             float  (% of listings that are
                                                    "Entire home/apt")

Run:
    python3 scripts/09_process_airbnb.py

Download (one-time, happens automatically if the file isn't present):
    https://data.insideairbnb.com/mexico/df/mexico-city/2025-09-27/data/listings.csv.gz
"""
from __future__ import annotations

import urllib.request
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "urban" / "airbnb" / "listings.csv.gz"
SPINE_PATH = ROOT / "data" / "processed" / "colonias_base.geojson"
OUT = ROOT / "data" / "processed" / "airbnb_by_colonia.csv"

SOURCE_URL = (
    "https://data.insideairbnb.com/mexico/df/mexico-city/2025-09-27/"
    "data/listings.csv.gz"
)
METRIC_CRS = "EPSG:32614"


def ensure_raw() -> Path:
    if RAW.exists() and RAW.stat().st_size > 0:
        return RAW
    RAW.parent.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {SOURCE_URL} ...")
    with urllib.request.urlopen(SOURCE_URL, timeout=120) as resp, \
            RAW.open("wb") as fh:
        fh.write(resp.read())
    print(f"  saved {RAW.relative_to(ROOT)} ({RAW.stat().st_size/1e6:.1f} MB)")
    return RAW


def parse_price(s: pd.Series) -> pd.Series:
    """'$3,673.00' -> 3673.0"""
    return (
        s.astype("string")
         .str.replace("$", "", regex=False)
         .str.replace(",", "", regex=False)
         .astype("Float64")
    )


def main() -> int:
    print("loading listings ...")
    ensure_raw()
    df = pd.read_csv(
        RAW,
        usecols=[
            "id", "latitude", "longitude", "price", "room_type",
            "minimum_nights", "availability_365",
        ],
        low_memory=False,
    )
    print(f"  {len(df):,} raw listings")

    df["price_mxn"] = parse_price(df["price"])
    before = len(df)
    df = df[
        (df["price_mxn"].notna())
        & (df["minimum_nights"] <= 30)
        & (df["availability_365"] > 0)
        & (df["latitude"].notna())
        & (df["longitude"].notna())
    ].copy()
    print(f"  kept {len(df):,}/{before:,} after filters "
          f"(price + min_nights<=30 + availability>0)")

    print("loading spine ...")
    spine = gpd.read_file(SPINE_PATH)[
        ["colonia_id", "area_m2", "geometry"]
    ].to_crs(METRIC_CRS)
    print(f"  {len(spine):,} colonias")

    print("spatial join ...")
    pts = gpd.GeoDataFrame(
        df[["id", "price_mxn", "room_type"]],
        geometry=gpd.points_from_xy(df["longitude"], df["latitude"]),
        crs="EPSG:4326",
    ).to_crs(METRIC_CRS)
    joined = pts.sjoin(
        spine[["colonia_id", "area_m2", "geometry"]],
        how="inner", predicate="within",
    )
    print(f"  {len(joined):,} listings matched a colonia "
          f"({len(joined)/len(df)*100:.1f}% of filtered)")

    grp = joined.groupby("colonia_id", as_index=False)
    out = grp.agg(
        airbnb_listings_count=("id", "count"),
        airbnb_median_nightly_mxn=("price_mxn", "median"),
        airbnb_p25_nightly_mxn=("price_mxn", lambda s: s.quantile(0.25)),
        airbnb_p75_nightly_mxn=("price_mxn", lambda s: s.quantile(0.75)),
        airbnb_entire_home_pct=(
            "room_type",
            lambda s: (s == "Entire home/apt").mean() * 100,
        ),
        _col_area_m2=("area_m2", "first"),
    )
    out["airbnb_density_per_km2"] = (
        out["airbnb_listings_count"] / (out["_col_area_m2"] / 1e6)
    ).round(2)
    out = out.drop(columns="_col_area_m2")

    for c in ("airbnb_median_nightly_mxn",
              "airbnb_p25_nightly_mxn",
              "airbnb_p75_nightly_mxn"):
        out[c] = out[c].round(0)
    out["airbnb_entire_home_pct"] = out["airbnb_entire_home_pct"].round(1)

    # Re-attach empty colonias so downstream merges stay aligned.
    base_ids = gpd.read_file(SPINE_PATH)["colonia_id"]
    missing = set(base_ids) - set(out["colonia_id"])
    if missing:
        pad = pd.DataFrame({"colonia_id": sorted(missing)})
        for col in out.columns:
            if col != "colonia_id":
                pad[col] = pd.NA
        pad["airbnb_listings_count"] = 0
        pad["airbnb_density_per_km2"] = 0.0
        out = pd.concat([out, pad], ignore_index=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)
    print(f"\nwrote {OUT.relative_to(ROOT)}  "
          f"({OUT.stat().st_size/1024:.1f} KB, {len(out)} rows)")

    # --- sanity ---
    print("\n=== sanity ===")
    with_data = out[out["airbnb_listings_count"] > 0]
    print(f"  colonias with ≥1 listing: {len(with_data):,}/{len(out):,} "
          f"({len(with_data)/len(out)*100:.1f}%)")
    print(f"  total listings: {out['airbnb_listings_count'].sum():,}")
    print(f"  median listings per covered colonia: "
          f"{with_data['airbnb_listings_count'].median():.0f}")
    print(f"  median nightly MXN (across covered colonias): "
          f"{with_data['airbnb_median_nightly_mxn'].median():.0f}")
    print(f"  density per km² (median): "
          f"{with_data['airbnb_density_per_km2'].median():.1f}")

    print("\nspot-check: well-known colonias")
    base = gpd.read_file(SPINE_PATH)[
        ["colonia_id", "colonia_name", "alcaldia_name"]
    ]
    check = base.merge(out, on="colonia_id", how="left")
    watch = [
        ("Roma Norte", "Cuauhtémoc"),
        ("Roma Sur", "Cuauhtémoc"),
        ("Condesa", "Cuauhtémoc"),
        ("Hipodromo", "Cuauhtémoc"),
        ("Polanco V Seccion", "Miguel Hidalgo"),
        ("Del Valle Centro", "Benito Juárez"),
        ("Centro", "Cuauhtémoc"),
        ("Doctores", "Cuauhtémoc"),
        ("Juarez", "Cuauhtémoc"),
        ("Santa Fe", "Álvaro Obregón"),
    ]
    rows = []
    for cname, aname in watch:
        m = check[(check["colonia_name"] == cname)
                  & (check["alcaldia_name"] == aname)]
        if not m.empty:
            rows.append(m.iloc[0])
    if rows:
        spot = pd.DataFrame(rows)[[
            "colonia_name", "alcaldia_name",
            "airbnb_listings_count", "airbnb_density_per_km2",
            "airbnb_median_nightly_mxn", "airbnb_p25_nightly_mxn",
            "airbnb_p75_nightly_mxn", "airbnb_entire_home_pct",
        ]]
        print(spot.to_string(index=False))

    print("\ntop 10 colonias by Airbnb density:")
    top = check.nlargest(10, "airbnb_density_per_km2")[
        ["colonia_name", "alcaldia_name",
         "airbnb_listings_count", "airbnb_density_per_km2",
         "airbnb_median_nightly_mxn"]
    ]
    print(top.to_string(index=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
