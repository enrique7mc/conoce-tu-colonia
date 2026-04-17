#!/usr/bin/env python3
"""Compute per-colonia transit access features.

Sources (all extracted from data/raw/transit/):
    Metro stations       — STC_Metro_estaciones_utm14n.shp          (UTM 14N)
    Metrobús stations    — Metrobus_estaciones.shp                  (lon/lat)
    STE stations         — ste_{cablebus,tren_ligero,trolebus}.shp  (mixed)
    Ecobici stations     — cicloestaciones_ecobici.shp              (lon/lat)
    Bike infra           — Infraestructura ciclista total.shp       (lon/lat)

Outputs (per colonia_id):
    metro_stations_800m        count of Metro stations within 800m
    metrobus_stations_500m     count of Metrobús stations within 500m
    tren_ligero_stations_500m  ...
    trolebus_stations_300m     ...
    cablebus_stations_500m     ...
    ste_stations_500m          combined STE count (500m)
    ecobici_stations           Ecobici stations whose point falls inside colonia
    ecobici_stations_300m      Ecobici within 300m of colonia
    has_tren_ligero            bool
    has_cablebus               bool
    has_ecobici                bool
    bike_lane_km               km of bike infra within colonia
    transit_coverage_pct       % of colonia area covered by (metro800 ∪
                               metrobus500 ∪ ste500) buffers

Notes
-----
* Buffers computed in EPSG:6372 (metric, Mexico LCC) then used as-is in 6372
  for all area/intersection math.  The colonia spine is reprojected to 6372
  for the duration of this script.
* Station-count columns count stations whose buffer intersects the colonia.
  The brief's wording "stations within 800m" means any station the colonia
  is within 800m of — equivalent to intersecting the buffer with the colonia.
* "Total" bike infra is the ADIP v11 aggregated layer; sub-types (ciclovía,
  ciclocarril, sendero, etc.) are all merged into one km figure.

Run:
    python3 scripts/05_process_transit.py
"""
from __future__ import annotations

import zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "transit"
EXTRACT = ROOT / "data" / "processed" / "transit_extracted"
SPINE = ROOT / "data" / "processed" / "colonias_base.geojson"
OUT = ROOT / "data" / "processed" / "transit_by_colonia.csv"

METRIC_CRS = "EPSG:6372"  # Mexico LCC, metres


def unzip(zip_path: Path, dest: Path) -> None:
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(dest)


def find_shp(root: Path, *needles: str) -> Path:
    """Find a .shp under ``root`` whose lower-cased path contains every needle."""
    needles_l = tuple(n.lower() for n in needles)
    matches = [
        p for p in root.rglob("*.shp")
        if all(n in p.as_posix().lower() for n in needles_l)
    ]
    if not matches:
        raise FileNotFoundError(f"no .shp matching {needles} under {root}")
    if len(matches) > 1:
        raise RuntimeError(f"multiple matches for {needles}: {matches}")
    return matches[0]


def extract_all() -> None:
    EXTRACT.mkdir(parents=True, exist_ok=True)
    pairs = [
        (RAW / "metro_stations" / "stcmetro_shp.zip",        EXTRACT / "metro"),
        (RAW / "metrobus_stations" / "mb_shp.zip",           EXTRACT / "metrobus"),
        (RAW / "ste_stations" / "ste_shp.zip",               EXTRACT / "ste"),
        (RAW / "ecobici_stations" / "cicloestaciones_ecobici.zip",
                                                             EXTRACT / "ecobici"),
        (RAW / "infra_ciclista" / "infraestructura_vial_ciclista.zip",
                                                             EXTRACT / "bike"),
    ]
    for src, dst in pairs:
        if dst.exists() and any(dst.iterdir()):
            continue
        dst.mkdir(parents=True, exist_ok=True)
        unzip(src, dst)

    # STE ships three inner zips — recurse once.
    ste = EXTRACT / "ste"
    for inner in ste.rglob("*.zip"):
        target = inner.with_suffix("")
        if target.exists() and any(target.iterdir()):
            continue
        target.mkdir(parents=True, exist_ok=True)
        unzip(inner, target)


def load_points(shp: Path) -> gpd.GeoDataFrame:
    g = gpd.read_file(shp)
    if g.crs is None:
        g = g.set_crs("EPSG:4326")
    return g.to_crs(METRIC_CRS)


def load_lines(shp: Path) -> gpd.GeoDataFrame:
    g = gpd.read_file(shp)
    if g.crs is None:
        g = g.set_crs("EPSG:4326")
    return g.to_crs(METRIC_CRS)


def count_within_buffer(
    stations: gpd.GeoDataFrame,
    colonias: gpd.GeoDataFrame,
    distance_m: int,
) -> pd.Series:
    """Count stations whose ``distance_m`` buffer intersects each colonia."""
    if len(stations) == 0:
        return pd.Series(0, index=colonias["colonia_id"], dtype=int)
    buffered = stations.copy()
    buffered["geometry"] = buffered.geometry.buffer(distance_m)
    joined = colonias[["colonia_id", "geometry"]].sjoin(
        buffered[["geometry"]], how="left", predicate="intersects",
    )
    counts = (
        joined.dropna(subset=["index_right"])
              .groupby("colonia_id").size()
    )
    return counts.reindex(colonias["colonia_id"], fill_value=0).astype(int)


def count_within_colonia(
    stations: gpd.GeoDataFrame,
    colonias: gpd.GeoDataFrame,
) -> pd.Series:
    """Count stations whose point lies inside each colonia."""
    joined = stations.sjoin(
        colonias[["colonia_id", "geometry"]],
        how="left", predicate="within",
    )
    counts = (
        joined.dropna(subset=["colonia_id"])
              .groupby("colonia_id").size()
    )
    return counts.reindex(colonias["colonia_id"], fill_value=0).astype(int)


def line_km_per_colonia(
    lines: gpd.GeoDataFrame,
    colonias: gpd.GeoDataFrame,
) -> pd.Series:
    """km of line geometry intersected with each colonia polygon."""
    overlay = gpd.overlay(
        lines[["geometry"]],
        colonias[["colonia_id", "geometry"]],
        how="intersection",
        keep_geom_type=True,
    )
    overlay["length_km"] = overlay.geometry.length / 1000.0
    return (
        overlay.groupby("colonia_id")["length_km"].sum()
               .reindex(colonias["colonia_id"], fill_value=0.0)
               .round(3)
    )


def coverage_pct(
    station_frames: list[tuple[gpd.GeoDataFrame, int]],
    colonias: gpd.GeoDataFrame,
) -> pd.Series:
    """Union of all station buffers, then % of each colonia area covered."""
    buffered_geoms = []
    for stations, dist in station_frames:
        if len(stations) == 0:
            continue
        buffered_geoms.append(unary_union(stations.geometry.buffer(dist).values))
    if not buffered_geoms:
        return pd.Series(0.0, index=colonias["colonia_id"])
    union = unary_union(buffered_geoms)
    union_gdf = gpd.GeoDataFrame(geometry=[union], crs=colonias.crs)
    inter = gpd.overlay(
        colonias[["colonia_id", "geometry"]],
        union_gdf,
        how="intersection",
        keep_geom_type=True,
    )
    covered_area = inter.groupby("colonia_id").geometry.apply(lambda g: g.area.sum())
    covered = covered_area.reindex(colonias["colonia_id"], fill_value=0.0)
    total = colonias.set_index("colonia_id").geometry.area
    return ((covered / total) * 100).round(2)


def main() -> int:
    print("extracting shapefile zips ...")
    extract_all()

    print("loading spine ...")
    base = gpd.read_file(SPINE).to_crs(METRIC_CRS)
    print(f"  spine: {len(base)} colonias (reprojected to {METRIC_CRS})")

    print("loading transit layers ...")
    metro = load_points(find_shp(EXTRACT / "metro", "estaciones"))
    metrobus = load_points(find_shp(EXTRACT / "metrobus", "metrobus_estaciones"))
    ecobici = load_points(find_shp(EXTRACT / "ecobici", "cicloestaciones_ecobici"))

    # STE comes as three separate mode zips.
    cablebus = load_points(find_shp(EXTRACT / "ste", "cablebus", "estaciones"))
    tren_ligero = load_points(find_shp(EXTRACT / "ste", "trenligero", "estaciones"))
    trolebus = load_points(find_shp(EXTRACT / "ste", "trolebus", "paradas"))

    bike = load_lines(
        find_shp(EXTRACT / "bike", "infraestructura ciclista total")
    )

    print(f"  metro       : {len(metro):,} stations")
    print(f"  metrobús    : {len(metrobus):,} stations")
    print(f"  tren ligero : {len(tren_ligero):,} stations")
    print(f"  trolebús    : {len(trolebus):,} paradas")
    print(f"  cablebús    : {len(cablebus):,} estaciones")
    print(f"  ecobici     : {len(ecobici):,} cicloestaciones")
    print(f"  bike infra  : {len(bike):,} segments")

    print("computing station counts ...")
    out = pd.DataFrame(index=base["colonia_id"])
    out["metro_stations_800m"] = count_within_buffer(metro, base, 800)
    out["metrobus_stations_500m"] = count_within_buffer(metrobus, base, 500)
    out["tren_ligero_stations_500m"] = count_within_buffer(tren_ligero, base, 500)
    out["trolebus_stations_300m"] = count_within_buffer(trolebus, base, 300)
    out["cablebus_stations_500m"] = count_within_buffer(cablebus, base, 500)
    out["ste_stations_500m"] = (
        out["tren_ligero_stations_500m"]
        + out["trolebus_stations_300m"]  # trolebus intentionally uses 300m
        + out["cablebus_stations_500m"]
    )
    out["ecobici_stations"] = count_within_colonia(ecobici, base)
    out["ecobici_stations_300m"] = count_within_buffer(ecobici, base, 300)

    out["has_tren_ligero"] = (out["tren_ligero_stations_500m"] > 0).astype(int)
    out["has_cablebus"] = (out["cablebus_stations_500m"] > 0).astype(int)
    out["has_ecobici"] = (out["ecobici_stations_300m"] > 0).astype(int)

    print("computing bike_lane_km ...")
    out["bike_lane_km"] = line_km_per_colonia(bike, base)

    # transit_coverage_pct = rapid-transit coverage only.  Trolebús has
    # ~800 paradas and its 300m buffers blanket central CDMX regardless of
    # actual rapid-transit access, which inflates the signal.  Trolebús
    # remains as a standalone count column.
    print("computing transit_coverage_pct (rapid transit only) ...")
    out["transit_coverage_pct"] = coverage_pct(
        [(metro, 800), (metrobus, 500),
         (tren_ligero, 500), (cablebus, 500)],
        base,
    )

    spine_cols = base[["colonia_id", "colonia_name", "alcaldia_name"]].set_index("colonia_id")
    full = spine_cols.join(out, how="left")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    full.to_csv(OUT)
    print(f"\nwrote {OUT.relative_to(ROOT)}  "
          f"({OUT.stat().st_size/1024:.1f} KB, {len(full)} rows)\n")

    print("=== sanity ===")
    print(f"colonias with any metro access (800m)     : "
          f"{(full['metro_stations_800m'] > 0).sum():,}")
    print(f"colonias with any metrobús access (500m)  : "
          f"{(full['metrobus_stations_500m'] > 0).sum():,}")
    print(f"colonias with any ecobici station         : "
          f"{(full['ecobici_stations'] > 0).sum():,}")
    print(f"colonias with tren ligero access          : "
          f"{int(full['has_tren_ligero'].sum()):,}")
    print(f"colonias with cablebús access             : "
          f"{int(full['has_cablebus'].sum()):,}")
    print(f"colonias with any bike infra              : "
          f"{(full['bike_lane_km'] > 0).sum():,}")
    print(f"total bike lane km (per-colonia sum)      : "
          f"{full['bike_lane_km'].sum():.1f}  (ADIP v11 reports ~630 km)")
    print(f"mean transit_coverage_pct                 : "
          f"{full['transit_coverage_pct'].mean():.1f}%")

    print("\ntop 10 colonias by transit_coverage_pct:")
    top = full.nlargest(10, "transit_coverage_pct")[
        ["colonia_name", "alcaldia_name",
         "metro_stations_800m", "metrobus_stations_500m",
         "transit_coverage_pct"]
    ]
    print(top.to_string())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
