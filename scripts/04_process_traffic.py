#!/usr/bin/env python3
"""Aggregate SSC hechos de tránsito (2024) into per-colonia traffic features.

Input:   data/raw/safety/hechos_transito_2024/nuevo_acumulado_hechos_de_transito_2024.csv
Spine:   data/processed/colonias_base.geojson
Output:  data/processed/traffic_by_colonia.csv  (one row per colonia_id)

Design notes
------------
* The SSC text fields ``alcaldia`` / ``colonia`` use abbreviations and
  informal names that only match the catálogo ~28% of the time.  Every row
  has valid ``latitud`` / ``longitud`` though, so we use a point-in-polygon
  spatial join instead of a text match.
* Window is calendar year 2024 (all rows).  The C5 incidentes viales file
  is *not* ingested here — it's a second, lower-quality signal (raw 911
  calls) and the SSC file is the authoritative traffic source.
* ``tipo_evento`` categorisation:
    ATROPELLADO        -> pedestrian (struck by vehicle)
    CAIDA DE CICLISTA  -> cyclist
    CHOQUE / DERRAPADO / VOLCADURA / CAIDA DE PASAJERO -> generic
* Fatalities are summed from ``personas_fallecidas`` (per-event total).

Run:
    python3 scripts/04_process_traffic.py
"""
from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "safety" / "hechos_transito_2024" / "nuevo_acumulado_hechos_de_transito_2024.csv"
SPINE = ROOT / "data" / "processed" / "colonias_base.geojson"
OUT = ROOT / "data" / "processed" / "traffic_by_colonia.csv"

READ_COLS = [
    "fecha_evento", "tipo_evento", "folio",
    "latitud", "longitud",
    "personas_fallecidas", "personas_lesionadas",
]


def main() -> int:
    print("loading spine ...")
    base = gpd.read_file(SPINE)
    print(f"  spine: {len(base)} colonias")

    print("loading hechos de tránsito ...")
    df = pd.read_csv(RAW, usecols=READ_COLS, low_memory=False)
    df["fecha_evento"] = pd.to_datetime(df["fecha_evento"],
                                        format="%d/%m/%Y", errors="coerce")
    print(f"  rows : {len(df):,}  "
          f"(dates {df['fecha_evento'].min().date()} .. "
          f"{df['fecha_evento'].max().date()})")
    print(f"  fatalities : {int(df['personas_fallecidas'].sum()):,}")
    print(f"  injuries   : {int(df['personas_lesionadas'].sum()):,}")

    print("building GeoDataFrame ...")
    # A handful of rows have column-shifted garbage in lat/lon (e.g. a folio
    # like "1123MP001" landing in latitud).  Coerce, then clip to CDMX bbox.
    df["latitud"] = pd.to_numeric(df["latitud"], errors="coerce")
    df["longitud"] = pd.to_numeric(df["longitud"], errors="coerce")
    before = len(df)
    df = df.dropna(subset=["latitud", "longitud"])
    in_bbox = (
        df["latitud"].between(19.0, 20.0)
        & df["longitud"].between(-99.5, -98.8)
    )
    df = df[in_bbox].reset_index(drop=True)
    print(f"  dropped {before - len(df):,} rows with bad coordinates")

    points = gpd.GeoDataFrame(
        df,
        geometry=gpd.points_from_xy(df["longitud"], df["latitud"]),
        crs="EPSG:4326",
    )

    print("spatial join (point-in-polygon) ...")
    joined = points.sjoin(
        base[["colonia_id", "geometry"]],
        how="left",
        predicate="within",
    )
    resolved = joined["colonia_id"].notna()
    print(f"  resolved : {resolved.sum():,} / {len(joined):,}  "
          f"({resolved.mean()*100:.1f}%)")

    # Tag by event type.
    kind = joined["tipo_evento"].fillna("").str.upper()
    joined["is_pedestrian"] = (kind == "ATROPELLADO").astype(int)
    joined["is_cyclist"]    = (kind == "CAIDA DE CICLISTA").astype(int)
    joined["is_fatal_event"] = (joined["personas_fallecidas"] > 0).astype(int)

    print("aggregating by colonia ...")
    agg = (
        joined.dropna(subset=["colonia_id"])
              .groupby("colonia_id")
              .agg(
                  traffic_incidents_2024=("folio", "count"),
                  traffic_pedestrian_2024=("is_pedestrian", "sum"),
                  traffic_cyclist_2024=("is_cyclist", "sum"),
                  traffic_fatal_events_2024=("is_fatal_event", "sum"),
                  traffic_fatalities_2024=("personas_fallecidas", "sum"),
                  traffic_injuries_2024=("personas_lesionadas", "sum"),
              )
    )

    spine_cols = base[["colonia_id", "colonia_name", "alcaldia_name"]].set_index("colonia_id")
    full = spine_cols.join(agg, how="left")
    num_cols = [c for c in full.columns if c.startswith("traffic_")]
    full[num_cols] = full[num_cols].fillna(0).astype(int)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    full.to_csv(OUT)
    print(f"\nwrote {OUT.relative_to(ROOT)}  "
          f"({OUT.stat().st_size/1024:.1f} KB, {len(full)} rows)\n")

    print("=== sanity ===")
    print(f"colonias with 0 incidents       : {(full['traffic_incidents_2024'] == 0).sum():,}")
    print(f"citywide incidents              : {full['traffic_incidents_2024'].sum():,}")
    print(f"citywide pedestrian             : {full['traffic_pedestrian_2024'].sum():,}")
    print(f"citywide cyclist                : {full['traffic_cyclist_2024'].sum():,}")
    print(f"citywide fatal events           : {full['traffic_fatal_events_2024'].sum():,}")
    print(f"citywide fatalities (victims)   : {full['traffic_fatalities_2024'].sum():,}")

    print("\ntop 5 colonias by incident count:")
    top = full.nlargest(5, "traffic_incidents_2024")[
        ["colonia_name", "alcaldia_name",
         "traffic_incidents_2024", "traffic_pedestrian_2024",
         "traffic_fatalities_2024"]
    ]
    print(top.to_string())

    print("\ntop 5 by pedestrian incidents:")
    ptop = full.nlargest(5, "traffic_pedestrian_2024")[
        ["colonia_name", "alcaldia_name",
         "traffic_pedestrian_2024", "traffic_incidents_2024"]
    ]
    print(ptop.to_string())

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
