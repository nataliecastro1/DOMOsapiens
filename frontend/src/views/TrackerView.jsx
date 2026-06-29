import React, { useState, useEffect, useMemo, useRef } from 'react';
import Badge from '../components/Badge';
import { getRecords, downloadRecordsAsXlsx, updateRecord, getAuditLog } from '../services/api';
import React, { useState, useEffect, useRef } from 'react';
import Badge from '../components/Badge';
import { getRecords } from '../services/api';
import ExecutiveSummaryReport from '../components/ExecutiveSummaryReport';

// ─── Column model ─────────────────────────────────────────────────────────────
// `editable` numeric metrics can be corrected inline (some ROI fields aren't
// known until later). Identifying columns stay read-only.
const COLUMNS = [
  { key: 'client',                label: 'Client',                         type: 'text' },
  { key: 'publisher',             label: 'Publisher',                      type: 'text' },
  { key: 'year',                  label: 'Year',                           type: 'text' },
  { key: 'identified_risk',       label: 'Identified Risk',                type: 'num', editable: true },
  { key: 'id_cost_avoidance',     label: 'Identified Cost Avoidance',      type: 'num', editable: true },
  { key: 'acc_cost_avoidance',    label: 'Accomplished Cost Avoidance',    type: 'num', editable: true },
  { key: 'id_cost_optimization',  label: 'Identified Cost Optimization',   type: 'num', editable: true },
  { key: 'acc_cost_optimization', label: 'Accomplished Cost Optimization', type: 'num', editable: true },
  { key: 'realized_savings',      label: 'Realized Savings',               type: 'num', editable: true },
  { key: 'contract_spend',        label: 'Contract Spend',                 type: 'num', editable: true },
  { key: 'confidence',            label: 'Confidence',                     type: 'conf' },
  { key: 'sme',                   label: 'SME',                            type: 'text' },
  { key: 'source_file',           label: 'Source File',                    type: 'file' },
];

const COL_BY_KEY = Object.fromEntries(COLUMNS.map(c => [c.key, c]));

// Metrics that can carry per-field provenance (mirrors the backend export).
const PROV_METRICS = [
  ['identified_risk',       'Identified Risk'],
  ['id_cost_avoidance',     'Identified Cost Avoidance'],
  ['acc_cost_avoidance',    'Accomplished Cost Avoidance'],
  ['id_cost_optimization',  'Identified Cost Optimization'],
  ['acc_cost_optimization', 'Accomplished Cost Optimization'],
  ['realized_savings',      'Realized Savings'],
  ['contract_spend',        'Contract Spend'],
];

const COL_STORAGE = 'domosapiens.tracker.columns';

function loadColPrefs() {
  const allKeys = COLUMNS.map(c => c.key);
  try {
    const raw = localStorage.getItem(COL_STORAGE);
    if (raw) {
      const p = JSON.parse(raw);
      // Reconcile saved prefs with the current column set (add new, drop gone).
      const order = (p.order || []).filter(k => allKeys.includes(k));
      for (const k of allKeys) if (!order.includes(k)) order.push(k);
      const hidden = (p.hidden || []).filter(k => allKeys.includes(k));
      return { order, hidden };
    }
  } catch { /* ignore corrupt prefs */ }
  return { order: allKeys, hidden: [] };
}

const fmtAmount = (n) => {
  if (n == null || n === '') return '—';
  const num = Number(String(n).replace(/[$,\s]/g, ''));
  return Number.isNaN(num) ? String(n) : `$${num.toLocaleString()}`;
};
const confColor = (c) => (c >= 90 ? 'green' : c >= 75 ? 'amber' : 'red');

// ─── Columns menu (show/hide) ──────────────────────────────────────────────────
function ColumnsMenu({ prefs, onToggle, onReset }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn ghost small" onClick={() => setOpen(o => !o)}>
        <i className="ti ti-columns-3" aria-hidden="true" /> Columns
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '110%', zIndex: 30,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 10, minWidth: 240,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>Show columns</span>
            <button onClick={onReset} style={{ border: 'none', background: 'none', color: 'var(--blue)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Reset</button>
          </div>
          {COLUMNS.map(c => (
            <label key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8, padding: '4px 2px', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
              <input
                type="checkbox"
                checked={!prefs.hidden.includes(c.key)}
                onChange={() => onToggle(c.key)}
                style={{ width: 'auto', flexShrink: 0, margin: 0, cursor: 'pointer' }}
              />
              <span style={{ flex: 1 }}>{c.label}</span>
            </label>
          ))}
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
            Tip: drag a column header to reorder.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: ROI Data (editable) ──────────────────────────────────────────────────
function TabROIData() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits]     = useState({});        // { recordId: { field: stringValue } }
  const [editingCell, setEditingCell] = useState(null); // { rid, key }
  const [colPrefs, setColPrefs] = useState(loadColPrefs);
  const [note, setNote]   = useState('');
  const [editor, setEditor] = useState('');
  const [saving, setSaving] = useState(false);
  const dragKey = useRef(null);
// ─── Executive Summary Drawer ─────────────────────────────────────────────────
function ExecSummaryDrawer({ record, onClose }) {
  const summary  = record?.executive_summary || null;
  const printRef = useRef(null);

  const handleDownloadPDF = () => {
    import('html2pdf.js').then(mod => {
      const html2pdf = mod.default;
      const name = [record.client, record.publisher, record.year].filter(Boolean).join('_') || 'ROI';
      html2pdf()
        .set({
          margin: [12, 12, 12, 12],
          filename: `${name}_Executive_Summary.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        })
        .from(printRef.current)
        .save();
    });
  };

  if (!record) return null;

  const subtitle = [record.client, record.publisher, record.year].filter(Boolean).join(' · ');

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,25,65,0.45)',
          zIndex: 200, backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(780px, 92vw)',
        background: 'var(--bg)',
        zIndex: 201,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.25)',
        animation: 'slideInRight 0.25s ease',
      }}>
        {/* Drawer header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 24px', borderBottom: '1px solid var(--border)',
          background: 'var(--surface)', flexShrink: 0,
        }}>
          <i className="ti ti-file-description" style={{ fontSize: 20, color: 'var(--blue)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>Executive Summary</div>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</div>}
          </div>
          <button
            onClick={handleDownloadPDF}
            disabled={!summary}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: summary ? 'var(--blue)' : 'var(--border)',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: summary ? 'pointer' : 'not-allowed',
            }}
          >
            <i className="ti ti-file-type-pdf" /> Download PDF
          </button>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}
          >
            <i className="ti ti-x" />
          </button>
        </div>

        {/* Drawer body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {summary ? (
            <ExecutiveSummaryReport
              summary={summary}
              subtitle={subtitle}
              client={record.client || ''}
              publisher={record.publisher || ''}
              innerRef={printRef}
            />
          ) : (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: 240, gap: 14, color: 'var(--text-muted)',
              textAlign: 'center',
            }}>
              <i className="ti ti-file-off" style={{ fontSize: 40, opacity: 0.35 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, color: 'var(--navy)' }}>
                  No executive summary saved yet
                </div>
                <div style={{ fontSize: 13 }}>
                  Complete the full extraction flow for this record —<br />
                  the summary is generated and saved automatically at the Done step.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Tab: ROI Data ────────────────────────────────────────────────────────────
function TabROIData() {
  const [records, setRecords]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [detailRow, setDetailRow]   = useState(null);
  const [summaryRecord, setSummaryRecord] = useState(null);

  const load = () => getRecords()
    .then(data => setRecords(Array.isArray(data) ? data : []))
    .catch(() => setRecords([]))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const recById = useMemo(() => Object.fromEntries(records.map(r => [r.record_id, r])), [records]);

  const visibleCols = useMemo(
    () => colPrefs.order.map(k => COL_BY_KEY[k]).filter(c => c && !colPrefs.hidden.includes(c.key)),
    [colPrefs],
  );

  const persistCols = (next) => {
    setColPrefs(next);
    try { localStorage.setItem(COL_STORAGE, JSON.stringify(next)); } catch { /* quota */ }
  };
  const toggleHidden = (key) => persistCols({
    ...colPrefs,
    hidden: colPrefs.hidden.includes(key) ? colPrefs.hidden.filter(k => k !== key) : [...colPrefs.hidden, key],
  });
  const resetCols = () => persistCols({ order: COLUMNS.map(c => c.key), hidden: [] });
  const reorder = (fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    const order = [...colPrefs.order];
    const fi = order.indexOf(fromKey), ti = order.indexOf(toKey);
    if (fi < 0 || ti < 0) return;
    order.splice(fi, 1);
    order.splice(ti, 0, fromKey);
    persistCols({ ...colPrefs, order });
  };

  const cellRaw = (rid, key) => {
    const e = edits[rid];
    return e && key in e ? e[key] : recById[rid]?.[key];
  };
  const isEdited = (rid, key) => {
    const e = edits[rid];
    if (!e || !(key in e)) return false;
    return String(e[key] ?? '') !== String(recById[rid]?.[key] ?? '');
  };
  const setEdit = (rid, key, value) => setEdits(prev => ({ ...prev, [rid]: { ...(prev[rid] || {}), [key]: value } }));
  const revertCell = (rid, key) => setEdits(prev => {
    const fm = { ...(prev[rid] || {}) };
    delete fm[key];
    const next = { ...prev };
    if (Object.keys(fm).length) next[rid] = fm; else delete next[rid];
    return next;
  });

  const changeCount = useMemo(() => {
    let n = 0;
    for (const [rid, fm] of Object.entries(edits))
      for (const k of Object.keys(fm)) if (isEdited(rid, k)) n++;
    return n;
  }, [edits, records]);

  const discard = () => { setEdits({}); setNote(''); setEditingCell(null); };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [rid, fm] of Object.entries(edits)) {
        const changes = {};
        for (const [k, v] of Object.entries(fm)) {
          if (!isEdited(rid, k)) continue;
          const col = COL_BY_KEY[k];
          let parsed = v;
          if (col?.type === 'num') {
            const s = String(v).replace(/[$,\s]/g, '');
            if (s === '') { parsed = null; }
            else { parsed = Number(s); if (Number.isNaN(parsed)) continue; }
          }
          changes[k] = parsed;
        }
        if (Object.keys(changes).length) {
          await updateRecord(rid, { changes, user: editor, note });
        }
      }
      await load();
      discard();
    } catch (e) {
      console.error('[Tracker] save failed:', e);
      alert(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const renderCell = (record, col) => {
    const rid = record.record_id;
    const editing = editingCell && editingCell.rid === rid && editingCell.key === col.key;
    const edited = isEdited(rid, col.key);
    const raw = cellRaw(rid, col.key);

    if (col.editable) {
      if (editing) {
        return (
          <input
            autoFocus
            defaultValue={raw ?? ''}
            className="cell-input"
            onChange={(e) => setEdit(rid, col.key, e.target.value)}
            onBlur={() => setEditingCell(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.currentTarget.blur(); }
              if (e.key === 'Escape') { revertCell(rid, col.key); setEditingCell(null); }
            }}
            style={{ width: '100%', font: 'inherit', padding: '2px 4px', border: '1px solid var(--blue)', borderRadius: 4, textAlign: 'right' }}
          />
        );
      }
      return (
        <span
          onClick={() => setEditingCell({ rid, key: col.key })}
          title="Click to edit"
          style={{
            display: 'block', cursor: 'pointer', borderRadius: 4, padding: '2px 4px', textAlign: 'right',
            background: edited ? 'rgba(255,173,0,0.18)' : 'transparent',
            outline: edited ? '1px solid var(--gold)' : 'none',
          }}
        >
          {edited && <i className="ti ti-point-filled" style={{ color: 'var(--gold)', fontSize: 10 }} aria-hidden="true" />}
          {fmtAmount(raw)}
        </span>
      );
    }

    switch (col.type) {
      case 'conf':
        return record.confidence != null ? <Badge color={confColor(record.confidence)}>{record.confidence}%</Badge> : '—';
      case 'num':
        return fmtAmount(record[col.key]);
      case 'file':
        return record.stored_name
          ? <a href={`http://localhost:8000/api/uploads/${record.stored_name}`} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>{record.source_file || record.stored_name}</a>
          : <span style={{ color: 'var(--text-muted)' }}>{record.source_file || '—'}</span>;
      default:
        return record[col.key] ?? '—';
    }
  };

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading records…</p>;

  const totalCols = visibleCols.length + 1; // index

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
        <p style={{ fontSize: 12, color: 'var(--blue)', margin: 0 }}>
          <i className="ti ti-info-circle" aria-hidden="true" /> Click a value to edit it · source slide &amp; confidence live on the <strong>Field Provenance</strong> tab
        </p>
        <ColumnsMenu prefs={colPrefs} onToggle={toggleHidden} onReset={resetCols} />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                {visibleCols.map(col => (
                  <th
                    key={col.key}
                    draggable
                    onDragStart={() => { dragKey.current = col.key; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { reorder(dragKey.current, col.key); dragKey.current = null; }}
                    style={{ cursor: 'grab', whiteSpace: 'nowrap' }}
                    title="Drag to reorder"
                  >
                    {col.label}{col.editable && <i className="ti ti-pencil" style={{ fontSize: 11, marginLeft: 4, color: 'var(--text-faint)' }} aria-hidden="true" />}
                  </th>
                ))}
                <th>#</th><th>Client</th><th>Publisher</th><th>Year</th>
                <th>Total Savings</th><th>Confidence</th>
                <th>SME</th><th>Source File</th><th>Status</th>
                <th>Exec. Summary</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={totalCols} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No records yet. Complete an extraction to see data here.</td></tr>
              ) : records.map((r, i) => (
                <tr key={r.record_id || i} className={edits[r.record_id] ? 'row-edited' : ''}>
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
                  <td onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setSummaryRecord(r)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: 'var(--blue-pale)', color: 'var(--blue)',
                        border: '1.5px solid var(--blue)', borderRadius: 8,
                        padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <i className="ti ti-file-description" /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {changeCount > 0 && (
        <div style={{
          position: 'sticky', bottom: 0, marginTop: 12, zIndex: 20,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 -4px 16px rgba(0,0,0,0.08)', padding: 12,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <Badge color="gold">{changeCount} unsaved change{changeCount !== 1 ? 's' : ''}</Badge>
          <input
            placeholder="Your name (SME)"
            value={editor}
            onChange={(e) => setEditor(e.target.value)}
            style={{ width: 170, flex: '0 0 170px', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
          />
          <input
            placeholder="Note — why? (e.g. client confirmed via stakeholder X)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ width: 'auto', flex: '1 1 260px', minWidth: 220, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
          />
          <button className="btn ghost" onClick={discard} disabled={saving}>Discard</button>
          <button className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : <>Review &amp; save {changeCount} change{changeCount !== 1 ? 's' : ''} <i className="ti ti-device-floppy" aria-hidden="true" /></>}
          </button>
        </div>
      )}

      {summaryRecord && (
        <ExecSummaryDrawer record={summaryRecord} onClose={() => setSummaryRecord(null)} />
      )}
    </>
  );
}

// ─── Tab: Audit Log (append-only event history) ─────────────────────────────────
function TabAuditLog() {
  const [events, setEvents]   = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAuditLog(), getRecords()])
      .then(([ev, rec]) => {
        setEvents(Array.isArray(ev) ? ev : []);
        setRecords(Array.isArray(rec) ? rec : []);
      })
      .catch(() => { setEvents([]); setRecords([]); })
      .finally(() => setLoading(false));
  }, []);

  const recById = useMemo(() => Object.fromEntries(records.map(r => [r.record_id, r])), [records]);
  const ordered = useMemo(
    () => [...events].sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || ''))),
    [events],
  );
  const actionColor = (a) => (a === 'edit' ? 'amber' : a === 'create' ? 'green' : 'blue');

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Timestamp</th><th>Client</th><th>Publisher</th><th>Action</th><th>Field</th><th>Change</th><th>User</th><th>Note</th></tr>
          </thead>
          <tbody>
            {ordered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No audit entries yet.</td></tr>
            ) : ordered.map((e) => {
              const rec = recById[e.record_id] || {};
              return (
                <tr key={e.event_id}>
                  <td style={{ color: 'var(--text-faint)' }}>{e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}</td>
                  <td>{rec.client || '—'}</td>
                  <td>{rec.publisher || '—'}</td>
                  <td><Badge color={actionColor(e.action)}>{e.action}</Badge></td>
                  <td style={{ fontSize: 12 }}>{e.field || '—'}</td>
                  <td style={{ fontSize: 12 }}>
                    {e.action === 'edit'
                      ? <span><span style={{ color: 'var(--text-muted)' }}>{fmtAmount(e.old_value)}</span> → <strong>{fmtAmount(e.new_value)}</strong></span>
                      : '—'}
                  </td>
                  <td>{e.user || '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{e.note || '—'}</td>
                </tr>
              );
            })}
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
              <tr key={r.record_id || i}>
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

// ─── Tab: Field Provenance ──────────────────────────────────────────────────
// In-app mirror of the Excel `Field_Provenance` sheet: one row per record×metric,
// with the source slide and confidence the value was extracted with.
function TabFieldProvenance() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRecords()
      .then(data => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const out = [];
    for (const r of records) {
      const fm = r.field_meta || {};
      for (const [k, label] of PROV_METRICS) {
        if (r[k] == null && !fm[k]) continue;
        const meta = fm[k] || {};
        out.push({
          record_id: r.record_id, client: r.client, publisher: r.publisher, year: r.year,
          metric: label, value: r[k],
          source_slide: meta.source_slide, confidence: meta.confidence,
          alternates: (meta.alternates || []).map(a => `${a.value} (${a.confidence}%)`).join(', '),
        });
      }
    }
    return out;
  }, [records]);

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>;

  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--blue)', marginBottom: 10 }}>
        <i className="ti ti-info-circle" aria-hidden="true" /> One row per metric — exactly the <strong>Field_Provenance</strong> sheet in the Excel export. Sort/filter there for deep triage.
      </p>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Record</th><th>Client</th><th>Publisher</th><th>Year</th>
                <th>Metric</th><th>Value</th><th>Source slide</th><th>Confidence</th><th>Alternates</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No provenance yet. Newly extracted records populate this automatically.</td></tr>
              ) : rows.map((row, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 11, color: 'var(--text-faint)' }}>{row.record_id}</td>
                  <td>{row.client}</td>
                  <td>{row.publisher}</td>
                  <td>{row.year}</td>
                  <td>{row.metric}</td>
                  <td>{fmtAmount(row.value)}</td>
                  <td style={{ textAlign: 'center' }}>{row.source_slide ?? '—'}</td>
                  <td>{row.confidence != null ? <Badge color={confColor(row.confidence)}>{row.confidence}%</Badge> : '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{row.alternates || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── TrackerView ──────────────────────────────────────────────────────────────
const TABS = [
  { id: 'data',       label: 'ROI Data'         },
  { id: 'provenance', label: 'Field Provenance' },
  { id: 'audit',      label: 'SME Audit Log'    },
  { id: 'sources',    label: 'Source Files'     },
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
          <strong style={{ color: 'var(--text)' }}>Field_Provenance</strong>
        </p>
        <button className="btn ghost small" onClick={downloadRecordsAsXlsx}><i className="ti ti-table-export" aria-hidden="true" /> Export .xlsx</button>
      </div>

      <div className="tab-bar">
        {TABS.map(t => (
          <button key={t.id} className={`tab-item ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'data'       && <TabROIData    />}
      {activeTab === 'provenance' && <TabFieldProvenance />}
      {activeTab === 'audit'      && <TabAuditLog   />}
      {activeTab === 'sources'    && <TabSourceFiles />}
    </>
  );
}
