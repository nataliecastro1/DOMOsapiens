import React, { useState } from 'react';
import Badge from '../components/Badge';
import { ROI_ROWS, AUDIT_ROWS, SOURCE_FILE_ROWS, ROW_DETAILS } from '../data';

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
  const [detailIdx, setDetailIdx] = useState(null);

  const statusColor = (s) => s === 'Stored' ? 'green' : 'amber';
  const confColor   = (c) => parseInt(c) >= 92 ? 'green' : parseInt(c) >= 88 ? 'blue' : 'gold';

  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--blue)', marginBottom: 10, cursor: 'pointer' }} onClick={() => setDetailIdx(0)}>
        <i className="ti ti-info-circle" aria-hidden="true" /> Click any row to view full audit detail
      </p>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th><th>Client</th><th>Publisher</th><th>Year</th>
                <th>Total Savings</th><th>Net ROI</th><th>Confidence</th>
                <th>SME</th><th>Source File</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ROI_ROWS.map((row, i) => (
                <tr key={row.id} className="clickable" onClick={() => setDetailIdx(i)}>
                  <td style={{ color: 'var(--text-faint)' }}>{row.id}</td>
                  <td>{row.client}</td>
                  <td>{row.publisher}</td>
                  <td>{row.year}</td>
                  <td style={{ fontWeight: 600 }}>{row.savings}</td>
                  <td style={{ fontWeight: 600 }}>{row.roi}</td>
                  <td><Badge color={confColor(row.confidence)}>{row.confidence}</Badge></td>
                  <td>{row.sme}</td>
                  <td style={{ color: 'var(--blue)', fontSize: 11 }}>{row.sourceFile}</td>
                  <td><Badge color={statusColor(row.status)}>{row.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detailIdx !== null && (
        <RowDetailPanel detail={ROW_DETAILS[detailIdx]} onClose={() => setDetailIdx(null)} />
      )}
    </>
  );
}

// ─── Tab: Audit Log ───────────────────────────────────────────────────────────
function TabAuditLog() {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Timestamp</th><th>Client</th><th>Publisher</th><th>Year</th><th>SME</th><th>Decision</th><th>File selected</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {AUDIT_ROWS.map((r, i) => (
              <tr key={i}>
                <td style={{ color: 'var(--text-faint)' }}>{r.ts}</td>
                <td>{r.client}</td>
                <td>{r.publisher}</td>
                <td>{r.year}</td>
                <td>{r.sme}</td>
                <td><Badge color={r.decisionColor}>{r.decision}</Badge></td>
                <td style={{ fontSize: 11 }}>{r.file}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{r.notes}</td>
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
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Filename</th><th>Client</th><th>Publisher</th><th>Year</th><th>Version</th><th>Modified</th><th>Size</th><th>Used on</th><th>SME</th></tr>
          </thead>
          <tbody>
            {SOURCE_FILE_ROWS.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500, color: 'var(--blue)' }}>{r.filename}</td>
                <td>{r.client}</td>
                <td>{r.publisher}</td>
                <td>{r.year}</td>
                <td>{r.version}</td>
                <td>{r.modified}</td>
                <td>{r.size}</td>
                <td style={{ color: 'var(--text-faint)' }}>{r.usedOn}</td>
                <td>{r.sme}</td>
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
        <button className="btn small"><i className="ti ti-table-export" aria-hidden="true" /> Export .xlsx</button>
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
