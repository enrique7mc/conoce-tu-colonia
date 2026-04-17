# Metrobús en Vivo — Real-time live map of CDMX Metrobús

**Claude Impact Lab · Ciudad de México · April 18, 2026**
**Challenge track:** Movilidad Inteligente

---

## Problem

Metrobús moves 1.5 million people daily across 7 lines and 339 stations — but riders have no way to see where their bus actually is. Google Maps recently integrated Metrobús real-time data (March 2026), but only as arrival estimates buried inside trip planning. The App CDMX shows similar point estimates. Nobody has built what cities like NYC, London, and Tokyo have had for years: a live, animated map showing every vehicle in the system moving in real time.

This matters for two reasons. First, practical: a rider at Insurgentes station can glance at a live map and see that the next L1 bus is three stations away and moving vs. stuck in a gap. Second, civic: a live fleet map makes the system legible. It exposes service quality — gaps between buses, bunching, lines running thin — in a way that a schedule never can. When 22 million people depend on public transit, making the system visible is an act of transparency.

## Solution

**Metrobús en Vivo** is a real-time animated map that shows the live position of every active Metrobús unit across all 7 lines. It polls the Metrobús GTFS-RT feed every 30 seconds, plots each bus as a colored dot on the map, and smoothly animates movement between updates. Users can click any station to see upcoming arrivals, view active service alerts, and toggle between a geographic map and a clean schematic diagram. An optional Claude-powered analytics layer detects anomalies like unusual gaps and service degradation.

---

## Data sources

This project requires remarkably few data sources — its power comes from the real-time feed.

### Primary: real-time

| Dataset | Source | Format | Refresh | Content |
|---------|--------|--------|---------|---------|
| Metrobús GTFS-RT: VehiclePositions | metrobus.cdmx.gob.mx | Protocol Buffers | 30 seconds | Latitude, longitude, bearing, speed, timestamp, vehicle_id, trip_id, current_stop_sequence for every active bus |
| Metrobús GTFS-RT: TripUpdates | metrobus.cdmx.gob.mx | Protocol Buffers | 30 seconds | Predicted arrival/departure times at upcoming stops for each active trip, delay in seconds |
| Metrobús GTFS-RT: ServiceAlerts | metrobus.cdmx.gob.mx | Protocol Buffers | As needed | Active alerts: closures, detours, delays, causes, affected routes and stops |

**Access:** Free API key required. Register at https://metrobus.cdmx.gob.mx/portal-ciudadano/datos-abiertos (follow link to registration form). Allow 1-3 business days for approval.

### Static: route geometry and station positions

| Dataset | Source | Format | Freshness | Content |
|---------|--------|--------|-----------|---------|
| GTFS estático CDMX | SEMOVI via datos.cdmx.gob.mx | ZIP (CSV files) | October 2022 | `shapes.txt` — polyline geometry for each Metrobús route. `stops.txt` — station names and coordinates. `routes.txt` — line names and colors. `trips.txt` — trip-to-route mapping. |
| Metrobús stations geolocation | SEMOVI via datos.cdmx.gob.mx | SHP | January 2024 | Authoritative station positions for all 7 lines. More recent than GTFS. Use as ground truth for station coordinates. |

### Fallback (if API key is not approved in time)

| Dataset | Source | Format | Content |
|---------|--------|--------|---------|
| Ubicación de las unidades del Metrobús | datos.cdmx.gob.mx | JSON/CSV | Vehicle positions from the last hour. Not truly real-time but sufficient for a demo with playback animation. Updated regularly on the portal. |

---

## The 7 Metrobús lines

| Line | Route | Color | Length | Stations | Key corridor |
|------|-------|-------|--------|----------|-------------|
| L1 | Indios Verdes ↔ El Caminero | Red (#E3242B) | 30 km | 45 | Av. Insurgentes (the world's longest urban avenue) |
| L2 | Tacubaya ↔ Tepalcates | Purple (#9B59B6) | 20 km | 36 | Eje 4 Sur |
| L3 | Tenayuca ↔ Pueblo Santa Cruz Atoyac | Green (#27AE60) | 20 km | 34 | Eje 1 Poniente |
| L4 | Buenavista ↔ Aeropuerto T1 | Gold (#F39C12) | 28 km | 24 | Airport express corridor |
| L5 | Río de los Remedios ↔ La Raza (extended) | Blue (#2980B9) | 20 km | 43 | Eje 3 Oriente |
| L6 | El Rosario ↔ El Caminero | Orange (#E67E22) | 20 km | 37 | Eje 5 Norte |
| L7 | Indios Verdes ↔ Glorieta de Vaqueritos | Dark Red (#C0392B) | 25 km | ~32 | Paseo de la Reforma (double-decker buses) |

Total: ~163 km of dedicated bus lanes, 339+ stations, estimated 200+ vehicles in active service during peak hours.

---

## Architecture

### System overview

```
┌──────────────────────────────────────────────────┐
│           Metrobús GTFS-RT API                   │
│  VehiclePositions · TripUpdates · ServiceAlerts  │
└─────────────────────┬────────────────────────────┘
                      │ Poll every 30s (protobuf)
                      ▼
            ┌───────────────────┐
            │   Backend (API)   │
            │                   │
            │  Parse protobuf   │
            │  Match to GTFS    │
            │  Snap to routes   │
            │  Compute deltas   │
            │  Detect anomalies │
            └────────┬──────────┘
                     │ WebSocket push
                     ▼
            ┌───────────────────┐
            │  Frontend (Map)   │
            │                   │
            │  Geographic view  │
            │  Schematic view   │
            │  Station popups   │
            │  Alert banners    │
            │  Fleet stats      │
            └───────────────────┘
```

### Backend

**Language:** Python

**Responsibilities:**

1. **Poll GTFS-RT** — Every 30 seconds, fetch VehiclePositions, TripUpdates, and ServiceAlerts from the Metrobús API. Parse Protocol Buffers using `gtfs-realtime-bindings` Python library.

2. **Enrich with GTFS static** — Match each vehicle's `trip_id` to a route and line via GTFS `trips.txt` and `routes.txt`. Resolve `current_stop_sequence` to a station name via `stop_times.txt`.

3. **Snap to route geometry** — Raw GPS positions may be slightly off the road. Snap each vehicle's lat/lon to the nearest point on the route's polyline (from `shapes.txt`). This ensures dots follow the lines visually. Simple nearest-point-on-line algorithm, not a full map-matching engine.

4. **Compute interpolation hints** — For each vehicle, compute bearing (direction of travel along the line) and estimated speed. Send these to the frontend so it can smoothly animate between 30-second updates rather than jumping.

5. **Detect anomalies (stretch goal)** — Compare current vehicle positions against expected spacing. Flag: large gaps (no bus for N km on a line), bunching (3+ buses within 500m), and deviations from route geometry.

6. **Push via WebSocket** — Broadcast enriched vehicle data to all connected frontends. Message format:

```json
{
  "timestamp": "2026-04-18T14:23:45Z",
  "vehicles": [
    {
      "id": "MB-1247",
      "line": "L1",
      "color": "#E3242B",
      "lat": 19.4326,
      "lon": -99.1332,
      "bearing": 185.2,
      "speed_kmh": 22,
      "next_station": "Insurgentes",
      "next_arrival_sec": 45,
      "delay_sec": 120,
      "snapped_position": [19.4325, -99.1333],
      "route_progress_pct": 0.42
    }
  ],
  "alerts": [
    {
      "line": "L3",
      "message": "Servicio suspendido entre Tenayuca y Potrero por obras",
      "severity": "WARNING"
    }
  ],
  "fleet_stats": {
    "total_active": 47,
    "by_line": {"L1": 12, "L2": 8, "L3": 7, "L4": 5, "L5": 6, "L6": 5, "L7": 4}
  }
}
```

**Stack:** FastAPI + `websockets` + `gtfs-realtime-bindings` + `shapely` (for route snapping)

### Frontend

**Framework:** Vanilla JS with MapLibre GL JS (free, no API key needed) or Mapbox GL JS

#### View 1: Geographic map

The primary view. A street map of CDMX with:

- **Route polylines** — 7 colored lines drawn from GTFS `shapes.txt`. Semi-transparent, 4px width. Each line uses its official Metrobús color.
- **Station markers** — Small circles at each station position. Subtle at default zoom (3px), expand on hover with name tooltip.
- **Vehicle dots** — Larger circles (10-12px) with line color, white border. Positioned at snapped coordinates. Rotate based on bearing. Smoothly animated between updates.
- **Animation** — On each WebSocket message, tween vehicle dots from current position to new position over 2-3 seconds using `requestAnimationFrame`. This creates the illusion of continuous movement.
- **Click station** → popup with:
  - Station name and line(s)
  - Next arrivals: "L1 norte → 1 min · L1 sur → 4 min" (from TripUpdates)
  - Current delay: "+2 min" in amber if late
- **Alert banner** — Fixed bar at top showing active ServiceAlerts with line badge and message.

#### View 2: Schematic diagram

A stylized transit diagram inspired by Harry Beck's London Underground map:

- Lines straightened into horizontal, vertical, and 45° segments
- Stations evenly spaced regardless of actual distance
- Interchange stations (where Metrobús crosses Metro) marked distinctly
- Bus dots animate along the schematic paths proportional to their route progress percentage
- Arrival countdowns displayed inline next to each station

**Implementation:** Pre-build the schematic as an SVG path for each line. Map each vehicle's `route_progress_pct` (0.0 = start terminus, 1.0 = end terminus) to a point along the SVG path. Animate along the path.

The schematic SVG can be hand-drawn or generated algorithmically. For the hackathon, hand-drawing 7 lines as clean paths is faster and produces a better result. Each line is a single `<path>` element with stations as `<circle>` elements at fixed positions along it.

**Toggle:** Button or keyboard shortcut to switch between geographic and schematic views. Crossfade transition.

#### Fleet dashboard panel (sidebar or bottom)

- **Active buses:** total count, sparkline of last hour
- **Per-line breakdown:** line badge + bus count + average headway
- **System health:** green/yellow/red indicator per line based on gap analysis
- **Clock:** current time + "data updated X seconds ago"

---

## Smooth animation — the key detail

The difference between a "meh" live map and a mesmerizing one is animation quality. With 30-second update intervals, naive plotting creates jerky jumps. The solution:

### Position interpolation

```javascript
// On each WebSocket message:
for (const vehicle of message.vehicles) {
  const marker = markers.get(vehicle.id);
  if (marker) {
    // Store previous and new position
    marker.prevPos = marker.currentPos;
    marker.nextPos = [vehicle.lon, vehicle.lat];
    marker.prevBearing = marker.currentBearing;
    marker.nextBearing = vehicle.bearing;
    marker.animStart = performance.now();
    marker.animDuration = 2500; // 2.5 second smooth transition
  }
}

// In render loop (requestAnimationFrame):
function animate(now) {
  for (const [id, marker] of markers) {
    const elapsed = now - marker.animStart;
    const t = Math.min(elapsed / marker.animDuration, 1);
    const eased = easeInOutCubic(t);

    // Interpolate position
    const lat = lerp(marker.prevPos[1], marker.nextPos[1], eased);
    const lon = lerp(marker.prevPos[0], marker.nextPos[0], eased);

    // Interpolate bearing (handle 360° wraparound)
    const bearing = lerpAngle(marker.prevBearing, marker.nextBearing, eased);

    updateMarkerPosition(marker, [lon, lat], bearing);
  }
  requestAnimationFrame(animate);
}
```

### Route snapping on the client

After interpolation, snap the animated position to the route polyline so buses don't cut corners. Use Turf.js `nearestPointOnLine()` for client-side snapping:

```javascript
import { nearestPointOnLine } from '@turf/nearest-point-on-line';

const snapped = nearestPointOnLine(routeLineString, [lon, lat]);
```

This ensures dots always follow the Metrobús route geometry, even during animation.

### Handling vehicle appearance/disappearance

- **New vehicle appears:** Fade in with opacity 0→1 over 500ms
- **Vehicle disappears (trip ended, out of service):** Fade out over 1 second, then remove
- **Vehicle at terminus:** Show a subtle pulse animation to indicate it's stopped and will reverse

---

## Build plan

### Pre-work (Thursday/Friday, ~1-2 hours)

1. **Register for Metrobús API key** — if not already done for Muévete CDMX
2. **Extract GTFS route data** — download GTFS ZIP, extract `shapes.txt`, `stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`. Filter to Metrobús-only records. Convert `shapes.txt` to GeoJSON LineStrings per route. Convert `stops.txt` to GeoJSON Points.
3. **Build schematic SVG (if attempting Tier 2)** — hand-draw or trace the 7 Metrobús lines as clean SVG paths. Place station circles at regular intervals. This is the most time-consuming pre-work step.
4. **Test API** — confirm the GTFS-RT endpoint works with your key. Parse one VehiclePositions response. Verify you get lat/lon/bearing/trip_id. Log the number of active vehicles to calibrate expectations.

### Saturday build

| Time | Task | Deliverable | Tier |
|------|------|-------------|------|
| 09:00–10:00 | Backend: GTFS-RT poller + parser + WebSocket server | Python service that polls every 30s, enriches with GTFS static data, pushes JSON via WebSocket | Tier 1 |
| 10:00–11:30 | Frontend: geographic map with animated vehicle dots | MapLibre map with route polylines, station dots, moving bus markers with smooth interpolation | Tier 1 |
| 11:30–12:30 | Station popups + alert banners + fleet dashboard | Click-to-see-arrivals, service alert display, active bus counts per line | Tier 1 |
| 12:30–13:30 | Schematic view | SVG-based Beck-style diagram with animated dots, toggle between views | Tier 2 |
| 13:30–14:30 | Claude analytics layer | Natural language system status ("L1 is bunching near Reforma"), anomaly detection, health indicators | Tier 3 |
| 14:30–15:00 | Polish + demo prep | Clean transitions, loading states, mobile responsiveness, screen recording for backup | All |

**Tier 1 alone is a complete, demoable project.** Tiers 2 and 3 are additive and independent — you can do either without the other.

---

## Scope: in vs. out

### In scope

- All 7 Metrobús lines with correct colors and geometry
- Smooth animated vehicle dots (geographic view)
- Station click → next arrivals from TripUpdates
- Service alert banner from ServiceAlerts
- Fleet count dashboard (total + per-line)
- Schematic transit diagram view (Tier 2)
- Claude-powered status narration (Tier 3)

### Out of scope

- Other transit systems (Metro, Tren Ligero, etc.) — no RT feeds available
- Historical data recording or playback — live only
- Rider-facing features (trip planning, notifications) — that's Muévete CDMX
- Physical LED hardware version — future Raspberry Pi project
- Mobile app — web only, responsive design
- RTP / concession buses — data quality too variable

---

## Tech stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| GTFS-RT parsing | Python, `gtfs-realtime-bindings`, `protobuf` | Official Google library for GTFS-RT protocol buffers |
| Route snapping (backend) | Python, `shapely` | `nearest_points()` for snapping GPS to route geometry |
| WebSocket server | Python, FastAPI + `websockets` | Lightweight, async, easy to set up |
| Map rendering | MapLibre GL JS | Free, no API key (unlike Mapbox), WebGL-powered, smooth |
| Route snapping (client) | Turf.js | `nearestPointOnLine` for client-side animation snapping |
| Schematic animation | SVG + vanilla JS | `getPointAtLength()` on SVG paths for position along schematic |
| Analytics (Tier 3) | Claude API (Sonnet) | Natural language anomaly narration |
| Map tiles | OpenStreetMap via MapLibre default style, or Carto positron (clean light basemap) | Free, no API key required |

---

## Demo script (3 minutes)

1. **Open (30s):** "Metrobús carries 1.5 million people a day. Until today, none of them could see where their bus actually is." Show the map — dozens of colored dots gliding across the city.

2. **Geographic view (60s):** Zoom into Insurgentes (L1). Watch red dots moving north and south. Click a station — show "next bus: 1 min northbound, 3 min southbound." Point out an alert banner for L3 service disruption.

3. **Schematic view (45s):** Toggle to the schematic diagram. "This is every Metrobús in CDMX on a single screen." Same dots, now on a clean Beck-style diagram. Point out the L4 airport express — "you can literally watch the bus approaching the terminal."

4. **Analytics (30s, if Tier 3):** "Claude is watching the same data." Show the status panel: "Line 1 is running 3 minutes behind schedule on the southbound segment between Reforma and Chilpancingo. 2 buses are bunched near Glorieta de Insurgentes."

5. **Close (15s):** "This is one GTFS-RT feed, 30 seconds of refresh, and 339 stations of open data from datos.cdmx.gob.mx. Imagine what happens when Metro, Tren Ligero, and Cablebús publish theirs."

---

## Connection to Muévete CDMX

If built alongside the Muévete CDMX multimodal routing project, this becomes the "live transit context" panel:

- Embed the Metrobús live map as a component within the Muévete CDMX interface
- When a route includes a Metrobús leg, highlight the relevant line and show the approaching bus
- Use the same backend GTFS-RT poller to feed both the live map and the routing engine's real-time ETA enrichment
- Shared infrastructure: same API key, same WebSocket server, same GTFS static data

Even as a standalone, it complements Muévete CDMX's pitch: "We built the routing engine that tells you the best way to get across the city. And we built the live map that lets you watch it happen."

---

## Future directions

### Short-term (weeks after hackathon)

- **Record and replay:** Save vehicle positions to a database. Replay any day's traffic patterns. Visualize rush hour vs. off-peak.
- **Headway analysis:** Compute actual headway between buses per line over time. Compare to scheduled frequency. Publish as a public dashboard.
- **Line performance scoring:** Daily report card per line — average delay, gap frequency, bunching incidents.

### Medium-term (months)

- **Additional transit systems:** If/when Metro, Tren Ligero, or Cablebús publish GTFS-RT feeds, add them to the same map.
- **Ecobici overlay:** Show live Ecobici station availability on the same map — green dots for bikes available, red for empty.
- **Community alerts:** Let riders report conditions (crowding, broken escalator, safety concern) overlaid on the map.

### Long-term (the dream)

- **Physical map:** Raspberry Pi + LED strip or PCB with LEDs at each station. Wall-mounted. WiFi-connected. The first Traintrackr for Latin America. 339 stations × 7 colors = a beautiful artifact.
- **Public installation:** Partner with Metrobús or SEMOVI to display the live map on screens at major stations (Insurgentes, Buenavista, Chapultepec).
- **Open data advocacy:** Use the project to demonstrate what's possible with GTFS-RT, motivating Metro and other systems to publish their own real-time feeds.
