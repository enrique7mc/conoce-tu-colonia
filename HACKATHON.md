# Hackathon log — Conoce tu Colonia

Living log for the Claude Impact Lab hackathon (Saturday, April 18, 2026).
README.md is the stable reference; this file is the scratchpad.

Progress checkboxes: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocker.

---

## Pre-work status

- [x] **Download pipeline** (`scripts/01_download.py`) — ~2.7 GB raw, 15+ datasets from datos.cdmx
- [x] **Build base spine** (`02_build_base.py`) — 1,543 colonia polygons
- [x] **Crime aggregation** (`03_process_crime.py`) — 2.1M FGJ rows → density/km², trend vs. prior 12m, 10 crime categories
- [x] **Traffic point-in-polygon** (`04_process_traffic.py`) — 2024 SSC hechos de tránsito
- [x] **Transit joins** (`05_process_transit.py`) — Metro/Metrobús/STE/Ecobici/bike infra buffers
- [x] **Tabular joins** (`06_process_tabular.py`) — urban services, IDS, Censo, 0311
- [x] **Scoring** (`07_compute_scores.py`) — 4 sub-scores + overall
- [x] **Output artifacts** — `data/output/conoce_tu_colonia.geojson` (13 MB, 1,543 × 73 props) and `colonia_lookup.json` (3.6 MB)

### Known data decisions carried into the UI

- Crime anchor is `max(fecha_inicio)` = 2024-10-25, not today. Tooltip/footer must say "últimos 12 meses" with the actual date range.
- No per-capita crime rate — we use `crime_density_per_km2`. UI must not label it "per 1,000 residents".
- `score_urban` is null for 344 peripheral colonias (no urban SHP coverage). Render gray.
- IDS is alcaldía-proxy (all colonias in same alcaldía share a score). Panel calls this out.
- `transit_coverage_pct` is rapid-transit only; trolebús is a separate count column.
- 89 colonia names repeat across alcaldías — always key on `colonia_id`, never name alone.

---

## Prototype preview (day -1)

First pass on `frontend/` to de-risk Saturday. Plain static site, no build step.

- [x] MapLibre GL 4.7 + Carto dark basemap (no API key)
- [x] GeoJSON loaded directly from `data/output/` via relative fetch
- [x] Choropleth fill with `interpolate` on current score key; null → gray
- [x] Score dropdown toggles color (overall / safety / transit / urban / development)
- [x] Hover: outline highlight + floating tooltip (name, alcaldía, current score)
- [x] Click or search → zooms to colonia, opens right-side profile panel
- [x] Profile panel: 4-bar radar, crime detail (totals, density, trend arrow, breakdown), tráfico 2024, transit chips, services bars, 0311, IDS + caveat
- [x] Fuzzy search (substring match on colonia + alcaldía names)
- [x] Legend + attribution
- [x] Favicon (inline SVG data URI)

### Verified in browser

- Roma Norte (Cuauhtémoc): score 63, safety 16 / transit 100 / urban 87 / IDS 67 — classic central-CDMX tradeoff reads cleanly
- Safety view: central ring red, periphery green — matches priors
- Transit view: concentric inverse — central green, periphery red

### Known gaps in the prototype (things Saturday needs)

- [ ] Compare mode (2–3 colonias side by side, overlay bars)
- [ ] Claude Q&A box wired to `colonia_lookup.json` + Claude API
- [ ] Layer toggles (metro stations, bike lanes, Ecobici, markets as point overlays)
- [ ] Heatmap alternative (crime point density within colonia)
- [ ] Sparkline / monthly trend (needs pipeline extension — deprioritize)
- [ ] Mobile polish — panel overlaps legend under 800px (legend hides, panel becomes bottom sheet — verify on a phone)
- [ ] Responsive map fit when panel is open (fitBounds padding assumes desktop layout)
- [ ] Permalink per colonia (`?colonia=307`) for shareable deep links
- [ ] Keyboard: Esc closes panel, arrow keys on search results
- [ ] Accessibility pass (panel role, focus trap on open, contrast check)

### How to run locally

```bash
python3 -m http.server 8765   # from project root
# open http://localhost:8765/frontend/
```

The GeoJSON is 13 MB uncompressed (~2–3 MB gzipped). If perceived load time hurts
on demo machine: add a simple loading spinner and consider PMTiles only if needed.

---

## Saturday checklist

Times are the spec's guideline — adjust live.

### 09:00–10:30 · Choropleth + click (already prototyped)

- [x] Core map + click-to-open panel — done day -1, see above
- [ ] Verify everything still works on the demo laptop from a cold clone
- [ ] Pick the default score view for the demo hook (`score_overall` vs. `score_safety`)
- [ ] Smooth the initial camera: fitBounds to actual CDMX data extent on load

### 10:30–12:00 · Profile panel polish

- [ ] Replace bar-pseudo-radar with actual radar chart (Chart.js) — decide if worth it vs. current bars
- [ ] Time-of-day pattern for crime (needs pipeline extension — drop if tight)
- [ ] "Rank within alcaldía" line in header ("12/47 colonias in Cuauhtémoc")
- [ ] City-average reference marks on bars (dotted line at median)
- [ ] Copyable "share this colonia" button

### 12:00–13:00 · Compare mode + search

- [ ] Multi-select in search (Cmd/Ctrl+click to add to compare)
- [ ] Compare panel: 2–3 colonias, overlaid bars, delta highlights
- [ ] "Colonias similar to X" shortcut (cosine similarity on score vector) — nice-to-have

### 13:00–14:00 · Claude Q&A

- [ ] Claude API key in a local `.env` (never commit)
- [ ] Backend: tiny fastapi proxy OR client-side call with user-provided key
- [ ] System prompt: tool-use pattern with `colonia_lookup.json` as context
- [ ] UI: chat-style input under the panel, answers with clickable colonia chips
- [ ] Ethical framing baked into system prompt (per spec — balanced, trends, caveats)

### 14:00–14:30 · Layer toggles (stretch)

- [ ] Metro stations GeoJSON overlay with line colors
- [ ] Bike lanes overlay
- [ ] Ecobici station dots
- [ ] Markets / public space points
- [ ] Crime heatmap (client-side kernel or precomputed hex grid)

### 14:30–15:00 · Polish

- [ ] Responsive check: iPhone SE, iPad, desktop
- [ ] Attribution footer (datos.cdmx.gob.mx + dataset corte dates)
- [ ] Ethical caveats block: underreporting, IDS proxy, Oct 2024 cutoff
- [ ] Loading state for initial GeoJSON fetch
- [ ] Dry-run the 5-minute demo end-to-end
- [ ] Print deployment/hosting decision (laptop server? Vercel? GH Pages?)

---

## Blockers / open decisions

- [ ] **Hosting.** Simplest = `python3 -m http.server` on the demo laptop. Vercel/Netlify also works but the 13 MB GeoJSON is near-ish their edge. Decide by 14:00.
- [ ] **Claude API key.** Bring one. Fallback: hardcoded example queries if API unreachable on venue wifi.
- [ ] **Trolebús vs. coverage.** Currently counted but excluded from `transit_coverage_pct`. If demo story needs "100% transit coverage", decide if STE/trolebús should appear as a badge.
- [ ] **Sexual violence display.** Currently shown in breakdown with asterisk footnote. Consider hiding by default and revealing behind a disclosure — per spec ethics section.

---

## Demo script (draft, iterate Saturday morning)

1. **Hook (30s)** — "Which colonia should I live in?" → today the answer is Facebook groups.
2. **Map overview (60s)** — show overall choropleth. Toggle to safety (central ring red). Toggle to transit (inverse). The picture changes with each lens — that's the point.
3. **Colonia deep dive (60s)** — click Roma Norte. Score 63, safety 16 but transit 100 + services 87. Trend improving −14.5%. 11 Metro, 21 Metrobús, 38 Ecobici, 18 km ciclovías. One click, full picture.
4. **Compare (45s)** — Roma vs. Narvarte vs. Del Valle. Radar overlay. Narvarte: lower crime, less transit. Del Valle: middle.
5. **Claude Q&A (45s)** — type a family-with-kids query in Spanish. Claude responds with 3 ranked recommendations grounded in the lookup JSON.
6. **Close (30s)** — 15 government datasets, one tool. No Facebook group needed.

---

## Post-hackathon follow-ups

(Anything we discover during the day but can't ship.)

- [ ] Manzana-level IDS
- [ ] Per-colonia population → per-capita crime rate
- [ ] Temporal explorer (2016→today animation)
- [ ] "Colonias like this" recommender
- [ ] PMTiles vector tiles if the 13 MB GeoJSON becomes a bottleneck
