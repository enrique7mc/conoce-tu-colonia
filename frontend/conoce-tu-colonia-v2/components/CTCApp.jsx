'use client';

import { useState } from 'react';
import { T } from '../lib/i18n';
import { CTC_DATA } from '../lib/data';
import { createTheme } from '../lib/theme';
import { MapCanvas } from './MapCanvas';
import {
  LayerPanel,
  ColoniaDetail, StopDetail, EventDetail, RestroomDetail, IncidentDetail, ServiceDetail,
  SearchResults, EventList, TweaksPanel,
} from './ui';

export function CTCApp() {
  const [lang, setLang] = useState('es');
  const [layers, setLayers] = useState({
    transport: true, liveStops: true, events: true, restrooms: true,
    traffic: false, safety: false, bikes: false, services: false, colonias: true,
  });
  const [tweaks, setTweaks] = useState({
    basemap: 'dark', panelPos: 'bottom', density: 3,
  });
  const [selected, setSelected] = useState(null);
  const [sheetMode, setSheetMode] = useState('layers');
  const [sheetHeight, setSheetHeight] = useState('mid');
  const [query, setQuery] = useState('');
  const [searchFocus, setSearchFocus] = useState(false);
  const [showTweaks, setShowTweaks] = useState(false);
  const [reportFlash, setReportFlash] = useState(false);

  const theme = createTheme(tweaks.basemap);

  const onSelect = (item) => {
    setSelected(item);
    setSheetMode('detail');
    setSheetHeight('mid');
    setSearchFocus(false);
  };

  const clearSelection = () => {
    setSelected(null);
    setSheetMode('layers');
  };

  const onReport = () => {
    setReportFlash(true);
    setTimeout(() => setReportFlash(false), 220);
  };

  const layerCount = Object.values(layers).filter(Boolean).length;
  const sheetPx = sheetHeight === 'peek' ? 110 : sheetHeight === 'mid' ? 340 : 620;

  let sheetBody;
  if (searchFocus && query) {
    sheetBody = <SearchResults query={query} lang={lang} theme={theme} onPick={(m) => {
      if (m.kind === 'colonia') {
        const full = CTC_DATA.COLONIAS.find(c => c.id === m.id);
        onSelect({ kind: 'colonia', ...full });
      } else if (m.kind === 'stop') {
        const full = CTC_DATA.STATIONS.find(s => s.id === m.id);
        onSelect({ kind: 'stop', ...full });
      } else if (m.kind === 'event') {
        const full = CTC_DATA.EVENTS.find(e => e.id === m.id);
        onSelect({ kind: 'event', ...full });
      } else if (m.kind === 'restroom') {
        const full = CTC_DATA.RESTROOMS.find(r => r.id === m.id);
        onSelect({ kind: 'restroom', ...full });
      } else if (m.kind === 'service') {
        const full = CTC_DATA.SERVICES.find(s => s.id === m.id);
        onSelect({ kind: 'service', ...full });
      }
      setQuery('');
    }}/>;
  } else if (sheetMode === 'detail' && selected) {
    if (selected.kind === 'colonia') sheetBody = <ColoniaDetail item={selected} lang={lang} theme={theme}/>;
    else if (selected.kind === 'stop') sheetBody = <StopDetail item={selected} lang={lang} theme={theme}/>;
    else if (selected.kind === 'event') sheetBody = <EventDetail item={selected} lang={lang} theme={theme}/>;
    else if (selected.kind === 'restroom') sheetBody = <RestroomDetail item={selected} lang={lang} theme={theme}/>;
    else if (selected.kind === 'incident') sheetBody = <IncidentDetail item={selected} lang={lang} theme={theme}/>;
    else if (selected.kind === 'service') sheetBody = <ServiceDetail item={selected} lang={lang} theme={theme}/>;
  } else if (sheetMode === 'events') {
    sheetBody = <EventList lang={lang} onPick={onSelect} theme={theme}/>;
  } else {
    sheetBody = (
      <div>
        <div style={{ padding: '4px 16px 8px', fontSize: 11, color: theme.textSubtle,
          textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', justifyContent: 'space-between' }}>
          <span>{T('layers', lang)}</span>
          <span>{layerCount} {T('layers_on', lang)}</span>
        </div>
        <LayerPanel layers={layers} setLayers={setLayers} lang={lang} theme={theme}/>
      </div>
    );
  }

  const leftRail = tweaks.panelPos === 'left' && !selected && !searchFocus;
  const floatRail = tweaks.panelPos === 'float' && !selected && !searchFocus;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%',
      background: theme.bg, overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro", system-ui, sans-serif',
      color: theme.text }}>

      <div style={{ position: 'absolute', inset: 0 }}>
        <MapCanvas layers={layers} selected={selected} onSelect={onSelect}
          tweaks={tweaks} onViewportTap={() => { if (sheetHeight === 'full') setSheetHeight('mid'); }}/>
      </div>

      <div style={{ position: 'absolute', top: 54, left: 12, right: 12, zIndex: 80 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderRadius: 14,
          background: theme.surface, backdropFilter: 'blur(14px)',
          border: `1px solid ${theme.border}`,
          boxShadow: theme.shadow,
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
            <circle cx="7" cy="7" r="5" stroke={theme.inputIcon} strokeWidth="1.6" fill="none"/>
            <path d="M11 11l4 4" stroke={theme.inputIcon} strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          <input value={query}
            onFocus={() => setSearchFocus(true)}
            onChange={e => { setQuery(e.target.value); setSearchFocus(true); }}
            placeholder={T('search_placeholder', lang)}
            style={{
              flex: 1, background: 'transparent', border: 0, outline: 'none',
              color: theme.text, fontSize: 14, fontFamily: 'inherit', minWidth: 0,
            }}/>
          {query && (
            <button onClick={() => { setQuery(''); setSearchFocus(false); }} style={{
              background: 'transparent', border: 0, color: theme.textSubtle, fontSize: 16, cursor: 'pointer', padding: 0,
            }}>×</button>
          )}
          <button onClick={() => setShowTweaks(v => !v)} style={{
            width: 28, height: 28, borderRadius: 8, border: 0, cursor: 'pointer',
            background: showTweaks ? theme.accent : theme.iconBg,
            color: showTweaks ? theme.accentContrast : theme.textMuted,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
          }}>⚙</button>
        </div>
      </div>

      {!searchFocus && (
        <div style={{
          position: 'absolute', top: 108, left: 0, right: 0, zIndex: 75,
          display: 'flex', gap: 6, padding: '0 12px', overflowX: 'auto',
          WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
        }}>
          {[
            { id: 'transport', icon: 'T', label: T('layer_transport', lang), color: '#7cc4ff' },
            { id: 'liveStops', icon: '◉', label: T('layer_live_stops', lang), color: '#fbbf24' },
            { id: 'events', icon: '★', label: T('layer_events', lang), color: '#c084fc' },
            { id: 'restrooms', icon: 'WC', label: T('layer_restrooms', lang), color: '#4ac6c0' },
            { id: 'safety', icon: 'S', label: T('layer_safety', lang), color: '#ff6b6b' },
            { id: 'traffic', icon: '!', label: T('layer_traffic', lang), color: '#ef4444' },
            { id: 'services', icon: 'M+', label: T('layer_services', lang), color: '#facc15' },
            { id: 'bikes', icon: '⇢', label: T('layer_bikes', lang), color: '#00B2A9' },
          ].map(chip => {
            const on = layers[chip.id];
            return (
              <button key={chip.id} onClick={() => setLayers(l => ({ ...l, [chip.id]: !l[chip.id] }))} style={{
                flexShrink: 0, padding: '6px 10px 6px 8px', borderRadius: 99, cursor: 'pointer',
                background: on ? chip.color : theme.chipOff,
                color: on ? '#0b1016' : theme.chipOffText,
                border: on ? `1px solid ${chip.color}` : `1px solid ${theme.chipOffBorder}`,
                fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                backdropFilter: 'blur(14px)',
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 99,
                  background: on ? 'rgba(11,16,22,0.2)' : `${chip.color}22`,
                  color: on ? '#0b1016' : chip.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800,
                }}>{chip.icon}</span>
                {chip.label}
              </button>
            );
          })}
        </div>
      )}

      {layers.safety && !searchFocus && tweaks.panelPos === 'bottom' && (
        <div style={{
          position: 'absolute', left: 12, bottom: sheetPx + 18, zIndex: 60,
          padding: '8px 10px', borderRadius: 10,
          background: theme.surfaceStrong, backdropFilter: 'blur(12px)',
          border: `1px solid ${theme.border}`, fontSize: 10, color: theme.textMuted,
          maxWidth: 160,
        }}>
          <div style={{ textTransform: 'uppercase', letterSpacing: '0.08em', color: theme.textSubtle, marginBottom: 4 }}>
            {T('layer_safety', lang)}
          </div>
          <div style={{ height: 6, borderRadius: 99, background: 'linear-gradient(90deg, rgba(255,56,96,0) 0%, rgba(255,56,96,0.4) 50%, #ff3860 100%)' }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 9 }}>
            <span>baja</span><span>alta</span>
          </div>
        </div>
      )}

      {tweaks.panelPos === 'bottom' && !searchFocus && (
        <div style={{
          position: 'absolute', right: 10, bottom: sheetPx + 18, zIndex: 60,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {[
            { icon: '⊕', title: 'Zoom in' },
            { icon: '⊖', title: 'Zoom out' },
            { icon: '⊙', title: 'Locate me' },
            { icon: '📋', title: 'Events list', onClick: () => { setSheetMode('events'); setSheetHeight('full'); setSelected(null); } },
          ].map(btn => (
            <button key={btn.title} onClick={btn.onClick} style={{
              width: 40, height: 40, borderRadius: 10, cursor: 'pointer',
              background: theme.surfaceStrong, backdropFilter: 'blur(12px)',
              color: theme.textMuted, fontSize: 17,
              border: `1px solid ${theme.border}`,
              boxShadow: theme.shadow,
            }}>{btn.icon}</button>
          ))}
        </div>
      )}

      {tweaks.panelPos === 'bottom' && !searchFocus && (
        <button onClick={onReport} style={{
          position: 'absolute', left: 12, bottom: sheetPx + 18, zIndex: 61,
          display: layers.safety ? 'none' : 'flex',
          alignItems: 'center', gap: 8, padding: '12px 18px 12px 14px',
          borderRadius: 99, border: 0, cursor: 'pointer',
          background: theme.report, color: theme.reportContrast,
          fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em',
          boxShadow: `0 8px 24px ${theme.mode === 'light' ? 'rgba(220,38,38,0.35)' : 'rgba(239,68,68,0.4)'}`,
          transform: reportFlash ? 'scale(0.94)' : 'scale(1)',
          transition: 'transform 160ms cubic-bezier(.2,.9,.2,1)',
          fontFamily: 'inherit',
        }}>
          <span style={{
            width: 22, height: 22, borderRadius: 99,
            background: 'rgba(255,255,255,0.22)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 800,
          }}>!</span>
          {T('report', lang)}
        </button>
      )}

      <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} lang={lang} setLang={setLang} visible={showTweaks} theme={theme}/>

      {leftRail && (
        <div style={{
          position: 'absolute', left: 12, top: 160, bottom: 40, width: 248, zIndex: 50,
          background: theme.surfaceStrong, backdropFilter: 'blur(14px)',
          borderRadius: 16, border: `1px solid ${theme.border}`,
          overflow: 'auto', padding: '12px 4px 12px',
          boxShadow: theme.shadow,
        }}>
          <div style={{ padding: '0 14px 8px', fontSize: 11, color: theme.textSubtle,
            textTransform: 'uppercase', letterSpacing: '0.08em' }}>{T('layers', lang)}</div>
          <LayerPanel layers={layers} setLayers={setLayers} lang={lang} theme={theme}/>
        </div>
      )}

      {floatRail && (
        <div style={{
          position: 'absolute', right: 10, top: 160, width: 220, zIndex: 50,
          background: theme.surfaceStrong, backdropFilter: 'blur(14px)',
          borderRadius: 14, border: `1px solid ${theme.border}`,
          padding: 4, boxShadow: theme.shadow,
        }}>
          <LayerPanel layers={layers} setLayers={setLayers} lang={lang} theme={theme}/>
        </div>
      )}

      {tweaks.panelPos === 'bottom' && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 70,
          height: sheetPx, transition: 'height 240ms cubic-bezier(.2,.9,.2,1)',
          background: theme.sheetBg, backdropFilter: 'blur(20px)',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          borderTop: `1px solid ${theme.border}`,
          boxShadow: theme.sheetShadow,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div onClick={() => {
            setSheetHeight(h => h === 'peek' ? 'mid' : h === 'mid' ? 'full' : 'peek');
          }} style={{
            padding: '8px 0 4px', display: 'flex', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
          }}>
            <div style={{ width: 40, height: 4, borderRadius: 99, background: theme.grabHandle }}/>
          </div>
          {(sheetMode === 'detail' && selected) ? (
            <div style={{
              padding: '4px 12px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <button onClick={clearSelection} style={{
                background: theme.iconBg, border: 0, color: theme.textMuted,
                padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
              }}>← {T('layers', lang)}</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {selected.live && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                  background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '2px 6px', borderRadius: 4,
                  border: '1px solid rgba(239,68,68,0.3)' }}>EN VIVO</span>}
              </div>
            </div>
          ) : (sheetMode === 'events') ? (
            <div style={{
              padding: '4px 12px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            }}>
              <button onClick={() => { setSheetMode('layers'); setSheetHeight('mid'); }} style={{
                background: theme.iconBg, border: 0, color: theme.textMuted,
                padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
              }}>← {T('layers', lang)}</button>
            </div>
          ) : null}
          <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {sheetBody}
          </div>
        </div>
      )}
    </div>
  );
}
