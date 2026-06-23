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

// ─── Small form primitives ────────────────────────────────────────────────────
function ToggleGroup({ options, value, onChange }) {
  return (
    <div className="toggle-group">
      {options.map(opt => (
        <button key={opt} className={`toggle-opt ${value === opt ? 'on' : ''}`} onClick={() => onChange(opt)}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function SegGroup({ options, selected, onToggle, render }) {
  return (
    <div className="seg">
      {options.map(opt => (
        <button key={opt} className={`seg-btn ${selected.includes(opt) ? 'on' : ''}`} onClick={() => onToggle(opt)}>
          {render ? render(opt) : opt}
        </button>
      ))}
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
  const [showPreview, setPreview]   = useState(Boolean(initial)); // reopened saved → show preview immediately
  const [saved, setSaved]           = useState(false);

  const toggleItem = (arr, setArr, item) =>
    setArr(arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]);

  const filterArgs = {
    client: client || null,
    publishers: pubMode === 'Select specific' ? selPubs : null,
    years:      yrMode  === 'Select specific' ? selYears : null,
  };
  const matched = useMemo(() => matchFilters(records, filterArgs),
    [records, client, pubMode, yrMode, selPubs, selYears]);

  const primaryMetric = selMetrics[0] || 'realized_savings';
  const groupField    = groupFieldFor(templateId, { pubMode, selPubs });
  const chartData     = useMemo(() => groupSum(matched, groupField, primaryMetric),
    [matched, groupField, primaryMetric]);
  const maxVal        = chartData.reduce((m, d) => Math.max(m, d.value), 0);

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button className="btn ghost small" onClick={onClose}><i className="ti ti-arrow-left" aria-hidden="true" /> All dashboards</button>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>Build: {TITLES[templateId]}</span>
      </div>

      <div className="card">
        <div className="card-title"><i className="ti ti-sliders" aria-hidden="true" /> Configure Filters</div>

        <div className="field-group">
          <label className="field-label">Dashboard name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Encova All Publishers 2025" />
        </div>

        <div className="field-group">
          <label className="field-label">Client</label>
          {options.clients.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No clients in the data yet.</p>
          ) : (
            <select value={client} onChange={e => setClient(e.target.value)}>
              {options.clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        <div className="field-group">
          <label className="field-label">Publisher</label>
          <ToggleGroup options={['All publishers','Select specific']} value={pubMode} onChange={setPubMode} />
          {pubMode === 'Select specific' && (
            options.publishers.length
              ? <SegGroup options={options.publishers} selected={selPubs} onToggle={item => toggleItem(selPubs, setSelPubs, item)} />
              : <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No publishers in the data yet.</p>
          )}
        </div>

        <div className="field-group">
          <label className="field-label">Year</label>
          <ToggleGroup options={['All years','Select specific']} value={yrMode} onChange={setYrMode} />
          {yrMode === 'Select specific' && (
            options.years.length
              ? <SegGroup options={options.years} selected={selYears} onToggle={item => toggleItem(selYears, setSelYears, item)} />
              : <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No years in the data yet.</p>
          )}
        </div>

        <div className="field-group">
          <label className="field-label">Metrics to display {selMetrics.length === 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· first is the chart metric</span>}</label>
          <SegGroup
            options={METRICS.map(m => m.key)}
            selected={selMetrics}
            onToggle={item => toggleItem(selMetrics, setSelMetrics, item)}
            render={labelFor}
          />
        </div>

        <div className="btn-row">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { setPreview(true); setSaved(false); }}>
            Preview Dashboard <i className="ti ti-arrow-right" aria-hidden="true" />
          </button>
        </div>
      </div>

      {showPreview && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Dashboard Preview</div>

          {matched.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>
              <i className="ti ti-database-off" aria-hidden="true" style={{ fontSize: 22, display: 'block', marginBottom: 8 }} />
              No records match these filters. Try widening the client, publisher, or year selection.
            </div>
          ) : (
            <>
              <div className="metric-grid">
                {(selMetrics.length ? selMetrics : ['realized_savings']).slice(0, 5).map(key => {
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
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No data for {labelFor(primaryMetric)} in the matched records.</p>
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

              <button className="btn primary" onClick={handleSave} disabled={saved}>
                {saved ? <>Saved <i className="ti ti-check" aria-hidden="true" /></> : <>Save Dashboard <i className="ti ti-device-floppy" aria-hidden="true" /></>}
              </button>
            </>
          )}
        </div>
      )}
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
