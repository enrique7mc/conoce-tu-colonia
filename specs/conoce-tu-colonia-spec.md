# Conoce tu Colonia — Neighborhood intelligence for CDMX

**Claude Impact Lab · Ciudad de México · April 18, 2026**
**Challenge track:** Seguridad por Colonia + Challenge Abierto (cross-dataset)

---

## Problem

Every year, thousands of people — expats, digital nomads, domestic migrants, tourists, and longtime residents looking to move — face the same question: *which colonia should I live in, stay in, or walk through?* CDMX has over 1,800 colonias, and the difference between two neighborhoods separated by a single avenue can be dramatic in terms of safety, walkability, services, and livability.

Today, people answer this question through Facebook groups, Reddit threads, anecdotal advice, and vibes. Real data exists — the CDMX government publishes crime records, transit coverage, public services, urban infrastructure, and social development indices at the colonia level — but it's scattered across 15+ datasets in separate CSV and GeoJSON files that require technical skills to join and interpret.

The result: people make one of the most consequential decisions of their time in CDMX — where to live — based on word of mouth. Meanwhile, the government data that could inform that decision sits unused.

## Solution

**Conoce tu Colonia** is an interactive neighborhood intelligence tool that aggregates government open data into a single, queryable, visual profile for every colonia in CDMX. Users can search or click any colonia on a map and instantly see a multi-dimensional profile covering safety, walkability, transit access, public services, urban quality, and livability. They can compare colonias side by side, ask Claude natural language questions ("¿qué colonia cerca del centro es segura para una familia con niños?"), and explore thematic heatmaps.

The tool is deliberately designed to go **beyond a crime map**. A crime-only view is reductive and can stigmatize neighborhoods. By combining safety data with transit access, public spaces, markets, schools, pedestrian infrastructure, and development indices, the tool presents a holistic picture that respects the complexity of each neighborhood.

---

## Data sources

The power of this project is in the number of datasets it cross-references, all at the colonia level.

### Spatial foundation

| Dataset | Source | Format | Role |
|---------|--------|--------|------|
| Catálogo de colonias | ADIP via datos.cdmx | GeoJSON + SHP | Polygon boundaries for ~1,800 colonias. The spatial key that joins everything. Used by the official Ajolote visualization system. |
| Manzanas (city blocks) | INEGI via datos.cdmx | GeoJSON | Block-level polygons for finer-grained heatmaps. From Marco Geoestadístico 2020. |
| Alcaldías | INEGI via datos.cdmx | GeoJSON | 16 borough boundaries for aggregation. |

### Safety dimension

| Dataset | Source | Format | Freshness | Content |
|---------|--------|--------|-----------|---------|
| Carpetas de investigación FGJ | FGJ via datos.cdmx | CSV | Monthly updates, data from 2016 | Every criminal investigation opened in CDMX. Variables: date, crime type, crime category, colonia, alcaldía, lat/lon coordinates. Georeferenced. UNODC-validated reclassification. Since Dec 2023 includes `colonia_catalogo` and `alcaldia_catalogo` fields matched to the official colonia boundaries. |
| Víctimas en carpetas FGJ | FGJ via datos.cdmx | CSV | Monthly, from 2019 | Victim demographics linked to investigations: sex, date of incident, date of case opening. Useful for per-capita victimization rates and gender-disaggregated analysis. |
| Hechos de tránsito SSC 2024 | SSC via datos.cdmx | CSV | Full year 2024 | Traffic incidents with coordinates, event type, injuries, fatalities. Covers pedestrian and cyclist safety — relevant for walkability scoring. |
| Incidentes viales C5 | C5 via datos.cdmx | CSV | Updated | Traffic incidents reported to the command center. Second source for road safety. |

### Transit access dimension

| Dataset | Source | Format | Content |
|---------|--------|--------|---------|
| Metro stations geolocation | SEMOVI via datos.cdmx | SHP | Station positions for all 12 Metro lines. |
| Metrobús stations geolocation | SEMOVI via datos.cdmx | SHP | Station positions for all 7 Metrobús lines. |
| STE stations (Tren Ligero, Trolebús, Cablebús) | SEMOVI via datos.cdmx | SHP | Station/stop positions for STE network. |
| Cobertura Metro (800m) | Instituto de Planeación via datos.cdmx | GeoJSON | Pre-computed 800m coverage area around Metro stations. |
| Cobertura Tren Ligero (400m) | Instituto de Planeación via datos.cdmx | GeoJSON | Pre-computed 400m coverage area. |
| Cobertura transporte concesionado (150m) | Instituto de Planeación via datos.cdmx | GeoJSON | Population within 150m of concession bus routes. |
| Infraestructura ciclista v11 | SEMOVI via datos.cdmx | GeoJSON | Bike lane coverage per colonia. |
| Cicloestaciones Ecobici | SEMOVI via datos.cdmx | SHP + CSV | Ecobici station locations. Presence = bike-share access. |

### Urban quality & services dimension

| Dataset | Source | Format | Content |
|---------|--------|--------|---------|
| Nivel de servicios básicos y equipamiento por colonia | Instituto de Planeación via datos.cdmx | CSV | Per-colonia: % of homes with water, electricity, street lighting, waste collection. Proximity to health centers, markets, public spaces, schools (preschool through secondary), daycare. |
| Espacios públicos por colonia | Instituto de Planeación via datos.cdmx | CSV + GeoJSON | % public space per colonia, presence of bike infrastructure, and pedestrian accessibility level. |
| Nivel de infraestructura peatonal por colonia | Instituto de Planeación via datos.cdmx | GeoJSON | Walkability index per colonia — pedestrian infrastructure level. |
| Mercados públicos | datos.cdmx | CSV | Count and location of public markets per colonia. |
| Encharcamientos (flood points) | datos.cdmx | GeoJSON | Historical flooding locations 2000-2017 by colonia. Relevant for rainy season livability. |
| Consumo doméstico de agua | datos.cdmx | CSV | Average water consumption per colonia — proxy for water availability. |

### Social development dimension

| Dataset | Source | Format | Content |
|---------|--------|--------|---------|
| Índice de Desarrollo Social 2020 | Evalúa CDMX via datos.cdmx | CSV | Composite index per colonia and manzana: housing quality, sanitation access (water, drainage), electricity, durable goods, education, health access. Stratified into Very Low / Low / Medium / High. |
| Censo 2020 | INEGI via datos.cdmx | CSV | Population, household counts, and demographic data per geographic unit. Essential for per-capita normalization. |
| Ingresos trimestrales por colonia 2014 | SIBISO via datos.cdmx | CSV | Income estimates per colonia. Older but useful as context. |

### Government responsiveness dimension

| Dataset | Source | Format | Content |
|---------|--------|--------|---------|
| *0311 Locatel solicitudes | ADIP via datos.cdmx | CSV (annual files) | Every citizen service request: type, colonia, status, resolution time, responsible agency. AI-classified since 2022. User confirms closure — not government. |

---

## Architecture

### Pre-processing pipeline (offline)

The core work is joining 15+ datasets into a single per-colonia feature table.

```
                    ┌──────────────────────┐
                    │  Raw datasets (CSV,  │
                    │  GeoJSON, SHP)       │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Spatial join engine  │
                    │  (geopandas)         │
                    │                      │
                    │  1. Load colonia      │
                    │     polygons          │
                    │  2. Point-in-polygon  │
                    │     for all geocoded  │
                    │     records           │
                    │  3. Aggregate per     │
                    │     colonia           │
                    │  4. Normalize per     │
                    │     capita (Censo)    │
                    │  5. Join tabular data │
                    │     on colonia name   │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Colonia feature      │
                    │  table (GeoJSON)      │
                    │                      │
                    │  ~1,800 rows ×       │
                    │  ~60 columns          │
                    │  + polygon geometry   │
                    └──────────────────────┘
```

**Output:** A single GeoJSON file where each feature is a colonia polygon with ~60 properties covering all dimensions. This file is the entire backend — it can be loaded directly into the frontend map.

### Per-colonia feature table (key columns)

**Safety:**
- `crime_total_last12mo` — total carpetas in the last 12 months
- `crime_per_1000` — normalized by colonia population (Censo 2020)
- `crime_trend` — % change vs. prior 12-month period (improving/worsening)
- `crime_robbery` — robo con/sin violencia count
- `crime_theft` — robo a transeúnte, robo a negocio
- `crime_violent` — homicidio, lesiones dolosas
- `crime_property` — robo de vehículo, robo a casa habitación
- `crime_fraud` — fraude, extorsión
- `crime_sexual` — delitos sexuales (handle with care in UI — see ethics section)
- `traffic_incidents` — hechos de tránsito with injuries/fatalities near the colonia
- `traffic_pedestrian_incidents` — filtered for pedestrian victims

**Transit access:**
- `metro_stations_800m` — count of Metro stations within 800m
- `metrobus_stations_500m` — count of Metrobús stations within 500m
- `has_tren_ligero` — boolean
- `has_cablebus` — boolean
- `has_ecobici` — count of Ecobici stations in the colonia
- `bike_lane_km` — kilometers of bike infrastructure
- `transit_coverage_pct` — % of colonia area within transit coverage

**Urban quality:**
- `pct_water` — % homes with water service
- `pct_electricity` — % homes with electricity
- `pct_street_lighting` — % homes near street lighting
- `pct_waste_collection` — % homes with waste collection
- `public_space_pct` — % of colonia area that is public space
- `pedestrian_infra_level` — walkability index
- `markets_count` — public markets in the colonia
- `health_proximity` — proximity to health centers
- `school_proximity` — proximity to schools
- `flood_risk_points` — historical flood incidents

**Social development:**
- `ids_score` — Índice de Desarrollo Social composite
- `ids_stratum` — Very Low / Low / Medium / High
- `population` — Censo 2020 total
- `household_count` — Censo 2020 households

**Government responsiveness:**
- `311_requests_last12mo` — total 0311 requests
- `311_avg_resolution_days` — average time to close
- `311_pct_resolved` — % marked as resolved by citizen
- `311_top_complaint` — most frequent complaint type

### Scoring model

Each dimension gets a 0-100 sub-score, then combined into an overall colonia score.

**Safety sub-score (0-100):**
```
raw = crime_per_1000 (last 12 months)
safety_score = 100 × (1 - percentile_rank(raw))
```
A colonia in the 10th percentile for crime (very low crime) scores ~90. A colonia in the 90th percentile scores ~10. Percentile ranking is robust to outliers and doesn't require arbitrary thresholds.

**Transit sub-score (0-100):**
```
transit_score = weighted_sum(
  metro_stations_800m × 25,
  metrobus_stations_500m × 20,
  has_ecobici × 15,
  bike_lane_km × 15,
  transit_coverage_pct × 25
) / max_possible, scaled to 0-100
```

**Urban quality sub-score (0-100):**
```
urban_score = mean(
  pct_water, pct_electricity, pct_street_lighting,
  pct_waste_collection, public_space_pct_normalized,
  pedestrian_infra_normalized,
  health_proximity_normalized, school_proximity_normalized
)
```

**Overall colonia score:**
```
overall = w_safety × safety + w_transit × transit + w_urban × urban + w_ids × ids_normalized
```
Default weights: safety 35%, transit 25%, urban 25%, development 15%. Users can adjust weights with sliders based on their priorities.

---

## User interface

### Map view (primary)

- **Choropleth map** — colonias colored by score (green = high, yellow = medium, red = low). Default: overall score. Toggle to any sub-dimension.
- **Hover** — colonia name, overall score, population
- **Click** — opens colonia profile panel (see below)
- **Heatmap toggle** — switch from choropleth to point-density heatmap for crime data (shows hotspots within colonias)
- **Layer toggles** — transit stations, Ecobici, bike lanes, markets, public spaces, flood risk

### Colonia profile panel (on click or search)

A detailed card for the selected colonia:

**Header:** Colonia name, alcaldía, population, IDS stratum badge

**Score dashboard:**
- Overall score (large number) with sub-scores as a radar/spider chart:
  - Safety
  - Transit
  - Walkability
  - Services
  - Urban quality

**Safety detail:**
- Crime rate per 1,000 residents (with city average comparison)
- Trend arrow: improving ↓ or worsening ↑ vs. prior year
- Breakdown by type: pie or bar chart of robbery, theft, violent, property, fraud
- Time-of-day pattern: when do most incidents occur? (morning/afternoon/night)
- "Compared to similar colonias" — rank within the same alcaldía

**Transit detail:**
- Metro stations within walking distance (named, with line)
- Metrobús stations nearby
- Ecobici stations in the colonia (count)
- Bike lane coverage
- "You can reach X% of CDMX jobs within 45 minutes from this colonia" (stretch)

**Urban quality detail:**
- Service coverage bars (water, electricity, lighting, waste)
- Nearby: markets, health centers, schools, public spaces
- Walkability index
- Flood risk indicator

**Government responsiveness:**
- Top complaint types in this colonia
- Average resolution time (vs. city average)
- % of complaints resolved

### Compare mode

Select 2-3 colonias and see their profiles side by side. Radar charts overlaid. Score differences highlighted. Perfect for "Roma Norte vs. Narvarte vs. Del Valle" decisions.

### Claude-powered Q&A

Natural language queries routed through Claude with access to the colonia feature table:

- "¿Qué colonias en Benito Juárez son seguras y tienen metro cerca?" → filter by alcaldía, safety > 70, metro_stations > 0, return ranked list
- "I'm a tourist staying near Zócalo for 5 days. Is it safe to walk around at night?" → look up Centro colonia, describe crime patterns, provide context
- "Compara Condesa vs. Polanco para una familia" → pull both profiles, narrate tradeoffs
- "¿Dónde hay buena infraestructura ciclista y bajo crimen?" → multi-filter query

---

## Ethical considerations

This tool deals with sensitive data. Design decisions must be deliberate:

**1. Never reduce a neighborhood to a single crime number.** Every colonia profile leads with the multi-dimensional score, not just safety. A colonia with high crime but excellent transit, services, and community infrastructure tells a different story than a colonia with high crime and nothing else.

**2. Normalize per capita.** Absolute crime counts are misleading — a colonia with 100,000 residents will have more incidents than one with 5,000 even at identical rates. Always show per-1,000-resident rates.

**3. Show trends, not just snapshots.** A colonia with high historical crime but rapidly improving trends is in a different position than one with stable high crime. Always include the trend arrow.

**4. Handle sexual violence data carefully.** Sexual crimes are notoriously underreported, and displaying raw counts could create a false sense of safety in areas with low reporting. Include in the aggregate but don't create a standalone "sexual violence" map layer. Add a note about underreporting.

**5. Contextualize, don't stigmatize.** Claude's narrations should be balanced: "Colonia X has a higher-than-average crime rate, primarily driven by property theft. It also has excellent transit access, a vibrant market scene, and improving safety trends." Not: "Colonia X is dangerous."

**6. Acknowledge data limitations.** Crime data only reflects reported and investigated crimes. Wealthier colonias may report more. The GTFS is from 2022. The IDS is from 2020. Surface these caveats in the UI.

**7. Include positive dimensions.** The tool should make you want to discover colonias, not just avoid them. Markets, public spaces, parks, cultural infrastructure, walkability — these are reasons to choose a neighborhood, and they come from the same open data portal.

---

## Build plan

### Pre-work (Thursday/Friday, ~4-5 hours)

This project is pre-processing-heavy. The hackathon day should be mostly frontend and Claude integration.

1. **Download all datasets** — ~15 CSVs, GeoJSONs, SHPs
2. **Build colonia feature table:**
   - Load colonia polygons
   - Point-in-polygon join for carpetas FGJ (millions of records — use geopandas spatial index)
   - Aggregate crime by colonia × crime category × time period
   - Join víctimas for demographic breakdowns
   - Join hechos de tránsito by colonia
   - Compute transit access: spatial join transit stations within buffer of each colonia
   - Join tabular datasets (services, IDS, 0311) on colonia name
   - Normalize per capita using Censo 2020 population
   - Compute all sub-scores and overall score
3. **Export** — Single GeoJSON with all features. Probably 5-10 MB. Also export as a flat JSON lookup by colonia name for Claude queries.
4. **Validate** — Spot-check known colonias (Roma Norte, Tepito, Polanco, Santa Fe) against expectations.

### Saturday build (5-6 hours)

| Time | Task | Deliverable | Priority |
|------|------|-------------|----------|
| 09:00–10:30 | Choropleth map + colonia click | MapLibre map with colored colonias, click opens basic profile panel | Must ship |
| 10:30–12:00 | Profile panel: full multi-dimension dashboard | Score radar chart, crime breakdown, transit detail, services bars, trend indicators | Must ship |
| 12:00–13:00 | Compare mode + search | Side-by-side comparison, search by colonia name with autocomplete | Must ship |
| 13:00–14:00 | Claude Q&A integration | Natural language queries about colonias, Claude narrates profiles contextually | Must ship |
| 14:00–14:30 | Layer toggles: transit, Ecobici, markets, heatmap | Toggle overlays for additional context on the map | Stretch |
| 14:30–15:00 | Polish: mobile, loading, ethical caveats | Responsive layout, data source attribution, limitation notes | Must ship |

---

## Scope: in vs. out

### In scope

- All ~1,800 colonias with polygon boundaries
- Safety scoring from FGJ carpetas (2016-present, emphasis on last 12 months)
- Traffic safety from SSC hechos de tránsito
- Transit access computed from station geolocations
- Urban services from per-colonia service datasets
- IDS 2020 social development index
- 0311 government responsiveness metrics
- Interactive choropleth with dimension toggle
- Colonia profile panel with multi-dimensional breakdown
- Compare mode (2-3 colonias)
- Claude natural language Q&A
- Ethical framing: per-capita rates, trends, balanced narration

### Out of scope

- Real-time data (this is a snapshot tool, not a live feed)
- Street-level routing (that's Muévete CDMX)
- Rental price data (not available in datos.cdmx)
- Restaurant/nightlife data (not government data)
- Building-level granularity (data is colonia-level)
- User accounts or saved searches
- Push notifications or alerts

---

## Tech stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Pre-processing | Python, geopandas, pandas | Spatial joins, aggregation, feature engineering |
| Map rendering | MapLibre GL JS | Free, fast choropleth from GeoJSON, no API key |
| Charts | Chart.js or Recharts (if React) | Radar chart, bar charts, sparklines in profile panel |
| Search | Client-side fuzzy search (Fuse.js) | ~1,800 colonias is small enough for in-browser search |
| Claude Q&A | Claude API (Sonnet) | Natural language colonia queries with feature table as context |
| Hosting | Static files (demo from laptop) | The entire app is a GeoJSON + HTML/JS — no backend needed |

---

## Demo script (5 minutes)

1. **Hook (30s):** "Everyone asks the same question about CDMX: 'which colonia should I stay in?' Today, the answer comes from Facebook groups. We think it should come from data."

2. **Map overview (60s):** Show the choropleth — all colonias colored by overall score. Point out patterns: the central corridor (Roma, Condesa, Juárez, Polanco) scoring well; contrasts with eastern periphery. Toggle to safety-only, then transit-only, then urban quality. Show how the picture changes with each lens.

3. **Colonia deep dive (60s):** Click Roma Norte. Show the full profile: safety score 72 (above average), trend improving -8% YoY, primarily theft-driven. Transit: 3 Metro stations, 4 Metrobús, 12 Ecobici. Walkability: high. Markets: 2. "This is the full picture in one click."

4. **Compare (45s):** Compare Roma Norte vs. Narvarte vs. Del Valle. Overlay radar charts. "Narvarte has lower crime but fewer transit options. Del Valle is the middle ground." This is the moment a prospective renter says "oh, I see."

5. **Claude Q&A (45s):** Type "I'm moving to CDMX with my family. We need a colonia near good schools, safe, with metro access, budget-friendly." Claude responds with 3 ranked recommendations, each with a one-paragraph justification referencing actual data.

6. **Close (30s):** "This is 15 government datasets from datos.cdmx.gob.mx, combined into one tool. No Facebook group needed."

---

## Future directions

- **Temporal explorer:** Slider to see how each colonia's safety profile has evolved from 2016 to today. Animated choropleth.
- **"Colonias like this" recommender:** Given a colonia you like, find others with similar profiles using cosine similarity on the feature vector.
- **Rental price integration:** If/when rental price data becomes available (Inmuebles24 scraping, Airbnb data), add affordability as a dimension.
- **Visitor mode vs. resident mode:** Different weight presets — tourists care about walkability and petty theft; residents care about schools and government responsiveness.
- **Street-level safety:** Integrate with Muévete CDMX's safe routing — "not just which colonia, but which streets within it."
- **Multilingual:** English + Spanish interface. Many users of this tool will be non-Spanish-speaking expats.
- **Embeddable widget:** Let real estate sites and Airbnb hosts embed a colonia score badge.
