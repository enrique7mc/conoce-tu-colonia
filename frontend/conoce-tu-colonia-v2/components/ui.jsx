'use client';

import { T } from '../lib/i18n';
import { CTC_DATA } from '../lib/data';

export function LayerRow({ id, icon, title, sub, on, onToggle, accent, dataKind, theme }) {
  return (
    <div onClick={() => onToggle(id)} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', cursor: 'pointer',
      borderRadius: 12,
      background: on ? theme.accentSoftBg : 'transparent',
      border: on ? `1px solid ${theme.accentSoftBorder}` : '1px solid transparent',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: on ? accent : theme.iconBg,
        color: on ? '#0b1016' : theme.iconText,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 14, letterSpacing: '0.03em',
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: on ? theme.text : theme.textMuted }}>{title}</div>
          {dataKind === 'live' && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
              background: 'rgba(239,68,68,0.15)', color: '#ef4444',
              padding: '1px 5px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)' }}>EN VIVO</span>
          )}
          {dataKind === 'static' && (
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
              color: theme.pillStaticText }}>estático</span>
          )}
          {dataKind === 'mixed' && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              color: '#fbbf24' }}>mixto</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: theme.textSubtle, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
      </div>
      <div style={{
        width: 34, height: 20, borderRadius: 100,
        background: on ? theme.accent : theme.toggleOff,
        position: 'relative', transition: 'all 140ms',
      }}>
        <div style={{
          position: 'absolute', top: 2, left: on ? 16 : 2,
          width: 16, height: 16, borderRadius: 100, background: theme.toggleKnob,
          transition: 'all 140ms', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        }}/>
      </div>
    </div>
  );
}

export function LayerPanel({ layers, setLayers, lang, theme }) {
  const toggle = (id) => setLayers(l => ({ ...l, [id]: !l[id] }));
  const defs = [
    { id: 'transport', key: 'transport', icon: 'T', accent: '#7cc4ff', kind: 'mixed' },
    { id: 'liveStops', key: 'live_stops', icon: '◉', accent: '#fbbf24', kind: 'live' },
    { id: 'events', key: 'events', icon: '★', accent: '#c084fc', kind: 'live' },
    { id: 'restrooms', key: 'restrooms', icon: 'WC', accent: '#4ac6c0', kind: 'live' },
    { id: 'traffic', key: 'traffic', icon: '!', accent: '#ef4444', kind: 'mixed' },
    { id: 'safety', key: 'safety', icon: 'S', accent: '#ff6b6b', kind: 'static' },
    { id: 'bikes', key: 'bikes', icon: '⇢', accent: '#00B2A9', kind: 'static' },
    { id: 'services', key: 'services', icon: 'M+', accent: '#facc15', kind: 'static' },
    { id: 'colonias', key: 'colonias', icon: 'C', accent: '#a6d96a', kind: 'static' },
  ];
  return (
    <div style={{ padding: '6px 10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {defs.map(d => (
        <LayerRow key={d.id} {...d}
          title={T('layer_' + d.key, lang)}
          sub={T('layer_' + d.key + '_sub', lang)}
          on={!!layers[d.id]} onToggle={toggle}
          dataKind={d.kind} theme={theme}/>
      ))}
    </div>
  );
}

export function ColoniaDetail({ item, lang, theme }) {
  const bar = (label, val, color) => (
    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 32px', gap: 8, alignItems: 'center', fontSize: 12 }}>
      <div style={{ color: theme.textSubtle }}>{label}</div>
      <div style={{ height: 6, background: theme.softBg, borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: (val ?? 0) + '%', height: '100%', background: color }}/>
      </div>
      <div style={{ textAlign: 'right', color: theme.text, fontVariantNumeric: 'tabular-nums' }}>{val ?? '—'}</div>
    </div>
  );
  return (
    <div style={{ padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', color: theme.text }}>{item.name}</div>
        <div style={{ fontSize: 12, color: theme.textSubtle }}>{item.alcaldia}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.02em', color: theme.text }}>{item.score_overall}</div>
        <div style={{ fontSize: 12, color: theme.textSubtle }}>/ 100 · score general</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bar(T('layer_safety', lang), item.score_safety, '#ef4444')}
        {bar(T('layer_transport', lang), item.score_transit, '#7cc4ff')}
        {bar('Servicios', item.score_urban, '#4ade80')}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <ActionBtn icon="→" label={T('directions', lang)} theme={theme}/>
        <ActionBtn icon="☆" label={T('save', lang)} theme={theme}/>
        <ActionBtn icon="↗" label={T('share', lang)} theme={theme}/>
      </div>
      <div style={{ fontSize: 11, color: theme.textFaint, lineHeight: 1.5 }}>
        Datos: carpetas FGJ (últ. 12 meses), SEMOVI, Evalúa CDMX IDS 2020. <span style={{ color: theme.textSubtle }}>Fuente estática — datos.cdmx.gob.mx</span>
      </div>
    </div>
  );
}

export function StopDetail({ item, lang, theme }) {
  const statusColor = item.status === 'open' ? '#4ade80'
                    : item.status === 'delay' ? '#fbbf24'
                    : item.status === 'closed' ? '#ef4444'
                    : '#ff6b9d';
  const statusLabel = T('status_' + item.status, lang);
  const crowdLabel = item.crowd === 'high' ? T('crowd_high', lang)
                   : item.crowd === 'medium' ? T('crowd_medium', lang)
                   : item.crowd === 'low' ? T('crowd_low', lang) : '—';
  return (
    <div style={{ padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
            padding: '2px 6px', borderRadius: 4, color: '#fff',
            background: item.mode === 'metro' ? '#E6007E' : item.mode === 'metrobus' ? '#D52B1E' : item.mode === 'trolebus' ? '#5FBF7F' : '#00B2A9' }}>
            {item.mode.toUpperCase()}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: theme.text }}>{item.name}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', borderRadius: 12,
        background: `${statusColor}15`, border: `1px solid ${statusColor}40` }}>
        <div style={{ width: 10, height: 10, borderRadius: 99, background: statusColor }}/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: statusColor }}>{statusLabel}</div>
          {item.note && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{item.note}</div>}
        </div>
        {item.live && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '2px 6px', borderRadius: 4,
          border: '1px solid rgba(239,68,68,0.3)' }}>EN VIVO</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <StatBox label={T('crowd_level', lang)} value={crowdLabel} accent={theme.accent} theme={theme}/>
        <StatBox label="Línea" value={item.line.toUpperCase()} accent={theme.textMuted} theme={theme}/>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <ActionBtn icon="→" label={T('directions', lang)} theme={theme}/>
        <ActionBtn icon="!" label={T('report', lang)} theme={theme}/>
        <ActionBtn icon="↗" label={T('share', lang)} theme={theme}/>
      </div>
      {item.live && (
        <div style={{ fontSize: 11, color: theme.textFaint, lineHeight: 1.5 }}>
          {T('crowd_data', lang)} · {T('reported_by', lang)} 14 {T('users', lang)} · últ. actualización hace 3 min
        </div>
      )}
    </div>
  );
}

export function EventDetail({ item, lang, theme }) {
  const color = item.kind === 'cultural' ? '#c084fc' : item.kind === 'civico' ? '#fb923c' : '#f472b6';
  return (
    <div style={{ padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            padding: '2px 8px', borderRadius: 99, color, background: `${color}22`, border: `1px solid ${color}55` }}>
            {item.tag?.toUpperCase()}
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            background: 'rgba(239,68,68,0.15)', color: '#ef4444',
            padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)' }}>EN VIVO</span>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 8, letterSpacing: '-0.01em', lineHeight: 1.25, color: theme.text }}>{item.name}</div>
        <div style={{ fontSize: 12, color: theme.textSubtle, marginTop: 4 }}>{item.colonia} · {item.when}</div>
      </div>
      {item.warning && (
        <div style={{ padding: '10px 12px', borderRadius: 12,
          background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.35)',
          fontSize: 12, color: theme.mode === 'light' ? '#b45309' : '#fbbf24' }}>
          ⚠ {item.warning}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <StatBox label={T('attendance', lang)} value={item.attendance.toLocaleString('es-MX')} accent={color} theme={theme}/>
        <StatBox label="Categoría" value={item.kind} accent={theme.textMuted} theme={theme}/>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <ActionBtn icon="→" label={T('directions', lang)} theme={theme}/>
        <ActionBtn icon="☆" label={T('save', lang)} theme={theme}/>
        <ActionBtn icon="↗" label={T('share', lang)} theme={theme}/>
      </div>
      <div style={{ fontSize: 11, color: theme.textFaint, lineHeight: 1.5 }}>
        {T('crowd_data', lang)} · publicado y validado por vecinos de la zona
      </div>
    </div>
  );
}

export function RestroomDetail({ item, lang, theme }) {
  return (
    <div style={{ padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: theme.text }}>{item.name}</div>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            background: 'rgba(239,68,68,0.15)', color: '#ef4444',
            padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)' }}>EN VIVO</span>
        </div>
        <div style={{ fontSize: 12, color: theme.textSubtle, marginTop: 4 }}>
          Baño público · {T('last_report', lang)} {item.lastReport}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <StatBox label={T('rating', lang)} value={'★ ' + item.rating} accent="#fbbf24" theme={theme}/>
        <StatBox label="Costo" value={item.fee} accent="#4ade80" theme={theme}/>
        <StatBox label="Acceso" value={item.accessible ? '♿ Sí' : 'No'} accent={item.accessible ? '#4ade80' : theme.textSubtle} theme={theme}/>
      </div>
      {item.flag && (
        <div style={{ padding: '8px 12px', borderRadius: 10,
          background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)',
          fontSize: 12, color: '#ef4444' }}>⚠ Reportado: {item.flag}</div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <ActionBtn icon="→" label={T('directions', lang)} theme={theme}/>
        <ActionBtn icon="!" label={T('report', lang)} theme={theme}/>
        <ActionBtn icon="↗" label={T('share', lang)} theme={theme}/>
      </div>
      <div style={{ fontSize: 11, color: theme.textFaint, lineHeight: 1.5 }}>
        {T('crowd_data', lang)} · {item.reports} {T('reports', lang)} de la comunidad
      </div>
    </div>
  );
}

export function IncidentDetail({ item, theme }) {
  return (
    <div style={{ padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>{item.name}</div>
          {item.live && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '2px 6px', borderRadius: 4,
            border: '1px solid rgba(239,68,68,0.3)' }}>EN VIVO</span>}
        </div>
        <div style={{ fontSize: 12, color: theme.textSubtle, marginTop: 4 }}>{item.when}</div>
      </div>
      <div style={{ fontSize: 11, color: theme.textFaint, lineHeight: 1.5 }}>
        {item.live ? 'Reporte colaborativo' : 'SSC hechos de tránsito 2024 (estático)'}
      </div>
    </div>
  );
}

export function ServiceDetail({ item, theme }) {
  return (
    <div style={{ padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: theme.text }}>{item.name}</div>
        <div style={{ fontSize: 12, color: theme.textSubtle, marginTop: 4, textTransform: 'capitalize' }}>{item.kind}</div>
      </div>
      <div style={{ fontSize: 11, color: theme.textFaint }}>Fuente estática · Catálogo de equipamiento urbano CDMX</div>
    </div>
  );
}

function StatBox({ label, value, accent, theme }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 12,
      background: theme.statBg, border: `1px solid ${theme.statBorder}`,
    }}>
      <div style={{ fontSize: 10, color: theme.textSubtle, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: accent, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ActionBtn({ icon, label, theme }) {
  return (
    <button style={{
      flex: 1, padding: '10px 12px', borderRadius: 12,
      background: theme.accentSoftBg, border: `1px solid ${theme.accentSoftBorder}`,
      color: theme.accent, fontSize: 13, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      cursor: 'pointer',
    }}>
      <span style={{ fontSize: 14 }}>{icon}</span> {label}
    </button>
  );
}

export function SearchResults({ query, onPick, lang, theme }) {
  const q = query.trim().toLowerCase();
  if (q.length < 1) return null;
  const all = CTC_DATA.SEARCH;
  const matches = all.filter(i => i.name.toLowerCase().includes(q) || (i.sub || '').toLowerCase().includes(q)).slice(0, 20);
  const iconFor = (k) => k === 'colonia' ? '◆' : k === 'stop' ? '◉' : k === 'event' ? '★' : k === 'restroom' ? 'WC' : '●';
  const colorFor = (k) => k === 'colonia' ? '#a6d96a' : k === 'stop' ? '#7cc4ff' : k === 'event' ? '#c084fc' : k === 'restroom' ? '#4ac6c0' : '#facc15';
  return (
    <div style={{ padding: '0 0 16px' }}>
      {matches.length === 0 && (
        <div style={{ padding: '16px', fontSize: 13, color: theme.textSubtle }}>{T('no_results', lang)}</div>
      )}
      {matches.map(m => (
        <div key={m.kind + m.id} onClick={() => onPick(m)} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
          cursor: 'pointer', borderTop: `1px solid ${theme.divider}`,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: `${colorFor(m.kind)}22`, color: colorFor(m.kind),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 12,
          }}>{iconFor(m.kind)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
            <div style={{ fontSize: 11, color: theme.textSubtle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.sub}</div>
          </div>
          <div style={{ fontSize: 10, color: theme.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.kind}</div>
        </div>
      ))}
    </div>
  );
}

export function EventList({ lang, onPick, theme }) {
  return (
    <div>
      <div style={{ padding: '4px 16px 8px', fontSize: 11, color: theme.textSubtle,
        textTransform: 'uppercase', letterSpacing: '0.08em' }}>{T('events_today', lang)}</div>
      {CTC_DATA.EVENTS.map(e => {
        const color = e.kind === 'cultural' ? '#c084fc' : e.kind === 'civico' ? '#fb923c' : '#f472b6';
        return (
          <div key={e.id} onClick={() => onPick({ kind: 'event', ...e })} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 16px',
            cursor: 'pointer', borderTop: `1px solid ${theme.divider}`,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `${color}22`, color, display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontWeight: 700,
              flexShrink: 0,
            }}>
              {e.kind === 'cultural' ? '♪' : e.kind === 'civico' ? '✊' : '★'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, lineHeight: 1.3 }}>{e.name}</div>
              <div style={{ fontSize: 11, color: theme.textSubtle, marginTop: 2 }}>{e.colonia} · {e.when}</div>
              <div style={{ fontSize: 10, color: color, marginTop: 3 }}>{e.attendance} {T('attendance', lang)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TweaksPanel({ tweaks, setTweaks, lang, setLang, visible, theme }) {
  if (!visible) return null;
  const row = (label, children) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 0', borderBottom: `1px solid ${theme.divider}` }}>
      <div style={{ fontSize: 13, color: theme.textMuted }}>{label}</div>
      <div>{children}</div>
    </div>
  );
  const seg = (current, options, onChange) => (
    <div style={{ display: 'flex', background: theme.softBg, borderRadius: 8, padding: 2 }}>
      {options.map(o => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{
          padding: '5px 10px', borderRadius: 6, border: 0, cursor: 'pointer',
          background: current === o.v ? theme.accent : 'transparent',
          color: current === o.v ? theme.accentContrast : theme.textMuted,
          fontSize: 11, fontWeight: 600,
        }}>{o.label}</button>
      ))}
    </div>
  );
  return (
    <div style={{
      position: 'absolute', right: 10, top: 110, width: 250, zIndex: 90,
      background: theme.surfaceStrong, backdropFilter: 'blur(12px)',
      border: `1px solid ${theme.borderStrong}`, borderRadius: 16,
      padding: '12px 14px', boxShadow: theme.shadow,
    }}>
      <div style={{ fontSize: 11, color: theme.textSubtle, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
        {T('tweaks', lang)}
      </div>
      {row(T('basemap', lang), seg(tweaks.basemap, [
        { v: 'dark', label: T('basemap_dark', lang) },
        { v: 'light', label: T('basemap_light', lang) },
        { v: 'satellite', label: T('basemap_satellite', lang) },
      ], v => setTweaks(t => ({ ...t, basemap: v }))))}
      {row(T('panel_pos', lang), seg(tweaks.panelPos, [
        { v: 'bottom', label: T('panel_bottom', lang) },
        { v: 'left', label: T('panel_left', lang) },
        { v: 'float', label: T('panel_float', lang) },
      ], v => setTweaks(t => ({ ...t, panelPos: v }))))}
      {row(T('density', lang) + ' ' + tweaks.density, (
        <input type="range" min="1" max="5" value={tweaks.density}
          onChange={e => setTweaks(t => ({ ...t, density: +e.target.value }))}
          style={{ width: 100, accentColor: theme.accent }}/>
      ))}
      {row(T('language', lang), seg(lang, [
        { v: 'es', label: 'ES' },
        { v: 'en', label: 'EN' },
      ], setLang))}
    </div>
  );
}
