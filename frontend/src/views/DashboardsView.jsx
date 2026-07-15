import React, { useState, useEffect, useMemo, useRef } from 'react';
import Badge from '../components/Badge';
import { SAVED_DASHBOARDS } from '../data';
import { getRecords } from '../services/api';
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
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* ignore corrupt storage */ }
  // Seed (display-only) from the mock list when nothing is saved yet.
  return SAVED_DASHBOARDS.map((d, i) => ({
    id: `seed-${i}`, name: d.name, sub: d.sub, badge: d.badge,
    badgeColor: d.badgeColor, seed: true,
  }));
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
      <img src="/anglepoint-logo.png" alt="Anglepoint" style={{ height: 26 }} />
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
function DashboardBuilder({ templateId, options, records, initial, onClose, onSave }) {
  const seed = useMemo(
    () => initial || defaultsFor(templateId, options),
    [templateId, options, initial],
  );

  const [name, setName]             = useState(seed.name || '');
  const [client, setClient]         = useState(seed.client || (options.clients[0] || ''));
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn ghost small" onClick={onClose}><i className="ti ti-arrow-left" aria-hidden="true" /> All dashboards</button>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>{TITLES[templateId]}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{template.sub}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave} disabled={!canSave}>
            {saved
              ? <>Saved <i className="ti ti-check" aria-hidden="true" /></>
              : <>Save Dashboard <i className="ti ti-device-floppy" aria-hidden="true" /></>}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* ── Left: configuration ── */}
        <div style={{ flex: '1 1 320px', minWidth: 280, maxWidth: 460 }}>
          <div className="card">
            <div className="card-title"><i className="ti ti-adjustments" aria-hidden="true" /> Configure</div>

            <div className="field-group">
              <label className="field-label">Dashboard name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={`e.g. ${client || 'Client'} ${TITLES[templateId]}`} />
            </div>

            <div className="field-group">
              <label className="field-label">Client</label>
              {options.clients.length === 0 ? (
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
        </div>

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

// ─── Dashboards view ──────────────────────────────────────────────────────────
export default function DashboardsView({ seed = null, onSeedConsumed }) {
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [savedList, setSavedList] = useState(loadSaved);
  const [building, setBuilding] = useState(null); // { templateId, initial }
  // When set, the view is scoped to a filtered subset handed over from the
  // Tracker rather than the full dataset. Null = work off every record.
  const [scopedRecords, setScopedRecords] = useState(null);

  useEffect(() => {
    getRecords()
      .then(data => setAllRecords(Array.isArray(data) ? data : []))
      .catch(() => setAllRecords([]))
      .finally(() => setLoading(false));
  }, []);

  // The Tracker handed over a filtered subset: scope to it and jump straight
  // into the custom builder. Consume the seed so a later normal visit resets.
  useEffect(() => {
    if (seed && seed.length) {
      setScopedRecords(seed);
      setBuilding({ templateId: 'custom', initial: null });
      onSeedConsumed?.();
    }
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const res = await fetch('/anglepoint-logo.png');
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

  if (building) {
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
        />
      </>
    );
  }

  return (
    <>
      {scopedRecords && <ScopeBanner count={scopedRecords.length} onClear={clearScope} />}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)' }}>Create a dashboard</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.45 }}>
          Start from a <strong>preset template</strong>, or build one from scratch with <strong>custom filters</strong>. Either way you'll configure the details and see a live preview before saving.
        </div>
      </div>

      {/* ── Preset templates ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--text-muted)' }}>Preset templates</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <div className="db-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 14 }}>
        {TEMPLATES.filter(t => t.id !== 'custom').map(t => (
          <button key={t.id} className="db-card" style={{ padding: 16 }} onClick={() => setBuilding({ templateId: t.id, initial: null })}>
            <div className="db-card-head" style={{ marginBottom: 6 }}>
              <i className={`ti ${t.icon}`} aria-hidden="true" />
              <div className="db-card-title">{t.title}</div>
            </div>
            <div className="db-card-sub">{t.sub}</div>
            <div className="db-tags" style={{ marginTop: 10 }}>
              {t.tags.map(tag => <Badge key={tag} color={t.tagColor || 'navy'}>{tag}</Badge>)}
            </div>
          </button>
        ))}
      </div>

      {/* ── Or build your own ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--text-muted)' }}>Or build your own</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
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

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Saved Dashboards</div>
      <div className="card" style={{ padding: 14 }}>
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Loading records…</p>
        ) : savedList.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No saved dashboards yet. Pick a template above to build one.</p>
        ) : savedList.map(d => {
          const reopenable = !d.seed && d.templateId;
          return (
            <div
              className="list-row"
              key={d.id}
              onClick={reopenable ? () => setBuilding({ templateId: d.templateId, initial: d }) : undefined}
              style={{ cursor: reopenable ? 'pointer' : 'default' }}
              title={reopenable ? 'Open dashboard' : undefined}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{d.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.sub}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Badge color={d.badgeColor}>{d.badge}</Badge>
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
}
