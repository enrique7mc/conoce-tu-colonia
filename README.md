# Conoce tu Colonia — CDMX Neighborhood Intelligence Tool

Aggregates 15+ CDMX government open datasets into a single, queryable profile
for every colonia in the city. Built for the **Claude Impact Lab hackathon**,
April 18, 2026.

Full problem statement and design: [`specs/conoce-tu-colonia-spec.md`](specs/conoce-tu-colonia-spec.md).
Pre-work brief: [`CLAUDE_CODE_BRIEF.md`](CLAUDE_CODE_BRIEF.md).

## Status

| Stage | State |
|---|---|
| Pre-processing pipeline (scripts 01–07) | **Done** |
| Final GeoJSON + flat lookup | **Done**, in `data/output/` |
| Frontend prototype (MapLibre choropleth + click-to-open profile panel) | **Done** — `frontend/`, see [`HACKATHON.md`](HACKATHON.md) |
| Compare mode, Claude Q&A, layer toggles | TBD — Saturday build |

## What's in the repo

```
.
├── CLAUDE_CODE_BRIEF.md        # Pre-work brief, updated with decisions made during pipeline build
├── specs/
│   ├── conoce-tu-colonia-spec.md    # Full product spec (primary hackathon entry)
│   ├── metrobus-en-vivo-spec.md     # Secondary project
│   └── muevete-cdmx-spec.md         # Post-hackathon project
├── scripts/                    # Pre-processing pipeline
│   ├── 01_download.py          # CKAN API → data/raw/ (~2.7 GB)
│   ├── 02_build_base.py        # Normalise catálogo de colonias → colonia spine
│   ├── 03_process_crime.py     # FGJ carpetas → crime features per colonia
│   ├── 04_process_traffic.py   # SSC hechos de tránsito → per-colonia (point-in-polygon)
│   ├── 05_process_transit.py   # Metro/Metrobús/STE/Ecobici + bike infra → per-colonia
│   ├── 06_process_tabular.py   # Urban services, IDS, Censo, 0311 → per-colonia
│   └── 07_compute_scores.py    # Sub-scores + overall, export GeoJSON + flat JSON
├── data/
│   ├── raw/                    # (gitignored) Downloaded source datasets
│   ├── processed/              # (gitignored) Intermediate tables
│   └── output/
│       ├── conoce_tu_colonia.geojson    # 13 MB, 1,543 features × ~67 props — the frontend's entire backend
│       └── colonia_lookup.json          # 3.6 MB flat dict keyed by colonia_id — for Claude Q&A
├── frontend/                   # (empty — Saturday build)
├── requirements.txt
└── README.md
```

## Running the pipeline

### Prereqs

Python 3.9 or later. The download script is stdlib-only; the rest need the
geospatial stack:

```bash
pip install -r requirements.txt
```

On macOS, `pyogrio` will pull in GDAL via pip. If that fails, fall back to
`brew install gdal` then reinstall.

### Run order

Each script is idempotent and prints sanity checks as it runs. The full
pipeline takes ~10 minutes end-to-end on a laptop (dominated by script 01).

```bash
python3 scripts/01_download.py          # ~8 min, ~2.7 GB download
python3 scripts/02_build_base.py        # <10 s
python3 scripts/03_process_crime.py     # ~30 s (2.1M FGJ rows)
python3 scripts/04_process_traffic.py   # <10 s
python3 scripts/05_process_transit.py   # ~20 s
python3 scripts/06_process_tabular.py   # ~10 s
python3 scripts/07_compute_scores.py    # <5 s
```

Selective runs: most scripts accept `--only <key>` or `--category <cat>`.
See `scripts/01_download.py --list` for the full manifest.

### Dataset not in the download manifest

**Metrobús GTFS static** is required for the secondary *Metrobús en Vivo*
project but needs an API key registration at
<https://metrobus.cdmx.gob.mx/portal-ciudadano/datos-abiertos>. Place the
extracted GTFS zip in `data/raw/Metrobus_GTFS_ESTATICO_<date>/`.

## Output schema

`data/output/conoce_tu_colonia.geojson` — one feature per colonia with:

**Identifiers:** `colonia_id`, `colonia_name`, `alcaldia_id`, `alcaldia_name`, `clasif`, `area_m2`

**Safety (crime):** `crime_total_last12mo`, `crime_violent_last12mo`,
`crime_homicide_last12mo`, `crime_sexual_last12mo`, `crime_robbery_last12mo`,
`crime_theft_last12mo`, `crime_property_last12mo`, `crime_fraud_last12mo`,
`crime_domestic_last12mo`, `crime_threats_last12mo`, `crime_drugs_last12mo`,
each also with `_prior12mo` counterpart, plus `crime_trend_pct`,
`crime_density_per_km2`, `crime_violent_density_per_km2`.

**Safety (traffic):** `traffic_incidents_2024`, `traffic_pedestrian_2024`,
`traffic_cyclist_2024`, `traffic_fatal_events_2024`, `traffic_fatalities_2024`,
`traffic_injuries_2024`.

**Transit:** `metro_stations_800m`, `metrobus_stations_500m`,
`tren_ligero_stations_500m`, `trolebus_stations_300m`, `cablebus_stations_500m`,
`ste_stations_500m`, `ecobici_stations`, `ecobici_stations_300m`,
`has_tren_ligero`, `has_cablebus`, `has_ecobici`,
`bike_lane_km`, `transit_coverage_pct`.

**Urban quality:** `pct_water`, `pct_electricity`, `pct_street_lighting`,
`waste_tons`, `markets_count`, `health_equip_count`, `school_equip_count`,
`daycare_count`, `services_index`, `pedestrian_infra_level`,
`pedestrian_infra_score`, `public_space_count`, `public_space_avg_dist_m`.

**Social + gov:** `ids_score`, `ids_stratum`, `alcaldia_population`,
`s311_requests_2024`, `s311_top_complaint`.

**Scores (0–100, higher = better):** `score_safety`, `score_transit`,
`score_urban`, `score_development`, `score_overall`.

## Data decisions and known limitations

These are choices made during pipeline build that aren't in the original
spec. Some are forced by what the data actually contains.

- **Crime anchor date = `max(fecha_inicio)`, not today.** The FGJ acumulado
  rolls up through 2024-10-25. "Last 12 months" is 2023-10-26 → 2024-10-25.
- **No colonia-level per-capita rates.** Censo 2020 data published by ADIP
  ships alcaldía-level totals only; there's no clean colonia population
  table. We use `crime_density_per_km2` (count ÷ colonia area) as the
  normalised rate. This is the standard urban-analytics substitute when
  per-capita isn't available.
- **IDS 2020 is alcaldía-proxy.** The IDS CSV is published at AGEB and
  manzana level, but the AGEB-to-colonia mapping isn't trivial without
  manzana polygons. We population-weighted-average to alcaldía. All
  colonias in the same alcaldía share an IDS score.
- **Crime taxonomy uses `categoria_delito` + `delito` joined.**
  `categoria_delito` has the clean severity labels (`HOMICIDIO DOLOSO`,
  `LESIONES DOLOSAS`) but is coarse; `delito` has granular subtypes. We
  regex-tag both fields. Culposo (negligent) homicide is excluded from
  the violent/homicide tags.
- **Urban SHPs use IECM's electoral colonia definition**, which subdivides
  large central colonias (e.g. `CENTRO I / II / III`) with codes that
  don't match the catálogo. We spatial-join SHP polygon centroids to the
  spine instead of text-joining on `cve_col`. This recovers central
  colonias (Roma Norte, Centro, Doctores) but loses ~340 peripheral
  colonias whose SHP centroids land in unmapped rural CDMX.
- **Catálogo covers 734 km² of CDMX's ~1,495 km².** The colonia layer is
  a set of named neighborhoods, not a tile of the whole city — rural /
  conservation land in Tlalpan, Milpa Alta, Xochimilco is not carved into
  colonias. Our index is accurate for developed land.
- **`transit_coverage_pct` is rapid transit only.** Including trolebús
  (800+ paradas at 300m each) was blanketing central CDMX at 100% and
  washing out the signal, so it's a standalone count column.
- **0311 `colonia_catalogo` is 66% null.** We fall back to the raw
  `colonia_solicitud` / `alcaldia_solicitud` text fields, getting us
  to ~50% of total rows resolved.
- **Colonia-name collisions are expected.** 89 colonia names repeat
  across alcaldías ("Barrio San Miguel" appears 6 times). Always join
  on `colonia_id` or the `(alcaldia, colonia)` pair.

## Next steps

### Saturday build (5–6 hours, per spec)

| Time | Task |
|---|---|
| 09:00–10:30 | MapLibre choropleth + click-to-open colonia profile |
| 10:30–12:00 | Full profile panel (radar chart, crime breakdown, transit detail, services bars, trend indicators) |
| 12:00–13:00 | Compare mode + search |
| 13:00–14:00 | Claude Q&A integration over `colonia_lookup.json` |
| 14:00–14:30 | Layer toggles (transit, bike lanes, markets, heatmap) |
| 14:30–15:00 | Responsive polish + data-source attribution + ethical caveats |

### Pipeline improvements worth doing post-hackathon

- **Manzana-level IDS.** Join AGEB polygons against the spine to compute
  real per-colonia IDS instead of alcaldía-proxy.
- **Per-colonia population.** Cross-reference INEGI manzana population
  with colonia polygons to enable `crime_per_1000`.
- **C5 incidentes viales as traffic cross-check.** We only use SSC hechos
  de tránsito (cleaner). C5 covers 2014–2024 and could add recency.
- **Encharcamientos (flood risk).** Not ingested yet. GeoJSON of
  historical flood points, already on datos.cdmx.
- **Temporal view.** Carpetas has monthly data from 2016. The current
  aggregator is window-based; extending to per-year snapshots enables
  the "temporal explorer" in the spec's future directions.

## License

Government data is CC-BY Ciudad de México. See
<https://datos.cdmx.gob.mx/dataset/terminos-y-condiciones>.

Code in this repo is unlicensed / use at will.
