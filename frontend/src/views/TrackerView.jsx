import React, { useState, useEffect } from 'react';
import Badge from '../components/Badge';
import { getRecords } from '../services/api';

// ─── Row Detail Panel ─────────────────────────────────────────────────────────
function RowDetailPanel({ detail, onClose }) {
  if (!detail) return null;
  return (
    <div className="detail-panel">
      <div className="detail-header">
        <span className="detail-header-title">{detail.title} — Audit Detail</span>
        <button className="detail-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="detail-body">
        <div>
          <div className="detail-section-title">SME Audit Trail</div>
          {[
            { label: 'File selected',    sub: `${detail.file} (${detail.ver})` },
            { label: `SME: ${detail.decision}`, sub: `${detail.sme} · ${detail.sme_ts}${detail.notes ? ` · "${detail.notes}"` : ''}` },
            { label: 'Extraction run',   sub: detail.extract_ts },
            { label: 'Stored to tracker',sub: detail.stored_ts },
          ].map((step, i) => (
            <React.Fragment key={i}>
              <div className="audit-step">
                <div className="audit-dot done" />
                <div>
                  <div className="audit-label">{step.label}</div>
                  <div className="audit-sub">{step.sub}</div>
                </div>
              </div>
              {i < 3 && <div className="audit-connector" />}
            </React.Fragment>
          ))}
        </div>
        <div>
          <div className="detail-section-title">Source File Reference</div>
          {[
            { key: 'Filename', val: detail.file },
            { key: 'Version',  val: detail.ver  },
            { key: 'Modified', val: detail.mod  },
            { key: 'Size',     val: detail.size },
            { key: 'Path',     val: detail.path },
          ].map(r => (
            <div className="source-row" key={r.key}>
              <span className="source-key">{r.key}</span>
              <span className="source-val" style={r.key === 'Path' ? { fontSize: 11, color: 'var(--text-muted)' } : {}}>{r.val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: ROI Data ────────────────────────────────────────────────────────────
function TabROIData() {
  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [detailRow, setDetailRow] = useState(null);

  useEffect(() => {
    getRecords()
      .then(data => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n) => n != null ? `$${Number(n).toLocaleString()}` : '—';
  const confColor = (c) => c >= 90 ? 'green' : c >= 75 ? 'amber' : 'red';

  const totalSavings = (r) => {
    const sum = [r.id_cost_avoidance, r.acc_cost_avoidance, r.id_cost_optimization,
                 r.acc_cost_optimization, r.realized_savings].reduce((a, v) => a + (v || 0), 0);
    return sum > 0 ? `$${sum.toLocaleString()}` : '—';
  };

  const toDetail = (r) => ({
    title:      r.client,
    file:       r.source_file || '—',
    ver:        '1.0',
    mod:        r.saved_at ? new Date(r.saved_at).toLocaleDateString() : '—',
    size:       '—',
    path:       r.source_file || '—',
    sme:        r.sme || '—',
    sme_ts:     r.saved_at ? new Date(r.saved_at).toLocaleString() : '—',
    decision:   'Approved',
    notes:      r.notes || '',
    extract_ts: r.saved_at ? new Date(r.saved_at).toLocaleString() : '—',
    stored_ts:  r.saved_at ? new Date(r.saved_at).toLocaleString() : '—',
  });

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading records…</p>;

  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--blue)', marginBottom: 10 }}>
        <i className="ti ti-info-circle" aria-hidden="true" /> Click any row to view full audit detail
      </p>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th><th>Client</th><th>Publisher</th><th>Year</th>
                <th>Total Savings</th><th>Confidence</th>
                <th>SME</th><th>Source File</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No records yet. Complete an extraction to see data here.</td></tr>
              ) : records.map((r, i) => (
                <tr key={i} className="clickable" onClick={() => setDetailRow(toDetail(r))}>
                  <td style={{ color: 'var(--text-faint)' }}>{i + 1}</td>
                  <td>{r.client}</td>
                  <td>{r.publisher}</td>
                  <td>{r.year}</td>
                  <td style={{ fontWeight: 600 }}>{totalSavings(r)}</td>
                  <td>{r.confidence != null ? <Badge color={confColor(r.confidence)}>{r.confidence}%</Badge> : '—'}</td>
                  <td>{r.sme || '—'}</td>
                  <td style={{ fontSize: 11 }}>
                    {r.stored_name
                      ? <a href={`http://localhost:8000/api/uploads/${r.stored_name}`} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>{r.source_file || r.stored_name}</a>
                      : <span style={{ color: 'var(--text-muted)' }}>{r.source_file || '—'}</span>}
                  </td>
                  <td><Badge color="green">Stored</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detailRow && (
        <RowDetailPanel detail={detailRow} onClose={() => setDetailRow(null)} />
      )}
    </>
  );
}

// ─── Tab: Audit Log ───────────────────────────────────────────────────────────
function TabAuditLog() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRecords()
      .then(data => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Timestamp</th><th>Client</th><th>Publisher</th><th>Year</th><th>SME</th><th>Decision</th><th>File selected</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No audit entries yet.</td></tr>
            ) : records.map((r, i) => (
              <tr key={i}>
                <td style={{ color: 'var(--text-faint)' }}>{r.saved_at ? new Date(r.saved_at).toLocaleString() : '—'}</td>
                <td>{r.client}</td>
                <td>{r.publisher}</td>
                <td>{r.year}</td>
                <td>{r.sme || '—'}</td>
                <td><Badge color="green">Approved</Badge></td>
                <td style={{ fontSize: 11 }}>{r.source_file || '—'}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{r.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Source Files ────────────────────────────────────────────────────────
function TabSourceFiles() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRecords()
      .then(data => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Filename</th><th>Client</th><th>Publisher</th><th>Year</th><th>Used on</th><th>SME</th></tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No source files yet.</td></tr>
            ) : records.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>
                    {r.stored_name
                      ? <a href={`http://localhost:8000/api/uploads/${r.stored_name}`} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>{r.source_file || r.stored_name}</a>
                      : <span style={{ color: 'var(--text-muted)' }}>{r.source_file || '—'}</span>}
                  </td>
                <td>{r.client}</td>
                <td>{r.publisher}</td>
                <td>{r.year}</td>
                <td style={{ color: 'var(--text-faint)' }}>{r.saved_at ? new Date(r.saved_at).toLocaleDateString() : '—'}</td>
                <td>{r.sme || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── TrackerView ──────────────────────────────────────────────────────────────
const TABS = [
  { id: 'data',    label: 'ROI Data'      },
  { id: 'audit',   label: 'SME Audit Log' },
  { id: 'sources', label: 'Source Files'  },
];

export default function TrackerView() {
  const [activeTab, setActiveTab] = useState('data');

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 4 }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Stored in <strong style={{ color: 'var(--text)' }}>Client_ROI_Tracker.xlsx</strong> &nbsp;·&nbsp;
          3 sheets: <strong style={{ color: 'var(--text)' }}>All_ROI_Data</strong>,{' '}
          <strong style={{ color: 'var(--text)' }}>SME_Audit_Log</strong>,{' '}
          <strong style={{ color: 'var(--text)' }}>Source_File_Log</strong>
        </p>
        <button className="btn ghost small"><i className="ti ti-table-export" aria-hidden="true" /> Export .xlsx</button>
      </div>

      <div className="tab-bar">
        {TABS.map(t => (
          <button key={t.id} className={`tab-item ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'data'    && <TabROIData    />}
      {activeTab === 'audit'   && <TabAuditLog   />}
      {activeTab === 'sources' && <TabSourceFiles />}
    </>
  );
}
