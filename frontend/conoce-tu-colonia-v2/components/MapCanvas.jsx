'use client';

import { useEffect, useState } from 'react';
import { CTC_DATA } from '../lib/data';

const VB_W = 1000, VB_H = 1000;

function BasemapDefs({ style }) {
  if (style === 'light') {
    return (
      <defs>
        <pattern id="base-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#EEEAE1"/>
          <path d="M40 0H0v40" fill="none" stroke="#DDD6C7" strokeWidth="0.5"/>
        </pattern>
      </defs>
    );
  }
  if (style === 'satellite') {
    return (
      <defs>
        <pattern id="base-grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <rect width="60" height="60" fill="#1a2419"/>
          <circle cx="20" cy="15" r="3" fill="#2d3a28" opacity="0.6"/>
          <circle cx="40" cy="35" r="2" fill="#35422d" opacity="0.5"/>
          <rect x="10" y="40" width="8" height="14" fill="#4a4a3a" opacity="0.7"/>
          <rect x="30" y="5" width="14" height="9" fill="#3e3e30" opacity="0.6"/>
        </pattern>
      </defs>
    );
  }
  return (
    <defs>
      <pattern id="base-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="#0b1016"/>
        <path d="M40 0H0v40" fill="none" stroke="#182030" strokeWidth="0.5"/>
      </pattern>
    </defs>
  );
}

function BasemapRoads({ style }) {
  const main = style === 'light' ? '#CFC6B0' : style === 'satellite' ? '#6a6a52' : '#1a2230';
  const secondary = style === 'light' ? '#DED7C6' : style === 'satellite' ? '#555544' : '#141b26';
  const roads = [
    'M 0 440 L 1000 445',
    'M 495 0 L 510 1000',
    'M 380 0 L 395 1000',
    'M 610 0 L 600 1000',
    'M 0 320 L 680 340 L 740 300 L 1000 290',
    'M 0 580 L 1000 590',
    'M 300 200 L 380 270 L 480 350 L 600 450',
  ];
  const minor = [
    'M 0 390 L 1000 395',
    'M 0 500 L 1000 505',
    'M 340 0 L 355 1000',
    'M 550 0 L 555 1000',
    'M 660 0 L 655 1000',
    'M 0 260 L 1000 265',
    'M 0 660 L 1000 670',
    'M 430 0 L 440 1000',
  ];
  return (
    <g>
      {minor.map((d, i) => <path key={'mi'+i} d={d} stroke={secondary} strokeWidth="4" fill="none"/>)}
      {roads.map((d, i) => <path key={'ma'+i} d={d} stroke={main} strokeWidth="7" fill="none"/>)}
    </g>
  );
}

function ColoniaLayer({ data, onSelect, selectedId, showLabels, basemap }) {
  const color = (s) => {
    if (s == null) return '#3a4354';
    if (s < 30) return '#d73027';
    if (s < 45) return '#fdae61';
    if (s < 60) return '#fee08b';
    if (s < 75) return '#a6d96a';
    return '#1a9850';
  };
  const labelColor = basemap === 'light' ? '#2a2a2a' : '#cbd3df';
  const polyStroke = basemap === 'light' ? 'rgba(15,23,42,0.25)' : 'rgba(255,255,255,0.18)';
  const selectedStroke = basemap === 'light' ? '#2563eb' : '#7cc4ff';
  return (
    <g>
      {data.COLONIAS.map(c => (
        <path key={c.id} d={c.poly}
          fill={color(c.score_overall)}
          fillOpacity={selectedId === c.id ? 0.55 : 0.28}
          stroke={selectedId === c.id ? selectedStroke : polyStroke}
          strokeWidth={selectedId === c.id ? 2.4 : 0.8}
          onClick={() => onSelect({ kind: 'colonia', ...c })}
          style={{ cursor: 'pointer' }}
        />
      ))}
      {showLabels && data.COLONIAS.map(c => {
        const nums = c.poly.match(/-?\d+(\.\d+)?/g).map(Number);
        let cx = 0, cy = 0, n = 0;
        for (let i = 0; i < nums.length; i += 2) { cx += nums[i]; cy += nums[i+1]; n++; }
        cx /= n; cy /= n;
        return (
          <text key={c.id+'-lbl'} x={cx} y={cy}
            fill={labelColor} fontSize="12" fontWeight="600"
            textAnchor="middle" style={{ pointerEvents: 'none', letterSpacing: '0.04em' }}>
            {c.name.toUpperCase()}
          </text>
        );
      })}
    </g>
  );
}

function CrimeHeatLayer({ data }) {
  return (
    <g style={{ mixBlendMode: 'screen', pointerEvents: 'none' }}>
      {data.CRIME_GRID.map(([x, y, i], idx) => (
        <circle key={idx} cx={x} cy={y} r={26}
          fill="#ff3860" opacity={Math.min(0.38, i * 0.45)}/>
      ))}
    </g>
  );
}

function TransitLayer({ data, time }) {
  const pathStr = (path) => path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  const vehicles = [];
  data.TRANSIT_LINES.forEach(line => {
    if (line.mode === 'ecobici') return;
    const count = line.mode === 'metro' ? 3 : 2;
    for (let v = 0; v < count; v++) {
      const speed = line.mode === 'metro' ? 0.00009 : line.mode === 'metrobus' ? 0.00007 : 0.00005;
      const t = (time * speed + v / count) % 1;
      vehicles.push({ line, t, id: line.id + '-v' + v });
    }
  });
  return (
    <g>
      {data.TRANSIT_LINES.map(line => (
        <g key={line.id}>
          <path d={pathStr(line.path)} stroke={line.color} strokeWidth="4"
            strokeOpacity="0.85" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </g>
      ))}
      {vehicles.map(v => {
        const p = v.line.path;
        const total = p.length - 1;
        const at = v.t * total;
        const i = Math.min(Math.floor(at), total - 1);
        const f = at - i;
        const x = p[i][0] + (p[i+1][0] - p[i][0]) * f;
        const y = p[i][1] + (p[i+1][1] - p[i][1]) * f;
        return (
          <g key={v.id}>
            <circle cx={x} cy={y} r={7} fill={v.line.color} stroke="#fff" strokeWidth="1.4"/>
            <circle cx={x} cy={y} r={11} fill={v.line.color} opacity="0.25"/>
          </g>
        );
      })}
    </g>
  );
}

function StationLayer({ data, time, onSelect, modes, basemap }) {
  const stations = data.STATIONS.filter(s => modes.includes(s.mode));
  const markerFill = basemap === 'light' ? '#ffffff' : '#0b1016';
  return (
    <g>
      {stations.map(s => {
        const color = s.status === 'open' ? '#7cc4ff'
                    : s.status === 'delay' ? '#fbbf24'
                    : s.status === 'closed' ? '#ef4444'
                    : '#ff6b9d';
        const pulse = (s.status !== 'open') ? (0.5 + 0.5 * Math.sin(time * 0.005)) : 0;
        return (
          <g key={s.id} onClick={() => onSelect({ kind: 'stop', ...s })} style={{ cursor: 'pointer' }}>
            {s.status !== 'open' && (
              <circle cx={s.x} cy={s.y} r={10 + 6 * pulse} fill={color} opacity={0.2 + 0.15 * pulse}/>
            )}
            <circle cx={s.x} cy={s.y} r={5.5} fill={markerFill} stroke={color} strokeWidth={2}/>
            {s.live && <circle cx={s.x + 5} cy={s.y - 5} r={2.5} fill="#ef4444" stroke={markerFill} strokeWidth="1"/>}
          </g>
        );
      })}
    </g>
  );
}

function BikeLaneLayer({ data }) {
  const pathStr = (path) => path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  return (
    <g style={{ pointerEvents: 'none' }}>
      {data.BIKE_LANES.map(l => (
        <path key={l.id} d={pathStr(l.path)} stroke="#00B2A9" strokeWidth="2.4"
          strokeDasharray="6 4" fill="none" opacity="0.85"/>
      ))}
    </g>
  );
}

function RestroomLayer({ data, onSelect, density, basemap }) {
  const list = density < 3 ? data.RESTROOMS.slice(0, 3 + density * 2) : data.RESTROOMS;
  const stroke = basemap === 'light' ? '#ffffff' : '#0b1016';
  return (
    <g>
      {list.map(r => (
        <g key={r.id} onClick={() => onSelect({ kind: 'restroom', ...r })} style={{ cursor: 'pointer' }}>
          <rect x={r.x - 10} y={r.y - 10} width="20" height="20" rx="6"
            fill="#4ac6c0" stroke={stroke} strokeWidth="1.5"/>
          <text x={r.x} y={r.y + 4} fontSize="11" fontWeight="700" textAnchor="middle" fill="#0b1016">
            WC
          </text>
          <circle cx={r.x + 8} cy={r.y - 8} r={2.5} fill="#ef4444" stroke={stroke} strokeWidth="1"/>
        </g>
      ))}
    </g>
  );
}

function EventLayer({ data, onSelect, density, basemap }) {
  const list = density < 3 ? data.EVENTS.slice(0, 4 + density) : data.EVENTS;
  const iconFor = (kind) => {
    if (kind === 'cultural') return '♪';
    if (kind === 'civico') return '✊';
    return '★';
  };
  const colorFor = (kind) => {
    if (kind === 'cultural') return '#c084fc';
    if (kind === 'civico') return '#fb923c';
    return '#f472b6';
  };
  const stroke = basemap === 'light' ? '#ffffff' : '#0b1016';
  const dot = basemap === 'light' ? '#ffffff' : '#0b1016';
  return (
    <g>
      {list.map(e => (
        <g key={e.id} onClick={() => onSelect({ kind: 'event', ...e })} style={{ cursor: 'pointer' }}>
          <path d={`M ${e.x} ${e.y - 22} C ${e.x - 14} ${e.y - 22}, ${e.x - 14} ${e.y - 4}, ${e.x} ${e.y + 2} C ${e.x + 14} ${e.y - 4}, ${e.x + 14} ${e.y - 22}, ${e.x} ${e.y - 22} Z`}
            fill={colorFor(e.kind)} stroke={stroke} strokeWidth="1.4"/>
          <circle cx={e.x} cy={e.y - 14} r={7} fill={dot}/>
          <text x={e.x} y={e.y - 10} fontSize="11" fontWeight="700" textAnchor="middle" fill={colorFor(e.kind)}>
            {iconFor(e.kind)}
          </text>
        </g>
      ))}
    </g>
  );
}

function ServiceLayer({ data, onSelect, density, basemap }) {
  const list = density < 3 ? data.SERVICES.slice(0, 4 + density) : data.SERVICES;
  const iconFor = (kind) => kind === 'mercado' ? 'M' : kind === 'salud' ? '+' : 'E';
  const colorFor = (kind) => kind === 'mercado' ? '#facc15' : kind === 'salud' ? '#4ade80' : '#60a5fa';
  const stroke = basemap === 'light' ? '#ffffff' : '#0b1016';
  return (
    <g>
      {list.map(s => (
        <g key={s.id} onClick={() => onSelect({ kind: 'service', ...s })} style={{ cursor: 'pointer' }}>
          <circle cx={s.x} cy={s.y} r={9} fill={colorFor(s.kind)} stroke={stroke} strokeWidth="1.4"/>
          <text x={s.x} y={s.y + 4} fontSize="11" fontWeight="800" textAnchor="middle" fill="#0b1016">
            {iconFor(s.kind)}
          </text>
        </g>
      ))}
    </g>
  );
}

function IncidentLayer({ data, onSelect, basemap }) {
  const stroke = basemap === 'light' ? '#ffffff' : '#0b1016';
  return (
    <g>
      {data.INCIDENTS.map(i => (
        <g key={i.id} onClick={() => onSelect({ kind: 'incident', ...i })} style={{ cursor: 'pointer' }}>
          <path d={`M ${i.x} ${i.y - 9} L ${i.x + 9} ${i.y + 7} L ${i.x - 9} ${i.y + 7} Z`}
            fill={i.live ? '#ef4444' : '#8b5a4a'} stroke={stroke} strokeWidth="1.2"/>
          <text x={i.x} y={i.y + 4} fontSize="9" fontWeight="800" textAnchor="middle" fill="#fff">!</text>
          {i.live && <circle cx={i.x + 8} cy={i.y - 8} r={2.5} fill="#fbbf24" stroke={stroke} strokeWidth="1"/>}
        </g>
      ))}
    </g>
  );
}

function YouMarker({ time, basemap }) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 0.003);
  const stroke = basemap === 'light' ? '#ffffff' : '#0b1016';
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx="460" cy="460" r={18 + 8 * pulse} fill="#7cc4ff" opacity={0.12 + 0.08 * pulse}/>
      <circle cx="460" cy="460" r={9} fill="#7cc4ff" stroke={stroke} strokeWidth={3}/>
    </g>
  );
}

export function MapCanvas({ layers, selected, onSelect, tweaks, onViewportTap }) {
  const [time, setTime] = useState(0);
  useEffect(() => {
    let raf;
    const loop = () => { setTime(performance.now()); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const data = CTC_DATA;
  const vb = { x: 150, y: 180, w: 700, h: 500 };
  return (
    <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} style={{ width: '100%', height: '100%', display: 'block' }}
      onClick={(e) => { if (e.target.tagName === 'svg' || e.target.id === 'basemap-bg') onViewportTap?.(); }}>
      <BasemapDefs style={tweaks.basemap}/>
      <rect id="basemap-bg" x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#base-grid)"/>
      <BasemapRoads style={tweaks.basemap}/>
      {layers.colonias && <ColoniaLayer data={data} onSelect={onSelect} selectedId={selected?.kind === 'colonia' ? selected.id : null} showLabels={true} basemap={tweaks.basemap}/>}
      {layers.safety && <CrimeHeatLayer data={data}/>}
      {layers.bikes && <BikeLaneLayer data={data}/>}
      {layers.transport && <TransitLayer data={data} time={time}/>}
      {layers.liveStops && <StationLayer data={data} time={time} onSelect={onSelect}
        modes={['metro','metrobus','trolebus','ecobici']} basemap={tweaks.basemap}/>}
      {layers.services && <ServiceLayer data={data} onSelect={onSelect} density={tweaks.density} basemap={tweaks.basemap}/>}
      {layers.traffic && <IncidentLayer data={data} onSelect={onSelect} basemap={tweaks.basemap}/>}
      {layers.restrooms && <RestroomLayer data={data} onSelect={onSelect} density={tweaks.density} basemap={tweaks.basemap}/>}
      {layers.events && <EventLayer data={data} onSelect={onSelect} density={tweaks.density} basemap={tweaks.basemap}/>}
      <YouMarker time={time} basemap={tweaks.basemap}/>
    </svg>
  );
}
