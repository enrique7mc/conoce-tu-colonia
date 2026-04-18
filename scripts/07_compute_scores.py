#!/usr/bin/env python3
"""Merge the four processed feature tables, compute sub-scores and the
overall colonia score, and export the final GeoJSON + flat JSON lookup.

Inputs
------
    data/processed/colonias_base.geojson    (spine — polygon + area_m2)
    data/processed/crime_by_colonia.csv
    data/processed/traffic_by_colonia.csv
    data/processed/transit_by_colonia.csv
    data/processed/tabular_by_colonia.csv
    data/processed/affordability_by_colonia.csv  (optional — MXN/m² land value)

Outputs
-------
    data/output/conoce_tu_colonia.geojson   (spine + all features + scores)
    data/output/colonia_lookup.json         (flat {colonia_id: {props}})

Scoring model
-------------
All sub-scores are 0-100 where higher = better.

* safety_score
    Combined percentile-rank of:
      - street-crime density   (count / km²)  weight 0.4
      - violent-crime density  (count / km²)  weight 0.6
    Inverted so low crime -> high score.
    Percentile rank is robust to outliers and the "delito de bajo impacto"
    dominating the absolute counts.  Violent density carries more weight
    so severity isn't drowned out by volume.  Colonias with zero density
    still get ranked, they just tie at percentile 0.
    "Street" excludes fraud/extortion/identity + domestic violence:
    those get filed at corporate or home addresses and inflate density
    in dense commercial colonias (Anzures, Juárez, Polanco) without
    reflecting pedestrian risk.

* transit_score
    Weighted composite:
      metro_stations_800m × 25 (capped at 5 stations)
      metrobus_stations_500m × 20 (capped at 5)
      ste_stations_500m × 10 (capped at 3)
      has_ecobici × 10
      bike_lane_km × 5 (capped at 3 km)
      transit_coverage_pct × 0.3 (= up to 30 points)
    Scaled into 0-100.

* urban_score
    Mean of normalised components (each 0-100):
      pct_water, pct_electricity, pct_street_lighting, pedestrian_infra_score,
      inv_public_space_avg_dist (closer = better),
      capped markets_count (0..3 -> 0..100),
      capped health_equip_count (0..4 -> 0..100),
      capped school_equip_count (0..8 -> 0..100).

* development_score
    IDS 2020 alcaldía-proxy, rescaled to 0-100.

* affordability_score
    Percentile-rank of land_value_mxn_per_m2 (Valores Unitarios del Suelo,
    Código Fiscal CDMX), inverted so cheap land -> high score.  Colonias
    outside the zonal cadastral map (mostly rural fringe) are NaN and the
    UI should surface "sin datos" rather than treat them as affordable.
    Deliberately NOT mixed into score_overall — affordability is good for
    renters, bad for owners; exposed as a standalone dimension + filter.

* score_overall = weighted mean of the four dimensions with target weights
    safety 0.35, transit 0.25, urban 0.25, development 0.15.  If a
    dimension is NaN (e.g. no ``Servicios urbanos`` coverage for the
    colonia), its weight is redistributed across the present dimensions
    — a missing dimension does not drag the overall toward zero.

Run:
    python3 scripts/07_compute_scores.py
"""
from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "data" / "processed"
OUT_DIR = ROOT / "data" / "output"
OUT_GEOJSON = OUT_DIR / "conoce_tu_colonia.geojson"
OUT_LOOKUP = OUT_DIR / "colonia_lookup.json"


def pct_rank(s: pd.Series) -> pd.Series:
    """Percentile rank 0..1 (0 = lowest, 1 = highest).  NaN -> NaN."""
    return s.rank(pct=True, method="average")


def cap_scale(s: pd.Series, cap: float) -> pd.Series:
    return (s.clip(lower=0, upper=cap) / cap * 100).round(1)


def invert_distance_score(dist_m: pd.Series, near_m: float = 150, far_m: float = 800) -> pd.Series:
    """Map avg distance (metres) to 0-100 where near_m -> 100, far_m -> 0."""
    s = (far_m - dist_m) / (far_m - near_m)
    return (s.clip(lower=0, upper=1) * 100).round(1)


def safety_score(crime: pd.DataFrame, area_km2: pd.Series) -> pd.Series:
    # ``crime_street`` = total − fraud − domestic.  Fraud/extortion/identity
    # cases are filed at corporate or contract addresses, and domestic
    # violence happens at home — neither reflects pedestrian street risk,
    # so excluding both gives a cleaner denominator.
    street_density = crime["crime_street_last12mo"] / area_km2
    violent_density = crime["crime_violent_last12mo"] / area_km2
    street_rank = pct_rank(street_density).fillna(0)
    violent_rank = pct_rank(violent_density).fillna(0)
    composite = 0.4 * street_rank + 0.6 * violent_rank
    return ((1 - composite) * 100).round(1)


def transit_score(t: pd.DataFrame) -> pd.Series:
    points = (
        cap_scale(t["metro_stations_800m"], 5) * 0.25
        + cap_scale(t["metrobus_stations_500m"], 5) * 0.20
        + cap_scale(t["ste_stations_500m"], 3) * 0.10
        + t["has_ecobici"].fillna(0).astype(int) * 10
        + cap_scale(t["bike_lane_km"], 3) * 0.05
        + t["transit_coverage_pct"].fillna(0) * 0.30
    )
    return points.clip(0, 100).round(1)


def urban_score(u: pd.DataFrame) -> pd.Series:
    parts = pd.DataFrame({
        "water":        u["pct_water"],
        "elec":         u["pct_electricity"],
        "light":        u["pct_street_lighting"],
        "ped":          u["pedestrian_infra_score"],
        "public_space": invert_distance_score(u["public_space_avg_dist_m"]),
        "markets":      cap_scale(u["markets_count"], 3),
        "health":       cap_scale(u["health_equip_count"], 4),
        "schools":      cap_scale(u["school_equip_count"], 8),
    })
    return parts.mean(axis=1, skipna=True).round(1)


def development_score(ids_score: pd.Series) -> pd.Series:
    # IDS 2020 values fall roughly in 0..1; rescale to 0..100.
    lo, hi = ids_score.min(), ids_score.max()
    if pd.isna(lo) or pd.isna(hi) or hi == lo:
        return pd.Series(np.nan, index=ids_score.index)
    return ((ids_score - lo) / (hi - lo) * 100).round(1)


def affordability_score(mxn_per_m2: pd.Series) -> pd.Series:
    """Inverted percentile rank so cheap land -> high score.

    NaN in -> NaN out: colonias outside the zonal map shouldn't be ranked
    as "infinitely affordable" when we simply lack data.
    """
    ranks = mxn_per_m2.rank(pct=True, method="average")
    return ((1 - ranks) * 100).round(1)


def main() -> int:
    print("loading ...")
    base = gpd.read_file(PROCESSED / "colonias_base.geojson")
    crime = pd.read_csv(PROCESSED / "crime_by_colonia.csv")
    traffic = pd.read_csv(PROCESSED / "traffic_by_colonia.csv")
    transit = pd.read_csv(PROCESSED / "transit_by_colonia.csv")
    tabular = pd.read_csv(PROCESSED / "tabular_by_colonia.csv")
    afford_path = PROCESSED / "affordability_by_colonia.csv"
    afford = pd.read_csv(afford_path) if afford_path.exists() else None
    airbnb_path = PROCESSED / "airbnb_by_colonia.csv"
    airbnb = pd.read_csv(airbnb_path) if airbnb_path.exists() else None
    print(f"  spine   : {len(base)} colonias, area total {base['area_m2'].sum()/1e6:.1f} km²")
    if afford is None:
        print("  !! affordability_by_colonia.csv missing — score_affordability will be NaN")
    if airbnb is None:
        print("  !! airbnb_by_colonia.csv missing — airbnb_* fields will be NaN")

    # Drop redundant identifier columns from each feature table.
    feature_tables = [crime, traffic, transit, tabular]
    if afford is not None:
        feature_tables.append(afford)
    if airbnb is not None:
        feature_tables.append(airbnb)
    for df in feature_tables:
        drop = [c for c in ("colonia_name", "alcaldia_name", "alcaldia_id")
                if c in df.columns]
        df.drop(columns=drop, inplace=True)

    # Merge everything onto the spine via colonia_id.
    full = (
        base
        .merge(crime, on="colonia_id", how="left")
        .merge(traffic, on="colonia_id", how="left")
        .merge(transit, on="colonia_id", how="left")
        .merge(tabular, on="colonia_id", how="left")
    )
    if afford is not None:
        full = full.merge(afford, on="colonia_id", how="left")
    else:
        full["land_value_mxn_per_m2"] = np.nan
        full["land_value_tier"] = None
        full["land_value_coverage_pct"] = 0.0
    if airbnb is not None:
        full = full.merge(airbnb, on="colonia_id", how="left")
    else:
        for c in ("airbnb_listings_count", "airbnb_density_per_km2",
                  "airbnb_active_count", "airbnb_active_density_per_km2",
                  "airbnb_active_pct",
                  "airbnb_median_nightly_mxn", "airbnb_p25_nightly_mxn",
                  "airbnb_p75_nightly_mxn", "airbnb_entire_home_pct"):
            full[c] = np.nan
    print(f"  merged  : {len(full)} rows, {len(full.columns)} columns")

    # --- scores ---
    area_km2 = full["area_m2"] / 1e6
    full["crime_density_per_km2"] = (full["crime_total_last12mo"] / area_km2).round(2)
    full["crime_violent_density_per_km2"] = (full["crime_violent_last12mo"] / area_km2).round(3)

    print("computing scores ...")
    full["score_safety"] = safety_score(full, area_km2)
    full["score_transit"] = transit_score(full)
    full["score_urban"] = urban_score(full)
    full["score_development"] = development_score(full["ids_score"])
    full["score_affordability"] = affordability_score(full["land_value_mxn_per_m2"])

    # Missing dimensions (e.g. no ``Servicios urbanos`` coverage) have their
    # weight redistributed across present ones rather than zero-filled.
    # Without this, Anzures — which lacks urban data — loses a full 25
    # points just for the gap and sinks from ~45 to ~34.
    weights = pd.Series({
        "score_safety":      0.35,
        "score_transit":     0.25,
        "score_urban":       0.25,
        "score_development": 0.15,
    })
    dims = full[weights.index]
    present = dims.notna()
    weighted_sum = (dims.fillna(0) * weights).sum(axis=1)
    weight_sum = (present * weights).sum(axis=1)
    full["score_overall"] = (
        weighted_sum / weight_sum.where(weight_sum > 0)
    ).round(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # GeoJSON export (the backend of the frontend).
    print(f"writing {OUT_GEOJSON.relative_to(ROOT)} ...")
    full.to_file(OUT_GEOJSON, driver="GeoJSON")

    # Flat lookup for Claude Q&A / client search — no geometry.
    print(f"writing {OUT_LOOKUP.relative_to(ROOT)} ...")
    flat = full.drop(columns="geometry").copy()
    flat = flat.replace({np.nan: None})
    lookup = {row["colonia_id"]: row.to_dict() for _, row in flat.iterrows()}
    OUT_LOOKUP.write_text(json.dumps(lookup, ensure_ascii=False, indent=2))

    # === sanity ===
    print(f"\n=== sanity ===")
    print(f"final file: {OUT_GEOJSON.stat().st_size/1e6:.1f} MB")
    print(f"flat lookup: {OUT_LOOKUP.stat().st_size/1e6:.1f} MB")
    for c in ("score_safety", "score_transit", "score_urban",
              "score_development", "score_affordability", "score_overall"):
        s = full[c]
        print(f"  {c:22s} min={s.min():.1f}  mean={s.mean():.1f}  "
              f"max={s.max():.1f}  nulls={s.isna().sum()}")

    print("\ntop 10 colonias by overall score:")
    top = full.nlargest(10, "score_overall")[
        ["colonia_name", "alcaldia_name",
         "score_overall", "score_safety", "score_transit",
         "score_urban", "score_development"]
    ]
    print(top.to_string(index=False))

    print("\nbottom 10 colonias by overall score:")
    bot = full.nsmallest(10, "score_overall")[
        ["colonia_name", "alcaldia_name",
         "score_overall", "score_safety", "score_transit",
         "score_urban", "score_development"]
    ]
    print(bot.to_string(index=False))

    print("\nspot-check: well-known colonias")
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
        m = full[(full["colonia_name"] == cname) & (full["alcaldia_name"] == aname)]
        if not m.empty:
            rows.append(m.iloc[0])
    if rows:
        spot = pd.DataFrame(rows)[[
            "colonia_name", "alcaldia_name", "score_overall",
            "score_safety", "score_transit", "score_urban",
            "score_development", "score_affordability",
            "land_value_mxn_per_m2", "land_value_tier",
        ]]
        print(spot.to_string(index=False))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
