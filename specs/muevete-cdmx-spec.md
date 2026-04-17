# Muévete CDMX — Bike-first multimodal routing

**Claude Impact Lab · Ciudad de México · April 18, 2026**
**Challenge track:** Movilidad Inteligente

---

## Problem

No app in CDMX currently combines safe bike routing with multimodal public transit. Google Maps offers bike OR transit directions but never treats Ecobici as a first/last mile option with safety-aware routing. Moovit has Metrobús real-time data but no bike routing. Ecobici's own app shows station availability but can't plan routes. Meanwhile, 6M+ daily transit riders and a growing cycling population navigate a system with 580km of bike infrastructure, 12 Metro lines, 7 Metrobús lines, Tren Ligero, Cablebús, and Trolebús — all disconnected in terms of trip planning.

The result: people either bike the whole way (often on unsafe roads) or take transit door-to-door (with long walks to/from stations). The obvious combination — bike to the nearest transit station via safe streets, ride transit across the city, bike the last mile to your destination — isn't available anywhere.

## Solution

**Muévete CDMX** is a multimodal trip planner that treats Ecobici as the first and last mile of any trip across the city. It routes bike legs through the safest streets (using government data on bike lanes, cyclist accidents, and traffic violations), connects them to the transit backbone (Metro, Metrobús, Tren Ligero, Cablebús, Trolebús), and incorporates real-time data from both Ecobici (bike/dock availability) and Metrobús (vehicle positions, arrival estimates).

Users describe their trip in natural language — "de Coyoacán a Polanco, ruta segura" — and receive a multimodal route that minimizes a combination of travel time and danger, with live updates on bike availability and Metrobús arrival times.

---

## Data sources

All primary datasets come from the CDMX open data portal (datos.cdmx.gob.mx) and related government APIs.

### Safety scoring layer

| Dataset | Source | Format | Freshness | Role |
|---------|--------|--------|-----------|------|
| Infraestructura vial ciclista v11 | SEMOVI via datos.cdmx | GeoJSON | March 2025 | 651 bike lane segments with type (ciclovía, ciclocarril, bus-bici, emergente) and status (active, needs maintenance, out of service). Primary positive signal for safe routing. |
| Puntos de accidentes de ciclistas | Instituto de Planeación Democrática via datos.cdmx | GeoJSON | TBD — validate on download | Dedicated geospatial layer of cyclist accident locations. Primary negative signal for danger scoring. |
| Hechos de tránsito SSC 2024 | Secretaría de Seguridad Ciudadana via datos.cdmx | CSV with coordinates | Full year 2024 | All traffic incidents including cyclist-related. Supplement to the dedicated accident points. Filterable by tags: bicicletas, ciclistas. |
| Fotocívicas | SEMOVI via datos.cdmx | CSV, georeferenced | Updated regularly | Traffic camera violations (speeding, red-light running). Proxy for dangerous driving behavior on specific corridors. |

### Transit network layer

| Dataset | Source | Format | Freshness | Role |
|---------|--------|--------|-----------|------|
| GTFS estático CDMX | SEMOVI via datos.cdmx | ZIP (8 CSV files) | October 2022 | Routes, stops, stop_times, frequencies, shapes for Metro, Metrobús, RTP, Trolebús, Tren Ligero, Cablebús, Suburbano, Pumabús. Source for station-to-station travel times and transfer logic. |
| Metro stations geolocation | SEMOVI via datos.cdmx | SHP + KMZ | ~2022 | Authoritative station positions for STC Metro. Use to validate/supplement GTFS stops. |
| Metrobús stations geolocation | SEMOVI via datos.cdmx | SHP | January 2024 | Authoritative station positions for all 7 Metrobús lines. |
| STE stations (Tren Ligero, Trolebús, Cablebús) | SEMOVI via datos.cdmx | SHP | September 2024 | Station/stop positions for Servicios de Transportes Eléctricos. |

### Ecobici layer

| Dataset | Source | Format | Freshness | Role |
|---------|--------|--------|-----------|------|
| Cicloestaciones Ecobici (new system) | SEMOVI via datos.cdmx | SHP + CSV | October 2024 | All station locations with physical characteristics. Static baseline for station positions. |
| Ecobici GBFS real-time feed | ecobici.cdmx.gob.mx | JSON (GBFS standard) | Live, continuous | Real-time bike and dock availability per station. Endpoint: `https://gbfs.mex.lyftbikes.com/gbfs/gbfs.json` |

### Real-time layer

| Dataset | Source | Format | Freshness | Role |
|---------|--------|--------|-----------|------|
| Metrobús GTFS-RT | metrobus.cdmx.gob.mx | Protocol Buffers (GTFS-RT) | 30-second refresh | Vehicle positions, trip updates (arrival predictions), and service alerts. Free API key required — register at metrobus.cdmx.gob.mx/portal-ciudadano/datos-abiertos |

### Supplementary

| Dataset | Source | Format | Role |
|---------|--------|--------|------|
| OpenStreetMap CDMX extract | Geofabrik | PBF | Routable street graph for bike network. Contains highway type, surface quality, one-way tags, cycleway tags. |

---

## Architecture

### Overview

The system is a three-layer graph with connector edges:

```
┌─────────────────────────────────────────────────────────┐
│                    User query (NL)                       │
│         "de Roma Norte a Polanco, ruta segura"           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  Claude (LLM)  │
              │  Parse origin, │
              │  destination,  │
              │  preferences   │
              └───────┬────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │     Candidate generator     │
        │                             │
        │  1. Find nearby Ecobici     │
        │     stations (origin/dest)  │
        │  2. Find nearby transit     │
        │     stations for each       │
        │  3. Generate candidate      │
        │     trip combinations       │
        └──────────────┬──────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌────────────┐ ┌─────────┐ ┌──────────┐
   │ Bike router│ │ Transit │ │ Real-time│
   │ (weighted) │ │ lookup  │ │ enricher │
   │            │ │         │ │          │
   │ OSMnx +    │ │ GTFS    │ │ GBFS +   │
   │ safety     │ │ stop_   │ │ GTFS-RT  │
   │ scores     │ │ times   │ │          │
   └─────┬──────┘ └────┬────┘ └─────┬────┘
         │             │            │
         └─────────────┼────────────┘
                       ▼
              ┌────────────────┐
              │  Trip ranker   │
              │  Score by time │
              │  + safety %    │
              │  Return top 3  │
              └───────┬────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │     Map visualization       │
        │  Color-coded route legs     │
        │  Safety overlay             │
        │  Live availability markers  │
        │  Metrobús ETA               │
        └─────────────────────────────┘
```

### Layer 1: Bike network (safety-weighted graph)

**Source:** OpenStreetMap CDMX extract, processed through OSMnx to produce a networkx directed graph.

**Bounding box:** Ecobici service area — approximately latitudes 19.35–19.47, longitudes -99.22 to -99.10. This covers Polanco, Roma, Condesa, Centro, Juárez, Coyoacán, Del Valle, Nápoles, and surrounding neighborhoods.

**Safety scoring per edge:**

Each OSM edge (street segment) receives a safety multiplier computed from four data layers:

```
segment_cost = base_travel_time × safety_multiplier

safety_multiplier = infra_bonus × accident_penalty × traffic_penalty × road_type_factor
```

**infra_bonus** (from Infraestructura ciclista v11, spatial join to OSM edges):
- 0.3 — dedicated ciclovía, active status
- 0.5 — ciclocarril or bus-bici, active status
- 0.7 — ciclovía emergente or status "requires maintenance"
- 1.0 — no bike infrastructure on this segment

**accident_penalty** (from Puntos de accidentes ciclistas + Hechos de tránsito 2024):
- Count cyclist-related incidents within a 50m buffer of the segment
- `1.0 + (incident_count / normalization_threshold)`
- Threshold TBD empirically — calibrate so the highest-accident segments get ~2.0x penalty

**traffic_penalty** (from Fotocívicas):
- Count traffic violations within 100m buffer
- `1.0 + (violation_count / normalization_threshold)`
- Captures corridors with aggressive driving patterns

**road_type_factor** (from OSM highway tag):
- 0.6 — residential, living_street
- 0.8 — secondary, tertiary
- 1.0 — unclassified, service
- 1.2 — primary
- 2.0 — trunk (heavily penalize — bikes should almost never be routed here)

**Pre-computation:** All spatial joins and safety multipliers are computed offline and stored as edge attributes in the networkx graph. Serialized as a pickle file for fast loading at query time.

### Layer 2: Transit network (GTFS lookup table)

**Source:** GTFS estático CDMX (October 2022), supplemented by geolocation SHP files for station position accuracy.

**Approach:** Pre-compute a station-to-station travel time matrix covering all reasonable transit trips.

**Steps:**
1. Parse `stops.txt` — extract all station IDs, names, and coordinates for Metro, Metrobús, Tren Ligero, Cablebús, Trolebús
2. Parse `stop_times.txt` — compute travel time between consecutive stops on each trip
3. Parse `frequencies.txt` — extract average headway (wait time) per line per time-of-day
4. Build a transit graph where nodes = stations, edges = (travel_time + avg_wait/2 for first boarding)
5. Compute shortest paths between all station pairs using Dijkstra (including transfers)
6. Store as a dictionary: `{(origin_station_id, dest_station_id): {time_seconds, transfers, route_description}}`

**Transfer logic:**
- Transfers at interchange stations (e.g., Tacubaya, Insurgentes, Chabacano) add: walk time between platforms (estimated 3-5 min) + half the headway of the connecting line
- Free transfers within Metro and within Metrobús; no penalty. Metro ↔ Metrobús requires separate fare — note in route description but don't change routing logic

**Known limitation:** GTFS is from October 2022. Metro Line 12 was partially closed for repairs and may have inaccurate station data. Validate against the Metro geolocation SHP (which is more recent). For the hackathon, note discrepancies in the UI rather than trying to fix the GTFS.

### Layer 3: Walk network (simple distance)

**Approach:** No graph needed. Compute walk time between any two points as Manhattan distance ÷ 4.5 km/h walk speed. Used for:
- Origin → nearest Ecobici station
- Ecobici station → nearest transit station
- Transit station → Ecobici station
- Ecobici station → destination
- Transit station → destination (when outside Ecobici zone)

### Connector edges

The three layers are linked at specific points:

**Ecobici ↔ Bike network:** Each Ecobici station is snapped to the nearest OSM node. Bike routing starts/ends at these nodes.

**Ecobici ↔ Transit:** For every Ecobici station within 500m of a transit station, a connector edge exists with cost = walk time between them. This is the critical link that enables bike-to-transit-to-bike trips.

**How many connectors?** In central CDMX, there are ~480 Ecobici stations and ~200 Metro/Metrobús/STE stations within the service area. Most Metro/Metrobús stations have 2-5 Ecobici stations within 500m. Expected ~600-800 connector edges total.

### Query algorithm

Given origin (lat, lon) and destination (lat, lon):

```
1. FIND CANDIDATE ECOBICI STATIONS
   origin_stations = 5 nearest Ecobici stations to origin with bikes > 0 (GBFS)
   dest_stations   = 5 nearest Ecobici stations to destination with docks > 0 (GBFS)

2. CLASSIFY TRIP TYPE
   if straight-line distance < 4km:
       → Try bike-only route (no transit)
   else:
       → Multimodal: bike + transit + bike

3. FOR BIKE-ONLY TRIPS
   For each (origin_stn, dest_stn) pair:
       route = weighted_shortest_path(bike_graph, origin_stn, dest_stn)
       cost  = walk_to_origin_stn + bike_time + walk_from_dest_stn

4. FOR MULTIMODAL TRIPS
   For each origin_stn in origin_stations:
       entry_transit_stns = transit stations within 500m of origin_stn

   For each dest_stn in dest_stations:
       exit_transit_stns = transit stations within 500m of dest_stn

   For each (origin_stn, entry_transit, exit_transit, dest_stn) combination:
       bike_leg_1  = weighted_shortest_path(bike_graph, origin_stn, entry_transit_area)
       transit_leg = transit_lookup[(entry_transit, exit_transit)]
       bike_leg_2  = weighted_shortest_path(bike_graph, exit_transit_area, dest_stn)

       total_time = walk_to_origin_stn
                  + bike_leg_1.time
                  + walk_origin_stn_to_transit
                  + transit_leg.time
                  + walk_transit_to_dest_stn
                  + bike_leg_2.time
                  + walk_from_dest_stn

       safety_pct = % of bike distance on dedicated infrastructure

5. ENRICH WITH REAL-TIME DATA
   For each candidate route:
       Check GBFS: are bikes/docks still available at suggested stations?
       If route includes Metrobús: fetch GTFS-RT trip updates
           → Replace scheduled arrival with live ETA
           → Include service alerts if any

6. RANK AND RETURN TOP 3
   Score = α × total_time + β × (1 - safety_pct)
   Where α and β are tunable weights (default: α=0.7, β=0.3)
   Offer "fastest" (α=1, β=0) vs "safest" (α=0.3, β=0.7) toggle
```

**Performance note:** This generates ~5 × 3 × 3 × 5 = 225 candidate combinations in the worst case. Most are prunable (transit trip takes longer than biking directly, station is in the wrong direction). After pruning, expect ~20-30 actual bike routing calls, each within the bounded Ecobici zone graph. On a modern laptop with OSMnx/networkx, each shortest-path call takes <100ms. Total query time target: <3 seconds.

---

## Tech stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Bike graph + routing | Python, OSMnx, networkx | OSMnx pulls OSM data and builds networkx graph in ~10 lines. Weighted shortest path is built-in. |
| Data pre-processing | Python, geopandas, shapely | Spatial joins (accidents → road segments, bike lanes → OSM edges). Standard geospatial stack. |
| Transit lookup | Python, pandas | Parse GTFS CSVs, build travel time matrix. Simple data wrangling. |
| Real-time APIs | Python, requests, protobuf | Ecobici GBFS is plain JSON. Metrobús GTFS-RT is Protocol Buffers. |
| Backend API | FastAPI or Flask | Expose routing engine as REST endpoint for the frontend. |
| Frontend map | Leaflet.js or Mapbox GL JS | Route polylines, station markers, real-time overlays. |
| NL interface | Claude API (Sonnet) | Parse natural language trip requests, generate route narratives. |
| Deployment | Local laptop for demo | No cloud needed for hackathon. |

---

## User interface

### Input
- Text field: natural language query ("de la Roma a Polanco, ruta segura")
- Alternative: click origin + destination on map
- Toggle: "más segura" ↔ "más rápida" (adjusts α/β weights)

### Output: route card
- Total estimated time with breakdown per leg
- Leg-by-leg instructions with leg type badges:
  - 🚶 Walk (gray) — "walk 3 min to Ecobici Ámsterdam"
  - 🚲 Ecobici (green) — "ride 12 min via Ámsterdam ciclovía"
  - 🚇 Metro (blue) — "take L9 to Tacubaya, transfer to L1, exit Chapultepec (14 min)"
  - 🚌 Metrobús (red) — "take L1 south, exit Insurgentes (8 min) — next bus in 3 min"
  - 🚃 Tren Ligero / Cablebús / Trolebús (amber)
- Safety stats: "87% of bike distance on dedicated infrastructure"
- Live indicators: bike/dock counts at suggested Ecobici stations, Metrobús ETA

### Output: map
- Route polyline color-coded by leg type
- Bike leg segments colored by safety: green (ciclovía), yellow (ciclocarril/mixed), red (no infrastructure)
- Ecobici station markers with live availability (bikes or docks count)
- Transit station markers at entry/exit points
- Accident hotspot overlay (toggleable)
- Alternative routes shown as faded lines

---

## Build plan

### Pre-work (Thursday/Friday evening, ~3-4 hours)

**Goal:** Arrive Saturday with all data downloaded, parsed, and the bike graph built.

1. **Download datasets** — all CSVs, GeoJSONs, SHPs from datos.cdmx.gob.mx
2. **Register Metrobús API key** — at metrobus.cdmx.gob.mx/portal-ciudadano/datos-abiertos
3. **Build bike graph** — OSMnx download of Ecobici zone, convert to networkx
4. **Safety scoring** — spatial join bike infrastructure, accidents, fotocívicas to OSM edges; compute multipliers; save as edge attributes
5. **Transit lookup** — parse GTFS into station-to-station time dictionary
6. **Ecobici-transit connectors** — identify all Ecobici stations within 500m of transit stations
7. **Validate** — spot-check a few known routes manually. Verify Metro L12 stations against SHP.
8. **Serialize** — pickle the bike graph, JSON the transit lookup and connector map

**Deliverable:** A `/data` folder with ready-to-load files.

### Saturday build (5-6 hours)

| Time | Task | Deliverable | Priority |
|------|------|-------------|----------|
| 09:00–10:30 | Core routing engine | Python module: given (origin, dest, preference), return ranked routes with legs, times, safety % | Must ship |
| 10:30–12:00 | Map visualization | Leaflet/Mapbox frontend showing color-coded route, station markers, leg breakdown panel | Must ship |
| 12:00–13:30 | Real-time integration | Ecobici GBFS on each query (bike/dock availability); Metrobús GTFS-RT for live ETA on Metrobús legs | Must ship |
| 13:30–14:30 | Claude NL interface + polish | Natural language input parsing via Claude API; route narration; safest/fastest toggle; UI polish | Must ship |
| 14:30–15:30 | Stretch: safety dashboard | Per-route safety stats, time-of-day awareness, alternative route comparison | Stretch |

---

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| GTFS is from Oct 2022 — some station data may be stale | Incorrect travel times or missing stations | Validate against geolocation SHP files (more recent). Flag discrepancies in UI. Use SHP positions as authoritative. |
| Metrobús API key not approved in time | No real-time Metrobús data | Register immediately (this week). Fallback: use GTFS scheduled times and show "estimated" instead of "live". |
| OSMnx routing too slow for demo | Slow query response | Bound graph to Ecobici zone bounding box. Pre-compute common origin/destination station pairs. Cache recent queries. Target: <3s per query. |
| Spatial joins produce incorrect matches | Wrong safety scores | Use conservative buffer distances (50m for accidents, 100m for fotocívicas). Visualize overlay on map to sanity-check. |
| Ecobici GBFS endpoint is down during demo | No live availability | Cache last known station data. Show "last updated X min ago" with stale data. |
| No real-time data for Metro | Can't show live Metro arrival | Accept this limitation. Show scheduled frequency: "Metro L1 runs every 3 min at this hour". Note in UI that Metro times are estimated. |
| Safety data may have temporal bias | Accident clusters from years ago may not reflect current conditions | Weight recent data higher (2024 hechos de tránsito > older puntos de accidentes). Note data recency in safety overlay. |

---

## Demo script (5 minutes)

1. **Hook (30s):** "6 million people ride CDMX transit daily. 580km of bike lanes connect them. But no app knows how to combine the two safely."

2. **Short trip demo (90s):** Roma Norte → Condesa. Show bike-only safe route avoiding Insurgentes, riding via Ámsterdam ciclovía. Compare: Google Maps sends you straight down Insurgentes. Our route is 3 min longer but 94% on bike lanes.

3. **Long trip demo (90s):** Coyoacán → Polanco. Show multimodal: Ecobici to Metro Chilpancingo → Metro to Chapultepec → Ecobici via Reforma ciclovía to Polanco. Show the Ecobici station has 8 bikes available (live). Show safety breakdown.

4. **Real-time demo (60s):** Change destination to include Metrobús leg. Show live Metrobús ETA: "next bus in 2 min at Insurgentes". Toggle "safest" vs "fastest" — show how the bike legs change.

5. **Data story (30s):** "Every data layer you see — bike lanes, accidents, transit schedules, real-time feeds — comes from datos.cdmx.gob.mx. This is what open data makes possible."

---

## Future directions (beyond hackathon)

- **Elevation-aware routing:** Integrate DEM data to penalize steep climbs (Polanco hills, Santa Fe)
- **Personal bike mode:** Route from any point, not just Ecobici stations
- **Weather integration:** Rain penalty, contingencia ambiental alerts
- **Crowdsourced safety updates:** Let cyclists report hazards, construction, dark streets
- **RTP and concession bus routes:** Extend transit backbone when data improves
- **Real-time Metro:** If STC Metro ever publishes GTFS-RT
- **Time-of-day safety weighting:** Some corridors are safe at noon but dangerous at midnight
- **Route learning:** Use Ecobici trip data (historical OD pairs) to identify most popular safe corridors
