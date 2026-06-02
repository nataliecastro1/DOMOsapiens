import React, { useState } from 'react';
import Badge from '../components/Badge';
import { CLIENTS, PUBLISHERS, YEARS, SAVED_DASHBOARDS } from '../data';

const TEMPLATES = [
  { id: 'client-all-pub', icon: 'ti-building',       title: 'Client — all publishers', sub: 'All publisher ROI for one client in a given year',     tags: ['1 client', 'All publishers', '1 year']         },
  { id: 'pub-all-years',  icon: 'ti-calendar-stats',  title: 'Publisher — all years',   sub: 'ROI trend for one publisher across all available years', tags: ['1 client', '1 publisher', 'All years']         },
  { id: 'full',           icon: 'ti-chart-line',      title: 'Full client history',     sub: 'All publishers × all years for one client',             tags: ['1 client', 'All publishers', 'All years']      },
  { id: 'custom',         icon: 'ti-sliders',         title: 'Custom filters',          sub: 'Any combination of clients, publishers, and years',      tags: ['Flexible'], tagColor: 'gold' },
];

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

function SegGroup({ options, selected, onToggle }) {
  return (
    <div className="seg">
      {options.map(opt => (
        <button key={opt} className={`seg-btn ${selected.includes(opt) ? 'on' : ''}`} onClick={() => onToggle(opt)}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function DashboardBuilder({ templateId, onClose }) {
  const titles = {
    'client-all-pub': 'Client — All Publishers',
    'pub-all-years':  'Publisher — All Years',
    'full':           'Full Client History',
    'custom':         'Custom Filters',
  };

  const [pubMode, setPubMode]       = useState('All publishers');
  const [yrMode, setYrMode]         = useState('All years');
  const [selPubs, setSelPubs]       = useState([...PUBLISHERS]);
  const [selYears, setSelYears]     = useState([...YEARS]);
  const [selMetrics, setSelMetrics] = useState(['Total savings', 'Net ROI', 'License spend']);
  const [showPreview, setPreview]   = useState(false);

  const toggleItem = (arr, setArr, item) =>
    setArr(arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item]);

  const METRICS = ['Total savings', 'Net ROI', 'License spend', 'Compliance risk', 'Support reduction'];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn ghost small" onClick={onClose}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> All dashboards
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>
          Build: {titles[templateId]}
        </span>
      </div>

      <div className="card">
        <div className="card-title">
          <i className="ti ti-sliders" aria-hidden="true" />
          Configure Filters
        </div>

        <div className="field-group">
          <label className="field-label">Dashboard name</label>
          <input type="text" placeholder="e.g. Encova All Publishers 2025" />
        </div>
        <div className="field-group">
          <label className="field-label">Client</label>
          <select>{CLIENTS.map(c => <option key={c}>{c}</option>)}</select>
        </div>

        <div className="field-group">
          <label className="field-label">Publisher</label>
          <ToggleGroup options={['All publishers', 'Select specific']} value={pubMode} onChange={setPubMode} />
          {pubMode === 'Select specific' && (
            <SegGroup options={PUBLISHERS} selected={selPubs} onToggle={item => toggleItem(selPubs, setSelPubs, item)} />
          )}
        </div>

        <div className="field-group">
          <label className="field-label">Year</label>
          <ToggleGroup options={['All years', 'Select specific']} value={yrMode} onChange={setYrMode} />
          {yrMode === 'Select specific' && (
            <SegGroup options={YEARS} selected={selYears} onToggle={item => toggleItem(selYears, setSelYears, item)} />
          )}
        </div>

        <div className="field-group">
          <label className="field-label">Metrics to display</label>
          <SegGroup options={METRICS} selected={selMetrics} onToggle={item => toggleItem(selMetrics, setSelMetrics, item)} />
        </div>

        <div className="btn-row">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => setPreview(true)}>
            Preview Dashboard <i className="ti ti-arrow-right" aria-hidden="true" />
          </button>
        </div>
      </div>

      {showPreview && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 14 }}>
            Dashboard Preview
          </div>
          <div className="metric-grid">
            <div className="metric-card">
              <div className="metric-label">Avg Total Savings</div>
              <div className="metric-value">$2.1M</div>
              <div className="metric-delta">across 4 publishers</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Best Net ROI</div>
              <div className="metric-value">$1.53M</div>
              <div className="metric-delta muted">Oracle · 2025</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Records</div>
              <div className="metric-value">12</div>
              <div className="metric-delta muted">matched rows</div>
            </div>
          </div>
          <div className="card">
            <div className="card-title">
              <i className="ti ti-chart-bar" aria-hidden="true" />
              Total Savings by Publisher — 2025
            </div>
            {[
              { label: 'Oracle',    pct: '80%', color: 'var(--navy)',       val: '$2.4M' },
              { label: 'Microsoft', pct: '55%', color: 'var(--blue)',       val: '$1.7M' },
              { label: 'SAP',       pct: '38%', color: 'var(--blue-light)', val: '$1.1M' },
              { label: 'IBM',       pct: '25%', color: 'var(--gold)',       val: '$740K' },
            ].map(b => (
              <div className="bar-row" key={b.label}>
                <span className="bar-label">{b.label}</span>
                <div className="bar-bg">
                  <div className="bar-fill" style={{ width: b.pct, background: b.color }} />
                </div>
                <span className="bar-val">{b.val}</span>
              </div>
            ))}
          </div>
          <button className="btn primary">
            Save Dashboard <i className="ti ti-device-floppy" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function DashboardsView() {
  const [buildingTemplate, setBuildingTemplate] = useState(null);

  if (buildingTemplate) {
    return <DashboardBuilder templateId={buildingTemplate} onClose={() => setBuildingTemplate(null)} />;
  }

  return (
    <>
      <div className="db-grid">
        {TEMPLATES.map(t => (
          <button key={t.id} className="db-card" onClick={() => setBuildingTemplate(t.id)}>
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

      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: 14 }}>
        Saved Dashboards
      </div>
      <div className="card" style={{ padding: '8px 28px' }}>
        {SAVED_DASHBOARDS.map(d => (
          <div className="list-row" key={d.name}>
            <div>
              <div style={{ fontWeight: 600 }}>{d.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{d.sub}</div>
            </div>
            <Badge color={d.badgeColor}>{d.badge}</Badge>
          </div>
        ))}
      </div>
    </>
  );
}
