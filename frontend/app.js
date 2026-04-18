// Conoce tu Colonia — MapLibre choropleth prototype
// Loads the pre-processed GeoJSON (1,543 colonias, ~70 properties each),
// renders as choropleth, opens a detail panel on click.

const DATA_URL = "../data/output/conoce_tu_colonia.geojson";

const SCORE_STOPS = [
  { v: 15, c: "#d73027" },
  { v: 30, c: "#fdae61" },
  { v: 45, c: "#fee08b" },
  { v: 60, c: "#a6d96a" },
  { v: 75, c: "#1a9850" },
];

const SCORE_LABELS = {
  score_overall: "Score general",
  score_safety: "Seguridad",
  score_transit: "Transporte",
  score_urban: "Servicios urbanos",
  score_development: "Desarrollo social",
  score_affordability: "Asequibilidad",
};

// Highest $/m² in the cadastral map (Muy alto midpoint). Slider caps here.
const AFFORD_MAX = 12000;

// ---- Map setup ------------------------------------------------------------

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      carto: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://carto.com/attributions">Carto</a> · datos.cdmx.gob.mx',
      },
      labels: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0b1016" } },
      { id: "carto", type: "raster", source: "carto" },
    ],
  },
  center: [-99.133, 19.43],
  zoom: 10.4,
  minZoom: 8,
  maxZoom: 17,
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "bottom-right");
map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }), "bottom-right");

// ---- State ----------------------------------------------------------------

let FEATURES = [];
let currentScoreKey = "score_overall";
let affordCap = AFFORD_MAX; // MXN/m², "sin tope" at the max
let hoveredId = null;
let selectedId = null;

// ---- Expressions ----------------------------------------------------------

function colorExpressionFor(scoreKey) {
  return [
    "case",
    ["!", ["has", scoreKey]], "#3a4354",
    ["==", ["get", scoreKey], null], "#3a4354",
    [
      "interpolate",
      ["linear"],
      ["to-number", ["get", scoreKey]],
      ...SCORE_STOPS.flatMap((s) => [s.v, s.c]),
    ],
  ];
}

// Dim colonias whose land value exceeds the affordability cap.
// "Sin tope" (slider at max) disables the filter — all colonias visible.
// Colonias with no land_value_mxn_per_m2 data pass through (don't penalize
// missing data).
function opacityExpression() {
  const dim = affordCap < AFFORD_MAX;
  const normal = [
    "case",
    ["boolean", ["feature-state", "selected"], false], 0.92,
    ["boolean", ["feature-state", "hover"], false], 0.85,
    0.65,
  ];
  if (!dim) return normal;
  return [
    "case",
    ["==", ["get", "land_value_mxn_per_m2"], null], normal,
    ["!", ["has", "land_value_mxn_per_m2"]], normal,
    [">", ["to-number", ["get", "land_value_mxn_per_m2"]], affordCap], 0.08,
    normal,
  ];
}

// ---- Load & render --------------------------------------------------------

map.on("load", async () => {
  let data;
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error("Failed to load GeoJSON", err);
    document.querySelector(".panel-empty").innerHTML =
      `<h2>No se pudo cargar el dataset</h2>
       <p class="muted">Revisa la consola y asegúrate de servir el proyecto con un HTTP server
       (no con file://). Desde la raíz del proyecto:</p>
       <pre style="background:#1a2230;padding:8px;border-radius:6px;color:#7cc4ff;font-size:12px;">python3 -m http.server 8000</pre>
       <p class="muted">Luego abre <code>http://localhost:8000/frontend/</code>.</p>`;
    return;
  }

  // Attach a numeric id for feature-state hover/select
  data.features.forEach((f, i) => { f.id = i; });
  FEATURES = data.features;

  document.getElementById("colonia-count").textContent =
    `${FEATURES.length.toLocaleString("es-MX")} colonias · 83 indicadores`;

  map.addSource("colonias", {
    type: "geojson",
    data,
    promoteId: undefined, // we already set ids
  });

  map.addLayer({
    id: "colonias-fill",
    type: "fill",
    source: "colonias",
    paint: {
      "fill-color": colorExpressionFor(currentScoreKey),
      "fill-opacity": opacityExpression(),
    },
  });

  map.addLayer({
    id: "colonias-outline",
    type: "line",
    source: "colonias",
    paint: {
      "line-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false], "#ffffff",
        ["boolean", ["feature-state", "hover"], false], "#7cc4ff",
        "rgba(255,255,255,0.12)",
      ],
      "line-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false], 2.2,
        ["boolean", ["feature-state", "hover"], false], 1.4,
        0.4,
      ],
    },
  });

  map.addLayer({ id: "labels", type: "raster", source: "labels" });

  wireInteractions();
});

// ---- Interactions ---------------------------------------------------------

function wireInteractions() {
  const tooltip = document.getElementById("tooltip");

  map.on("mousemove", "colonias-fill", (e) => {
    if (!e.features?.length) return;
    map.getCanvas().style.cursor = "pointer";
    const f = e.features[0];
    if (hoveredId !== null && hoveredId !== f.id) {
      map.setFeatureState({ source: "colonias", id: hoveredId }, { hover: false });
    }
    hoveredId = f.id;
    map.setFeatureState({ source: "colonias", id: hoveredId }, { hover: true });

    const p = f.properties;
    const score = p[currentScoreKey];
    tooltip.innerHTML = `
      <div class="tip-name">${escapeHtml(p.colonia_name)}</div>
      <div class="tip-alc">${escapeHtml(p.alcaldia_name)}</div>
      <div class="tip-score">${SCORE_LABELS[currentScoreKey]}: <strong>${fmtScore(score)}</strong></div>
    `;
    tooltip.style.left = `${e.point.x + 14}px`;
    tooltip.style.top = `${e.point.y + 14}px`;
    tooltip.classList.add("show");
  });

  map.on("mouseleave", "colonias-fill", () => {
    map.getCanvas().style.cursor = "";
    if (hoveredId !== null) {
      map.setFeatureState({ source: "colonias", id: hoveredId }, { hover: false });
      hoveredId = null;
    }
    tooltip.classList.remove("show");
  });

  map.on("click", "colonias-fill", (e) => {
    if (!e.features?.length) return;
    const f = e.features[0];
    selectFeature(f.id);
  });

  // Score selector
  document.getElementById("score-select").addEventListener("change", (e) => {
    currentScoreKey = e.target.value;
    map.setPaintProperty("colonias-fill", "fill-color", colorExpressionFor(currentScoreKey));
  });

  // Affordability filter — dims colonias above the MXN/m² cap.
  const affordRange = document.getElementById("afford-range");
  const affordValue = document.getElementById("afford-value");
  affordRange.addEventListener("input", (e) => {
    const v = Number(e.target.value);
    affordCap = v;
    affordValue.textContent =
      v >= AFFORD_MAX
        ? "sin tope"
        : `≤ ${v.toLocaleString("es-MX")} $/m²`;
    map.setPaintProperty("colonias-fill", "fill-opacity", opacityExpression());
  });

  // Search
  const searchInput = document.getElementById("search-input");
  const resultsEl = document.getElementById("search-results");
  searchInput.addEventListener("input", (e) => {
    renderSearchResults(e.target.value);
  });
  searchInput.addEventListener("focus", (e) => {
    if (e.target.value) renderSearchResults(e.target.value);
  });
  document.addEventListener("click", (e) => {
    if (!resultsEl.contains(e.target) && e.target !== searchInput) {
      resultsEl.hidden = true;
    }
  });
}

// ---- Selection / panel ----------------------------------------------------

function selectFeature(id) {
  if (selectedId !== null) {
    map.setFeatureState({ source: "colonias", id: selectedId }, { selected: false });
  }
  selectedId = id;
  map.setFeatureState({ source: "colonias", id }, { selected: true });

  const feat = FEATURES[id];
  renderPanel(feat);

  const b = bboxOfFeature(feat);
  if (b) {
    map.fitBounds(b, { padding: { top: 80, bottom: 80, left: 80, right: 420 }, maxZoom: 14.5, duration: 600 });
  }
}

function renderPanel(feat) {
  const p = feat.properties;
  const panel = document.getElementById("panel");
  panel.classList.remove("panel--empty");
  panel.innerHTML = panelHtml(p);
  panel.querySelector(".close").addEventListener("click", () => clearSelection());
}

function clearSelection() {
  if (selectedId !== null) {
    map.setFeatureState({ source: "colonias", id: selectedId }, { selected: false });
    selectedId = null;
  }
  const panel = document.getElementById("panel");
  panel.classList.add("panel--empty");
  panel.innerHTML = `
    <div class="panel-empty">
      <h2>Haz clic en una colonia</h2>
      <p>Cada polígono contiene ~70 indicadores de seguridad, transporte, servicios, peatonalidad y desarrollo social, cruzados de 15+ datasets de datos.cdmx.gob.mx.</p>
      <p class="muted">Los scores son 0–100 (mayor es mejor). El score general pondera seguridad 35%, transporte 25%, servicios 25%, IDS 15%.</p>
    </div>`;
}

// ---- Panel HTML -----------------------------------------------------------

function panelHtml(p) {
  const idsClass = p.ids_stratum ? `ids-${p.ids_stratum.replace(/\s/g, "\\ ")}` : "";
  const trendClass = trendClassFor(p.crime_trend_pct);
  const trendArrow = trendArrowFor(p.crime_trend_pct);

  return `
  <div class="panel-header">
    <button class="close" aria-label="Cerrar">×</button>
    <h2>${escapeHtml(p.colonia_name)}</h2>
    <div class="alcaldia">${escapeHtml(p.alcaldia_name)} · ${(p.area_m2 / 1e6).toFixed(2)} km²</div>
    <div class="badge-row">
      ${p.ids_stratum ? `<span class="badge ${idsClass}">IDS <strong>${escapeHtml(p.ids_stratum)}</strong></span>` : ""}
      ${p.has_ecobici ? `<span class="badge"><strong>Ecobici</strong></span>` : ""}
      ${p.has_cablebus ? `<span class="badge"><strong>Cablebús</strong></span>` : ""}
      ${p.has_tren_ligero ? `<span class="badge"><strong>Tren Ligero</strong></span>` : ""}
      ${p.metro_stations_800m > 0 ? `<span class="badge">Metro <strong>${p.metro_stations_800m}</strong></span>` : ""}
    </div>
  </div>

  <div class="panel-body">

    <section class="section">
      <div class="score-overall">
        <span class="num">${fmtScore(p.score_overall)}</span>
        <span class="outof">/ 100</span>
        <span class="label">score general</span>
      </div>
      <div class="bars">
        ${barRow("Seguridad", p.score_safety)}
        ${barRow("Transporte", p.score_transit)}
        ${barRow("Servicios urbanos", p.score_urban)}
        ${barRow("Desarrollo (IDS)", p.score_development)}
        ${barRow("Asequibilidad", p.score_affordability)}
      </div>
      ${affordabilityRow(p)}
    </section>

    <section class="section">
      <h3>Seguridad · últimos 12 meses</h3>
      <div class="kv">
        <div class="k">Carpetas totales</div>
        <div class="v">${fmtNum(p.crime_total_last12mo)}</div>
        <div class="k">Densidad / km²</div>
        <div class="v">${fmtNum(p.crime_density_per_km2, 1)}</div>
        <div class="k">Tendencia vs. 12m previos</div>
        <div class="v ${trendClass}">${trendArrow} ${fmtPct(p.crime_trend_pct)}</div>
        <div class="k">Violencia (dens. / km²)</div>
        <div class="v">${fmtNum(p.crime_violent_density_per_km2, 2)}</div>
      </div>
      ${crimeBreakdown(p)}
    </section>

    <section class="section">
      <h3>Tránsito 2024</h3>
      <div class="kv">
        <div class="k">Incidentes</div><div class="v">${fmtNum(p.traffic_incidents_2024)}</div>
        <div class="k">Atropellos (peatón)</div><div class="v">${fmtNum(p.traffic_pedestrian_2024)}</div>
        <div class="k">Ciclistas</div><div class="v">${fmtNum(p.traffic_cyclist_2024)}</div>
        <div class="k">Fallecidos</div><div class="v">${fmtNum(p.traffic_fatalities_2024)}</div>
      </div>
    </section>

    <section class="section">
      <h3>Transporte</h3>
      <div class="chips">
        ${chip("Metro 800m", p.metro_stations_800m)}
        ${chip("Metrobús 500m", p.metrobus_stations_500m)}
        ${chip("Tren Ligero 500m", p.tren_ligero_stations_500m)}
        ${chip("Cablebús 500m", p.cablebus_stations_500m)}
        ${chip("Trolebús 300m", p.trolebus_stations_300m)}
        ${chip("Ecobici en colonia", p.ecobici_stations)}
        ${chip("Ecobici 300m", p.ecobici_stations_300m)}
      </div>
      <div class="kv" style="margin-top:8px">
        <div class="k">Ciclovías</div><div class="v">${fmtNum(p.bike_lane_km, 2)} km</div>
        <div class="k">Cobertura rápida</div><div class="v">${fmtPct(p.transit_coverage_pct, 1)}</div>
      </div>
    </section>

    <section class="section">
      <h3>Servicios & urbanidad</h3>
      <div class="bars">
        ${simpleBar("Agua", p.pct_water, "%")}
        ${simpleBar("Electricidad", p.pct_electricity, "%")}
        ${simpleBar("Alumbrado", p.pct_street_lighting, "%")}
        ${simpleBar("Peatonalidad", p.pedestrian_infra_score, p.pedestrian_infra_level ? ` (${p.pedestrian_infra_level})` : "")}
        ${simpleBar("Índice de servicios", p.services_index, "")}
      </div>
      <div class="kv" style="margin-top:8px">
        <div class="k">Mercados</div><div class="v">${fmtNum(p.markets_count)}</div>
        <div class="k">Salud (equipamientos)</div><div class="v">${fmtNum(p.health_equip_count)}</div>
        <div class="k">Escuelas</div><div class="v">${fmtNum(p.school_equip_count)}</div>
        <div class="k">Guarderías</div><div class="v">${fmtNum(p.daycare_count)}</div>
        <div class="k">Espacios públicos</div><div class="v">${fmtNum(p.public_space_count)}</div>
        <div class="k">Dist. media a esp. público</div><div class="v">${fmtNum(p.public_space_avg_dist_m)} m</div>
      </div>
    </section>

    <section class="section">
      <h3>Gobierno responsivo · 0311</h3>
      <div class="kv">
        <div class="k">Solicitudes 2024</div><div class="v">${fmtNum(p.s311_requests_2024)}</div>
        <div class="k">Queja principal</div>
        <div class="v" style="text-align:right">${p.s311_top_complaint ? escapeHtml(p.s311_top_complaint) : "—"}</div>
      </div>
    </section>

    <section class="section">
      <h3>Desarrollo social</h3>
      <div class="kv">
        <div class="k">IDS</div><div class="v">${fmtNum(p.ids_score, 3)} · ${escapeHtml(p.ids_stratum || "—")}</div>
        <div class="k">Población alcaldía</div><div class="v">${fmtNum(p.alcaldia_population)}</div>
      </div>
      <p class="footer-note" style="margin-top:8px">
        IDS es a nivel alcaldía (proxy) porque el mapeo AGEB→colonia no es trivial sin manzanas.
        La población es total de alcaldía, no per cápita de la colonia.
      </p>
    </section>

    <p class="footer-note">
      Fuente: datos.cdmx.gob.mx · FGJ carpetas (corte Oct 2024) · SSC hechos de tránsito 2024 ·
      0311 · SEMOVI transporte · Evalúa CDMX IDS 2020.
    </p>
  </div>`;
}

function barRow(name, score) {
  if (score === null || score === undefined) {
    return `<div class="bar-row null">
      <div class="name">${name}</div>
      <div class="track"><div class="fill"></div></div>
      <div class="val">—</div>
    </div>`;
  }
  const color = colorForScore(score);
  return `<div class="bar-row">
    <div class="name">${name}</div>
    <div class="track"><div class="fill" style="width:${clamp(score, 0, 100)}%;background:${color}"></div></div>
    <div class="val">${fmtScore(score)}</div>
  </div>`;
}

function affordabilityRow(p) {
  const v = p.land_value_mxn_per_m2;
  const rows = [];

  if (v !== null && v !== undefined && !Number.isNaN(v)) {
    const tier = p.land_value_tier ? ` · ${escapeHtml(p.land_value_tier)}` : "";
    const cov = p.land_value_coverage_pct;
    const covNote = cov !== null && cov !== undefined && cov < 95
      ? ` <span class="muted">(cobertura ${fmtNum(cov, 0)}%)</span>`
      : "";
    rows.push(`
      <div class="k">Valor de suelo (Código Fiscal)</div>
      <div class="v">$${fmtNum(v)} / m²${tier}${covNote}</div>
    `);
  } else {
    rows.push(`
      <div class="k">Valor de suelo (Código Fiscal)</div>
      <div class="v muted">sin datos</div>
    `);
  }

  const listings = p.airbnb_listings_count;
  if (listings !== null && listings !== undefined && listings > 0) {
    const median = p.airbnb_median_nightly_mxn;
    const p25 = p.airbnb_p25_nightly_mxn;
    const p75 = p.airbnb_p75_nightly_mxn;
    const density = p.airbnb_density_per_km2;
    const entire = p.airbnb_entire_home_pct;
    const range = (p25 && p75) ? ` <span class="muted">($${fmtNum(p25)}–$${fmtNum(p75)})</span>` : "";
    rows.push(`
      <div class="k">Airbnb · mediana noche</div>
      <div class="v">$${fmtNum(median)} MXN${range}</div>
    `);
    rows.push(`
      <div class="k">Airbnb · densidad</div>
      <div class="v">${fmtNum(listings)} listings (${fmtNum(density, 0)} / km²)</div>
    `);
    rows.push(`
      <div class="k">Airbnb · casa entera</div>
      <div class="v">${fmtPct(entire, 0)}</div>
    `);
  }

  return `<div class="kv" style="margin-top:8px">${rows.join("")}</div>
    <p class="footer-note" style="margin-top:6px">
      Asequibilidad: percentil invertido del valor unitario de suelo (Código Fiscal CDMX,
      5 tramos) ${listings > 0 ? "· Airbnb Inside (snapshot sep 2025)" : ""}.
    </p>`;
}

function simpleBar(name, val, suffix) {
  if (val === null || val === undefined || Number.isNaN(val)) {
    return `<div class="bar-row null">
      <div class="name">${name}</div>
      <div class="track"><div class="fill"></div></div>
      <div class="val">—</div>
    </div>`;
  }
  const pct = clamp(val, 0, 100);
  const color = colorForScore(pct);
  return `<div class="bar-row">
    <div class="name">${name}</div>
    <div class="track"><div class="fill" style="width:${pct}%;background:${color}"></div></div>
    <div class="val">${fmtNum(val, 0)}${suffix || ""}</div>
  </div>`;
}

function chip(label, count) {
  const has = count && count > 0;
  return `<span class="chip ${has ? "chip--on" : ""}">${label} · ${fmtNum(count)}</span>`;
}

function crimeBreakdown(p) {
  const cats = [
    ["Robos", p.crime_robbery_last12mo],
    ["Hurto", p.crime_theft_last12mo],
    ["Violento", p.crime_violent_last12mo],
    ["Homicidio", p.crime_homicide_last12mo],
    ["Propiedad", p.crime_property_last12mo],
    ["Fraude", p.crime_fraud_last12mo],
    ["Amenazas", p.crime_threats_last12mo],
    ["Familiar", p.crime_domestic_last12mo],
    ["Narcóticos", p.crime_drugs_last12mo],
    ["Sexual*", p.crime_sexual_last12mo],
  ];
  const total = cats.reduce((a, [, v]) => a + (v || 0), 0) || 1;
  const rows = cats
    .filter(([, v]) => v && v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, v]) => {
      const pct = (v / total) * 100;
      return `<div class="bar-row">
        <div class="name">${name}</div>
        <div class="track"><div class="fill" style="width:${pct}%;background:#7cc4ff"></div></div>
        <div class="val">${fmtNum(v)}</div>
      </div>`;
    })
    .join("");
  if (!rows) return `<p class="footer-note" style="margin-top:8px">Sin carpetas registradas en 12m.</p>`;
  return `<div class="bars" style="margin-top:8px">${rows}</div>
    <p class="footer-note">* Delitos sexuales notoriamente subreportados.</p>`;
}

// ---- Search ---------------------------------------------------------------

function renderSearchResults(query) {
  const el = document.getElementById("search-results");
  const q = query.trim().toLowerCase();
  if (q.length < 2) { el.hidden = true; return; }
  const matches = [];
  for (const f of FEATURES) {
    const name = f.properties.colonia_name.toLowerCase();
    const alc = f.properties.alcaldia_name.toLowerCase();
    if (name.includes(q) || alc.includes(q)) {
      matches.push(f);
      if (matches.length >= 40) break;
    }
  }
  if (!matches.length) {
    el.hidden = false;
    el.innerHTML = `<div class="result"><div class="sub">Sin resultados para “${escapeHtml(query)}”</div></div>`;
    return;
  }
  el.hidden = false;
  el.innerHTML = matches.map((f) => `
    <div class="result" data-id="${f.id}">
      <div class="name">${escapeHtml(f.properties.colonia_name)}</div>
      <div class="sub">${escapeHtml(f.properties.alcaldia_name)} · score ${fmtScore(f.properties.score_overall)}</div>
    </div>`).join("");
  el.querySelectorAll(".result").forEach((node) => {
    node.addEventListener("click", () => {
      const id = Number(node.getAttribute("data-id"));
      selectFeature(id);
      el.hidden = true;
      document.getElementById("search-input").value = FEATURES[id].properties.colonia_name;
    });
  });
}

// ---- Utilities ------------------------------------------------------------

function bboxOfFeature(f) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === "number") {
      minX = Math.min(minX, coords[0]); maxX = Math.max(maxX, coords[0]);
      minY = Math.min(minY, coords[1]); maxY = Math.max(maxY, coords[1]);
    } else {
      for (const c of coords) walk(c);
    }
  };
  walk(f.geometry.coordinates);
  if (!isFinite(minX)) return null;
  return [[minX, minY], [maxX, maxY]];
}

function colorForScore(score) {
  if (score === null || score === undefined || Number.isNaN(score)) return "#3a4354";
  const stops = SCORE_STOPS;
  if (score <= stops[0].v) return stops[0].c;
  if (score >= stops[stops.length - 1].v) return stops[stops.length - 1].c;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (score >= a.v && score <= b.v) {
      const t = (score - a.v) / (b.v - a.v);
      return lerpHex(a.c, b.c, t);
    }
  }
  return "#3a4354";
}

function lerpHex(a, b, t) {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function fmtScore(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return Number(v).toFixed(0);
}
function fmtNum(v, digits = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return Number(v).toLocaleString("es-MX", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
function fmtPct(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${Number(v).toFixed(digits)}%`;
}
function trendClassFor(v) {
  if (v === null || v === undefined) return "trend-flat";
  if (v > 5) return "trend-up";
  if (v < -5) return "trend-down";
  return "trend-flat";
}
function trendArrowFor(v) {
  if (v === null || v === undefined) return "→";
  if (v > 5) return "↑";
  if (v < -5) return "↓";
  return "→";
}
function clamp(x, lo, hi) { return Math.min(Math.max(x, lo), hi); }
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
