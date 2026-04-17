# CLAUDE CODE PROJECT BRIEF
# Conoce tu Colonia — CDMX Neighborhood Intelligence Tool
# Claude Impact Lab Hackathon · April 18, 2026

## What this is
Feed this file to Claude Code as context when starting the data pre-processing pipeline.
Full specs are in the companion markdown files.

## Priority: Conoce tu Colonia (primary hackathon entry)
Secondary: Metrobús en Vivo (if teammate enables it)
Post-hackathon: Muévete CDMX (multimodal routing)

## Goal for pre-work (before Saturday)
Build a single GeoJSON file where each feature is a colonia polygon with ~60 properties
covering safety, transit, services, urban quality, and development scores.

---

## DATA SOURCES TO DOWNLOAD

All from https://datos.cdmx.gob.mx/ unless noted otherwise.

### Spatial foundation
1. Catálogo de colonias (GeoJSON) — colonia polygon boundaries (~1,800 colonias)
   URL: datos.cdmx.gob.mx/dataset/catalogo-de-colonias-datos-abiertos
   
2. Alcaldías (GeoJSON) — 16 borough boundaries
   URL: datos.cdmx.gob.mx/dataset/ (search "alcaldias" under División Geográfica)

### Safety
3. Carpetas de investigación FGJ (CSV) — crime records 2016-present, monthly updates
   URL: datos.cdmx.gob.mx/dataset/carpetas-de-investigacion-fgj-de-la-ciudad-de-mexico
   KEY COLUMNS: fecha_hechos, delito, categoria_delito, colonia_catalogo, alcaldia_catalogo, latitud, longitud
   NOTE: Since Dec 2023 has colonia_catalogo pre-matched to official boundaries — spatial join already done for crime!

4. Víctimas en carpetas FGJ (CSV) — victim demographics, from 2019
   URL: datos.cdmx.gob.mx/dataset/victimas-en-carpetas-de-investigacion-fgj
   KEY COLUMNS: sexo, fecha_hecho, colonia_catalogo, alcaldia_catalogo, delito, categoria_delito

5. Hechos de tránsito SSC 2024 (CSV) — traffic incidents with coordinates
   URL: datos.cdmx.gob.mx/dataset/hechos-de-transito-registrados-por-la-ssc-2024-serie-de-datos-ampliada-no-comparativa
   KEY COLUMNS: fecha, tipo_evento, coordenada_x, coordenada_y, total_lesionados, total_fallecidos

6. Incidentes viales C5 (CSV) — traffic incidents from command center
   URL: datos.cdmx.gob.mx/dataset/ (search "incidentes viales C5")

### Transit access (geolocation shapefiles)
7. Metro stations — datos.cdmx.gob.mx/dataset/lineas-y-estaciones-del-metro (SHP + KMZ)
8. Metrobús stations — datos.cdmx.gob.mx/dataset/geolocalizacion-metrobus (SHP)
9. STE stations (Tren Ligero, Trolebús, Cablebús) — datos.cdmx.gob.mx/dataset/geolocalizacion-de-lineas-y-estaciones-paradas-del-servicio-de-transportes-electricos (SHP)
10. Cicloestaciones Ecobici — datos.cdmx.gob.mx/dataset/cicloestaciones-ecobici-nuevo-sistema (SHP + CSV)
11. Infraestructura ciclista v11 — datos.cdmx.gob.mx/dataset/infraestructura-vial-ciclista (GeoJSON, 651 segments, March 2025)

### Urban quality & services
12. Servicios básicos y equipamiento por colonia (CSV)
    URL: datos.cdmx.gob.mx/dataset/porcentaje-de-viviendas-con-servicios-basicos-y-numero-de-elementos-de-equipamiento-de-primer-nivel
    COLUMNS: % water, electricity, street lighting, waste collection; proximity to health, markets, schools, public spaces, daycare

13. Nivel de infraestructura peatonal por colonia (GeoJSON)
    URL: datos.cdmx.gob.mx/dataset/ (search "infraestructura peatonal")
    
14. Espacios públicos por colonia (CSV + GeoJSON)
    URL: datos.cdmx.gob.mx/dataset/ (search "espacios publicos colonia")

### Social development
15. Índice de Desarrollo Social 2020 (CSV)
    URL: datos.cdmx.gob.mx/dataset/indice-de-desarrollo-social-de-la-ciudad-de-mexico-2020
    COLUMNS: IDS score, stratum (Very Low/Low/Medium/High), per colonia and manzana

16. Censo 2020 population data (CSV)
    URL: datos.cdmx.gob.mx/dataset/ (search "censo 2020")
    For per-capita normalization

### Government responsiveness
17. *0311 Locatel solicitudes (CSV, annual files)
    URL: datos.cdmx.gob.mx/dataset/0311
    KEY COLUMNS: 0311_colonia_registro, tipo_solicitud, fecha, estatus, tiempo_resolucion

---

## PRE-PROCESSING PIPELINE

### Step 1: Load colonia polygons
```python
import geopandas as gpd
colonias = gpd.read_file("catalogo_colonias.geojson")
# Expected: ~1,800 polygons with colonia name, alcaldía
```

### Step 2: Aggregate crime by colonia
The carpetas FGJ dataset already has colonia_catalogo since Dec 2023.
```python
import pandas as pd
carpetas = pd.read_csv("carpetas_fgj.csv")
# Filter to last 12 months — anchor = max(fecha_inicio), not today's date
# (the FGJ publication cadence lags; the latest available acumulado is
# through 2024-10-25).
# Group by colonia_catalogo, count total, count by categoria_delito
# Compute crime_density_per_km2 = total / colonia_area_km2
#   (we dropped crime_per_1000: Censo 2020 only ships alcaldía-level
#    population in the ADIP subset, so we can't get per-capita rates
#    without fabricating per-colonia pop.  Density per km² uses the
#    colonia area we already have and is the standard urban-analytics
#    substitute when per-capita isn't available.)
# Compute trend = last_12mo vs prior_12mo
```

Crime categories to break out:
- ROBO (robbery — con violencia, sin violencia, a transeúnte, a negocio, de vehículo, a casa habitación)
- LESIONES (injuries — dolosas, culposas)
- HOMICIDIO (homicide — doloso, culposo)
- FRAUDE / EXTORSIÓN
- DELITOS SEXUALES
- AMENAZAS
- DAÑO EN PROPIEDAD
- Others

### Step 3: Traffic safety by colonia
```python
# Point-in-polygon join: hechos de tránsito coordinates → colonia polygons
# Aggregate: total incidents, pedestrian incidents, cyclist incidents, fatalities
```

### Step 4: Transit access per colonia
```python
# For each transit station (Metro, Metrobús, STE, Ecobici):
#   Buffer 500-800m around station
#   Count stations whose buffer intersects each colonia
# Also: compute % of colonia area covered by transit buffers
# Also: km of bike infrastructure within each colonia
```

### Step 5: Join tabular datasets
```python
# Join services dataset on colonia name
# Join IDS 2020 on colonia name
# Join 0311 on colonia_registro
# Join population from Censo 2020
```

### Step 6: Compute scores
```python
# Safety sub-score (0-100): percentile rank of crime_density_per_km2,
#   inverted.  Optionally blend in violent-crime density separately so
#   volume (dominated by "delito de bajo impacto") doesn't drown out
#   severity.
# Transit sub-score (0-100): weighted sum of station counts + coverage
# Urban sub-score (0-100): mean of service percentages + walkability
# Overall: 0.35*safety + 0.25*transit + 0.25*urban + 0.15*ids_normalized
#   IDS is alcaldía-proxy (16 unique values repeated across colonias in
#   the same alcaldía) — the AGEB->colonia mapping isn't trivial without
#   manzana polygons, so within-alcaldía colonias share an IDS.
```

### Step 7: Export
```python
colonias.to_file("conoce_tu_colonia.geojson", driver="GeoJSON")
# Also export flat JSON lookup for Claude: {colonia_name: {all_properties}}
```

---

## COLUMN NAMING CONVENTION FOR OUTPUT GEOJSON

Safety: crime_total_last12mo, crime_density_per_km2, crime_trend_pct, crime_robbery_last12mo,
        crime_theft_last12mo, crime_violent_last12mo, crime_homicide_last12mo,
        crime_property_last12mo, crime_fraud_last12mo, crime_sexual_last12mo,
        traffic_incidents_2024, traffic_pedestrian_2024, traffic_cyclist_2024,
        traffic_fatalities_2024
        (per-1,000-residents rates dropped: no colonia-level population available)

Transit: metro_stations_800m, metrobus_stations_500m, ste_stations_500m,
         tren_ligero_stations_500m, cablebus_stations_500m, trolebus_stations_300m,
         has_tren_ligero, has_cablebus, has_ecobici,
         ecobici_stations, ecobici_stations_300m, bike_lane_km, transit_coverage_pct
         (transit_coverage_pct = rapid transit only; trolebús excluded because
          its dense local-bus stop network blankets central CDMX at 300m and
          washes out the signal)

Urban: pct_water, pct_electricity, pct_street_lighting, waste_tons,
       public_space_count, public_space_avg_dist_m, pedestrian_infra_level,
       pedestrian_infra_score, markets_count, health_equip_count,
       school_equip_count, daycare_count, services_index

Development: ids_score, ids_stratum, alcaldia_population
       (ids_score/stratum are alcaldía-level proxies; alcaldia_population is
        total-alcaldía population, not per-colonia.)

Government: s311_requests_2024, s311_top_complaint
       (s311_avg_resolution_days, s311_pct_resolved out of scope — the 0311
        CSVs we pulled don't carry resolution-time fields in this subset.)

Scores: score_safety, score_transit, score_urban, score_development, score_overall

---

## METROBÚS EN VIVO (secondary project, for teammate)

Needs:
- Metrobús GTFS-RT API key (register at metrobus.cdmx.gob.mx/portal-ciudadano/datos-abiertos)
- GTFS static: shapes.txt, stops.txt, routes.txt (extract from datos.cdmx.gob.mx/dataset/gtfs)
- Python: gtfs-realtime-bindings, fastapi, websockets
- Frontend: MapLibre GL JS

Fallback if no API key: datos.cdmx.gob.mx/dataset/prueba_fetchdata_metrobus 
(last hour of vehicle positions, not truly real-time)

---

## FILE STRUCTURE
```
conoce-tu-colonia/
├── data/
│   ├── raw/                    # Downloaded CSVs, GeoJSONs, SHPs
│   ├── processed/              # Intermediate files
│   └── output/
│       ├── conoce_tu_colonia.geojson    # THE final product
│       └── colonia_lookup.json          # Flat JSON for Claude
├── scripts/
│   ├── 01_download.py          # Fetch all datasets
│   ├── 02_process_crime.py     # Carpetas FGJ aggregation
│   ├── 03_process_transit.py   # Station spatial joins
│   ├── 04_process_services.py  # Tabular joins
│   ├── 05_compute_scores.py    # Scoring engine
│   └── 06_export.py            # Final GeoJSON export
├── frontend/                   # Saturday build
├── specs/
│   ├── conoce-tu-colonia-spec.md
│   ├── metrobus-en-vivo-spec.md
│   └── muevete-cdmx-spec.md
└── README.md
```
