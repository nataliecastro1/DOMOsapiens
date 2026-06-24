import React, { useState, useEffect, useMemo } from 'react';
import Badge from '../components/Badge';
import { SAVED_DASHBOARDS } from '../data';
import { getRecords } from '../services/api';
import {
  METRICS, labelFor, deriveOptions, sum, countWithMetric,
  formatCurrency, matchFilters, groupSum,
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
    selMetrics: ['realized_savings'],
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
  const [selMetrics, setSelMetrics] = useState(seed.selMetrics?.length ? seed.selMetrics : ['realized_savings']);
  const [saved, setSaved]           = useState(false);

  // Any edit invalidates the "Saved" confirmation.
  useEffect(() => { setSaved(false); }, [name, client, pubMode, yrMode, selPubs, selYears, selMetrics]);

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

  // When filters change, drop any selected metric that no longer has data; if that
  // empties the selection, fall back to the first metric that does have data.
  useEffect(() => {
    setSelMetrics(prev => {
      const kept = prev.filter(k => metricAvailable[k]);
      if (kept.length) return kept.length === prev.length ? prev : kept;
      const first = METRICS.find(m => metricAvailable[m.key])?.key;
      return first ? [first] : [];
    });
  }, [metricAvailable]);

  const primaryMetric = selMetrics[0]
    || METRICS.find(m => metricAvailable[m.key])?.key
    || 'realized_savings';
  const groupField    = groupFieldFor(templateId, { pubMode, selPubs });
  const chartData     = useMemo(() => groupSum(matched, groupField, primaryMetric),
    [matched, groupField, primaryMetric]);
  const maxVal        = chartData.reduce((m, d) => Math.max(m, d.value), 0);

  const pubScope = pubMode === 'All publishers'
    ? 'All publishers'
    : `${selPubs.length} publisher${selPubs.length === 1 ? '' : 's'}`;
  const yrScope = yrMode === 'All years'
    ? 'All years'
    : selYears.length === 1 ? String(selYears[0]) : `${selYears.length} years`;

  const canSave = Boolean(client) && selMetrics.length > 0
    && (!needsYear || selYears.length > 0)
    && (!needsPub  || selPubs.length  > 0);

  const buildConfig = () => ({
    id: initial?.id && !initial?.seed ? initial.id : `dash-${client}-${templateId}-${selMetrics.join('-')}-${matched.length}`,
    name: name.trim() || `${client || 'Untitled'} — ${TITLES[templateId]}`,
    templateId, client, pubMode, yrMode, selPubs, selYears, selMetrics,
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
                <select value={client} onChange={e => setClient(e.target.value)}>
                  {options.clients.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
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

            {/* Metrics */}
            <div className="field-group" style={{ marginBottom: 0 }}>
              <label className="field-label">Metrics</label>
              <Chips
                options={METRICS.map(m => m.key)}
                selected={selMetrics}
                onToggle={item => toggleItem(selMetrics, setSelMetrics, item)}
                render={labelFor}
                primary={primaryMetric}
                isDisabled={key => !metricAvailable[key]}
              />
              <InfoNote>The first selected metric (<i className="ti ti-chart-bar" aria-hidden="true" />) drives the chart. Pick more to add summary cards.</InfoNote>
            </div>
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
              <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                {selMetrics.slice(0, 5).map(key => {
                  const has = countWithMetric(matched, key);
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
                <div className="metric-card">
                  <div className="metric-label">Matched Records</div>
                  <div className="metric-value">{matched.length}</div>
                  <div className="metric-delta muted">{client || 'all clients'}</div>
                </div>
              </div>

              <div className="card">
                <div className="card-title">
                  <i className="ti ti-chart-bar" aria-hidden="true" /> {labelFor(primaryMetric)} by {groupField === 'year' ? 'Year' : 'Publisher'}
                </div>
                {maxVal <= 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No data for {labelFor(primaryMetric)} in the matched records.</p>
                ) : (
                  chartData.map((d, i) => (
                    <div className="bar-row" key={d.label}>
                      <span className="bar-label">{d.label}</span>
                      <div className="bar-bg">
                        <div className="bar-fill" style={{ width: `${Math.round((d.value / maxVal) * 100)}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
                      </div>
                      <span className="bar-val">{formatCurrency(d.value)}</span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboards view ──────────────────────────────────────────────────────────
export default function DashboardsView() {
  const [records, setRecords]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [savedList, setSavedList] = useState(loadSaved);
  const [building, setBuilding] = useState(null); // { templateId, initial }

  useEffect(() => {
    getRecords()
      .then(data => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

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
    const primaryMetric = dash.selMetrics?.[0] || 'realized_savings';
    const groupField = groupFieldFor(dash.templateId, dash);
    const chartData = groupSum(matched, groupField, primaryMetric);
    const maxVal = chartData.reduce((m, d) => Math.max(m, d.value), 0);
    const colors = ['#001941', '#005f86', '#0089af', '#ffad00'];

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

    // Metric summary cards (mirrors the builder preview).
    const metricKeys = (dash.selMetrics?.length ? dash.selMetrics : ['realized_savings']).slice(0, 5);
    const metricCards = metricKeys.map(key => {
      const has = countWithMetric(matched, key);
      const value = has ? formatCurrency(sum(matched, key)) : '—';
      const delta = has ? `across ${has} record${has === 1 ? '' : 's'}` : 'no data for this metric';
      const deltaColor = has ? '#ffad00' : 'rgba(255,255,255,0.35)';
      return `      <div class="metric-card">
        <div class="metric-label">${escapeHtml(labelFor(key))}</div>
        <div class="metric-value">${escapeHtml(value)}</div>
        <div class="metric-delta" style="color:${deltaColor}">${escapeHtml(delta)}</div>
      </div>`;
    }).join('\n');

    const recordsCard = `      <div class="metric-card">
        <div class="metric-label">Matched Records</div>
        <div class="metric-value">${matched.length}</div>
        <div class="metric-delta" style="color:rgba(255,255,255,0.35)">${escapeHtml(dash.client || 'all clients')}</div>
      </div>`;

    // Bar chart (mirrors the builder preview).
    const bars = maxVal <= 0
      ? `<p style="font-size:14px;color:#5a6e8c;margin:0">No data for ${escapeHtml(labelFor(primaryMetric))} in the matched records.</p>`
      : chartData.map((d, i) => `      <div class="bar-row">
        <span class="bar-label">${escapeHtml(d.label)}</span>
        <div class="bar-bg"><div class="bar-fill" style="width:${Math.round((d.value / maxVal) * 100)}%;background:${colors[i % colors.length]}"></div></div>
        <span class="bar-val">${escapeHtml(formatCurrency(d.value))}</span>
      </div>`).join('\n');

    const body = matched.length === 0
      ? `  <div class="card" style="text-align:center;color:#5a6e8c;padding:40px">No records match these filters.</div>`
      : `  <div class="metric-grid">
${metricCards}
${recordsCard}
  </div>

  <div class="card">
    <div class="card-title">${escapeHtml(labelFor(primaryMetric))} by ${groupField === 'year' ? 'Year' : 'Publisher'}</div>
${bars}
  </div>`;

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
      <DashboardBuilder
        templateId={building.templateId}
        initial={building.initial}
        options={options}
        records={records}
        onClose={() => setBuilding(null)}
        onSave={handleSave}
      />
    );
  }

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Start from a template</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Pick a layout — you'll configure filters and see a live preview before saving.</div>
      </div>
      <div className="db-grid">
        {TEMPLATES.map(t => (
          <button key={t.id} className="db-card" onClick={() => setBuilding({ templateId: t.id, initial: null })}>
            <div className="db-card-head">
              <i className={`ti ${t.icon}`} aria-hidden="true" />
              <div className="db-card-title">{t.title}</div>
            </div>
            <div className="db-card-sub">{t.sub}</div>
            <div className="db-tags">
              {t.tags.map(tag => <Badge key={tag} color={t.tagColor || 'navy'}>{tag}</Badge>)}
            </div>
          </button>
        ))}
      </div>

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
