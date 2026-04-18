// Mocked data for the Conoce tu Colonia layered map prototype.
// Mix of STATIC (from downloaded datasets) and LIVE (crowdsourced / real-time).
// All coordinates are in a local map space (0..1000 x 0..1000), mapped to CDMX central area.
// We use a faux coordinate system so the prototype is self-contained (no MapLibre needed).

const COLONIAS = [
  { id: 'roma_norte', name: 'Roma Norte', alcaldia: 'Cuauhtémoc', score_overall: 63, score_safety: 16, score_transit: 100, score_urban: 87,
    poly: 'M 430 380 L 520 375 L 540 430 L 530 490 L 450 495 L 420 445 Z' },
  { id: 'condesa', name: 'Condesa', alcaldia: 'Cuauhtémoc', score_overall: 68, score_safety: 28, score_transit: 92, score_urban: 84,
    poly: 'M 360 420 L 420 415 L 425 480 L 370 490 L 340 455 Z' },
  { id: 'juarez', name: 'Juárez', alcaldia: 'Cuauhtémoc', score_overall: 58, score_safety: 12, score_transit: 98, score_urban: 78,
    poly: 'M 450 310 L 540 305 L 560 365 L 545 375 L 435 380 Z' },
  { id: 'centro', name: 'Centro', alcaldia: 'Cuauhtémoc', score_overall: 42, score_safety: 8, score_transit: 100, score_urban: 70,
    poly: 'M 560 290 L 680 285 L 700 360 L 690 410 L 555 410 L 545 350 Z' },
  { id: 'doctores', name: 'Doctores', alcaldia: 'Cuauhtémoc', score_overall: 48, score_safety: 18, score_transit: 88, score_urban: 62,
    poly: 'M 545 420 L 680 415 L 690 480 L 680 510 L 540 510 L 535 450 Z' },
  { id: 'narvarte', name: 'Narvarte', alcaldia: 'Benito Juárez', score_overall: 74, score_safety: 52, score_transit: 80, score_urban: 82,
    poly: 'M 520 510 L 650 505 L 660 580 L 530 585 L 510 550 Z' },
  { id: 'delvalle', name: 'Del Valle', alcaldia: 'Benito Juárez', score_overall: 78, score_safety: 58, score_transit: 75, score_urban: 88,
    poly: 'M 400 510 L 515 510 L 525 585 L 410 590 L 385 555 Z' },
  { id: 'polanco', name: 'Polanco', alcaldia: 'Miguel Hidalgo', score_overall: 82, score_safety: 60, score_transit: 70, score_urban: 95,
    poly: 'M 300 280 L 430 275 L 440 345 L 310 355 L 285 315 Z' },
  { id: 'anzures', name: 'Anzures', alcaldia: 'Miguel Hidalgo', score_overall: 60, score_safety: 22, score_transit: 85, score_urban: 74,
    poly: 'M 355 360 L 440 355 L 445 415 L 360 420 Z' },
  { id: 'hipodromo', name: 'Hipódromo', alcaldia: 'Cuauhtémoc', score_overall: 72, score_safety: 40, score_transit: 88, score_urban: 85,
    poly: 'M 340 480 L 400 475 L 405 525 L 345 530 Z' },
];

const TRANSIT_LINES = [
  { id: 'm1', mode: 'metro', name: 'L1', color: '#E6007E',
    path: [[180, 440], [300, 440], [430, 445], [560, 450], [700, 455], [820, 460]] },
  { id: 'm3', mode: 'metro', name: 'L3', color: '#008E47',
    path: [[480, 160], [490, 280], [500, 400], [505, 520], [510, 640], [515, 780]] },
  { id: 'mb1', mode: 'metrobus', name: 'MB1', color: '#D52B1E',
    path: [[380, 180], [385, 280], [390, 380], [395, 480], [400, 580], [405, 680]] },
  { id: 't', mode: 'trolebus', name: 'T-EC', color: '#5FBF7F',
    path: [[620, 200], [615, 320], [610, 440], [605, 560], [600, 680]] },
  { id: 'eco', mode: 'ecobici', name: 'Ecobici', color: '#00B2A9',
    path: [[330, 420], [400, 430], [470, 440], [540, 445]] },
];

const STATIONS = [
  { id: 's1', mode: 'metro', line: 'm1', name: 'Insurgentes', x: 430, y: 445, status: 'open', crowd: 'high' },
  { id: 's2', mode: 'metro', line: 'm1', name: 'Sevilla', x: 380, y: 443, status: 'open', crowd: 'medium' },
  { id: 's3', mode: 'metro', line: 'm1', name: 'Cuauhtémoc', x: 495, y: 448, status: 'delay', crowd: 'high',
    note: 'Retrasos 8-12 min · reportado por 14 usuarios', live: true },
  { id: 's4', mode: 'metro', line: 'm1', name: 'Balderas', x: 560, y: 450, status: 'open', crowd: 'high' },
  { id: 's5', mode: 'metro', line: 'm1', name: 'Salto del Agua', x: 620, y: 452, status: 'closed', crowd: 'n/a',
    note: 'Cerrada por obras hasta 28 abr', live: true },
  { id: 's6', mode: 'metro', line: 'm3', name: 'Hidalgo', x: 490, y: 330, status: 'open', crowd: 'medium' },
  { id: 's7', mode: 'metro', line: 'm3', name: 'Juárez', x: 498, y: 380, status: 'open', crowd: 'high' },
  { id: 's8', mode: 'metro', line: 'm3', name: 'Niños Héroes', x: 502, y: 440, status: 'open', crowd: 'medium' },
  { id: 's9', mode: 'metro', line: 'm3', name: 'Hospital General', x: 505, y: 490, status: 'open', crowd: 'low' },
  { id: 's10', mode: 'metro', line: 'm3', name: 'Centro Médico', x: 508, y: 540, status: 'open', crowd: 'high' },
  { id: 's11', mode: 'metrobus', line: 'mb1', name: 'Álvaro Obregón', x: 390, y: 400, status: 'open', crowd: 'medium' },
  { id: 's12', mode: 'metrobus', line: 'mb1', name: 'Sonora', x: 393, y: 450, status: 'open', crowd: 'low' },
  { id: 's13', mode: 'metrobus', line: 'mb1', name: 'Chilpancingo', x: 397, y: 510, status: 'incident', crowd: 'high',
    note: 'Aglomeración inusual · 3 reportes', live: true },
  { id: 's14', mode: 'metrobus', line: 'mb1', name: 'La Piedad', x: 400, y: 570, status: 'open', crowd: 'medium' },
  { id: 's15', mode: 'trolebus', line: 't', name: 'Bellas Artes', x: 618, y: 350, status: 'open', crowd: 'medium' },
  { id: 's16', mode: 'trolebus', line: 't', name: 'Eje 1', x: 612, y: 450, status: 'open', crowd: 'low' },
  { id: 's17', mode: 'ecobici', line: 'eco', name: 'Álvaro Obregón 100', x: 400, y: 430, status: 'open', crowd: 'n/a',
    note: '12/24 bicis disponibles', live: true },
  { id: 's18', mode: 'ecobici', line: 'eco', name: 'Sonora', x: 470, y: 440, status: 'open', crowd: 'n/a',
    note: '2/22 bicis disponibles · escasez', live: true },
];

const SERVICES = [
  { id: 'sv1', kind: 'mercado', name: 'Mercado Medellín', x: 455, y: 420, static: true },
  { id: 'sv2', kind: 'mercado', name: 'Mercado Juárez', x: 470, y: 340, static: true },
  { id: 'sv3', kind: 'salud', name: 'Hospital General', x: 505, y: 490, static: true },
  { id: 'sv4', kind: 'salud', name: 'Centro Médico', x: 508, y: 540, static: true },
  { id: 'sv5', kind: 'escuela', name: 'Secundaria 4', x: 395, y: 455, static: true },
  { id: 'sv6', kind: 'escuela', name: 'Primaria Benito Juárez', x: 545, y: 430, static: true },
  { id: 'sv7', kind: 'mercado', name: 'Mercado San Juan', x: 595, y: 360, static: true },
  { id: 'sv8', kind: 'salud', name: 'Clínica 8 IMSS', x: 375, y: 500, static: true },
  { id: 'sv9', kind: 'escuela', name: 'CCH Naucalpan', x: 310, y: 310, static: true },
];

const RESTROOMS = [
  { id: 'r1', name: 'Baños Parque México', x: 380, y: 460, fee: 'Gratis', accessible: true, rating: 4.2, reports: 38, lastReport: 'hace 12 min', live: true },
  { id: 'r2', name: 'Mercado Medellín', x: 455, y: 420, fee: '$5 MXN', accessible: false, rating: 3.8, reports: 27, lastReport: 'hace 34 min', live: true },
  { id: 'r3', name: 'Metro Insurgentes', x: 425, y: 450, fee: '$5 MXN', accessible: true, rating: 3.1, reports: 54, lastReport: 'hace 4 min', live: true, flag: 'sucio' },
  { id: 'r4', name: 'Alameda Central', x: 580, y: 340, fee: 'Gratis', accessible: true, rating: 4.5, reports: 72, lastReport: 'hace 22 min', live: true },
  { id: 'r5', name: 'Plaza Río de Janeiro', x: 475, y: 400, fee: 'Gratis', accessible: false, rating: 3.9, reports: 16, lastReport: 'hace 1 h', live: true },
  { id: 'r6', name: 'Parque Hundido', x: 410, y: 560, fee: 'Gratis', accessible: true, rating: 4.1, reports: 41, lastReport: 'hace 8 min', live: true },
  { id: 'r7', name: 'Mercado San Juan', x: 595, y: 360, fee: '$5 MXN', accessible: false, rating: 3.5, reports: 19, lastReport: 'hace 47 min', live: true },
];

const EVENTS = [
  { id: 'e1', kind: 'cultural', name: 'Concierto gratis — Foro Lindbergh', colonia: 'Condesa', x: 385, y: 470,
    when: 'Hoy 19:00', attendance: 340, live: true, tag: 'Música' },
  { id: 'e2', kind: 'civico', name: 'Marcha — Reforma', colonia: 'Juárez', x: 515, y: 335,
    when: 'Sáb 11:00', attendance: 1200, live: true, tag: 'Manifestación', warning: 'Cortes viales Reforma-Insurgentes' },
  { id: 'e3', kind: 'cultural', name: 'Tianguis del libro', colonia: 'Roma Norte', x: 470, y: 420,
    when: 'Dom 10:00–18:00', attendance: 180, live: true, tag: 'Feria' },
  { id: 'e4', kind: 'publico', name: 'Bazar — Parque México', colonia: 'Condesa', x: 380, y: 465,
    when: 'Sáb–Dom', attendance: 420, live: true, tag: 'Bazar' },
  { id: 'e5', kind: 'cultural', name: 'Función MUAC — Cine al aire libre', colonia: 'Del Valle', x: 450, y: 550,
    when: 'Vie 20:30', attendance: 95, live: true, tag: 'Cine' },
  { id: 'e6', kind: 'civico', name: 'Jornada vacunación', colonia: 'Doctores', x: 600, y: 465,
    when: 'Hoy 09:00–16:00', attendance: 210, live: true, tag: 'Salud' },
  { id: 'e7', kind: 'publico', name: 'Brigada limpieza comunitaria', colonia: 'Centro', x: 620, y: 350,
    when: 'Sáb 07:00', attendance: 48, live: true, tag: 'Comunidad' },
];

const INCIDENTS = [
  { id: 'i1', kind: 'pedestrian', name: 'Atropello peatón', x: 435, y: 448, when: 'hace 2 h', live: true },
  { id: 'i2', kind: 'cyclist', name: 'Ciclista lesionado', x: 395, y: 440, when: 'hace 4 h', live: true },
  { id: 'i3', kind: 'collision', name: 'Choque — 3 vehículos', x: 510, y: 330, when: 'hace 18 min', live: true },
  { id: 'i4', kind: 'pedestrian', name: 'Atropello (2024)', x: 540, y: 425, when: 'Q4 2024', live: false },
  { id: 'i5', kind: 'collision', name: 'Choque (2024)', x: 620, y: 445, when: 'Q3 2024', live: false },
  { id: 'i6', kind: 'pedestrian', name: 'Atropello (2024)', x: 560, y: 510, when: 'Q2 2024', live: false },
  { id: 'i7', kind: 'cyclist', name: 'Ciclista lesionado', x: 440, y: 500, when: 'hace 1 h', live: true },
  { id: 'i8', kind: 'collision', name: 'Choque menor', x: 385, y: 495, when: 'hace 45 min', live: true },
];

const BIKE_LANES = [
  { id: 'bl1', path: [[330, 420], [400, 430], [470, 440], [540, 445], [600, 450]] },
  { id: 'bl2', path: [[450, 380], [455, 430], [460, 480], [465, 530]] },
  { id: 'bl3', path: [[360, 350], [410, 370], [460, 395]] },
];

const CRIME_GRID = (() => {
  const cells = [];
  for (let x = 150; x < 850; x += 40) {
    for (let y = 200; y < 780; y += 40) {
      const dx = x - 560, dy = y - 380;
      const d = Math.sqrt(dx * dx + dy * dy);
      let intensity = Math.max(0, 1 - d / 260);
      intensity *= 0.6 + 0.4 * ((Math.sin(x * 0.03) + Math.cos(y * 0.04) + 2) / 4);
      if (intensity > 0.08) cells.push([x, y, intensity]);
    }
  }
  return cells;
})();

function buildSearchIndex() {
  const items = [];
  COLONIAS.forEach(c => items.push({ kind: 'colonia', id: c.id, name: c.name, sub: c.alcaldia, x: null, y: null, score: c.score_overall }));
  STATIONS.forEach(s => items.push({ kind: 'stop', id: s.id, name: s.name, sub: `${s.mode.toUpperCase()} · ${s.status}`, x: s.x, y: s.y, mode: s.mode, status: s.status }));
  EVENTS.forEach(e => items.push({ kind: 'event', id: e.id, name: e.name, sub: `${e.when} · ${e.colonia}`, x: e.x, y: e.y, tag: e.tag }));
  RESTROOMS.forEach(r => items.push({ kind: 'restroom', id: r.id, name: r.name, sub: `${r.fee} · ★${r.rating}`, x: r.x, y: r.y }));
  SERVICES.forEach(s => items.push({ kind: 'service', id: s.id, name: s.name, sub: s.kind, x: s.x, y: s.y }));
  return items;
}

export const CTC_DATA = {
  COLONIAS, TRANSIT_LINES, STATIONS, SERVICES, RESTROOMS, EVENTS, INCIDENTS, BIKE_LANES, CRIME_GRID,
  SEARCH: buildSearchIndex(),
};
