import React, { useState, useEffect, useMemo, useRef } from 'react';
import AutoDashViewer from '../components/AutoDashViewer';
import ValueAtAGlanceComponent from '../components/ValueAtAGlance';
import Badge from '../components/Badge';
import { getRecords, exportValueAtAGlanceHtml, exportValueAtAGlancePptx, exportLifetimeValueHtml, exportLifetimeValuePptx, augmentExecutiveSummary } from '../services/api';
import {
  METRICS, labelFor, deriveOptions, sum, countWithMetric,
  formatCurrency, matchFilters, groupSum,
  yearSeries, yearDeltas, journeyStages, realizationRate, withPercent, formatPct,
  NUMERIC_ELEMENTS, SUMMARY_ELEMENTS, CHART_ELEMENTS, elementById, parseElementId,
  isVariantable, groupElements, mostRecentSummary, summaryFieldContent, normalizeElements,
} from '../services/dashboardData';

const STORAGE_KEY = 'domosapiens.dashboards';

const TEMPLATES = [
  { id: 'client-all-pub', icon: 'ti-building',       title: 'Client — all publishers', sub: 'All publisher ROI for one client in a given year',     tags: ['1 client','All publishers','1 year'] },
  { id: 'pub-all-years',  icon: 'ti-calendar-stats', title: 'Publisher — all years',   sub: 'ROI trend for one publisher across all available years', tags: ['1 client','1 publisher','All years'] },
  { id: 'full',           icon: 'ti-chart-line',     title: 'Full client history',     sub: 'All publishers × all years for one client',             tags: ['1 client','All publishers','All years'] },
  { id: 'custom',         icon: 'ti-sliders',        title: 'Custom filters',          sub: 'Any combination of clients, publishers, and years',      tags: ['Flexible'], tagColor: 'gold' },
];

const TITLES = {
  'client-all-pub': 'Client — All Publishers',
  'pub-all-years':  'Publisher — All Years',
  'full':           'Full Client History',
  'custom':         'Custom Filters',
};

const BAR_COLORS = ['var(--navy)', 'var(--blue)', 'var(--blue-light)', 'var(--gold)'];
// Cap visible comparison bars so a long publisher list stays readable.
const MAX_BARS = 12;
// Pipeline stage colors for the ROI journey funnel (navy → blue → gold).
const STAGE_COLORS = ['var(--navy)', 'var(--blue)', 'var(--gold)'];

// ─── localStorage helpers ─────────────────────────────────────────────────────
function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(d => !d.seed);
    }
  } catch { /* ignore corrupt storage */ }
  return [];
}

function persistSaved(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* quota / private mode */ }
}

// ─── Form primitives ──────────────────────────────────────────────────────────
// Segmented mode switch (All / Select specific) — uses the styled .toggle-group CSS.
function ToggleGroup({ options, value, onChange }) {
  return (
    <div className="toggle-group">
      {options.map(opt => (
        <button key={opt} type="button" className={`toggle-opt ${value === opt ? 'on' : ''}`} onClick={() => onChange(opt)}>
          {opt}
        </button>
      ))}
    </div>
  );
}

// Searchable single-select combobox — type to filter a long list of options.
// Keeps the styling of the native <input> (search icon + chevron added inline) so
// it slots in wherever a <select> would, but scales to large option sets.
function SearchableSelect({ options, value, onChange, placeholder = 'Search…', emptyText = 'No matches' }) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const [active, setActive] = useState(0);
  const boxRef   = useRef(null);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const close = () => { setOpen(false); setQuery(''); };
  const pick  = (opt) => { onChange(opt); close(); inputRef.current?.blur(); };

  // Close when clicking outside the component.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) close(); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Keep the highlighted option in range as the filter changes.
  useEffect(() => { setActive(0); }, [query, open]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown')      { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter')     { if (open && filtered[active]) { e.preventDefault(); pick(filtered[active]); } }
    else if (e.key === 'Escape')    { close(); inputRef.current?.blur(); }
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <i className="ti ti-search" aria-hidden="true"
         style={{ position: 'absolute', left: 12, top: 19, fontSize: 15, color: 'var(--text-faint)', pointerEvents: 'none' }} />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        value={open ? query : value}
        placeholder={value || placeholder}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onKeyDown={onKeyDown}
        style={{ paddingLeft: 34, paddingRight: 34 }}
      />
      <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} aria-hidden="true"
         style={{ position: 'absolute', right: 12, top: 19, fontSize: 15, color: 'var(--text-faint)', pointerEvents: 'none' }} />

      {open && (
        <div style={{
          position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius-sm)', boxShadow: '0 8px 24px rgba(0,25,65,0.12)',
          maxHeight: 240, overflowY: 'auto', padding: 4,
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-muted)' }}>{emptyText}</div>
          ) : filtered.map((opt, i) => {
            const isActive = i === active;
            const isSel    = opt === value;
            return (
              <div
                key={opt}
                role="option"
                aria-selected={isSel}
                onMouseEnter={() => setActive(i)}
                onMouseDown={e => { e.preventDefault(); pick(opt); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 12px', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                  fontSize: 14, fontWeight: isSel ? 700 : 500,
                  background: isActive ? 'var(--navy)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--navy)',
                }}
              >
                {isSel
                  ? <i className="ti ti-check" style={{ fontSize: 14, color: isActive ? '#fff' : 'var(--blue)' }} aria-hidden="true" />
                  : <span style={{ width: 14 }} />}
                <span style={{ flex: 1 }}>{opt}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Pill chips for single- or multi-select. Styled inline (no dependency on new CSS).
// `isDisabled(opt)` greys an option out and blocks selection (e.g. metric with no data).
function Chips({ options, selected, onToggle, render, single = false, primary = null, isDisabled }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(opt => {
        const disabled = isDisabled ? isDisabled(opt) : false;
        const on = !disabled && selected.includes(opt);
        const isPrimary = primary != null && opt === primary;
        const icon = single ? 'ti-circle-check' : isPrimary ? 'ti-chart-bar' : 'ti-check';
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={disabled ? undefined : () => onToggle(opt)}
            title={disabled ? 'No data available for this metric' : undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 13px', borderRadius: 20,
              border: `1.5px solid ${on ? 'var(--navy)' : 'var(--border)'}`,
              background: disabled ? 'var(--surface-2)' : on ? 'var(--navy)' : 'var(--surface)',
              color: disabled ? 'var(--text-faint)' : on ? '#fff' : 'var(--text-muted)',
              fontSize: 13, fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.7 : 1,
              transition: 'all 0.15s',
            }}
          >
            {disabled && <i className="ti ti-ban" style={{ fontSize: 13 }} aria-hidden="true" />}
            {on && <i className={`ti ${icon}`} style={{ fontSize: 14 }} aria-hidden="true" />}
            {render ? render(opt) : opt}
          </button>
        );
      })}
    </div>
  );
}

function InfoNote({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 8, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
      <i className="ti ti-info-circle" style={{ fontSize: 14, color: 'var(--blue)', marginTop: 1, flexShrink: 0 }} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

// Anglepoint-branded header band — mirrors the topbar (navy bg, gold mark + underline).
// The same markup is reproduced in the exported HTML for a consistent deliverable.
function BrandHeader({ tag = 'ROI Dashboard' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '11px 16px', background: 'var(--navy)',
      borderRadius: 10, borderBottom: '3px solid var(--gold)', marginBottom: 14,
    }}>
      <img src={`${import.meta.env.BASE_URL}anglepoint-logo.png`} alt="Anglepoint" style={{ height: 26 }} />
      <span style={{ color: '#fff', fontWeight: 800, fontSize: 14, letterSpacing: 1 }}>ANGLEPOINT</span>
      <span style={{ marginLeft: 'auto', color: 'var(--gold)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>{tag}</span>
    </div>
  );
}

// ─── Storytelling visuals ─────────────────────────────────────────────────────
// Pure-render: all math is precomputed in dashboardData.js so the same numbers
// can be mirrored into the HTML export (see buildDashboardHtml).

// Identified → Accomplished → Realized funnel. Bar widths are relative to the
// first (largest) stage; realization-rate chips sit between stages.
function JourneyFunnel({ stages, rates }) {
  const top = Math.max(...stages.map(s => s.value), 1);
  const stepRates = [null, rates.accToId, rates.realToAcc]; // rate from the prior stage
  return (
    <div className="card">
      <div className="card-title"><i className="ti ti-filter" aria-hidden="true" /> ROI Journey</div>
      {stages.map((s, i) => (
        <div key={s.key}>
          {i > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0 8px', paddingLeft: 150, fontSize: 12, fontWeight: 700, color: 'var(--blue)' }}>
              <i className="ti ti-arrow-down" aria-hidden="true" style={{ fontSize: 13 }} />
              {formatPct(stepRates[i])} of {stages[i - 1].label.toLowerCase()}
            </div>
          )}
          <div className="bar-row">
            <span className="bar-label">{s.label}</span>
            <div className="bar-bg">
              <div className="bar-fill" style={{ width: `${Math.round((Math.max(0, s.value) / top) * 100)}%`, background: STAGE_COLORS[i] }} />
            </div>
            <span className="bar-val">{formatCurrency(s.value)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Year-over-year trend as a static inline-SVG area+line (same coordinate math as
// the HTML export). `series` is yearDeltas() output, chronological.
function TrendChart({ series, metricLabel }) {
  const W = 600, H = 180, P = 28;
  const innerW = W - 2 * P, innerH = H - 2 * P - 18;
  const n = series.length;
  const max = series.reduce((m, p) => Math.max(m, p.value), 0) || 1;
  const pts = series.map((p, i) => ({
    ...p,
    x: P + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2),
    y: P + innerH - (max > 0 ? (p.value / max) * innerH : 0),
  }));
  const line = pts.map(p => `${p.x},${p.y}`).join(' ');
  const baseY = P + innerH;
  const area = `${pts[0].x},${baseY} ${line} ${pts[n - 1].x},${baseY}`;
  const deltaColor = d => (d === 'up' ? '#1a7f4b' : d === 'down' ? '#c0392b' : 'var(--text-muted)');
  return (
    <div className="card">
      <div className="card-title"><i className="ti ti-chart-line" aria-hidden="true" /> {metricLabel} Trend</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${metricLabel} by year`} style={{ display: 'block' }}>
        <polygon points={area} fill="rgba(0,95,134,0.12)" />
        <polyline points={line} fill="none" stroke="var(--blue)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map(p => (
          <g key={p.year}>
            <circle cx={p.x} cy={p.y} r="3.5" fill="var(--navy)" />
            <text x={p.x} y={H - 14} textAnchor="middle" fontSize="12" fill="var(--text-muted)">{p.year}</text>
            {p.deltaPct != null && (
              <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill={deltaColor(p.deltaDir)}>
                {p.deltaDir === 'down' ? '▼' : '▲'} {Math.abs(p.deltaPct)}%
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

// Bullet icon + accent color per summary list field (mirrors the executive-
// summary report palette). Used by both the selector and the rendered card.
const SUMMARY_FIELD_STYLE = {
  overview:            { icon: 'ti-file-text',      color: 'var(--blue)' },
  key_accomplishments: { icon: 'ti-circle-check',   color: '#2d9e5c' },
  recommendations:     { icon: 'ti-bulb',           color: 'var(--gold)' },
  primary_risks:       { icon: 'ti-alert-triangle', color: '#c0392b' },
  market_risks:        { icon: 'ti-bolt',           color: '#e67e22' },
  additional_insights: { icon: 'ti-eye',            color: '#4a6a9c' },
  next_steps:          { icon: 'ti-arrow-right',    color: '#0089af' },
  key_metrics:         { icon: 'ti-chart-bar',      color: 'var(--blue)' },
  highlights:          { icon: 'ti-star',           color: 'var(--gold)' },
};

// A selected element that resolves to no data under the current filters. Shown
// in the preview (so the user sees it IS selected) but omitted from the export.
function PlaceholderCard({ label }) {
  return (
    <div className="card" style={{ borderStyle: 'dashed', color: 'var(--text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
      <i className="ti ti-eye-off" aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
      {label} — no data for the current filters
    </div>
  );
}

// One executive-summary field rendered per its type, drawn from the most recent
// matched engagement's summary. `variant` is 'short' | 'long' for text/list.
function SummaryCard({ field, variant, recent }) {
  const def   = SUMMARY_ELEMENTS.find(e => e.field === field);
  const style = SUMMARY_FIELD_STYLE[field] || { icon: 'ti-point', color: 'var(--blue)' };
  const [expanded, setExpanded] = useState(false);

  const shortContent = summaryFieldContent(recent?.summary, field, 'short');
  const longContent  = summaryFieldContent(recent?.summary, field, 'long');
  const base = variant === 'long' ? longContent : shortContent;
  if (!base) return <PlaceholderCard label={def?.label || field} />;

  // A short text/list field with extra content hidden gets a See more toggle
  // that swaps in the full long version inline.
  const canExpand = variant === 'short' && def?.variantable && longContent && (
    longContent.text  ? longContent.text !== shortContent.text
    : longContent.items ? longContent.items.length > shortContent.items.length
    : false
  );
  const content = (canExpand && expanded) ? longContent : base;

  const renderContent = () => {
    if (content.text) {
      return <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text)', margin: 0 }}>{content.text}</p>;
    }
    if (content.items) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {content.items.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, lineHeight: 1.5 }}>
              <i className={`ti ${style.icon}`} aria-hidden="true" style={{ color: style.color, fontSize: 15, marginTop: 1, flexShrink: 0 }} />
              <span style={{ color: 'var(--text)' }}>{it}</span>
            </div>
          ))}
        </div>
      );
    }
    // key_metrics / highlights → label/value cards
    const cards = content.metrics || content.highlights;
    return (
      <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 0 }}>
        {cards.map((c, i) => (
          <div className="metric-card" key={i}>
            <div className="metric-label">{c.label}</div>
            <div className="metric-value" style={{ fontSize: 20 }}>{c.value || '—'}</div>
            {c.context && <div className="metric-delta muted">{c.context}</div>}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 12 }}>
        <i className={`ti ${style.icon}`} aria-hidden="true" style={{ color: style.color }} /> {def.label}
        {recent?.source && (
          <span style={{ fontWeight: 500, fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
            {recent.count > 1 ? 'most recent · ' : ''}{recent.source}
          </span>
        )}
      </div>
      {renderContent()}
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded(x => !x)}
          style={{
            marginTop: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12.5, fontWeight: 700, color: 'var(--blue)', fontFamily: 'inherit',
          }}
        >
          {expanded ? 'See less' : 'See more'}
          <i className={`ti ti-chevron-${expanded ? 'up' : 'down'}`} aria-hidden="true" style={{ fontSize: 14 }} />
        </button>
      )}
    </div>
  );
}

// The publisher/year comparison bar card — extracted so the ordered preview can
// place it among the other elements.
function BarCard({ barsPct, maxVal, primaryMetric, groupField }) {
  return (
    <div className="card">
      <div className="card-title">
        <i className="ti ti-chart-bar" aria-hidden="true" /> {labelFor(primaryMetric)} by {groupField === 'year' ? 'Year' : 'Publisher'}
      </div>
      {barsPct.slice(0, MAX_BARS).map((d, i) => (
        <div className="bar-row" key={d.label}>
          <span className="bar-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {d.label}
            {d.isTop && (
              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--navy)', background: 'var(--gold)', borderRadius: 6, padding: '1px 7px' }}>Top</span>
            )}
          </span>
          <div className="bar-bg">
            <div className="bar-fill" style={{ width: `${Math.round((d.value / maxVal) * 100)}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
          </div>
          <span className="bar-val">{formatCurrency(d.value)} · {Math.round(d.pct)}%</span>
        </div>
      ))}
      {barsPct.length > MAX_BARS && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          + {barsPct.length - MAX_BARS} more
        </div>
      )}
    </div>
  );
}

// ─── Element picker ───────────────────────────────────────────────────────────
// Builds the ordered `selElements` list: an "Add" palette grouped by category,
// plus the selected list with drag-to-reorder / remove / short-long controls.
// Selection order is preserved; drag a row to move the summary to the top,
// between charts, etc.
function ElementsField({ selElements, setSelElements, isAvailable }) {
  const selectedIds = new Set(selElements.map(e => e.id));
  // Native HTML5 drag-and-drop reorder. dragIndex = the row being dragged;
  // overIndex = the row it's hovering, used to draw the drop indicator.
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  const add = (id) => setSelElements(prev =>
    prev.some(e => e.id === id) ? prev : [...prev, { id, variant: isVariantable(id) ? 'short' : undefined }]);
  const remove = (idx) => setSelElements(prev => prev.filter((_, i) => i !== idx));
  const setVariant = (idx, variant) => setSelElements(prev => prev.map((e, i) => i === idx ? { ...e, variant } : e));
  const moveTo = (from, to) => setSelElements(prev => {
    if (from == null || to == null || from === to || to < 0 || to >= prev.length) return prev;
    const a = [...prev];
    const [x] = a.splice(from, 1);
    a.splice(to, 0, x);
    return a;
  });

  const endDrag = () => { setDragIndex(null); setOverIndex(null); };
  const handleDrop = (toIdx) => { moveTo(dragIndex, toIdx); endDrag(); };

  const GROUPS = [
    { title: 'Metrics',           icon: 'ti-coin',        items: NUMERIC_ELEMENTS },
    { title: 'Executive Summary', icon: 'ti-file-text',   items: SUMMARY_ELEMENTS },
    { title: 'Charts',            icon: 'ti-chart-dots',  items: CHART_ELEMENTS  },
  ];

  return (
    <div className="field-group" style={{ marginBottom: 0 }}>
      <label className="field-label">Dashboard elements</label>

      {/* Selected, ordered */}
      {selElements.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>
          Nothing selected yet — add elements below. They appear on the dashboard in the order you add them.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {selElements.map((e, idx) => {
            const cat   = elementById(e.id);
            const avail = isAvailable(e.id);
            const isDragging = dragIndex === idx;
            const isOver     = overIndex === idx && dragIndex !== null && dragIndex !== idx;
            return (
              <div
                key={e.id}
                draggable
                onDragStart={(ev) => { setDragIndex(idx); ev.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; if (overIndex !== idx) setOverIndex(idx); }}
                onDrop={(ev) => { ev.preventDefault(); handleDrop(idx); }}
                onDragEnd={endDrag}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  border: `1.5px solid ${isOver ? 'var(--blue)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  padding: '7px 10px',
                  background: isOver ? 'var(--blue-pale)' : 'var(--surface)',
                  // Drop indicator painted as an inset shadow so the row never
                  // changes size — keeps the gap between rows uniform.
                  boxShadow: isOver
                    ? (dragIndex > idx ? 'inset 0 3px 0 var(--blue)' : 'inset 0 -3px 0 var(--blue)')
                    : 'none',
                  opacity: isDragging ? 0.4 : avail ? 1 : 0.6,
                  cursor: 'grab',
                  transition: 'border-color 0.12s, background 0.12s',
                }}
              >
                <i className="ti ti-grip-vertical" aria-hidden="true"
                   style={{ color: 'var(--text-faint)', fontSize: 16, flexShrink: 0, cursor: 'grab' }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                  {cat?.label || e.id}
                  {!avail && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-faint)', marginLeft: 6 }}>(no data)</span>}
                </span>
                {isVariantable(e.id) && (
                  <div className="toggle-group" style={{ flexShrink: 0 }}>
                    {['short', 'long'].map(v => (
                      <button key={v} type="button" className={`toggle-opt ${e.variant === v ? 'on' : ''}`}
                              style={{ padding: '3px 10px', fontSize: 11, textTransform: 'capitalize' }}
                              onClick={() => setVariant(idx, v)}>
                        {v}
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" className="btn ghost small" style={{ padding: '0 4px' }}
                        onClick={() => remove(idx)} aria-label="Remove">
                  <i className="ti ti-x" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add palette */}
      {GROUPS.map(group => (
        <div key={group.title} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className={`ti ${group.icon}`} aria-hidden="true" /> {group.title}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {group.items.map(item => {
              const added = selectedIds.has(item.id);
              const avail = isAvailable(item.id);
              const disabled = added || !avail;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => add(item.id)}
                  title={!avail ? 'No data for this element under the current filters' : added ? 'Already added' : 'Add to dashboard'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    border: `1.5px solid ${added ? 'var(--blue)' : 'var(--border)'}`,
                    background: added ? 'var(--blue-pale)' : 'var(--surface)',
                    color: disabled ? 'var(--text-faint)' : 'var(--navy)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  <i className={`ti ti-${added ? 'check' : 'plus'}`} style={{ fontSize: 13 }} aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <InfoNote>
        The first <strong>Metric</strong> you add drives the comparison bar and trend charts. Drag the <i className="ti ti-grip-vertical" aria-hidden="true" /> handle to reorder — elements render top-to-bottom in this order.
      </InfoNote>
    </div>
  );
}

// ─── Default builder selections for a given template ──────────────────────────
function defaultsFor(templateId, options) {
  const { clients, publishers, years } = options;
  const base = {
    name:       '',
    client:     clients[0] || '',
    pubMode:    'All publishers',
    selPubs:    [...publishers],
    yrMode:     'All years',
    selYears:   [...years],
    // Default to the classic layout: one metric card driving the charts. Users
    // add summary fields and reorder from here.
    selElements: [
      { id: 'metric:realized_savings' },
      { id: 'chart:journey' },
      { id: 'chart:bar' },
      { id: 'chart:trend' },
    ],
  };
  switch (templateId) {
    case 'client-all-pub': // one client, one year, all publishers
      return { ...base, yrMode: 'Select specific', selYears: years.slice(0, 1) };
    case 'pub-all-years':  // one client, one publisher, all years
      return { ...base, pubMode: 'Select specific', selPubs: publishers.slice(0, 1) };
    case 'full':           // one client, everything
      return base;
    case 'custom':
    default:
      return base;
  }
}

// Which field the preview chart groups by, per template.
function groupFieldFor(templateId, cfg) {
  if (templateId === 'client-all-pub') return 'publisher';
  if (templateId === 'pub-all-years')  return 'year';
  if (templateId === 'full')           return 'year';
  // custom: group by whichever dimension varies most
  return (cfg.pubMode === 'Select specific' && cfg.selPubs.length <= 1) ? 'year' : 'publisher';
}

// ─── Dashboard builder ────────────────────────────────────────────────────────
export function DashboardBuilder({ templateId, options, records, initial, onClose, onSave, onExport, lockedClient, defaultClient, embedded = false }) {
  const seed = useMemo(
    () => initial || defaultsFor(templateId, options),
    [templateId, options, initial],
  );

  // Config panel is hidden by default when re-opening a saved dashboard.
  const [isEditing, setIsEditing]   = useState(!initial || Boolean(initial?.seed));
  const [name, setName]             = useState(seed.name || '');
  const [client, setClient]         = useState(lockedClient || (initial?.client) || defaultClient || seed.client || '');
  const [pubMode, setPubMode]       = useState(seed.pubMode || 'All publishers');
  const [yrMode, setYrMode]         = useState(seed.yrMode || 'All years');
  const [selPubs, setSelPubs]       = useState(seed.selPubs || [...options.publishers]);
  const [selYears, setSelYears]     = useState(seed.selYears || [...options.years]);
  // Ordered element list — migrates older configs that only carried selMetrics.
  const [selElements, setSelElements] = useState(
    () => normalizeElements(seed) || [{ id: 'metric:realized_savings' }],
  );
  const [saved, setSaved]           = useState(false);

  // Any edit invalidates the "Saved" confirmation.
  useEffect(() => { setSaved(false); }, [name, client, pubMode, yrMode, selPubs, selYears, selElements]);

  const toggleItem = (arr, setArr, item) =>
    setArr(arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]);

  const template = TEMPLATES.find(t => t.id === templateId) || {};
  const needsYear = templateId === 'client-all-pub';
  const needsPub  = templateId === 'pub-all-years';

  const filterArgs = {
    client: client || null,
    publishers: pubMode === 'Select specific' ? selPubs : null,
    years:      yrMode  === 'Select specific' ? selYears : null,
  };
  const matched = useMemo(() => matchFilters(records, filterArgs),
    [records, client, pubMode, yrMode, selPubs, selYears]);

  // A metric is available only if some matched record actually carries a value for it.
  const metricAvailable = useMemo(() => {
    const m = {};
    METRICS.forEach(({ key }) => { m[key] = countWithMetric(matched, key) > 0; });
    return m;
  }, [matched]);

  // The first selected numeric metric drives the bar/trend charts (falling back
  // to the first metric that has data, then realized_savings).
  const primaryMetric = useMemo(() => {
    const firstMetric = selElements.map(e => parseElementId(e.id)).find(p => p.kind === 'metric')?.key;
    return firstMetric
      || METRICS.find(m => metricAvailable[m.key])?.key
      || 'realized_savings';
  }, [selElements, metricAvailable]);

  const groupField    = groupFieldFor(templateId, { pubMode, selPubs });
  const chartData     = useMemo(() => groupSum(matched, groupField, primaryMetric),
    [matched, groupField, primaryMetric]);
  const maxVal        = chartData.reduce((m, d) => Math.max(m, d.value), 0);

  // Storytelling aggregations (shared with the HTML export).
  const stages  = useMemo(() => journeyStages(matched), [matched]);
  const rates   = useMemo(() => realizationRate(stages), [stages]);
  const trend   = useMemo(() => yearDeltas(yearSeries(matched, primaryMetric)), [matched, primaryMetric]);
  const barsPct = useMemo(() => withPercent(chartData), [chartData]);
  const recent  = useMemo(() => mostRecentSummary(matched), [matched]);

  // Per-element availability for the picker (disable add) and preview (placeholder).
  const chartAvailable = {
    journey: stages[0].value > 0,
    bar:     maxVal > 0 && barsPct.length > 1,
    trend:   trend.length >= 2 && trend.some(p => p.value > 0),
  };
  const isElementAvailable = (id) => {
    const { kind, key } = parseElementId(id);
    if (kind === 'metric')  return Boolean(metricAvailable[key]);
    if (kind === 'summary') return Boolean(summaryFieldContent(recent?.summary, key, 'long'));
    if (kind === 'chart')   return Boolean(chartAvailable[key]);
    return false;
  };

  const pubScope = pubMode === 'All publishers'
    ? 'All publishers'
    : `${selPubs.length} publisher${selPubs.length === 1 ? '' : 's'}`;
  const yrScope = yrMode === 'All years'
    ? 'All years'
    : selYears.length === 1 ? String(selYears[0]) : `${selYears.length} years`;

  const canSave = Boolean(client) && selElements.length > 0
    && (!needsYear || selYears.length > 0)
    && (!needsPub  || selPubs.length  > 0);

  const buildConfig = () => ({
    id: initial?.id && !initial?.seed ? initial.id : `dash-${client}-${templateId}-${selElements.map(e => e.id).join('+')}-${matched.length}`,
    name: name.trim() || `${client || 'Untitled'} — ${TITLES[templateId]}`,
    templateId, client, pubMode, yrMode, selPubs, selYears, selElements,
    sub: `${TITLES[templateId]} · ${matched.length} record${matched.length === 1 ? '' : 's'}`,
    badge: labelFor(primaryMetric),
    badgeColor: templateId === 'custom' ? 'gold' : 'blue',
  });

  const handleSave = () => { onSave(buildConfig()); setSaved(true); };

  return (
    <div>
      {/* Header: back · title · save */}
      <div style={{ display: embedded ? 'none' : 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn ghost small" onClick={onClose}><i className="ti ti-arrow-left" aria-hidden="true" /> All dashboards</button>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>{TITLES[templateId]}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{template.sub}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn ghost"
            onClick={() => onExport?.(buildConfig())}
            title="Download as HTML"
          >
            <i className="ti ti-download" aria-hidden="true" /> Download HTML
          </button>
          {!isEditing && (
            <>
              <button className="btn ghost" onClick={() => {
                const copy = { ...buildConfig(), id: undefined, name: `Copy of ${name || client}` };
                onSave?.(copy);
                setName(copy.name);
                setIsEditing(true);
              }}>
                <i className="ti ti-copy" aria-hidden="true" /> Duplicate
              </button>
              <button className="btn ghost" onClick={() => setIsEditing(true)}>
                <i className="ti ti-pencil" aria-hidden="true" /> Edit
              </button>
            </>
          )}
          {isEditing && (
            <button className="btn primary" onClick={handleSave} disabled={!canSave}>
              {saved
                ? <>Saved <i className="ti ti-check" aria-hidden="true" /></>
                : <>Save Dashboard <i className="ti ti-device-floppy" aria-hidden="true" /></>}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* ── Left: configuration (hidden until Edit is clicked) ── */}
        {isEditing && <div style={{ flex: '1 1 320px', minWidth: 280, maxWidth: 460 }}>
          <div className="card">
            <div className="card-title"><i className="ti ti-adjustments" aria-hidden="true" /> Configure</div>

            <div className="field-group">
              <label className="field-label">Dashboard name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={`e.g. ${client || 'Client'} ${TITLES[templateId]}`} />
            </div>

            <div className="field-group">
              <label className="field-label">Client</label>
              {lockedClient ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
                  background: 'var(--surface-alt, rgba(0,0,0,0.04))', opacity: 0.85,
                }}>
                  <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text)', fontWeight: 500 }}>{lockedClient}</span>
                  <i className="ti ti-lock" style={{ fontSize: 14, color: 'var(--text-muted)' }} aria-hidden="true" />
                  <span style={{
                    fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)',
                    background: 'var(--border)', borderRadius: 4, padding: '2px 6px',
                  }}>Linked to extraction client</span>
                </div>
              ) : options.clients.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No clients in the data yet.</p>
              ) : (
                <SearchableSelect
                  options={options.clients}
                  value={client}
                  onChange={setClient}
                  placeholder="Search clients…"
                  emptyText="No clients match your search"
                />
              )}
            </div>

            {/* Template-specific filters */}
            {templateId === 'client-all-pub' && (
              <div className="field-group">
                <label className="field-label">Year</label>
                {options.years.length ? (
                  <Chips options={options.years} selected={selYears} single
                         onToggle={y => { setSelYears([y]); setYrMode('Select specific'); }} />
                ) : <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No years in the data yet.</p>}
                <InfoNote>Compares every publisher for this client in the chosen year.</InfoNote>
              </div>
            )}

            {templateId === 'pub-all-years' && (
              <div className="field-group">
                <label className="field-label">Publisher</label>
                {options.publishers.length ? (
                  <Chips options={options.publishers} selected={selPubs} single
                         onToggle={p => { setSelPubs([p]); setPubMode('Select specific'); }} />
                ) : <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No publishers in the data yet.</p>}
                <InfoNote>Trends this publisher across every available year.</InfoNote>
              </div>
            )}

            {templateId === 'full' && (
              <div className="field-group">
                <InfoNote>Includes <strong>all publishers</strong> and <strong>all years</strong> for the selected client.</InfoNote>
              </div>
            )}

            {templateId === 'custom' && (
              <>
                <div className="field-group">
                  <label className="field-label">Publisher</label>
                  <ToggleGroup options={['All publishers', 'Select specific']} value={pubMode} onChange={setPubMode} />
                  {pubMode === 'Select specific' && (
                    options.publishers.length
                      ? <div style={{ marginTop: 10 }}><Chips options={options.publishers} selected={selPubs} onToggle={item => toggleItem(selPubs, setSelPubs, item)} /></div>
                      : <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>No publishers in the data yet.</p>
                  )}
                </div>
                <div className="field-group">
                  <label className="field-label">Year</label>
                  <ToggleGroup options={['All years', 'Select specific']} value={yrMode} onChange={setYrMode} />
                  {yrMode === 'Select specific' && (
                    options.years.length
                      ? <div style={{ marginTop: 10 }}><Chips options={options.years} selected={selYears} onToggle={item => toggleItem(selYears, setSelYears, item)} /></div>
                      : <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>No years in the data yet.</p>
                  )}
                </div>
              </>
            )}

            {/* Elements — ordered metrics + summary fields + charts */}
            <ElementsField
              selElements={selElements}
              setSelElements={setSelElements}
              isAvailable={isElementAvailable}
            />
          </div>
        </div>}

        {/* ── Right: live preview ── */}
        <div style={{ flex: '2 1 420px', minWidth: 300 }}>
          <BrandHeader tag="ROI Dashboard" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}><i className="ti ti-eye" aria-hidden="true" /> Live preview</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Badge color="navy">{client || 'All clients'}</Badge>
              <Badge color="blue">{pubScope}</Badge>
              <Badge color="blue">{yrScope}</Badge>
              <Badge color="gold">{matched.length} record{matched.length === 1 ? '' : 's'}</Badge>
            </div>
          </div>

          {matched.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
              <i className="ti ti-database-off" aria-hidden="true" style={{ fontSize: 24, display: 'block', marginBottom: 10, color: 'var(--text-faint)' }} />
              No records match these filters.<br />Try a different client, publisher, or year.
            </div>
          ) : (
            <>
              {groupElements(selElements).map((block, bi) => {
                // A run of adjacent metric elements → one summary-card grid.
                if (block.type === 'metrics') {
                  return (
                    <div key={bi} className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                      {block.items.map(e => {
                        const key   = parseElementId(e.id).key;
                        const has   = countWithMetric(matched, key);
                        const total = sum(matched, key);
                        return (
                          <div className="metric-card" key={key}>
                            <div className="metric-label">{labelFor(key)}</div>
                            <div className="metric-value">{has ? formatCurrency(total) : '—'}</div>
                            <div className={`metric-delta ${has ? '' : 'muted'}`}>
                              {has ? `across ${has} record${has === 1 ? '' : 's'}` : 'no data for this metric'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                if (block.type === 'summary') {
                  const { key } = parseElementId(block.el.id);
                  return <SummaryCard key={bi} field={key} variant={block.el.variant || 'short'} recent={recent} />;
                }
                if (block.type === 'chart') {
                  const { key } = parseElementId(block.el.id);
                  if (key === 'journey') {
                    return stages[0].value > 0
                      ? <JourneyFunnel key={bi} stages={stages} rates={rates} />
                      : <PlaceholderCard key={bi} label="ROI Journey" />;
                  }
                  if (key === 'bar') {
                    // A single bar tells no story — need 2+ bars carrying data.
                    return (maxVal > 0 && barsPct.length > 1)
                      ? <BarCard key={bi} barsPct={barsPct} maxVal={maxVal} primaryMetric={primaryMetric} groupField={groupField} />
                      : <PlaceholderCard key={bi} label="Comparison Bars" />;
                  }
                  if (key === 'trend') {
                    return (trend.length >= 2 && trend.some(p => p.value > 0))
                      ? <TrendChart key={bi} series={trend} metricLabel={labelFor(primaryMetric)} />
                      : <PlaceholderCard key={bi} label="Year Trend" />;
                  }
                }
                return null;
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Banner shown when the view is scoped to a filtered subset sent from the Tracker.
function ScopeBanner({ count, onClear }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
      padding: '10px 14px', borderRadius: 10,
      background: 'rgba(255,173,0,0.10)', border: '1.5px solid var(--gold)',
    }}>
      <i className="ti ti-filter-cog" style={{ fontSize: 18, color: 'var(--gold)', flexShrink: 0 }} aria-hidden="true" />
      <span style={{ flex: 1, fontSize: 13, color: 'var(--navy)' }}>
        Scoped to a filtered view from the Tracker — <strong>{count} record{count === 1 ? '' : 's'}</strong>.
        Builder filters &amp; charts only see these rows.
      </span>
      <button className="btn ghost small" onClick={onClear} title="Return to all records">
        <i className="ti ti-x" aria-hidden="true" /> Use all records
      </button>
    </div>
  );
}

// ─── Publisher chip bar (shared by Value at a Glance + Lifetime Value) ───────
const PINNED_PUBLISHERS = ['Microsoft', 'IBM', 'Oracle', 'VMware', 'SAP'];

// Props:
//   allPublishers   – publishers that actually have data in the current filter
//   activePubs      – publishers currently included in the view
//   onToggle(pub)   – toggle one individual publisher
//   onToggleOthers  – toggle all "other" (non-pinned, non-added) publishers as a group
//   onSelectAll     – select every publisher
//   extraPubs       – publishers the user pinned via "+"
//   onAddPub(pub)   – add a publisher chip
//   onRemoveExtra(pub) – remove an added publisher chip
//   otherPubs       – publishers in data not in pinned/added set
function PublisherChipBar({ allPublishers, activePubs, onToggle, onToggleOthers, onSelectAll, extraPubs, onAddPub, onRemoveExtra, otherPubs }) {
  const [addOpen,    setAddOpen]    = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
  const [query, setQuery]           = useState('');
  const addRef    = useRef(null);
  const othersRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    if (!addOpen) return;
    function h(e) { if (!addRef.current?.contains(e.target)) { setAddOpen(false); setQuery(''); } }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [addOpen]);

  useEffect(() => {
    if (!othersOpen) return;
    function h(e) { if (!othersRef.current?.contains(e.target)) setOthersOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [othersOpen]);

  const displayedChips = [...PINNED_PUBLISHERS, ...extraPubs];
  // Publishers in data that the user can add via "+"
  const addable = allPublishers.filter(p => !displayedChips.includes(p));
  const filteredAddable = query.trim()
    ? addable.filter(p => p.toLowerCase().includes(query.trim().toLowerCase()))
    : addable;

  const othersOn   = otherPubs.some(p => activePubs.includes(p));
  const othersCount = otherPubs.length;
  const allOn = activePubs.length === allPublishers.length;

  const chipStyle = (on, hasData) => ({
    padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    fontFamily: 'inherit',
    cursor: hasData ? 'pointer' : 'default',
    opacity: hasData ? 1 : 0.28,
    background: on ? '#fff' : 'transparent',
    color: on ? '#001941' : '#aab4c4',
    border: `1px solid ${on ? '#fff' : '#2a4a7e'}`,
    transition: 'all 0.15s',
    display: 'flex', alignItems: 'center', gap: 5,
  });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: '100%', alignItems: 'center' }}>

      {/* Select all */}
      <button
        onClick={onSelectAll}
        disabled={allOn}
        style={{
          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          fontFamily: 'inherit', cursor: allOn ? 'default' : 'pointer',
          background: 'transparent', color: allOn ? '#3a5a7e' : '#7ab0d4',
          border: `1px solid ${allOn ? '#1a3a5e' : '#4a7aae'}`,
          letterSpacing: '0.04em', transition: 'all 0.15s',
        }}
        title="Select all publishers"
      >
        Select all
      </button>

      {/* Pinned chips */}
      {PINNED_PUBLISHERS.map(pub => {
        const hasData = allPublishers.includes(pub);
        const on = hasData && activePubs.includes(pub);
        return (
          <button key={pub} onClick={() => hasData && onToggle(pub)} style={chipStyle(on, hasData)}
            title={hasData ? undefined : 'No data for this publisher in the current filter'}>
            {pub}
          </button>
        );
      })}

      {/* Extra (user-added) chips */}
      {extraPubs.map(pub => {
        const hasData = allPublishers.includes(pub);
        const on = hasData && activePubs.includes(pub);
        return (
          <span key={pub} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <button onClick={() => hasData && onToggle(pub)} style={{ ...chipStyle(on, hasData), borderRadius: '20px 0 0 20px', borderRight: 'none', paddingRight: 6 }}
              title={hasData ? undefined : 'No data for this publisher'}>
              {pub}
            </button>
            <button onClick={() => onRemoveExtra(pub)}
              style={{
                padding: '3px 7px', borderRadius: '0 20px 20px 0', fontSize: 11,
                fontFamily: 'inherit', cursor: 'pointer',
                background: on ? '#fff' : 'transparent',
                color: on ? '#64748b' : '#4a6a8e',
                border: `1px solid ${on ? '#fff' : '#2a4a7e'}`, borderLeft: 'none',
                transition: 'all 0.15s',
              }}
              title={`Remove ${pub} chip`}>
              <i className="ti ti-x" style={{ fontSize: 9 }} />
            </button>
          </span>
        );
      })}

      {/* Others (N) chip — only shown when data has publishers beyond the pinned/added set */}
      {othersCount > 0 && (
        <span ref={othersRef} style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative' }}>
          {/* Main chip: click to toggle all others on/off */}
          <button
            onClick={onToggleOthers}
            style={{ ...chipStyle(othersOn, true), borderRadius: '20px 0 0 20px', borderRight: 'none', paddingRight: 6 }}
            title={othersOn ? 'Deselect all other publishers' : 'Select all other publishers'}
          >
            Others ({othersCount})
          </button>
          {/* Expand button: shows the individual publishers in the others group */}
          <button
            onClick={() => setOthersOpen(o => !o)}
            style={{
              padding: '3px 7px', borderRadius: '0 20px 20px 0', fontSize: 11,
              fontFamily: 'inherit', cursor: 'pointer',
              background: othersOn ? '#fff' : 'transparent',
              color: othersOn ? '#64748b' : '#4a6a8e',
              border: `1px solid ${othersOn ? '#fff' : '#2a4a7e'}`, borderLeft: 'none',
              transition: 'all 0.15s',
            }}
            title="Show publishers in this group"
          >
            <i className={`ti ${othersOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ fontSize: 9 }} />
          </button>

          {othersOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 120,
              background: '#fff', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
              minWidth: 200, overflow: 'hidden',
            }}>
              <div style={{ padding: '7px 12px 5px', fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Other publishers
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto', paddingBottom: 4 }}>
                {otherPubs.map(p => {
                  const on = activePubs.includes(p);
                  return (
                    <button key={p} onClick={() => onToggle(p)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        width: '100%', padding: '7px 12px', border: 'none',
                        background: 'none', cursor: 'pointer', fontSize: 12,
                        textAlign: 'left', fontFamily: 'inherit', color: '#001941',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <span style={{
                        width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                        background: on ? '#005f86' : 'transparent',
                        border: `1.5px solid ${on ? '#005f86' : '#cbd5e1'}`,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {on && <i className="ti ti-check" style={{ fontSize: 8, color: '#fff' }} />}
                      </span>
                      {p}
                    </button>
                  );
                })}
              </div>
              <div style={{ padding: '6px 12px 8px', borderTop: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>Use + to pin a publisher as its own chip</span>
              </div>
            </div>
          )}
        </span>
      )}

      {/* "+" add publisher button */}
      <div ref={addRef} style={{ position: 'relative' }}>
        <button
          onClick={() => { setAddOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 40); }}
          style={{
            padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            fontFamily: 'inherit', cursor: 'pointer',
            background: 'transparent', color: '#aab4c4',
            border: '1px dashed #2a4a7e',
            transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
          title="Pin a publisher as its own chip"
        >
          <i className="ti ti-plus" style={{ fontSize: 11 }} /> Add publisher
        </button>

        {addOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 120,
            background: '#fff', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
            minWidth: 220, overflow: 'hidden',
          }}>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search publishers…"
                style={{
                  width: '100%', border: '1px solid #e2e8f0', borderRadius: 6,
                  padding: '5px 8px', fontSize: 12, outline: 'none',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                }}
                onKeyDown={e => e.key === 'Escape' && (setAddOpen(false), setQuery(''))}
              />
            </div>
            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
              {filteredAddable.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: 12, color: '#94a3b8' }}>
                  {addable.length === 0 ? 'All publishers already shown' : 'No matches'}
                </div>
              ) : filteredAddable.map(p => (
                <button key={p}
                  onClick={() => { onAddPub(p); setQuery(''); setAddOpen(false); }}
                  style={{
                    display: 'block', width: '100%', padding: '8px 12px',
                    border: 'none', background: 'none', cursor: 'pointer',
                    fontSize: 12, textAlign: 'left', fontFamily: 'inherit', color: '#001941',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Value at a Glance banner ────────────────────────────────────────────────
function ValueAtAGlance({ records = [], loginClient = '', selectedClient, onClientChange, fromYear, onFromYearChange, toYear, onToYearChange }) {
  const allYears   = useMemo(() => [...new Set(records.map(r => r.year).filter(Boolean))].sort(), [records]);
  const allClients = useMemo(() => [...new Set(records.map(r => r.client).filter(Boolean))].sort(), [records]);

  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting]   = useState(false);

  const clientFiltered = useMemo(() => {
    if (!selectedClient) return records;
    return records.filter(r => r.client === selectedClient);
  }, [records, selectedClient]);

  const yearFiltered = useMemo(() => clientFiltered.filter(r => {
    const y = r.year;
    if (!y) return true;
    if (fromYear && y < fromYear) return false;
    if (toYear && y > toYear) return false;
    return true;
  }), [clientFiltered, fromYear, toYear]);

  const allPublishers = useMemo(() => [...new Set(yearFiltered.map(r => r.publisher).filter(Boolean))].sort(), [yearFiltered]);
  const [selectedPubs, setSelectedPubs] = useState(null);
  const [extraPubs, setExtraPubs]       = useState([]);
  const [hoveredPubRow, setHoveredPubRow] = useState(null);

  useEffect(() => { setSelectedPubs(null); setExtraPubs([]); }, [selectedClient, fromYear, toYear]);

  const activePubs = selectedPubs ?? allPublishers;

  // Publishers in data that are not pinned or user-added — shown as the "Others" group
  const otherPubs = useMemo(
    () => allPublishers.filter(p => ![...PINNED_PUBLISHERS, ...extraPubs].includes(p)),
    [allPublishers, extraPubs],
  );

  const togglePub = (pub) => {
    if (!selectedPubs) {
      setSelectedPubs(allPublishers.filter(p => p !== pub));
    } else if (selectedPubs.includes(pub)) {
      const next = selectedPubs.filter(p => p !== pub);
      setSelectedPubs(next.length === allPublishers.length ? null : next);
    } else {
      const next = [...selectedPubs, pub];
      setSelectedPubs(next.length === allPublishers.length ? null : next);
    }
  };

  const toggleOthers = () => {
    const anyOtherOn = otherPubs.some(p => activePubs.includes(p));
    if (anyOtherOn) {
      // Deselect all others, keep only pinned + added that are active
      const keep = activePubs.filter(p => !otherPubs.includes(p));
      setSelectedPubs(keep.length === allPublishers.length ? null : keep.length === 0 ? [] : keep);
    } else {
      // Add all others back
      const next = [...new Set([...activePubs, ...otherPubs])];
      setSelectedPubs(next.length === allPublishers.length ? null : next);
    }
  };

  const selectAll = () => setSelectedPubs(null);

  const finalRecords = useMemo(() => yearFiltered.filter(r => {
    if (!r.publisher) return activePubs.length === 0;
    return activePubs.includes(r.publisher);
  }), [yearFiltered, activePubs]);

  // Addon column order: Risk pair → Cost Avoidance pair → Cost Savings pair
  const METRICS = [
    { key: 'identified_risk',    exportKey: 'idRisk',   label: 'Identified Risk',           color: '#e5546a' },
    { key: '_remaining_risk',    exportKey: 'remRisk',  label: 'Remaining Risk',             color: '#e5546a' },
    { key: 'id_cost_avoidance',  exportKey: 'avoidId',  label: 'Cost Avoidance Identified', color: '#ffad00' },
    { key: 'acc_cost_avoidance', exportKey: 'avoidAcc', label: 'Avoidance Accomplished',    color: '#fb790f' },
    { key: '_pot_savings',       exportKey: 'savPot',   label: 'Potential Cost Savings',    color: '#2aadab' },
    { key: 'realized_savings',   exportKey: 'savReal',  label: 'Realized Cost Savings',     color: '#5fd1a7' },
  ];

  const sumMetric = (rows, key) => {
    if (key === '_remaining_risk') {
      const id  = rows.reduce((s, r) => s + (Number(r.identified_risk) || 0), 0);
      const acc = rows.reduce((s, r) => s + (Number(r.acc_cost_avoidance) || 0), 0);
      return Math.max(0, id - acc);
    }
    if (key === '_pot_savings') {
      const a = rows.reduce((s, r) => s + (Number(r.id_cost_optimization) || 0), 0);
      const b = rows.reduce((s, r) => s + (Number(r.id_cost_savings) || 0), 0);
      return a || b;
    }
    return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
  };

  const fmtVal = (v) => {
    if (!v) return '—';
    const av = Math.abs(v);
    if (av >= 1e9) return `$${(v / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
    if (av >= 1e6) return `$${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (av >= 1e3) return `$${Math.round(v / 1e3).toLocaleString()}K`;
    return `$${Math.round(v).toLocaleString()}`;
  };

  const kpis = useMemo(() => METRICS.map(m => ({ ...m, value: sumMetric(finalRecords, m.key) })), [finalRecords]);

  const pubRows = useMemo(() => {
    const displayedChips = [...PINNED_PUBLISHERS, ...extraPubs];
    // Individual rows: pinned + added publishers that have data and are active
    const rows = displayedChips
      .filter(p => allPublishers.includes(p) && activePubs.includes(p))
      .map(pub => {
        const recs = finalRecords.filter(r => r.publisher === pub);
        return { pub, vals: METRICS.map(m => sumMetric(recs, m.key)) };
      });
    // Aggregate "Others" row
    const activeOthers = otherPubs.filter(p => activePubs.includes(p));
    if (activeOthers.length > 0) {
      const othersRecs = finalRecords.filter(r => activeOthers.includes(r.publisher));
      rows.push({ pub: `Others (${activeOthers.length})`, vals: METRICS.map(m => sumMetric(othersRecs, m.key)) });
    }
    return rows;
  }, [finalRecords, extraPubs, allPublishers, activePubs, otherPubs]);

  const totalVals = useMemo(() => METRICS.map(m => sumMetric(finalRecords, m.key)), [finalRecords]);

  if (allYears.length === 0 && allClients.length === 0) return null;

  // ── Period label and export payload ──────────────────────────────────────────
  const periodLabel = fromYear && toYear && String(fromYear) !== String(toYear)
    ? `${fromYear}–${toYear}`
    : fromYear ? String(fromYear) : 'All Years';

  const buildExportPayload = () => {
    const toRow = (vals) => ({
      idRisk:   vals[0] || null,
      remRisk:  vals[1] || null,
      avoidId:  vals[2] || null,
      avoidAcc: vals[3] || null,
      savPot:   vals[4] || null,
      savReal:  vals[5] || null,
    });
    return {
      period: periodLabel,
      client: selectedClient || '',
      rows:   pubRows.map(({ pub, vals }) => ({ pub, ...toRow(vals) })),
      total:  { pub: 'Total', ...toRow(totalVals) },
    };
  };

  const handleExportHtml = async () => {
    setExportOpen(false);
    setExporting(true);
    try { await exportValueAtAGlanceHtml(buildExportPayload()); }
    catch (err) { alert(`Export failed: ${err.message}`); }
    finally { setExporting(false); }
  };

  const handleExportPptx = async () => {
    setExportOpen(false);
    setExporting(true);
    try { await exportValueAtAGlancePptx(buildExportPayload()); }
    catch (err) { alert(`Export failed: ${err.message}`); }
    finally { setExporting(false); }
  };

  const selStyle = { background: '#0a2a5e', color: '#fff', border: '1px solid #2a4a7e', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontFamily: 'inherit' };

  return (
    <div style={{ borderRadius: '0 0 12px 12px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.10)' }}>
      {/* Header bar */}
      <div style={{ background: '#001941', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>

        {/* Client selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ color: '#aab4c4' }}>Client</span>
          <select value={selectedClient} onChange={e => onClientChange(e.target.value)} style={selStyle}>
            <option value="">All Clients</option>
            {allClients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Year range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ color: '#aab4c4' }}>From</span>
          <select value={fromYear ?? ''} onChange={e => onFromYearChange(e.target.value || null)} style={selStyle}>
            {allYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span style={{ color: '#aab4c4' }}>To</span>
          <select value={toYear ?? ''} onChange={e => onToYearChange(e.target.value || null)} style={selStyle}>
            {allYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Export dropdown */}
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <button
            onClick={() => setExportOpen(o => !o)}
            disabled={exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              fontFamily: 'inherit', cursor: exporting ? 'default' : 'pointer',
              background: 'rgba(255,255,255,0.12)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)',
            }}
          >
            {exporting
              ? <><i className="ti ti-loader-2 spinning" /> Exporting…</>
              : <><i className="ti ti-download" /> Export</>
            }
          </button>
          {exportOpen && (
            <div
              style={{ position: 'absolute', right: 0, top: '110%', zIndex: 50, background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', minWidth: 180, overflow: 'hidden' }}
              onMouseLeave={() => setExportOpen(false)}
            >
              {[
                { icon: 'ti-file-code',    label: 'Export as HTML',       action: handleExportHtml },
                { icon: 'ti-presentation', label: 'Export as PowerPoint',  action: handleExportPptx },
              ].map(item => (
                <button
                  key={item.label}
                  onClick={item.action}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#001941', fontFamily: 'inherit', fontWeight: 500, textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <i className={`ti ${item.icon}`} style={{ fontSize: 15, color: '#005f86' }} />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Publisher toggles */}
        <PublisherChipBar
          allPublishers={allPublishers}
          activePubs={activePubs}
          onToggle={togglePub}
          onToggleOthers={toggleOthers}
          onSelectAll={selectAll}
          extraPubs={extraPubs}
          onAddPub={p => setExtraPubs(prev => [...prev, p])}
          onRemoveExtra={p => setExtraPubs(prev => prev.filter(x => x !== p))}
          otherPubs={otherPubs}
        />
      </div>

      {/* KPI boxes */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${kpis.length},1fr)`, background: '#001941', gap: 8, padding: '10px 12px 12px' }}>
        {kpis.map(kpi => (
          <div key={kpi.key} style={{ background: '#fff', borderTop: `5px solid ${kpi.color}`, borderRadius: 6, padding: '14px 12px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.22)' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#001941', lineHeight: 1.1 }}>{fmtVal(kpi.value)}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, lineHeight: 1.35 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Publisher table */}
      {pubRows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#001941', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 16px', textAlign: 'left', color: '#fff', fontWeight: 700, borderBottom: '1px solid #0a2a5e', background: '#0a1f4e' }}>Publisher</th>
              {METRICS.map(m => (
                <th key={m.key} style={{ padding: '10px 12px', textAlign: 'right', color: m.color, fontWeight: 700, borderBottom: '1px solid #0a2a5e', background: '#0a1f4e', fontSize: 12 }}>{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pubRows.map(({ pub, vals }, ri) => {
              const isHovered = hoveredPubRow === ri;
              const baseBg = ri % 2 === 0 ? '#001941' : '#00204e';
              return (
                <tr key={pub} onMouseEnter={() => setHoveredPubRow(ri)} onMouseLeave={() => setHoveredPubRow(null)} style={{ background: isHovered ? '#0a2a5e' : baseBg, transition: 'background 0.12s', cursor: 'default' }}>
                  <td style={{ padding: '9px 16px', color: '#fff', fontWeight: 600 }}>{pub}</td>
                  {vals.map((v, ci) => (
                    <td key={ci} style={{ padding: '9px 12px', textAlign: 'right', color: METRICS[ci].color, fontWeight: 500 }}>{fmtVal(v)}</td>
                  ))}
                </tr>
              );
            })}
            <tr style={{ background: '#001030', borderTop: '2px solid #1a3a6e' }}>
              <td style={{ padding: '11px 16px', color: '#fff', fontWeight: 800, letterSpacing: '0.04em', fontSize: 13 }}>TOTAL</td>
              {totalVals.map((v, ci) => (
                <td key={ci} style={{ padding: '11px 12px', textAlign: 'right', color: METRICS[ci].color, fontWeight: 800, fontSize: 13 }}>{fmtVal(v)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
// ─── Custom Dashboard Builder ─────────────────────────────────────────────────
const CUSTOM_FIELD_LABELS = [
  'Identified Risk',
  'Identified Cost Avoidance',
  'Accomplished Cost Avoidance',
  'Identified Cost Optimization',
  'Accomplished Cost Optimization',
  'Identified Cost Savings',
  'Realized Cost Savings',
];

const FLAT_FIELD_MAP = {
  'Identified Risk':               r => Number(r.identified_risk) || 0,
  'Identified Cost Avoidance':     r => Number(r.id_cost_avoidance) || 0,
  'Accomplished Cost Avoidance':   r => Number(r.acc_cost_avoidance) || 0,
  'Identified Cost Optimization':  r => Number(r.id_cost_optimization) || 0,
  'Accomplished Cost Optimization':r => Number(r.acc_cost_optimization) || 0,
  'Identified Cost Savings':       r => Number(r.id_cost_savings) || 0,
  'Realized Cost Savings':         r => Number(r.realized_savings) || 0,
};

function aggregateFields(records, filterArgs) {
  const matched = matchFilters(records, filterArgs);
  const totals = {};
  CUSTOM_FIELD_LABELS.forEach(lbl => { totals[lbl] = 0; });
  matched.forEach(r => {
    CUSTOM_FIELD_LABELS.forEach(lbl => {
      if (FLAT_FIELD_MAP[lbl]) totals[lbl] += FLAT_FIELD_MAP[lbl](r);
    });
    // Also handle extraction-generated records that store data in finalFields
    (r.finalFields || []).forEach(({ label, value }) => {
      if (label in totals) {
        totals[label] += parseFloat(String(value || '').replace(/[$,]/g, '')) || 0;
      }
    });
  });
  return CUSTOM_FIELD_LABELS
    .filter(lbl => totals[lbl] > 0)
    .map(lbl => ({ label: lbl, value: totals[lbl] }));
}

const SECTION_DEFS = [
  { key: 'vag',       label: 'Value at a Glance',    icon: 'ti-eye' },
  { key: 'kpis',      label: 'KPI Tiles',             icon: 'ti-layout-grid' },
  { key: 'summary',   label: '01 — Executive Summary',icon: 'ti-file-text' },
  { key: 'breakdown', label: '02 — Value Analysis',   icon: 'ti-chart-bar' },
  { key: 'journey',   label: '03 — ROI Journey',      icon: 'ti-trending-up' },
  { key: 'ledger',    label: '04 — Value Ledger',     icon: 'ti-table' },
];

function CustomDashBuilder({ records, allRecords = [], options, loginClient, onClose, onSave, loggedInUser = '' }) {
  const clientList = options.clients || [];
  const [client, setClient]       = useState(loginClient || clientList[0] || '');
  const [pubMode, setPubMode]     = useState('All publishers');
  const [selPubs, setSelPubs]     = useState([]);
  const [yrMode, setYrMode]       = useState('All years');
  const [selYears, setSelYears]   = useState([]);
  const [name, setName]           = useState('');
  const [sumOv,  setSumOv]        = useState('');
  const [sumAcc, setSumAcc]       = useState('');
  const [sumRec, setSumRec]       = useState('');
  // Which sections are hidden (keyed by SECTION_DEFS key)
  const [hiddenSecs, setHiddenSecs] = useState({});
  const toggleSec = (k) => setHiddenSecs(p => ({ ...p, [k]: !p[k] }));
  // AI chatbox
  const [chatOpen, setChatOpen]     = useState(false);
  const [chatInput, setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError]   = useState(null);
  const [chatHistory, setChatHistory] = useState([]); // [{role:'user'|'ai', text}]
  const toLines = s => s.split('\n').map(x => x.trim()).filter(Boolean);

  const filterArgs = useMemo(() => ({
    client: client || null,
    publishers: pubMode === 'Select specific' ? selPubs : null,
    years:      yrMode  === 'Select specific' ? selYears : null,
  }), [client, pubMode, selPubs, yrMode, selYears]);

  // Always aggregate from allRecords so a scoped view (from Tracker) doesn't limit the custom builder
  const previewFields = useMemo(() => aggregateFields(allRecords, filterArgs), [allRecords, filterArgs]);

  const autoName = [
    client,
    pubMode === 'All publishers' ? 'All Publishers' : selPubs.join(', '),
    yrMode  === 'All years'      ? 'All Years'       : selYears.join(', '),
  ].filter(Boolean).join(' — ');

  // Auto-generate summary + charts from current fields + user text
  const builtSummary = useMemo(() => {
    const hasText = sumOv || sumAcc || sumRec;
    const barData = previewFields.filter(f => f.value > 0).map(f => ({ name: f.label.replace('Identified ', 'Id. ').replace('Accomplished ', 'Acc. ').replace('Cost ', '').replace(' Savings', ' Sav.'), value: f.value }));
    const getVal = lbl => previewFields.find(f => f.label === lbl)?.value || 0;
    const totalId  = getVal('Identified Cost Avoidance') + getVal('Identified Cost Optimization') + getVal('Identified Cost Savings') || getVal('Identified Risk');
    const totalAcc = getVal('Accomplished Cost Avoidance') + getVal('Accomplished Cost Optimization');
    const charts = barData.length > 0 ? {
      roi_breakdown: barData,
      accomplishment_rate: totalId > 0 ? { accomplished: totalAcc, remaining: Math.max(0, totalId - totalAcc) } : {},
    } : null;
    if (!hasText && !charts) return null;
    return {
      overview: sumOv,
      key_accomplishments: toLines(sumAcc),
      recommendations: toLines(sumRec),
      primary_risks: [],
      next_steps: [],
      charts,
    };
  }, [previewFields, sumOv, sumAcc, sumRec]);

  const previewDash = useMemo(() => ({
    id: `custom-preview`,
    type: 'custom',
    name: name.trim() || autoName,
    client,
    publisher: pubMode === 'Select specific' && selPubs.length === 1 ? selPubs[0] : null,
    year: yrMode === 'Select specific' && selYears.length === 1 ? selYears[0] : null,
    fields: previewFields,
    summary: builtSummary,
    savedAt: new Date().toISOString(),
    includeValueAtAGlance: !hiddenSecs.vag,
    initialHidden: {
      kpis:      hiddenSecs.kpis      || false,
      summary:   hiddenSecs.summary   || false,
      breakdown: hiddenSecs.breakdown || false,
      journey:   hiddenSecs.journey   || false,
      ledger:    hiddenSecs.ledger    || false,
    },
  }), [name, autoName, client, pubMode, selPubs, yrMode, selYears, previewFields, hiddenSecs, builtSummary]);

  // Use allRecords for full publisher/year lists (not scoped)
  const pubList = useMemo(() => {
    const base = allRecords.length ? allRecords : records;
    const matched = client ? base.filter(r => (r.client || '') === client) : base;
    return [...new Set(matched.map(r => r.publisher).filter(Boolean))].sort();
  }, [allRecords, records, client]);

  const yearList = useMemo(() => {
    const base = allRecords.length ? allRecords : records;
    const matched = base.filter(r => {
      if (client && (r.client || '') !== client) return false;
      if (pubMode === 'Select specific' && selPubs.length && !selPubs.includes(r.publisher)) return false;
      return true;
    });
    return [...new Set(matched.map(r => String(r.year || '')).filter(Boolean))].sort();
  }, [allRecords, records, client, pubMode, selPubs]);

  const togglePub  = (p) => setSelPubs(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  const toggleYear = (y) => setSelYears(prev => prev.includes(y) ? prev.filter(x => x !== y) : [...prev, y]);

  const canBuild = Boolean(client);

  const handleBuild = () => {
    if (!canBuild) return;
    const dash = {
      id: `custom-${Date.now()}`,
      type: 'custom',
      name: name.trim() || autoName,
      client,
      publisher: pubMode === 'Select specific' && selPubs.length === 1 ? selPubs[0] : null,
      year: yrMode === 'Select specific' && selYears.length === 1 ? selYears[0] : null,
      pubMode, selPubs, yrMode, selYears,
      includeValueAtAGlance: !hiddenSecs.vag,
      initialHidden: {
        kpis:      hiddenSecs.kpis      || false,
        summary:   hiddenSecs.summary   || false,
        breakdown: hiddenSecs.breakdown || false,
        journey:   hiddenSecs.journey   || false,
        ledger:    hiddenSecs.ledger    || false,
      },
      fields: previewFields,
      summary: builtSummary,
      createdBy: loggedInUser,
      savedAt: new Date().toISOString(),
    };
    onSave(dash);
    onClose();
  };

  const panelStyle   = { flex: '0 0 300px', minWidth: 250, maxWidth: 340 };
  const previewStyle = { flex: 1, minWidth: 0 };
  const tagBtnStyle  = (on) => ({
    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1.5px solid',
    borderColor: on ? 'var(--blue)' : 'var(--border)',
    background: on ? 'var(--blue)' : 'transparent',
    color: on ? '#fff' : 'var(--text-muted)',
  });

  const handleChatSubmit = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput('');
    setChatError(null);
    setChatHistory(h => [...h, { role: 'user', text }]);
    setChatLoading(true);
    try {
      const currentSummary = {
        overview: sumOv,
        key_accomplishments: toLines(sumAcc),
        recommendations: toLines(sumRec),
        primary_risks: [],
        next_steps: [],
      };
      const updated = await augmentExecutiveSummary({
        existing_summary: currentSummary,
        additional_text: text,
        client,
        publisher: pubMode === 'Select specific' && selPubs.length === 1 ? selPubs[0] : '',
      });
      // Apply AI response back to the summary text fields
      if (updated.overview)              setSumOv(updated.overview);
      if (updated.key_accomplishments)   setSumAcc((updated.key_accomplishments || []).join('\n'));
      if (updated.recommendations)       setSumRec((updated.recommendations || []).join('\n'));
      setChatHistory(h => [...h, { role: 'ai', text: 'Done! The executive summary has been updated. Check the live preview.' }]);
    } catch {
      setChatError('Could not process the request. Please try again.');
      setChatHistory(h => [...h, { role: 'ai', text: 'Sorry, something went wrong. Please try again.', error: true }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button className="btn ghost small" onClick={onClose}><i className="ti ti-arrow-left" /> All dashboards</button>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)', flex: 1 }}>New Custom Dashboard</div>
      </div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* ── Left panel ── */}
        <div style={panelStyle}>
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-title"><i className="ti ti-sliders" aria-hidden="true" /> Configure</div>

            <div className="field-group">
              <label className="field-label">Client</label>
              <SearchableSelect options={clientList} value={client} onChange={v => { setClient(v); setSelPubs([]); setSelYears([]); }} placeholder="Search clients…" emptyText="No clients" />
            </div>

            <div className="field-group">
              <label className="field-label">Publishers</label>
              <ToggleGroup options={['All publishers', 'Select specific']} value={pubMode} onChange={v => { setPubMode(v); if (v === 'All publishers') setSelPubs([]); }} />
              {pubMode === 'Select specific' && pubList.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {pubList.map(p => (
                    <button key={p} type="button" style={tagBtnStyle(selPubs.includes(p))} onClick={() => togglePub(p)}>{p}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="field-group">
              <label className="field-label">Years</label>
              <ToggleGroup options={['All years', 'Select specific']} value={yrMode} onChange={v => { setYrMode(v); if (v === 'All years') setSelYears([]); }} />
              {yrMode === 'Select specific' && yearList.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {yearList.map(y => (
                    <button key={y} type="button" style={tagBtnStyle(selYears.includes(y))} onClick={() => toggleYear(y)}>{y}</button>
                  ))}
                </div>
              )}
            </div>

            <div className="field-group">
              <label className="field-label">Dashboard name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={autoName || 'e.g. IBM 2024 Overview'} />
            </div>

            {/* ── Executive Summary text ── */}
            <div className="field-group">
              <label className="field-label" style={{ marginBottom: 8 }}>Executive Summary <span style={{ fontWeight:400, color:'var(--text-muted)', fontSize:11 }}>(optional)</span></label>
              <textarea
                value={sumOv} onChange={e => setSumOv(e.target.value)}
                placeholder="Write an executive overview…"
                rows={3} style={{ width:'100%', boxSizing:'border-box', resize:'vertical', fontSize:12, fontFamily:'inherit', padding:'7px 9px', borderRadius:6, border:'1.5px solid var(--border)', color:'var(--text)', lineHeight:1.5 }}
              />
              <textarea
                value={sumAcc} onChange={e => setSumAcc(e.target.value)}
                placeholder="Key accomplishments (one per line)…"
                rows={2} style={{ width:'100%', boxSizing:'border-box', resize:'vertical', fontSize:12, fontFamily:'inherit', padding:'7px 9px', borderRadius:6, border:'1.5px solid var(--border)', color:'var(--text)', lineHeight:1.5, marginTop:6 }}
              />
              <textarea
                value={sumRec} onChange={e => setSumRec(e.target.value)}
                placeholder="Recommendations (one per line)…"
                rows={2} style={{ width:'100%', boxSizing:'border-box', resize:'vertical', fontSize:12, fontFamily:'inherit', padding:'7px 9px', borderRadius:6, border:'1.5px solid var(--border)', color:'var(--text)', lineHeight:1.5, marginTop:6 }}
              />
            </div>

            {/* ── Section visibility ── */}
            <div className="field-group">
              <label className="field-label" style={{ marginBottom: 8 }}>Sections</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {SECTION_DEFS.map(sec => {
                  const visible = !hiddenSecs[sec.key];
                  return (
                    <button
                      key={sec.key}
                      type="button"
                      onClick={() => toggleSec(sec.key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                        border: `1.5px solid ${visible ? 'var(--blue)' : 'var(--border)'}`,
                        background: visible ? 'rgba(0,95,134,.08)' : 'transparent',
                        color: visible ? 'var(--blue)' : 'var(--text-muted)',
                        textAlign: 'left',
                      }}
                    >
                      <i className={`ti ${sec.icon}`} style={{ fontSize: 14 }} />
                      <span style={{ flex: 1 }}>{sec.label}</span>
                      <i className={`ti ${visible ? 'ti-eye' : 'ti-eye-off'}`} style={{ fontSize: 13, opacity: 0.7 }} />
                    </button>
                  );
                })}
              </div>
            </div>

            <button className="btn primary" style={{ width: '100%', marginTop: 8 }} disabled={!canBuild} onClick={handleBuild}>
              <i className="ti ti-device-floppy" aria-hidden="true" /> Build Dashboard
            </button>
          </div>
        </div>

        {/* ── Right: live preview ── */}
        <div style={previewStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
            Live Preview
          </div>
          {previewFields.length === 0 && (
            <div style={{ background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-card)', padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Select a client to see a preview.
            </div>
          )}
          {previewFields.length > 0 && (
            <AutoDashViewer
              d={previewDash}
              viewOnly={true}
              allRecords={allRecords}
              controlledHidden={{
                kpis:      hiddenSecs.kpis      || false,
                summary:   hiddenSecs.summary   || false,
                breakdown: hiddenSecs.breakdown || false,
                journey:   hiddenSecs.journey   || false,
                ledger:    hiddenSecs.ledger    || false,
              }}
            />
          )}
        </div>

        {/* ── AI Chat toggle button (fixed to right edge) ── */}
        <button
          onClick={() => setChatOpen(o => !o)}
          title={chatOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
          style={{
            position: 'fixed', right: chatOpen ? 324 : 0, top: '50%', transform: 'translateY(-50%)',
            zIndex: 200, width: 36, height: 64, borderRadius: '8px 0 0 8px',
            background: 'var(--navy)', color: '#fff', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            boxShadow: '-2px 0 10px rgba(0,0,0,.15)', transition: 'right .25s ease',
          }}
        >
          <i className={`ti ${chatOpen ? 'ti-chevron-right' : 'ti-message-bolt'}`} />
        </button>

        {/* ── AI Chat drawer (fixed right side) ── */}
        <div style={{
          position: 'fixed', right: chatOpen ? 0 : -324, top: 0, bottom: 0, width: 320,
          zIndex: 199, background: 'var(--surface)', borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', transition: 'right .25s ease',
          boxShadow: '-4px 0 20px rgba(0,0,0,.12)',
        }}>
          {/* Header */}
          <div style={{ background: 'var(--navy)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <i className="ti ti-sparkles" style={{ color: '#ffad00', fontSize: 16 }} />
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, flex: 1 }}>AI Dashboard Assistant</span>
            <button onClick={() => setChatOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.6)', cursor: 'pointer', fontSize: 16, padding: 0 }}>
              <i className="ti ti-x" />
            </button>
          </div>

          {/* History */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {chatHistory.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
                <p style={{ margin: '0 0 10px', fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>Ask me to improve your dashboard:</p>
                {[
                  'Write an executive overview for this client',
                  'Add a recommendation about cost reduction',
                  'Summarize the key accomplishments',
                ].map(ex => (
                  <button key={ex} onClick={() => setChatInput(ex)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', marginBottom: 6, fontFamily: 'inherit', lineHeight: 1.4 }}>
                    "{ex}"
                  </button>
                ))}
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                background: msg.role === 'user' ? 'var(--navy)' : msg.error ? '#fef2f2' : 'var(--bg)',
                color: msg.role === 'user' ? '#fff' : msg.error ? '#b91c1c' : 'var(--text)',
                border: msg.role === 'ai' ? '1px solid var(--border)' : 'none',
                borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                padding: '8px 11px', fontSize: 12, lineHeight: 1.5,
              }}>
                {msg.role === 'ai' && <i className="ti ti-sparkles" style={{ color: '#ffad00', marginRight: 5, fontSize: 11 }} />}
                {msg.text}
              </div>
            ))}
            {chatLoading && (
              <div style={{ alignSelf: 'flex-start', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px 12px 12px 2px', padding: '8px 11px', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="ti ti-loader-2 spinning" /> Thinking…
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: '12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0 }}>
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleChatSubmit()}
              placeholder="Ask AI to update the dashboard…"
              disabled={chatLoading}
              style={{ flex: 1, fontSize: 12, padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
            />
            <button
              onClick={handleChatSubmit}
              disabled={!chatInput.trim() || chatLoading}
              style={{ background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 8, width: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, opacity: (!chatInput.trim() || chatLoading) ? 0.4 : 1 }}
            >
              <i className="ti ti-send" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Lifetime Value slide ─────────────────────────────────────────────────────

function fmtSlideM(v) {
  if (!v || v <= 0) return '$0M';
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}B`;
  if (v >= 100)  return `$${Math.round(v)}M`;
  return `$${v.toFixed(1)}M`;
}

function buildSlideData(records, client, fromYear, toYear) {
  const toM = (key) => records.reduce((s, r) => s + (Number(r[key]) || 0), 0) / 1e6;

  const accAvoidance = toM('acc_cost_avoidance');
  const idRisk       = toM('identified_risk');
  const realSavings  = toM('realized_savings') || toM('acc_cost_optimization');
  const idSavings    = toM('id_cost_optimization') || toM('id_cost_savings');
  const annualSpend  = toM('annual_contract_spend');
  const totalAcc     = accAvoidance + realSavings;

  // Publisher breakdown — top 6 by accomplished avoidance
  const pubMap = {};
  records.forEach(r => {
    const pub = r.publisher || 'Unknown';
    if (!pubMap[pub]) pubMap[pub] = { identified: 0, accomplished: 0 };
    pubMap[pub].identified  += (Number(r.identified_risk) || 0) / 1e6;
    pubMap[pub].accomplished += (Number(r.acc_cost_avoidance) || 0) / 1e6;
  });
  const categories = Object.entries(pubMap)
    .sort((a, b) => b[1].accomplished - a[1].accomplished)
    .slice(0, 6)
    .map(([label, v]) => ({ label, identified: +v.identified.toFixed(2), accomplished: +v.accomplished.toFixed(2) }));

  const yMax = categories.reduce((m, c) => Math.max(m, c.identified), 0);
  const yAxisMax = Math.ceil(yMax / 5) * 5 || 10;

  const pubs  = [...new Set(records.map(r => r.publisher).filter(Boolean))];
  const years = [...new Set(records.map(r => r.year).filter(Boolean))].sort();
  const scope = pubs.length && years.length
    ? `${pubs.length} publisher${pubs.length === 1 ? '' : 's'} · FY${years[0]}–FY${years[years.length - 1]}`
    : 'All engagements';

  return {
    client: client || 'Client',
    scope,
    groups: [
      { accent: 'opt', tag: 'Optimization Activities', metric: 'Realized Risk Avoidance',
        value: +accAvoidance.toFixed(2), identified: +idRisk.toFixed(2), identified_label: 'identified risk' },
      { accent: 'sav', tag: 'Savings Opportunities', metric: 'Accomplished Cost Savings',
        value: +realSavings.toFixed(2), identified: +idSavings.toFixed(2), identified_label: 'identified optimization' },
    ],
    headline: {
      value: `${fmtSlideM(totalAcc)}+`,
      caption: 'in total value delivered',
      subtitle: 'Proactive savings through informed purchases and better decision-making.',
    },
    chips: [
      { value: fmtSlideM(totalAcc),    label: 'Value realized to date' },
      { value: fmtSlideM(annualSpend), label: 'Annual contract spend managed' },
    ],
    chart: {
      title: 'Value delivered by publisher ($M)',
      series_names: { identified: 'Identified', accomplished: 'Accomplished' },
      y_axis_max: yAxisMax,
      y_ticks: 4,
      categories,
    },
  };
}

// Inline SVG grouped bar chart for the Lifetime Value preview.
// Renders identified (navy) vs accomplished (gold) bars side-by-side per publisher.
function LVBarChart({ categories, yAxisMax }) {
  if (!categories?.length) return null;
  const W = 560, H = 160, PAD_L = 10, PAD_B = 22, PAD_T = 8;
  const innerW = W - PAD_L;
  const innerH = H - PAD_B - PAD_T;
  const n = categories.length;
  const groupW = innerW / n;
  const barW = Math.min(groupW * 0.35, 22);
  const gap   = barW * 0.35;
  const scale = (v) => PAD_T + innerH - (Math.max(0, v) / (yAxisMax || 1)) * innerH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {/* gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => {
        const y = PAD_T + innerH * (1 - t);
        return <line key={t} x1={PAD_L} y1={y} x2={W} y2={y} stroke="#1a2a4a" strokeWidth={0.8} />;
      })}
      {categories.map((c, i) => {
        const cx = PAD_L + i * groupW + groupW / 2;
        const x0 = cx - barW - gap / 2;
        const x1 = cx + gap / 2;
        return (
          <g key={c.label}>
            {/* identified bar */}
            <rect x={x0} y={scale(c.identified)} width={barW}
                  height={Math.max(0, innerH - (scale(c.identified) - PAD_T))}
                  fill="#005F86" rx={2} />
            {/* accomplished bar */}
            <rect x={x1} y={scale(c.accomplished)} width={barW}
                  height={Math.max(0, innerH - (scale(c.accomplished) - PAD_T))}
                  fill="#FFAD00" rx={2} />
            <text x={cx} y={H - 6} textAnchor="middle" fontSize={8.5} fill="#aab8cc">{c.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function LifetimeValueSlide({ records = [], loginClient = '', selectedClient, onClientChange, fromYear, onFromYearChange, toYear, onToYearChange }) {
  const clients  = useMemo(() => [...new Set(records.map(r => r.client).filter(Boolean))].sort(), [records]);
  const allYears = useMemo(() => [...new Set(records.map(r => r.year).filter(Boolean))].sort(), [records]);

  const [exportOpen, setExportOpen] = useState(false);
  const [exporting,  setExporting]  = useState(false);

  const clientYearFiltered = useMemo(() => records.filter(r => {
    if (selectedClient && r.client !== selectedClient) return false;
    if (fromYear && r.year < fromYear) return false;
    if (toYear   && r.year > toYear)   return false;
    return true;
  }), [records, selectedClient, fromYear, toYear]);

  const allPublishers = useMemo(
    () => [...new Set(clientYearFiltered.map(r => r.publisher).filter(Boolean))].sort(),
    [clientYearFiltered],
  );
  const [selectedPubs, setSelectedPubs] = useState(null);
  const [extraPubs, setExtraPubs]       = useState([]);

  useEffect(() => { setSelectedPubs(null); setExtraPubs([]); }, [selectedClient, fromYear, toYear]);

  const activePubs = selectedPubs ?? allPublishers;

  const otherPubs = useMemo(
    () => allPublishers.filter(p => ![...PINNED_PUBLISHERS, ...extraPubs].includes(p)),
    [allPublishers, extraPubs],
  );

  const togglePub = (pub) => {
    if (!selectedPubs) {
      setSelectedPubs(allPublishers.filter(p => p !== pub));
    } else if (selectedPubs.includes(pub)) {
      const next = selectedPubs.filter(p => p !== pub);
      setSelectedPubs(next.length === allPublishers.length ? null : next);
    } else {
      const next = [...selectedPubs, pub];
      setSelectedPubs(next.length === allPublishers.length ? null : next);
    }
  };

  const toggleOthers = () => {
    const anyOtherOn = otherPubs.some(p => activePubs.includes(p));
    if (anyOtherOn) {
      const keep = activePubs.filter(p => !otherPubs.includes(p));
      setSelectedPubs(keep.length === allPublishers.length ? null : keep.length === 0 ? [] : keep);
    } else {
      const next = [...new Set([...activePubs, ...otherPubs])];
      setSelectedPubs(next.length === allPublishers.length ? null : next);
    }
  };

  const selectAll = () => setSelectedPubs(null);

  const filtered = useMemo(
    () => clientYearFiltered.filter(r => !r.publisher || activePubs.includes(r.publisher)),
    [clientYearFiltered, activePubs],
  );

  const sd = useMemo(() => buildSlideData(filtered, selectedClient || 'All Clients', fromYear, toYear),
    [filtered, selectedClient, fromYear, toYear]);

  const handleExportHtml = async () => {
    setExportOpen(false);
    setExporting(true);
    try { await exportLifetimeValueHtml(sd); }
    catch (err) { alert(`Export failed: ${err.message}`); }
    finally { setExporting(false); }
  };

  const handleExportPptx = async () => {
    setExportOpen(false);
    setExporting(true);
    try { await exportLifetimeValuePptx(sd); }
    catch (err) { alert(`Export failed: ${err.message}`); }
    finally { setExporting(false); }
  };

  if (clients.length === 0) return null;

  // Capture % for each group
  const capPct = (g) => g.identified > 0 ? Math.min(1, g.value / g.identified) : 0;

  return (
    <div style={{ borderRadius: '0 0 12px 12px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.10)' }}>
      {/* ── Header bar ── */}
      <div style={{ background: '#001941', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, flex: '0 0 auto' }}>Lifetime Value Slide</span>

        {/* Client selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ color: '#aab4c4' }}>Client</span>
          <select
            value={selectedClient}
            onChange={e => onClientChange(e.target.value)}
            style={{ background: '#0a2a5e', color: '#fff', border: '1px solid #2a4a7e', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontFamily: 'inherit' }}
          >
            <option value="">All Clients</option>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Year range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ color: '#aab4c4' }}>From</span>
          <select value={fromYear ?? ''} onChange={e => onFromYearChange(e.target.value || null)}
            style={{ background: '#0a2a5e', color: '#fff', border: '1px solid #2a4a7e', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontFamily: 'inherit' }}>
            {allYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span style={{ color: '#aab4c4' }}>To</span>
          <select value={toYear ?? ''} onChange={e => onToYearChange(e.target.value || null)}
            style={{ background: '#0a2a5e', color: '#fff', border: '1px solid #2a4a7e', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontFamily: 'inherit' }}>
            {allYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Export dropdown */}
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <button
            onClick={() => setExportOpen(o => !o)}
            disabled={exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              fontFamily: 'inherit', cursor: exporting ? 'default' : 'pointer',
              background: 'rgba(255,255,255,0.12)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)',
            }}
          >
            {exporting
              ? <><i className="ti ti-loader-2 spinning" /> Exporting…</>
              : <><i className="ti ti-download" /> Export</>}
          </button>
          {exportOpen && (
            <div
              onMouseLeave={() => setExportOpen(false)}
              style={{
                position: 'absolute', right: 0, top: '110%', zIndex: 50,
                background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                minWidth: 200, overflow: 'hidden',
              }}
            >
              {[
                { icon: 'ti-file-code',    label: 'Export as HTML',       action: handleExportHtml },
                { icon: 'ti-presentation', label: 'Export as PowerPoint',  action: handleExportPptx },
              ].map(item => (
                <button key={item.label} onClick={item.action}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9,
                    width: '100%', padding: '10px 14px', border: 'none',
                    background: 'none', cursor: 'pointer', fontSize: 13,
                    color: '#001941', fontFamily: 'inherit', fontWeight: 500, textAlign: 'left',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <i className={`ti ${item.icon}`} style={{ fontSize: 15, color: '#005f86' }} />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Publisher toggles */}
        <PublisherChipBar
          allPublishers={allPublishers}
          activePubs={activePubs}
          onToggle={togglePub}
          onToggleOthers={toggleOthers}
          onSelectAll={selectAll}
          extraPubs={extraPubs}
          onAddPub={p => setExtraPubs(prev => [...prev, p])}
          onRemoveExtra={p => setExtraPubs(prev => prev.filter(x => x !== p))}
          otherPubs={otherPubs}
        />
      </div>

      {/* ── Slide preview ── */}
      <div style={{ background: '#001941', display: 'flex', minHeight: 240 }}>
        {/* Left stat rail */}
        <div style={{ width: '28%', minWidth: 180, background: '#003861', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#FFAD00', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>{sd.client}</div>
          <div style={{ fontSize: 9, color: '#aab8cc', marginBottom: 14 }}>{sd.scope}</div>

          {sd.groups.map((g, i) => {
            const accent = g.accent === 'opt' ? '#FFAD00' : '#005F86';
            const pct = capPct(g);
            return (
              <div key={i} style={{ marginBottom: i === 0 ? 16 : 0 }}>
                <div style={{ fontSize: 8.5, fontWeight: 700, color: '#aab8cc', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 2 }}>{g.tag}</div>
                <div style={{ fontSize: 9.5, color: '#ccd5e0', marginBottom: 4 }}>{g.metric}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1.05, marginBottom: 6 }}>
                  {fmtSlideM(g.value)}
                </div>
                {/* Capture bar */}
                <div style={{ background: '#1a2a4a', borderRadius: 3, height: 6, marginBottom: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: accent, borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 8.5, color: '#aab8cc' }}>
                  {Math.round(pct * 100)}% of {g.identified_label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Main area */}
        <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Headline */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: '#fff', lineHeight: 1, marginBottom: 2 }}>{sd.headline.value}</div>
            <div style={{ fontSize: 11, color: '#aab8cc', marginBottom: 4 }}>{sd.headline.caption}</div>
            <div style={{ fontSize: 10, color: '#ccd5e0', lineHeight: 1.45 }}>{sd.headline.subtitle}</div>
          </div>

          {/* KPI chips */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            {sd.chips.map((ch, i) => (
              <div key={i} style={{
                background: '#F2F4F6', borderRadius: 6, padding: '8px 12px',
                borderLeft: '4px solid #FFAD00', minWidth: 130,
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#001941' }}>{ch.value}</div>
                <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>{ch.label}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          {sd.chart.categories.length > 0 && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: '#aab8cc', marginBottom: 4 }}>{sd.chart.title}</div>
              <LVBarChart categories={sd.chart.categories} yAxisMax={sd.chart.y_axis_max} />
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: '#aab8cc' }}>
                  <div style={{ width: 10, height: 10, background: '#005F86', borderRadius: 2 }} /> Identified
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: '#aab8cc' }}>
                  <div style={{ width: 10, height: 10, background: '#FFAD00', borderRadius: 2 }} /> Accomplished
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboards view ──────────────────────────────────────────────────────────
export default function DashboardsView({ seed = null, onSeedConsumed, loginClient = '', loginPublisher = '', targetRecord = null, onTargetConsumed, loggedInUser = '', newDashId = null, onNewDashConsumed }) {
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [savedList, setSavedList] = useState(loadSaved);
  const [building, setBuilding] = useState(null); // { templateId, initial }
  const [viewingAuto, setViewingAuto] = useState(null); // auto-saved dashboard from ScreenDone
  const [highlightId, setHighlightId] = useState(null); // briefly green after coming from ScreenDone
  const [lockedClient, setLockedClient] = useState(null);
  const [showAllClients, setShowAllClients] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  // When set, the view is scoped to a filtered subset handed over from the
  // Tracker rather than the full dataset. Null = work off every record.
  const [scopedRecords, setScopedRecords] = useState(null);

  // ── Shared slide-panel state (persists when toggling VAG ↔ LTV) ──
  const [activeSlide, setActiveSlide] = useState('vag');
  const [slideClient, setSlideClient] = useState(loginClient || '');
  const [slideFromYear, setSlideFromYear] = useState(null);
  const [slideToYear, setSlideToYear]   = useState(null);

  useEffect(() => {
    getRecords()
      .then(data => setAllRecords(Array.isArray(data) ? data : []))
      .catch(() => setAllRecords([]))
      .finally(() => setLoading(false));
  }, []);

  // Seed slide year bounds once records arrive
  useEffect(() => {
    const ys = [...new Set(allRecords.map(r => r.year).filter(Boolean))].sort();
    setSlideFromYear(prev => prev ?? (ys[0] ?? null));
    setSlideToYear(prev => prev ?? (ys[ys.length - 1] ?? null));
  }, [allRecords]); // eslint-disable-line react-hooks/exhaustive-deps

  // The Tracker (or history panel) handed over a filtered subset: scope to it
  // and jump into the builder. When a single record is passed, pre-configure
  // the builder from it and open in view mode (isEditing = false).
  useEffect(() => {
    if (seed && seed.length) {
      setScopedRecords(seed);
      const r = seed[0];
      const partial = seed.length === 1 ? {
        client:    r.client    || '',
        pubMode:   r.publisher ? 'Select specific' : 'All publishers',
        selPubs:   r.publisher ? [r.publisher] : [],
        yrMode:    r.year      ? 'Select specific' : 'All years',
        selYears:  r.year      ? [String(r.year)]  : [],
        name: [r.client, r.publisher, r.year].filter(Boolean).join(' — '),
        selElements: [
          { id: 'metric:realized_savings' },
          { id: 'chart:journey' },
          { id: 'chart:bar' },
          { id: 'chart:trend' },
        ],
      } : null;
      setBuilding({ templateId: 'custom', initial: partial });
      onSeedConsumed?.();
    }
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // When coming from ScreenDone, highlight and auto-open the newly saved dashboard
  useEffect(() => {
    if (!newDashId) return;
    onNewDashConsumed?.();
    const fresh = loadSaved();
    setSavedList(fresh);
    const dash = fresh.find(d => d.id === newDashId);
    if (dash) {
      setHighlightId(newDashId);
      setViewingAuto(dash);
      setTimeout(() => setHighlightId(null), 5000);
    }
  }, [newDashId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When a specific past-document record is clicked, find its saved dashboard
  // (matched by client + publisher + year) and open it in view mode.
  // If no saved dashboard exists yet, open the builder pre-configured for it.
  useEffect(() => {
    if (!targetRecord) return;
    onTargetConsumed?.();
    const r = targetRecord;
    const rClient    = (r.client    || '').toLowerCase().trim();
    const rPublisher = (r.publisher || '').toLowerCase().trim();
    const rYear      = String(r.year || '');

    // Check for auto-saved dashboard first
    const autoMatch = savedList.find(d => {
      if (d.type !== 'auto') return false;
      if ((d.client || '').toLowerCase().trim() !== rClient) return false;
      const pubMatch = !rPublisher || (d.publisher || '').toLowerCase().trim() === rPublisher;
      const yrMatch  = !rYear || String(d.year || '') === rYear;
      return pubMatch && yrMatch;
    });
    if (autoMatch) {
      setViewingAuto(autoMatch);
      return;
    }

    const match = savedList.find(d => {
      if (!d.templateId) return false;
      if ((d.client || '').toLowerCase().trim() !== rClient) return false;
      const pubMatch = !rPublisher
        || d.pubMode === 'All publishers'
        || (d.selPubs || []).some(p => p.toLowerCase().trim() === rPublisher);
      const yrMatch  = !rYear
        || d.yrMode  === 'All years'
        || (d.selYears || []).map(String).includes(rYear);
      return pubMatch && yrMatch;
    });
    if (match) {
      setBuilding({ templateId: match.templateId, initial: match });
    } else {
      const partial = {
        client:   r.client    || '',
        pubMode:  r.publisher ? 'Select specific' : 'All publishers',
        selPubs:  r.publisher ? [r.publisher] : [],
        yrMode:   r.year      ? 'Select specific' : 'All years',
        selYears: r.year      ? [String(r.year)]  : [],
        name: [r.client, r.publisher, r.year].filter(Boolean).join(' — '),
        selElements: [
          { id: 'metric:realized_savings' },
          { id: 'chart:journey' },
          { id: 'chart:bar' },
          { id: 'chart:trend' },
        ],
      };
      setBuilding({ templateId: 'custom', initial: partial });
    }
  }, [targetRecord]); // eslint-disable-line react-hooks/exhaustive-deps

  const records = scopedRecords ?? allRecords;
  const clearScope = () => { setScopedRecords(null); setBuilding(null); };

  const options = useMemo(() => deriveOptions(records), [records]);

  const handleSave = (config) => {
    setSavedList(prev => {
      // Replace an existing real entry with the same id; otherwise prepend.
      const withoutSeeds = prev.filter(d => !d.seed && d.id !== config.id);
      const next = [config, ...withoutSeeds];
      persistSaved(next);
      return next;
    });
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    setSavedList(prev => {
      const next = prev.filter(d => d.id !== id);
      persistSaved(next.filter(d => !d.seed));
      return next;
    });
  };

  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Load the Anglepoint logo as a data URI so the exported file is self-contained
  // (a root-relative path breaks when the .html is opened from disk).
  const fetchLogoDataUri = async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}anglepoint-logo.png`);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  };

  const buildDashboardHtml = (dash, logoUri) => {
    const filterArgs = {
      client: dash.client || null,
      publishers: dash.pubMode === 'Select specific' ? dash.selPubs : null,
      years: dash.yrMode === 'Select specific' ? dash.selYears : null,
    };
    const matched = matchFilters(records, filterArgs);
    const selElements = normalizeElements(dash) || [{ id: 'metric:realized_savings' }];
    const primaryMetric = selElements.map(e => parseElementId(e.id)).find(p => p.kind === 'metric')?.key
      || 'realized_savings';
    const groupField = groupFieldFor(dash.templateId, dash);
    const chartData = groupSum(matched, groupField, primaryMetric);
    const maxVal = chartData.reduce((m, d) => Math.max(m, d.value), 0);
    const colors = ['#001941', '#005f86', '#0089af', '#ffad00'];

    // Storytelling aggregations (mirror the live preview, same helpers).
    const stages = journeyStages(matched);
    const rates = realizationRate(stages);
    const trend = yearDeltas(yearSeries(matched, primaryMetric));
    const barsPct = withPercent(chartData);
    const recent = mostRecentSummary(matched);

    const pubScope = dash.pubMode === 'All publishers'
      ? 'All publishers'
      : `${dash.selPubs?.length || 0} publisher${(dash.selPubs?.length || 0) === 1 ? '' : 's'}`;
    const yrScope = dash.yrMode === 'All years'
      ? 'All years'
      : (dash.selYears?.length === 1 ? String(dash.selYears[0]) : `${dash.selYears?.length || 0} years`);

    const scopeBadges = [
      { text: dash.client || 'All clients', bg: '#001941' },
      { text: pubScope, bg: '#005f86' },
      { text: yrScope, bg: '#005f86' },
      { text: `${matched.length} record${matched.length === 1 ? '' : 's'}`, bg: '#ffad00', fg: '#001941' },
    ].map(b => `<span class="badge" style="background:${b.bg};color:${b.fg || '#fff'}">${escapeHtml(b.text)}</span>`).join('\n      ');

    // One numeric metric summary card (mirrors the builder preview).
    const metricCardHtml = (key) => {
      const has = countWithMetric(matched, key);
      const value = has ? formatCurrency(sum(matched, key)) : '—';
      const delta = has ? `across ${has} record${has === 1 ? '' : 's'}` : 'no data for this metric';
      const deltaColor = has ? '#ffad00' : 'rgba(255,255,255,0.35)';
      return `      <div class="metric-card">
        <div class="metric-label">${escapeHtml(labelFor(key))}</div>
        <div class="metric-value">${escapeHtml(value)}</div>
        <div class="metric-delta" style="color:${deltaColor}">${escapeHtml(delta)}</div>
      </div>`;
    };

    // Bar chart with contribution callouts (mirrors the builder preview).
    // A single bar tells no story — only render the card when 2+ bars carry data.
    const bars = barsPct.slice(0, MAX_BARS).map((d, i) => `      <div class="bar-row">
        <span class="bar-label">${escapeHtml(d.label)}${d.isTop ? ' <span class="top-pill">Top</span>' : ''}</span>
        <div class="bar-bg"><div class="bar-fill" style="width:${Math.round((d.value / maxVal) * 100)}%;background:${colors[i % colors.length]}"></div></div>
        <span class="bar-val">${escapeHtml(formatCurrency(d.value))} · ${Math.round(d.pct)}%</span>
      </div>`).join('\n')
        + (barsPct.length > MAX_BARS
          ? `\n      <div style="font-size:12px;color:#5a6e8c;margin-top:4px">+ ${barsPct.length - MAX_BARS} more</div>`
          : '');
    const barCard = (maxVal > 0 && barsPct.length > 1)
      ? `  <div class="card">
    <div class="card-title">${escapeHtml(labelFor(primaryMetric))} by ${groupField === 'year' ? 'Year' : 'Publisher'}</div>
${bars}
  </div>\n`
      : '';

    // ROI Journey funnel (Identified → Accomplished → Realized).
    const stageColors = ['#001941', '#005f86', '#ffad00'];
    const journeyTop = Math.max(...stages.map(s => s.value), 1);
    const stepRates = [null, rates.accToId, rates.realToAcc];
    const journeyRows = stages.map((s, i) => {
      const chip = i > 0
        ? `      <div class="rate-chip">↓ ${escapeHtml(formatPct(stepRates[i]))} of ${escapeHtml(stages[i - 1].label.toLowerCase())}</div>\n`
        : '';
      return `${chip}      <div class="bar-row">
        <span class="bar-label">${escapeHtml(s.label)}</span>
        <div class="bar-bg"><div class="bar-fill" style="width:${Math.round((Math.max(0, s.value) / journeyTop) * 100)}%;background:${stageColors[i]}"></div></div>
        <span class="bar-val">${escapeHtml(formatCurrency(s.value))}</span>
      </div>`;
    }).join('\n');
    const journeyCard = stages[0].value > 0
      ? `  <div class="card">
    <div class="card-title">ROI Journey</div>
${journeyRows}
  </div>\n`
      : '';

    // Year-over-year trend as a static inline SVG (mirrors TrendChart).
    let trendCard = '';
    if (trend.length >= 2 && trend.some(p => p.value > 0)) {
      const W = 600, H = 180, P = 28, innerW = W - 2 * P, innerH = H - 2 * P - 18;
      const n = trend.length;
      const tMax = trend.reduce((m, p) => Math.max(m, p.value), 0) || 1;
      const pts = trend.map((p, i) => ({
        ...p,
        x: P + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2),
        y: P + innerH - (tMax > 0 ? (p.value / tMax) * innerH : 0),
      }));
      const line = pts.map(p => `${p.x},${p.y}`).join(' ');
      const baseY = P + innerH;
      const area = `${pts[0].x},${baseY} ${line} ${pts[n - 1].x},${baseY}`;
      const dots = pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#001941"></circle>`).join('');
      const yearLabels = pts.map(p => `<text x="${p.x}" y="${H - 14}" text-anchor="middle" font-size="12" fill="#5a6e8c">${p.year}</text>`).join('');
      const deltas = pts.filter(p => p.deltaPct != null).map(p =>
        `<text x="${p.x}" y="${p.y - 10}" text-anchor="middle" font-size="11" font-weight="700" fill="${p.deltaDir === 'down' ? '#c0392b' : '#1a7f4b'}">${p.deltaDir === 'down' ? '▼' : '▲'} ${Math.abs(p.deltaPct)}%</text>`).join('');
      trendCard = `\n  <div class="card">
    <div class="card-title">${escapeHtml(labelFor(primaryMetric))} Trend</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" style="display:block">
      <polygon points="${area}" fill="rgba(0,95,134,0.12)"></polygon>
      <polyline points="${line}" fill="none" stroke="#005f86" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></polyline>
      ${dots}
      ${yearLabels}
      ${deltas}
    </svg>
  </div>`;
    }

    // One executive-summary field as a card (mirrors SummaryCard). No icon font
    // in the export, so list bullets use a colored dot. Returns '' when empty so
    // the deliverable omits sections with no data.
    const fieldDot = {
      key_accomplishments: '#2d9e5c', recommendations: '#ffad00', primary_risks: '#c0392b',
      market_risks: '#e67e22', additional_insights: '#4a6a9c', next_steps: '#0089af',
    };
    // Render one content object (short or long) to inner HTML.
    const renderFieldContent = (field, content) => {
      if (content.text) {
        return `    <p class="insight-overview">${escapeHtml(content.text)}</p>\n`;
      }
      if (content.items) {
        const dot = fieldDot[field] || '#005f86';
        const rows = content.items.map(it =>
          `      <div class="insight-item"><span class="insight-dot" style="background:${dot}"></span><span>${escapeHtml(it)}</span></div>`).join('\n');
        return `    <div class="insight-list">\n${rows}\n    </div>\n`;
      }
      const cards = content.metrics || content.highlights;
      const cardHtml = cards.map(c => `      <div class="metric-card">
        <div class="metric-label">${escapeHtml(c.label)}</div>
        <div class="metric-value" style="font-size:26px">${escapeHtml(c.value || '—')}</div>${c.context ? `
        <div class="metric-delta" style="color:#ffad00">${escapeHtml(c.context)}</div>` : ''}
      </div>`).join('\n');
      return `    <div class="metric-grid" style="margin:0">\n${cardHtml}\n    </div>\n`;
    };

    const summaryFieldHtml = (field, variant) => {
      const def = SUMMARY_ELEMENTS.find(e => e.field === field);
      const shortContent = summaryFieldContent(recent?.summary, field, 'short');
      const longContent  = summaryFieldContent(recent?.summary, field, 'long');
      const base = variant === 'long' ? longContent : shortContent;
      if (!def || !base) return '';
      const src = recent?.source
        ? ` <span style="font-weight:500;font-size:11px;color:#5a6e8c">${recent.count > 1 ? 'most recent · ' : ''}${escapeHtml(recent.source)}</span>`
        : '';
      const title = `    <div class="card-title">${escapeHtml(def.label)}${src}</div>\n`;

      // A short text/list field with more content gets a CSS-only See more
      // toggle (a hidden checkbox swaps the short body for the long one) so the
      // exported file stays interactive without any JavaScript.
      const canExpand = variant === 'short' && def.variantable && longContent && (
        longContent.text  ? longContent.text !== shortContent.text
        : longContent.items ? longContent.items.length > shortContent.items.length
        : false
      );
      if (!canExpand) {
        return `  <div class="card">\n${title}${renderFieldContent(field, base)}  </div>\n`;
      }
      const id = `exp-${field}`;
      return `  <div class="card">
${title}    <input type="checkbox" id="${id}" class="exp-toggle" hidden>
    <div class="exp-short">
${renderFieldContent(field, shortContent)}    </div>
    <div class="exp-long">
${renderFieldContent(field, longContent)}    </div>
    <label for="${id}" class="exp-label"><span class="exp-more">See more ▾</span><span class="exp-less">See less ▴</span></label>
  </div>\n`;
    };

    // Walk the ordered elements, grouping adjacent metric cards into one grid.
    const orderedBody = groupElements(selElements).map(block => {
      if (block.type === 'metrics') {
        return `  <div class="metric-grid">\n${block.items.map(e => metricCardHtml(parseElementId(e.id).key)).join('\n')}\n  </div>\n`;
      }
      if (block.type === 'summary') {
        return summaryFieldHtml(parseElementId(block.el.id).key, block.el.variant || 'short');
      }
      if (block.type === 'chart') {
        const key = parseElementId(block.el.id).key;
        return key === 'journey' ? journeyCard : key === 'bar' ? barCard : key === 'trend' ? trendCard : '';
      }
      return '';
    }).filter(Boolean).join('\n');

    const body = matched.length === 0
      ? `  <div class="card" style="text-align:center;color:#5a6e8c;padding:40px">No records match these filters.</div>`
      : orderedBody;

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(dash.name)}</title>
  <style>
    :root { --navy:#001941; --gold:#ffad00; --border:#dce3ef; --text-muted:#5a6e8c; --surface-3:#e6e8ec; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin: 0; padding: 32px; color: var(--navy); background: #eef1f6; }
    .wrap { max-width: 920px; margin: 0 auto; }
    .title { font-size: 24px; font-weight: 800; color: var(--navy); }
    .subtitle { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
    .badges { display: flex; gap: 6px; flex-wrap: wrap; margin: 16px 0 22px; }
    .badge { font-size: 11px; font-weight: 700; padding: 4px 11px; border-radius: 6px; }
    .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin-bottom: 20px; }
    .metric-card { background: var(--navy); border-radius: 10px; padding: 22px; border: 1px solid rgba(255,255,255,0.04); }
    .metric-label { font-size: 11px; color: rgba(255,255,255,0.45); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.7px; }
    .metric-value { font-size: 32px; font-weight: 800; color: #fff; line-height: 1.1; }
    .metric-delta { font-size: 13px; margin-top: 6px; }
    .card { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 28px; margin-bottom: 16px; }
    .card-title { font-size: 16px; font-weight: 700; color: var(--navy); margin-bottom: 20px; }
    .bar-row { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; }
    .bar-label { min-width: 150px; font-size: 14px; color: var(--text-muted); }
    .bar-bg { flex: 1; height: 8px; background: var(--surface-3); border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 4px; }
    .bar-val { min-width: 60px; text-align: right; font-size: 13px; font-weight: 700; color: var(--text-muted); }
    .top-pill { font-size: 10px; font-weight: 800; color: #001941; background: var(--gold); border-radius: 6px; padding: 1px 7px; margin-left: 8px; }
    .rate-chip { padding-left: 150px; font-size: 12px; font-weight: 700; color: #005f86; margin-bottom: 8px; }
    .insight-overview { font-size: 13.5px; line-height: 1.6; color: var(--navy); margin: 0 0 10px; }
    .insight-list { display: flex; flex-direction: column; gap: 8px; }
    .insight-item { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; line-height: 1.5; color: var(--navy); }
    .insight-dot { width: 9px; height: 9px; border-radius: 2px; margin-top: 5px; flex-shrink: 0; }
    .insight-note { font-size: 11px; color: var(--text-muted); margin-top: 12px; }
    .exp-long { display: none; }
    .exp-toggle:checked ~ .exp-long { display: block; }
    .exp-toggle:checked ~ .exp-short { display: none; }
    .exp-label { display: inline-flex; align-items: center; gap: 4px; margin-top: 10px; font-size: 12.5px; font-weight: 700; color: #005f86; cursor: pointer; user-select: none; }
    .exp-less { display: none; }
    .exp-toggle:checked ~ .exp-label .exp-more { display: none; }
    .exp-toggle:checked ~ .exp-label .exp-less { display: inline; }
    .brandbar { display: flex; align-items: center; gap: 12px; padding: 14px 20px; background: var(--navy); border-bottom: 3px solid var(--gold); border-radius: 12px 12px 0 0; }
    .brandbar img { height: 30px; }
    .brand-name { color: #fff; font-weight: 800; font-size: 16px; letter-spacing: 1px; }
    .brand-tag { margin-left: auto; color: var(--gold); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; }
    .report-head { background: #fff; border: 1px solid var(--border); border-top: none; border-radius: 0 0 12px 12px; padding: 22px 24px; margin-bottom: 16px; }
    .footer { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #8aa4cc; margin-top: 24px; border-top: 1px solid var(--border); padding-top: 14px; }
    .footer .dot { color: var(--gold); }
  </style>
</head>
<body>
  <div class="wrap">
  <div class="brandbar">
    ${logoUri ? `<img src="${logoUri}" alt="Anglepoint">` : ''}
    <span class="brand-name">ANGLEPOINT</span>
    <span class="brand-tag">ROI Dashboard</span>
  </div>
  <div class="report-head">
    <div class="title">${escapeHtml(dash.name)}</div>
    <div class="subtitle">${escapeHtml(dash.sub)}</div>
    <div class="badges">
      ${scopeBadges}
    </div>
  </div>
${body}
  <div class="footer"><strong>Anglepoint</strong> <span class="dot">·</span> ROI Reporting <span class="dot">·</span> Generated ${escapeHtml(new Date().toLocaleString())}</div>
  </div>
</body>
</html>`;
  };

  const handleExport = async (dashboard, e) => {
    e.stopPropagation();
    const logoUri = await fetchLogoDataUri();
    const html = buildDashboardHtml(dashboard, logoUri);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement('a');
    const safeName = dashboard.name
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 140) || 'dashboard';

    element.href = url;
    element.download = `${safeName}.html`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(url);
  };

  if (viewingAuto) {
    return <AutoDashViewer
      d={viewingAuto}
      currentUser={loggedInUser}
      allRecords={allRecords}
      onBack={() => setViewingAuto(null)}
      onRename={(newName) => {
        setSavedList(prev => {
          const next = prev.map(x => x.id === viewingAuto.id ? { ...x, name: newName } : x);
          persistSaved(next.filter(x => !x.seed));
          return next;
        });
        setViewingAuto(v => ({ ...v, name: newName }));
      }}
      onDuplicate={() => {
        const copy = { ...viewingAuto, id:`auto-copy-${Date.now()}`, name: viewingAuto.name + ' (Copy)', savedAt: new Date().toISOString() };
        setSavedList(prev => { const next = [copy, ...prev]; persistSaved(next.filter(x => !x.seed)); return next; });
      }}
      onDelete={() => {
        setSavedList(prev => { const next = prev.filter(x => x.id !== viewingAuto.id); persistSaved(next.filter(x => !x.seed)); return next; });
        setViewingAuto(null);
      }}
      onSaveEdits={(editedSummary) => {
        const updated = { ...viewingAuto, summary: editedSummary };
        setSavedList(prev => {
          const next = prev.map(x => x.id === viewingAuto.id ? updated : x);
          persistSaved(next.filter(x => !x.seed));
          return next;
        });
        setViewingAuto(updated);
      }}
    />;
  }

  if (building) {
    // New custom builds (no prior config) go to the redesigned CustomDashBuilder.
    if (building.templateId === 'custom' && !building.initial) {
      return (
        <>
          {scopedRecords && <ScopeBanner count={scopedRecords.length} onClear={clearScope} />}
          <CustomDashBuilder
            records={records}
            allRecords={allRecords}
            options={options}
            loginClient={!lockedClient && loginClient ? loginClient : lockedClient || ''}
            onClose={() => setBuilding(null)}
            onSave={(dash) => { handleSave(dash); setBuilding(null); }}
            loggedInUser={loggedInUser}
          />
        </>
      );
    }
    return (
      <>
        {scopedRecords && <ScopeBanner count={scopedRecords.length} onClear={clearScope} />}
        <DashboardBuilder
          templateId={building.templateId}
          initial={building.initial}
          options={options}
          records={records}
          onClose={() => setBuilding(null)}
          onSave={handleSave}
          onExport={async (config) => {
            const logoUri = await fetchLogoDataUri();
            const html = buildDashboardHtml(config, logoUri);
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const safeName = (config.name || 'dashboard').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 140) || 'dashboard';
            a.href = url; a.download = `${safeName}.html`;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
          }}
          lockedClient={lockedClient}
          defaultClient={!lockedClient && loginClient ? loginClient : undefined}
        />
      </>
    );
  }

  return (
    <>
      {scopedRecords && <ScopeBanner count={scopedRecords.length} onClear={clearScope} />}
      {/* Slide panel: Value at a Glance / Lifetime Value with shared filters */}
      {records.length > 0 && (
        <div style={{ marginBottom: 28, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.10)' }}>
          {/* Tab bar */}
          <div style={{ background: '#001941', borderRadius: '12px 12px 0 0', padding: '10px 16px 0', display: 'flex', gap: 4 }}>
            {[
              { id: 'vag', label: 'Value at a Glance' },
              { id: 'ltv', label: 'Lifetime Value' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveSlide(tab.id)}
                style={{
                  padding: '7px 16px', borderRadius: '8px 8px 0 0',
                  border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: activeSlide === tab.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: activeSlide === tab.id ? '#fff' : '#aab4c4',
                  borderBottom: activeSlide === tab.id ? '2px solid #ffad00' : '2px solid transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {activeSlide === 'vag'
            ? <ValueAtAGlance
                records={records}
                loginClient={loginClient}
                selectedClient={slideClient}
                onClientChange={setSlideClient}
                fromYear={slideFromYear}
                onFromYearChange={setSlideFromYear}
                toYear={slideToYear}
                onToYearChange={setSlideToYear}
              />
            : <LifetimeValueSlide
                records={records}
                loginClient={loginClient}
                selectedClient={slideClient}
                onClientChange={setSlideClient}
                fromYear={slideFromYear}
                onFromYearChange={setSlideFromYear}
                toYear={slideToYear}
                onToYearChange={setSlideToYear}
              />
          }
        </div>
      )}
      <button
        onClick={() => setBuilding({ templateId: 'custom', initial: null })}
        style={{
          display: 'flex', alignItems: 'center', gap: 14, width: '100%',
          textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer',
          background: 'var(--surface)', border: '2px dashed var(--gold)',
          borderRadius: 'var(--radius-card)', padding: '14px 18px', marginBottom: 22,
        }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 44, height: 44, borderRadius: 10, background: 'rgba(255,173,0,0.12)', flexShrink: 0,
        }}>
          <i className="ti ti-sliders" style={{ fontSize: 24, color: 'var(--gold)' }} aria-hidden="true" />
        </span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>Build a custom dashboard</span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>Mix any combination of clients, publishers, years, and metrics.</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>
          Custom filters <i className="ti ti-arrow-right" aria-hidden="true" />
        </span>
      </button>

      {/* ── Saved dashboards header with client scope ── */}
      {(() => {
        const hasScope = Boolean(loginClient) && !showAllClients;
        const searchQ = clientSearch.trim().toLowerCase();
        const visibleList = hasScope
          ? savedList.filter(d => !d.client || d.client.toLowerCase() === loginClient.toLowerCase())
          : searchQ
            ? savedList.filter(d => (d.name + ' ' + (d.client || '') + ' ' + (d.sub || '')).toLowerCase().includes(searchQ))
            : savedList;
        const hiddenCount = savedList.length - visibleList.length;

        return (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Saved Dashboards</div>
              {loginClient && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  {!showAllClients ? (
                    <>
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        Showing: <strong style={{ color: 'var(--navy)' }}>{loginClient}</strong>
                        {hiddenCount > 0 && <> · {hiddenCount} hidden</>}
                      </span>
                      <button
                        className="btn ghost small"
                        onClick={() => setShowAllClients(true)}
                        style={{ fontSize: 11.5 }}
                      >
                        Show all clients
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={clientSearch}
                        onChange={e => setClientSearch(e.target.value)}
                        placeholder="Search dashboards…"
                        style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', width: 180 }}
                      />
                      <button
                        className="btn ghost small"
                        onClick={() => { setShowAllClients(false); setClientSearch(''); }}
                        style={{ fontSize: 11.5, color: 'var(--blue)' }}
                      >
                        <i className="ti ti-arrow-back-up" /> Back to {loginClient}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="card" style={{ padding: 14 }}>
              {loading ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Loading records…</p>
              ) : visibleList.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  {loginClient && !showAllClients
                    ? <>No saved dashboards for <strong>{loginClient}</strong> yet. Build one above.</>
                    : 'No saved dashboards yet. Build one above to get started.'}
                </p>
              ) : visibleList.map(d => {
          const reopenable = !d.seed && d.templateId;
          const isAuto = d.type === 'auto' || d.type === 'custom';
          const clickable = reopenable || isAuto;
          const handleOpen = () => {
            if (isAuto) setViewingAuto(d);
            else if (reopenable) setBuilding({ templateId: d.templateId, initial: d });
          };
          const isNew = d.id === highlightId;
          return (
            <div
              className="list-row"
              key={d.id}
              onClick={clickable ? handleOpen : undefined}
              style={{ cursor: clickable ? 'pointer' : 'default', ...(isNew ? { outline: '2px solid #00875a', outlineOffset: -2, borderRadius: 10, background: 'rgba(0,135,90,.06)' } : {}) }}
              title={clickable ? 'Open dashboard' : undefined}
            >
              <div>
                <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {d.name}
                  {isNew && <span style={{ fontSize: 10, fontWeight: 700, background: '#00875a', color: '#fff', borderRadius: 20, padding: '1px 8px', letterSpacing: '.04em' }}>NEW</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.sub}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Badge color={d.badgeColor}>{d.badge}</Badge>
                {isAuto && (
                  <span style={{ fontSize:11, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:4 }}>
                    <i className="ti ti-eye" style={{ fontSize:13 }} /> View
                  </span>
                )}
                {reopenable && (
                  <button
                    className="btn ghost small"
                    onClick={(e) => { e.stopPropagation(); setBuilding({ templateId: d.templateId, initial: d }); }}
                    aria-label="Edit dashboard"
                  >
                    <i className="ti ti-pencil" aria-hidden="true" />
                  </button>
                )}
                {reopenable && (
                  <button
                    className="btn ghost small"
                    onClick={(e) => handleExport(d, e)}
                    aria-label="Export dashboard"
                  >
                    <i className="ti ti-table-export" aria-hidden="true" />
                  </button>
                )}
                {!d.seed && (
                  <button
                    className="btn ghost small"
                    onClick={(e) => handleDelete(d.id, e)}
                    aria-label="Delete dashboard"
                  >
                    <i className="ti ti-trash" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          );
              })}
            </div>
          </>
        );
      })()}
    </>
  );
}
