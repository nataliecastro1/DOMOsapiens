import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Badge from '../components/Badge';
import ClientSelect from '../components/ClientSelect';
import ExecutiveSummaryReport from '../components/ExecutiveSummaryReport';
import { extractROAR, extractFromFile, uploadFile, searchDocuments, saveRecord, getRecords, generateExecutiveSummary, saveExecutiveSummary, checkUpload, deleteUpload, getSlideMeta } from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  PUBLISHERS, YEARS,
  SAMPLE_FILES, EXTRACTED_FIELDS, EXTRACTION_STEPS,
} from '../data';
import { DashboardBuilder } from './DashboardsView';
import { deriveOptions } from '../services/dashboardData';

// ─── Blank field template ─────────────────────────────────────────────────────
// The canonical 7 ROI fields with no data — derived from EXTRACTED_FIELDS so the
// field labels and variant colors stay in one place (its schema), but every value
// is nulled. Used as the honest empty state when extraction fails or when a step
// is reached without any extracted data, instead of substituting mock numbers.
const BLANK_FIELDS = EXTRACTED_FIELDS.map(f => ({
  ...f,
  value: null,
  confidence: null,
  source: null,
  flag: null,
  entryMode: null,
}));

// ─── Journey Bar ──────────────────────────────────────────────────────────────
const STEP_DEFS = [
  { label: 'Request',      icon: 'ti-adjustments-horizontal' },
  { label: 'SME Validate', icon: 'ti-user-check'             },
  { label: 'Review',       icon: 'ti-database'               },
  { label: 'Done',         icon: 'ti-circle-check'           },
];

// Maps internal step index (0-6) to JourneyBar index (0-3)
// step: 0=Request  1=Files  2=Validate  3=(unused)  4=Loading  5=Store  6=Done
const STEP_TO_BAR = [0, 1, 1, 2, 2, 2, 3];
// Maps JourneyBar click (0-3) back to the internal step to navigate to
const BAR_TO_STEP = [0, 2, 5, 6];

function JourneyBar({ currentStep }) {
  return (
    <div id="journey-bar" className="journey-bar" role="list" aria-label="Extraction pipeline">
      {STEP_DEFS.map((step, i) => {
        const isDone   = i < currentStep;
        const isActive = i === currentStep;
        return (
          <React.Fragment key={i}>
            <div
              className={`journey-step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}
              role="listitem"
              aria-current={isActive ? 'step' : undefined}
              style={{ cursor: 'default' }}
            >
              <div className="journey-step-icon">
                {isDone
                  ? <i className="ti ti-check" aria-hidden="true" />
                  : <i className={`ti ${step.icon}`} aria-hidden="true" />
                }
              </div>
              <div className="journey-step-label">{step.label}</div>
            </div>
            {i < STEP_DEFS.length - 1 && (
              <div className={`journey-connector ${isDone ? 'done' : ''}`} aria-hidden="true" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Bulk Import Zone ─────────────────────────────────────────────────────────
function BulkImportZone() {
  const [dragOver, setDragOver]   = useState(false);
  const [status, setStatus]       = useState(null); // null | 'loading' | 'undoing' | { batch_id, imported, ... } | { error }
  const fileInputRef               = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'csv'].includes(ext)) {
      setStatus({ error: 'Only .xlsx and .csv files are accepted.' });
      return;
    }
    setStatus('loading');
    try {
      const result = await bulkImport(file);
      setStatus(result);
    } catch (err) {
      setStatus({ error: err.message });
    }
  };

  const handleUndo = async () => {
    if (!status?.batch_id) return;
    setStatus('undoing');
    try {
      await undoBulkImport(status.batch_id);
      setStatus(null);
    } catch (err) {
      setStatus({ error: err.message });
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const [flaggedOpen, setFlaggedOpen] = useState(false);

  const downloadErrorRows = (flagged) => {
    const COLS = [
      { header: 'Year',                           key: 'year' },
      { header: 'Client',                         key: 'client' },
      { header: 'Publisher',                      key: 'publisher' },
      { header: 'Currency',                       key: 'currency' },
      { header: 'Date Delivered',                 key: 'date_delivered' },
      { header: 'Identified Risk',                key: 'identified_risk' },
      { header: 'Identified Cost Avoidance',      key: 'id_cost_avoidance' },
      { header: 'Accomplished Cost Avoidance',    key: 'acc_cost_avoidance' },
      { header: 'Identified Cost Optimization',   key: 'id_cost_optimization' },
      { header: 'Accomplished Cost Optimization', key: 'acc_cost_optimization' },
      { header: 'Realized Cost Savings',          key: 'realized_savings' },
      { header: 'Annual Publisher Contract',      key: 'contract_spend' },
      { header: 'Notes',                          key: 'notes' },
    ];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headerRow = [...COLS.map(c => esc(c.header)), esc('Error Reason'), esc('Sheet'), esc('Row #')];
    const dataRows = flagged.map(f => [
      ...COLS.map(c => esc(f.data?.[c.key] ?? '')),
      esc(f.reason), esc(f.location), esc(f.row),
    ]);
    const csv = [headerRow, ...dataRows].map(r => r.join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: 'import_errors.csv',
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isLoading  = status === 'loading';
  const isUndoing  = status === 'undoing';
  const isBusy     = isLoading || isUndoing;
  const isResult   = status && !isBusy && !status.error;
  const isError    = status?.error;

  return (
    <div className="card" style={{ marginTop: 0 }}>
      <div className="card-title">
        <i className="ti ti-table-import" aria-hidden="true" />
        Bulk Data Import
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
          Upload an Excel or CSV file with multiple ROI records — no PPTX required
        </span>
      </div>

      <div
        className={`upload-dropzone${dragOver ? ' is-dragover' : ''}`}
        style={{ cursor: isBusy ? 'default' : 'pointer' }}
        onClick={() => !isBusy && fileInputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {isLoading ? (
          <>
            <i className="ti ti-loader-2 spinning upload-dropzone-icon" aria-hidden="true" />
            <div className="upload-dropzone-title">Importing…</div>
          </>
        ) : isUndoing ? (
          <>
            <i className="ti ti-loader-2 spinning upload-dropzone-icon" aria-hidden="true" />
            <div className="upload-dropzone-title">Undoing import…</div>
          </>
        ) : (
          <>
            <i className="ti ti-file-spreadsheet upload-dropzone-icon" aria-hidden="true" />
            <div className="upload-dropzone-title">Drag & drop an Excel or CSV file</div>
            <div className="upload-dropzone-hint">or click to browse · .xlsx or .csv</div>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.csv"
        className="upload-file-input"
        onChange={e => { handleFile(e.target.files[0]); e.target.value = ''; }}
      />

      {isResult && (
        <div style={{
          marginTop: 10, padding: '10px 14px', borderRadius: 'var(--radius)',
          background: status.imported > 0 ? 'var(--green-bg, #f0fdf4)' : 'var(--surface-alt)',
          border: `1.5px solid ${status.imported > 0 ? 'var(--green, #22c55e)' : 'var(--border)'}`,
          fontSize: 13,
        }}>

          {/* ── Header row: counts + undo ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontWeight: 600, color: status.imported > 0 ? 'var(--green, #16a34a)' : 'var(--text-muted)' }}>
              <i className={`ti ${status.imported > 0 ? 'ti-circle-check' : 'ti-info-circle'}`} style={{ marginRight: 5 }} />
              {status.imported} record{status.imported !== 1 ? 's' : ''} imported
              {status.flagged?.length > 0 && (
                <span style={{ marginLeft: 10, fontWeight: 400, fontSize: 12, color: 'var(--orange, #ea580c)' }}>
                  · {status.flagged.length} need review
                </span>
              )}
            </div>
            {status.batch_id && (
              <button
                onClick={handleUndo}
                style={{
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: 'none', border: '1.5px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '3px 10px',
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4,
                  transition: 'border-color 0.15s, color 0.15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red, #ef4444)'; e.currentTarget.style.color = 'var(--red, #ef4444)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                title="Remove all records from this import"
              >
                <i className="ti ti-arrow-back-up" /> Undo import
              </button>
            )}
          </div>

          {/* ── Per-sheet breakdown ── */}
          {status.sheets?.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {status.sheets.map((s, i) => (
                <div key={i} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                  <i className="ti ti-table" style={{ fontSize: 11 }} />
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{s.name}</span>
                  <span>— {s.imported} imported{s.flagged > 0 ? `, ${s.flagged} flagged` : ''}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Flagged rows (error log) ── */}
          {status.flagged?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <button
                  onClick={() => setFlaggedOpen(o => !o)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    fontSize: 12, fontWeight: 600, color: 'var(--orange, #ea580c)',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <i className={`ti ${flaggedOpen ? 'ti-chevron-down' : 'ti-chevron-right'}`} />
                  {status.flagged.length} row{status.flagged.length !== 1 ? 's' : ''} need review
                </button>
                <button
                  onClick={() => downloadErrorRows(status.flagged)}
                  style={{
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: 'none', border: '1.5px solid var(--orange-border, #fed7aa)',
                    borderRadius: 'var(--radius)', padding: '2px 9px',
                    color: 'var(--orange, #c2410c)', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                  title="Download these rows as CSV, fix them, and re-upload"
                >
                  <i className="ti ti-download" /> Download error rows
                </button>
              </div>

              {flaggedOpen && (
                <div style={{
                  marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5,
                  maxHeight: 280, overflowY: 'auto',
                }}>
                  {status.flagged.map((f, i) => {
                    const keyFields = ['year', 'client', 'publisher'];
                    const extraFields = ['currency', 'date_delivered', 'identified_risk', 'id_cost_avoidance',
                      'acc_cost_avoidance', 'id_cost_optimization', 'acc_cost_optimization',
                      'realized_savings', 'contract_spend'];
                    return (
                      <div key={i} style={{
                        background: 'var(--orange-bg, #fff7ed)',
                        border: '1px solid var(--orange-border, #fed7aa)',
                        borderRadius: 'var(--radius)', padding: '7px 10px', fontSize: 12,
                      }}>
                        <div style={{ fontWeight: 600, color: 'var(--orange, #c2410c)', marginBottom: 4 }}>
                          <i className="ti ti-alert-triangle" style={{ marginRight: 4 }} />
                          {f.location} · row {f.row} — {f.reason}
                        </div>
                        {/* Key identifiers */}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', color: 'var(--text)', marginBottom: 3 }}>
                          {keyFields.map(k => f.data?.[k]
                            ? <span key={k} style={{ fontWeight: 600 }}>{f.data[k]}</span>
                            : <span key={k} style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>({k} missing)</span>
                          )}
                        </div>
                        {/* Non-empty numeric/extra fields */}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', color: 'var(--text-muted)' }}>
                          {extraFields.map(k => f.data?.[k]
                            ? <span key={k}><span style={{ fontWeight: 500 }}>{k.replace(/_/g, ' ')}:</span> {f.data[k]}</span>
                            : null
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                    Download the error rows CSV, fix the highlighted issues, then re-upload the fixed file.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Unexpected parse errors ── */}
          {status.errors?.length > 0 && (
            <div style={{ marginTop: 6, color: 'var(--orange, #ea580c)', fontSize: 12 }}>
              {status.errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
            Records are now visible in the ROI Tracker.
          </div>
        </div>
      )}

      {isError && (
        <div className="upload-error" style={{ marginTop: 10 }}>
          <i className="ti ti-alert-triangle" aria-hidden="true" /> {status.error}
        </div>
      )}
    </div>
  );
}

// ─── Screen 0: Request ────────────────────────────────────────────────────────
function ScreenRequest({ onNext, onUploaded, clients, year, onYearChange, client, publisher, existingBatch = [], onRemoveExisting, onOpenRecord, onDuplicateChange }) {
  const MAX_FILES = 4;
  const [dragOver, setDragOver]           = useState(false);
  const [newFiles, setNewFiles]           = useState([]);   // local File objects not yet uploaded
  const [uploading, setUploading]         = useState(false);
  const [uploadError, setUploadError]     = useState(null);
  const [history, setHistory]             = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [previewRecord, setPreviewRecord] = useState(null);
  const [detectedYear, setDetectedYear]   = useState(null); // year extracted from PPTX first slide
  const fileInputRef                      = useRef(null);

  // Find the saved dashboard config matching the clicked record
  const savedDash = useMemo(() => {
    if (!previewRecord) return null;
    try {
      const saved = JSON.parse(localStorage.getItem('domosapiens.dashboards') || '[]');
      const rClient    = (previewRecord.client    || '').toLowerCase();
      const rPublisher = (previewRecord.publisher || '').toLowerCase();
      const rYear      = String(previewRecord.year || '');
      return saved.find(d => {
        if (d.type === 'auto') {
          // Auto-saved dashboards from ScreenDone: match by client + publisher or year
          if ((d.client || '').toLowerCase() !== rClient) return false;
          const pubMatch = !rPublisher || (d.publisher || '').toLowerCase() === rPublisher;
          const yrMatch  = !rYear || String(d.year || '') === rYear;
          return pubMatch || yrMatch;
        }
        if (!d.templateId) return false;
        if ((d.client || '').toLowerCase() !== rClient) return false;
        const pubMatch = !rPublisher || d.pubMode === 'All publishers'
          || (d.selPubs || []).some(p => p.toLowerCase() === rPublisher);
        const yrMatch  = !rYear || d.yrMode === 'All years'
          || (d.selYears || []).map(String).includes(rYear);
        return pubMatch && yrMatch;
      }) || null;
    } catch { return null; }
  }, [previewRecord]);

  const dashOptions = useMemo(() => deriveOptions(history), [history]);

  // Controlled by parent so values survive back-navigation
  const upYear      = year      ?? '';
  const upClient    = client    ?? '';
  const upPublisher = publisher ?? '';

  // Load past records for this client whenever the client changes
  useEffect(() => {
    setHistoryLoading(true);
    getRecords()
      .then(data => {
        const all = Array.isArray(data) ? data : [];
        const filtered = upClient
          ? all.filter(r => (r.client || '').toLowerCase().includes(upClient.toLowerCase()))
          : all;
        setHistory(filtered);
      })
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [upClient]);

  const totalCount = existingBatch.length + newFiles.length;

  // Duplicate detection: fires when a file is uploaded and we have a year
  // (either manually selected or auto-detected from the PPTX first slide)
  const effectiveYear = upYear || detectedYear || '';
  const duplicateRecords = (totalCount > 0 && effectiveYear)
    ? history.filter(r =>
        String(r.year) === String(effectiveYear) &&
        upPublisher && (r.publisher || '').toLowerCase() === upPublisher.toLowerCase()
      )
    : [];
  const hasDuplicate = duplicateRecords.length > 0;

  useEffect(() => { onDuplicateChange?.(hasDuplicate); }, [hasDuplicate]);

  const addFiles = async (incoming) => {
    setUploadError(null);
    const arr = Array.from(incoming);
    const combined = existingBatch.length + newFiles.length + arr.length;
    if (combined > MAX_FILES) {
      setUploadError(`You can upload a maximum of ${MAX_FILES} files at a time.`);
      return;
    }
    // Upload immediately on drop/select so the file survives navigation
    setUploading(true);
    try {
      const staged = [];
      for (const file of arr) {
        const meta = await uploadFile(file);
        staged.push({ ...meta, name: meta.filename, version: 'Uploaded', source: 'uploaded', file });
        // Extract year from first slide to power duplicate detection without manual year selection
        getSlideMeta(meta.stored_name)
          .then(({ year: slideYear }) => {
            if (slideYear) setDetectedYear(slideYear);
          })
          .catch(() => {});
      }
      setNewFiles(prev => [...prev, ...staged]);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const removeNew = (idx) => {
    setNewFiles(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0 && existingBatch.length === 0) setDetectedYear(null);
      return next;
    });
  };

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); };
  const handleFileChange = (e) => { addFiles(e.target.files); e.target.value = ''; };

  const handleUpload = async () => {
    if (totalCount === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      // newFiles are already uploaded; just merge with existingBatch and tag metadata
      const batch = [
        ...existingBatch.map(f => ({ ...f, year: upYear, client: upClient.trim(), publisher: upPublisher.trim() })),
        ...newFiles.map(f => ({ ...f, year: upYear, client: upClient.trim(), publisher: upPublisher.trim() })),
      ];
      onUploaded(batch);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>

      {/* ── LEFT: Upload Raw File ── */}
      <div id="upload-card" className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="card-title">
          <i className="ti ti-file-upload" aria-hidden="true" />
          Upload Raw File
          <span className="upload-count">{totalCount}/{MAX_FILES}</span>
        </div>

        {/* Duplicate warning */}
        {hasDuplicate && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            background: '#fff5f5', border: '1.5px solid #f87171',
            borderRadius: 8, padding: '10px 14px', marginBottom: 12,
          }}>
            <i className="ti ti-alert-circle" style={{ color: '#dc2626', fontSize: 18, flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#991b1b' }}>Document already exists</div>
              <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 2 }}>
                A record for <strong>{upClient}</strong> · <strong>{upPublisher}</strong> · <strong>{upYear}</strong> already exists. See the highlighted document on the right — view its dashboard or add new information.
              </div>
            </div>
          </div>
        )}

        {/* Year */}
        <div className="field-group">
          <label className="field-label">Year</label>
          <select value={upYear} onChange={e => onYearChange(e.target.value)}>
            <option value="">Select year…</option>
            {YEARS.map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        {(upClient || upPublisher) && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {upClient && (
              <span style={{ fontSize: 12, background: 'var(--accent-bg, #eff6ff)', color: 'var(--accent, #2563eb)', borderRadius: 6, padding: '3px 10px', fontWeight: 600 }}>
                <i className="ti ti-building" style={{ marginRight: 4 }} />{upClient}
              </span>
            )}
            {upPublisher && (
              <span style={{ fontSize: 12, background: 'var(--accent-bg, #eff6ff)', color: 'var(--accent, #2563eb)', borderRadius: 6, padding: '3px 10px', fontWeight: 600 }}>
                <i className="ti ti-brand-windows" style={{ marginRight: 4 }} />{upPublisher}
              </span>
            )}
          </div>
        )}

        {/* Drag & drop zone */}
        <div
          className={`upload-dropzone ${dragOver ? 'is-dragover' : ''} ${totalCount >= MAX_FILES ? 'is-full' : ''}`}
          onClick={() => totalCount < MAX_FILES && fileInputRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <i className="ti ti-file-upload upload-dropzone-icon" aria-hidden="true" />
          <div className="upload-dropzone-title">
            {totalCount >= MAX_FILES ? 'Maximum files reached' : 'Drag & drop files here'}
          </div>
          <div className="upload-dropzone-hint">
            {totalCount < MAX_FILES
              ? `or click to browse · up to ${MAX_FILES} files · PDF, PPTX, XLSX`
              : 'Remove a file to add another'}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.pptx,.xlsx,.ppt"
          multiple
          className="upload-file-input"
          onChange={handleFileChange}
        />

        {/* File list — already-uploaded (from back-navigation) + newly selected */}
        {(existingBatch.length > 0 || newFiles.length > 0) && (
          <div className="upload-file-list">
            {existingBatch.map((f, i) => (
              <div key={`existing-${i}`} className="upload-file-chip upload-file-chip--existing">
                <i className="ti ti-circle-check upload-file-chip-icon" style={{ color: 'var(--green, #22c55e)' }} />
                <span className="upload-file-chip-name">{f.name || f.filename}</span>
                <span className="upload-file-chip-size upload-file-chip-tag">uploaded</span>
                <button onClick={() => onRemoveExisting(i)} className="upload-file-chip-remove" title="Remove">
                  <i className="ti ti-x" />
                </button>
              </div>
            ))}
            {newFiles.map((f, i) => (
              <div key={`new-${i}`} className="upload-file-chip">
                <i className="ti ti-file-description upload-file-chip-icon" />
                <span className="upload-file-chip-name">{f.name}</span>
                <span className="upload-file-chip-size">{(f.size / 1024).toFixed(0)} KB</span>
                <button onClick={() => removeNew(i)} className="upload-file-chip-remove" title="Remove">
                  <i className="ti ti-x" />
                </button>
              </div>
            ))}
          </div>
        )}

        {uploadError && (
          <div className="upload-error">
            <i className="ti ti-alert-triangle" aria-hidden="true" /> {uploadError}
          </div>
        )}

        <div className="btn-row">
          <button
            className="btn primary is-gated"
            disabled={totalCount === 0 || uploading}
            onClick={handleUpload}
          >
            {uploading
              ? <><i className="ti ti-loader-2 spinning" aria-hidden="true" /> Uploading…</>
              : <>Continue <i className="ti ti-arrow-right" aria-hidden="true" /></>
            }
          </button>
        </div>
      </div>

      {/* ── RIGHT: Document history for this client ── */}
      <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="card-title">
          <i className="ti ti-history" aria-hidden="true" />
          Past Documents
          {upClient && <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>— {upClient}</span>}
        </div>

        {historyLoading ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            <i className="ti ti-loader-2 spinning" /> Loading…
          </p>
        ) : history.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            {upClient
              ? `No past documents found for "${upClient}". Upload a new file on the left.`
              : 'Enter a client name to see past documents here.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 380 }}>
            {history.map(r => {
              const isDup = duplicateRecords.some(d => d.record_id === r.record_id);
              return (
                <div
                  key={r.record_id}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 6,
                    background: isDup ? '#fff5f5' : 'var(--surface-alt, rgba(0,0,0,0.03))',
                    border: `1.5px solid ${isDup ? '#f87171' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    padding: '10px 14px',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-file-description" style={{ color: isDup ? '#dc2626' : 'var(--blue)', fontSize: 15 }} />
                    {r.source_file || 'Untitled document'}
                    {isDup && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: '#fee2e2', color: '#b91c1c', borderRadius: 4, padding: '1px 6px', marginLeft: 4 }}>
                        DUPLICATE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', paddingLeft: 21 }}>
                    {[r.publisher, r.year].filter(Boolean).join(' · ')}
                  </div>
                  {isDup ? (
                    <div style={{ display: 'flex', gap: 8, paddingLeft: 21, marginTop: 2 }}>
                      <button
                        onClick={() => setPreviewRecord(r)}
                        style={{
                          fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                          background: '#1e40af', color: '#fff', border: 'none',
                          borderRadius: 6, padding: '5px 12px',
                        }}
                      >
                        <i className="ti ti-layout-dashboard" style={{ marginRight: 4 }} />View Dashboard
                      </button>
                      <button
                        onClick={handleUpload}
                        disabled={uploading}
                        style={{
                          fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                          background: 'transparent', color: '#dc2626',
                          border: '1.5px solid #f87171', borderRadius: 6, padding: '5px 12px',
                          opacity: uploading ? 0.6 : 1,
                        }}
                      >
                        <i className="ti ti-plus" style={{ marginRight: 4 }} />Add New Information
                      </button>
                    </div>
                  ) : (
                    <div
                      style={{ fontSize: 11, color: 'var(--blue)', paddingLeft: 21, cursor: 'pointer' }}
                      onClick={() => setPreviewRecord(r)}
                    >
                      View dashboard →
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>

    {/* ── Dashboard preview modal ── */}
    {previewRecord && createPortal(
      <>
        {/* Blurred backdrop */}
        <div
          onClick={() => setPreviewRecord(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.48)', backdropFilter: 'blur(5px)',
          }}
        />

        {/* Centered floating card */}
        <div
          style={{
            position: 'fixed', zIndex: 1001,
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(720px, 92vw)',
            maxHeight: '88vh',
            background: 'var(--surface)',
            borderRadius: 20,
            border: '1.5px solid var(--border)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,255,255,0.04)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Card header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 24px 16px', flexShrink: 0,
            borderBottom: '1px solid var(--border)',
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                {previewRecord.source_file || 'Document Dashboard'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                {[previewRecord.client, previewRecord.publisher, previewRecord.year].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button
              onClick={() => setPreviewRecord(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', lineHeight: 1, padding: 4, borderRadius: 6 }}
            >
              <i className="ti ti-x" />
            </button>
          </div>

          {/* Dashboard content — scrollable */}
          <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
            {savedDash?.type === 'auto' ? (
              <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '20px 24px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Auto-saved dashboard</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>{savedDash.name || `${savedDash.client} — ${savedDash.publisher} ${savedDash.year}`}</div>
                  {savedDash.savedAt && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Saved {new Date(savedDash.savedAt).toLocaleDateString()}</div>
                  )}
                  {(() => {
                    const total = Object.values(savedDash.fields || {}).reduce((s, v) => s + (Number(v) || 0), 0);
                    return total > 0 ? (
                      <div style={{ marginTop: 14, fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>
                        ${total >= 1e6 ? `${(total/1e6).toFixed(1)}M` : total >= 1e3 ? `${(total/1e3).toFixed(0)}K` : total.toFixed(0)}
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>total identified value</span>
                      </div>
                    ) : null;
                  })()}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>Open the full dashboard for complete details.</div>
              </div>
            ) : savedDash ? (
              <DashboardBuilder
                templateId={savedDash.templateId}
                options={dashOptions}
                records={history}
                initial={savedDash}
                embedded
                onClose={() => setPreviewRecord(null)}
                onSave={updated => {
                  try {
                    const all = JSON.parse(localStorage.getItem('domosapiens.dashboards') || '[]');
                    const idx = all.findIndex(d => d.id === updated.id);
                    if (idx >= 0) all[idx] = updated; else all.push(updated);
                    localStorage.setItem('domosapiens.dashboards', JSON.stringify(all));
                  } catch {}
                }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 220, gap: 12, color: 'var(--text-muted)', padding: 32 }}>
                <i className="ti ti-layout-dashboard" style={{ fontSize: 48, opacity: 0.3 }} />
                <div style={{ fontSize: 15, fontWeight: 600 }}>No saved dashboard found</div>
                <div style={{ fontSize: 13, textAlign: 'center' }}>Open the full dashboard to create one for this document.</div>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div style={{
            display: 'flex', gap: 10, padding: '14px 24px', flexShrink: 0,
            borderTop: '1px solid var(--border)',
          }}>
            <button
              onClick={() => { setPreviewRecord(null); onOpenRecord?.(previewRecord); }}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                background: 'var(--navy)', color: '#fff', border: 'none',
              }}
            >
              <i className="ti ti-layout-dashboard" /> Go to Full Dashboard
            </button>
            <button
              onClick={() => setPreviewRecord(null)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                background: 'transparent', color: 'var(--text)',
                border: '1.5px solid var(--border)',
              }}
            >
              <i className="ti ti-arrow-left" /> Stay Here
            </button>
          </div>
        </div>
      </>,
      document.body
    )}
    </div>
  );
}

// ─── Screen 1: Files ──────────────────────────────────────────────────────────
// Recursively walk a picked directory, yielding each file handle plus the
// relative folder path it was found in. Lets ScreenFiles search a whole client
// folder locally (e.g. a OneDrive-synced "Client Delivery" folder) with no
// backend — it reads file NAMES while walking, so cloud "online-only" files
// still show up without being downloaded.
async function* walkDirectory(dirHandle, pathPrefix = '') {
  for await (const entry of dirHandle.values()) {
    const entryPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
    if (entry.kind === 'file') {
      yield { handle: entry, path: pathPrefix };
    } else if (entry.kind === 'directory') {
      yield* walkDirectory(entry, entryPath);
    }
  }
}

// A filename counts as a deliverable only if "ROAR" or "ELP" appears as a
// standalone token. Underscores, spaces and dots count as separators, so a
// name like "help_notes.xlsx" does NOT match on "elp".
const DELIVERABLE_RE = /(?:^|[^a-z])(roar|elp)(?:[^a-z]|$)/i;

// A filename is treated as a TEMPLATE (and hidden from results) if it contains
// "template", or carries date-placeholder tokens like YYYY / MM / DD (e.g.
// "Client_ROAR_YYYY-MM-DD.xlsx"). YYYY is matched case-sensitively (no real word
// has it); MM/DD must appear as their own uppercase token so words like
// "ADDENDUM" aren't caught.
const isTemplateName = (name) =>
  /template/i.test(name) ||
  /YYYY/.test(name) ||
  /(?:^|[^A-Za-z])(MM|DD)(?:[^A-Za-z]|$)/.test(name);

const formatBytes = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const formatModified = (ms) =>
  new Date(ms)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    .replace(',', '');

// Rank a filename by version so the current copy of a deliverable wins: a
// "final" beats any numbered draft, otherwise the highest "v<n>" wins.
const versionRank = (nm) => {
  const lower = nm.toLowerCase();
  const nums  = [...lower.matchAll(/(?:v|ver|version|rev|revision)\.?\s*(\d+)/g)].map(m => Number(m[1]));
  const versionNum = nums.length ? Math.max(...nums) : 0;
  const isFinal = /final/.test(lower) ? 1 : 0;
  return isFinal * 100000 + versionNum;
};

// Collapse v1/v2/v3 of the same document to one key so they group together.
// Strips version tokens, "final"/"draft" labels, full dates and the extension.
// The year is kept on purpose — a 2024 ROAR and a 2025 ROAR are different docs.
const deliverableKey = (nm) =>
  nm.toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/\d{2,4}[-_.]\d{2}[-_.]\d{2,4}/g, '')
    .replace(/[_\-\s]*\(?\s*final\s*\)?/g, '')
    .replace(/[_\-\s]*draft/g, '')
    .replace(/[_\-\s]*(?:v|ver|version|rev|revision)\.?\s*\d+/g, '')
    .replace(/[_\-\s]+/g, ' ')
    .trim();

// One file result card — shared by the ROAR and ELP columns. Cards are
// multi-select: clicking toggles the file's membership in the batch. The
// "Continue with N files" action in ScreenFiles finalizes the selection.
function FileCard({ f, selected, onToggle }) {
  return (
    <div
      className={`file-card ${f._best ? 'featured' : ''} ${selected ? 'selected' : ''}`}
      onClick={() => onToggle(f)}
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(f); } }}
    >
      <i
        className={`ti ti-${selected ? 'square-check-filled' : 'square'} file-card-check ${selected ? 'is-checked' : ''}`}
        aria-hidden="true"
      />
      <i
        className={`ti ti-file-description file-card-icon ${f._best ? 'featured' : ''}`}
        aria-hidden="true"
      />
      <div className="file-card-body">
        <div className="file-card-name">{f.name}</div>
        <div className="file-card-meta">
          <span>{f.modified}</span>
          <span>·</span>
          <span>{f.size}</span>
          {f.path && (<><span>·</span><span>{f.path}</span></>)}
          <Badge color={f._best ? 'green' : 'navy'}>{f._best ? 'Best match' : f.docType}</Badge>
        </div>
      </div>
    </div>
  );
}

function ScreenFiles({ filters = {}, clientDir = null, onSelect, onBack }) {
  const [files, setFiles]           = useState([]);
  const [scanning, setScanning]     = useState(Boolean(clientDir));
  const [scanned, setScanned]       = useState(false);
  const [error, setError]           = useState(null);
  const [folderName, setFolderName] = useState(clientDir ? clientDir.name : '');
  const [showDrafts, setShowDrafts] = useState(false);
  // Multi-select: a Set of file keys (`${path}/${name}`) chosen for the batch.
  const [selected, setSelected]     = useState(new Set());
  const [preparing, setPreparing]   = useState(false);
  const [showElpModal, setShowElpModal] = useState(false);

  const { client = '', year = '', publisher = '' } = filters;

  const fileKey = (f) => `${f.path}/${f.name}`;

  const toggleFile = (f) => {
    setSelected(prev => {
      const next = new Set(prev);
      const key = fileKey(f);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Read the raw File for each chosen match (via its retained handle) so the
  // script extractor can run, then hand the whole batch to the parent.
  const handleContinue = async () => {
    const chosen = files.filter(f => selected.has(fileKey(f)));
    if (!chosen.length) return;
    setPreparing(true);
    const batch = [];
    for (const f of chosen) {
      let raw;
      try { raw = f._handle ? await f._handle.getFile() : undefined; } catch { raw = undefined; }
      batch.push({ ...f, version: f.modified, source: 'local', client: client || folderName, file: raw });
    }
    setPreparing(false);
    onSelect(batch);
  };

  // The local folder picker is a Chromium-only browser capability. When it is
  // unavailable (Firefox/Safari) we show a hint instead of a broken button.
  const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  // Scan a directory handle for ROAR/ELP deliverables and populate the list.
  // Shared by the manual picker and by the automatic scan of the client folder
  // that was already chosen (via its loaded handle) on the Request step.
  const runScan = async (dirHandle) => {
    setError(null);
    setFolderName(dirHandle.name);
    setFiles([]);
    setSelected(new Set());
    setScanned(false);
    setScanning(true);

    try {
      const matches = [];
      const pub = (publisher || '').toLowerCase();
      const yr  = year ? String(year).toLowerCase() : '';
      for await (const { handle, path } of walkDirectory(dirHandle)) {
        const name      = handle.name;
        const lowerName = name.toLowerCase();
        const lowerPath = `${path}/${name}`.toLowerCase();
        // ── Filters: a file must satisfy every criterion the SME actually set ──
        if (!DELIVERABLE_RE.test(name)) continue;        // must be a ROAR/ELP file
        if (isTemplateName(name)) continue;              // hide template files entirely
        if (yr  && !lowerName.includes(yr))  continue;   // year, when chosen
        if (pub && !lowerPath.includes(pub)) continue;   // publisher, when chosen
        // Passed the filters — open the file. Only matches are read, so a large
        // folder of cloud files is never bulk-downloaded just to search it.
        const file    = await handle.getFile();
        const docType = /(?:^|[^a-z])elp(?:[^a-z]|$)/i.test(name) ? 'ELP' : 'ROAR';
        matches.push({
          name,
          modified:  formatModified(file.lastModified),
          size:      formatBytes(file.size),
          extension: (name.split('.').pop() || '').toUpperCase(),
          path,
          docType,
          publisher,
          year,
          _mtime:    file.lastModified,
          _handle:   handle,   // retained so the raw File can be read on selection (for the script extractor)
        });
      }
      // Group the versions of each deliverable, then mark only the top version
      // of each group as a "best match" — highest version (or "final"), with the
      // most recently modified file breaking ties. One badge per distinct
      // deliverable, instead of lighting up every file that shares the same
      // client / publisher / year in its name.
      const groups = {};
      matches.forEach(f => {
        f._rank  = versionRank(f.name);
        f._draft = /draft|internal/i.test(f.name);   // drafts and "internal" files are never a best match
        f._isDraft = /draft/i.test(f.name);          // drafts are tucked into a separate "See drafts" section
        f._best  = false;
        const key = deliverableKey(f.name);
        (groups[key] = groups[key] || []).push(f);
      });
      Object.values(groups).forEach(group => {
        // Only non-draft files are eligible. If a deliverable has only drafts so
        // far, none of them is highlighted as the best match.
        const candidates = group.filter(f => !f._draft);
        if (!candidates.length) return;
        const top = candidates.reduce((best, f) =>
          (f._rank > best._rank || (f._rank === best._rank && f._mtime > best._mtime)) ? f : best
        );
        top._best = true;
      });
      // Best (current) versions first, then most recently modified.
      matches.sort((a, b) => (b._best - a._best) || (b._mtime - a._mtime));
      setFiles(matches);
    } catch (err) {
      setError(err.message || 'Could not read the selected folder.');
    } finally {
      setScanning(false);
      setScanned(true);
    }
  };

  // Open the OS folder picker (a user gesture), then scan the chosen folder.
  const handlePick = async () => {
    setError(null);
    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker();
    } catch (err) {
      // User dismissed the picker — not an error, leave the screen untouched.
      if (err && err.name === 'AbortError') return;
      setError(err.message || 'Could not open the folder picker.');
      return;
    }
    runScan(dirHandle);
  };

  // If the chosen client already has a known folder (loaded at login), scan it
  // automatically so the SME doesn't have to pick a folder a second time.
  useEffect(() => {
    if (clientDir) runScan(clientDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientDir]);

  const rankNote = [publisher, year].filter(Boolean).join(' · ');

  return (
    <div className="card">
      <div className="card-title">
        <i className="ti ti-files" aria-hidden="true" />
        Matched Files
      </div>

      {!supported && (
        <div className="files-unsupported">
          <i className="ti ti-browser-x" aria-hidden="true" />
          Local folder search needs Chrome or Microsoft Edge. Open DOMOsapiens in one of those, or upload a file manually on the previous step.
        </div>
      )}

      {supported && !clientDir && !scanned && !scanning && (
        <div className="files-pick">
          <i className="ti ti-folder-search files-pick-icon" aria-hidden="true" />
          <p className="files-pick-text">
            Choose the client folder on your computer — for example your synced{' '}
            <strong>Client Delivery</strong> folder. DOMOsapiens scans it for ROAR and ELP files.
            Your files never leave your machine.
          </p>
          <button className="btn primary" onClick={handlePick}>
            <i className="ti ti-folder-open" aria-hidden="true" /> Choose client folder
          </button>
        </div>
      )}

      {scanning && (
        <p className="files-subtitle">
          <i className="ti ti-loader-2 files-scanning-icon" aria-hidden="true" />
          {' '}Scanning <strong>{folderName}</strong>…
        </p>
      )}

      {error && (
        <div className="files-error">
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          {' '}{error}
        </div>
      )}

      {scanned && !scanning && !error && (
        <p className="files-subtitle">
          <strong>{files.length}</strong>
          {' '}ROAR/ELP file{files.length !== 1 ? 's' : ''} found in <strong>{folderName}</strong>
          {rankNote && <> matching <strong>{rankNote}</strong></>}
          {files.length > 0 && '. Select one or more to continue.'}
        </p>
      )}

      {scanned && !scanning && files.length === 0 && !error && (
        <div className="files-empty">
          <i className="ti ti-folder-off files-empty-icon" aria-hidden="true" />
          No ROAR or ELP files matched your search in that folder.
          <br />
          <span className="files-empty-hint">Try a broader search (clear the year or publisher), pick a different folder, or upload a file manually on the previous step.</span>
        </div>
      )}

      {files.length > 0 && (
        <div className="files-columns">
          <div className="files-column">
            <div className="files-column-title">ROAR</div>
            {files.filter(f => f.docType === 'ROAR' && !f._isDraft).length === 0
              ? <div className="files-column-empty">No ROAR files</div>
              : files.filter(f => f.docType === 'ROAR' && !f._isDraft).map(f => (
                  <FileCard key={`${f.path}/${f.name}`} f={f} selected={selected.has(`${f.path}/${f.name}`)} onToggle={toggleFile} />
                ))}
          </div>
          <div className="files-column">
            <div className="files-column-title">ELP</div>
            {files.filter(f => f.docType === 'ELP' && !f._isDraft).length === 0
              ? <div className="files-column-empty">No ELP files</div>
              : files.filter(f => f.docType === 'ELP' && !f._isDraft).map(f => (
                  <FileCard key={`${f.path}/${f.name}`} f={f} selected={selected.has(`${f.path}/${f.name}`)} onToggle={() => setShowElpModal(true)} />
                ))}
          </div>
        </div>
      )}

      {files.some(f => f._isDraft) && (
        <div className="files-drafts">
          <button
            className="files-drafts-toggle"
            onClick={() => setShowDrafts(s => !s)}
            aria-expanded={showDrafts}
          >
            <i className={`ti ti-chevron-${showDrafts ? 'down' : 'right'}`} aria-hidden="true" />
            See drafts ({files.filter(f => f._isDraft).length})
          </button>
          {showDrafts && (
            <div className="files-columns files-drafts-list">
              <div className="files-column">
                <div className="files-column-title">ROAR</div>
                {files.filter(f => f.docType === 'ROAR' && f._isDraft).length === 0
                  ? <div className="files-column-empty">No ROAR drafts</div>
                  : files.filter(f => f.docType === 'ROAR' && f._isDraft).map(f => (
                      <FileCard key={`${f.path}/${f.name}`} f={f} selected={selected.has(`${f.path}/${f.name}`)} onToggle={toggleFile} />
                    ))}
              </div>
              <div className="files-column">
                <div className="files-column-title">ELP</div>
                {files.filter(f => f.docType === 'ELP' && f._isDraft).length === 0
                  ? <div className="files-column-empty">No ELP drafts</div>
                  : files.filter(f => f.docType === 'ELP' && f._isDraft).map(f => (
                      <FileCard key={`${f.path}/${f.name}`} f={f} selected={selected.has(`${f.path}/${f.name}`)} onToggle={() => setShowElpModal(true)} />
                    ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="btn-row">
        <button className="btn ghost" onClick={onBack}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back
        </button>
        {supported && scanned && (
          <button className="btn" onClick={handlePick}>
            <i className="ti ti-folder-open" aria-hidden="true" /> Choose a different folder
          </button>
        )}
        {files.length > 0 && (
          <button
            className="btn primary is-gated"
            disabled={selected.size === 0 || preparing}
            onClick={handleContinue}
          >
            {preparing
              ? <><i className="ti ti-loader-2 spinning" aria-hidden="true" /> Preparing…</>
              : <>Continue with {selected.size || 0} file{selected.size !== 1 ? 's' : ''} <i className="ti ti-arrow-right" aria-hidden="true" /></>
            }
          </button>
        )}
      </div>

      {showElpModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <i className="ti ti-clock modal-icon" aria-hidden="true" />
            <div className="modal-title">This feature is coming soon!</div>
            <p className="modal-text">ELP extraction is not yet available. Please use a ROAR document for now.</p>
            <div className="modal-btn-row">
              <button className="btn primary" onClick={() => setShowElpModal(false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Slide Carousel ───────────────────────────────────────────────────────────
// PPTX → embedded thumbnail (instant, zero conversion, zero extra disk).
// PDF  → PDF.js full-page navigation at device pixel ratio (sharp vectors).
function SlideCarousel({ storedName }) {
  const BASE = 'http://localhost:8000/api';
  const isPDF = storedName.toLowerCase().endsWith('.pdf');

  // ── PPTX: simple thumbnail image ──────────────────────────────────────────
  if (!isPDF) {
    return <PptxThumbnail storedName={storedName} BASE={BASE} />;
  }

  // ── PDF: full PDF.js carousel ─────────────────────────────────────────────
  return <PdfCarousel storedName={storedName} BASE={BASE} />;
}

function PptxThumbnail({ storedName, BASE }) {
  const [status, setStatus] = useState('loading'); // loading | ok | error
  const src = `${BASE}/uploads/${encodeURIComponent(storedName)}/thumbnail`;
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1.5px solid var(--border)', background: '#0f1f3a', marginBottom: 16 }}>
      {status === 'loading' && (
        <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="ti ti-loader-2 spinning" style={{ fontSize: 26, color: 'var(--gold)' }} />
        </div>
      )}
      {status === 'error' && (
        <div style={{ height: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <i className="ti ti-eye-off" style={{ fontSize: 24, color: 'rgba(255,255,255,0.25)' }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>No preview available</span>
        </div>
      )}
      <img
        src={src}
        alt="Document preview"
        onLoad={() => setStatus('ok')}
        onError={() => setStatus('error')}
        style={{ display: status === 'ok' ? 'block' : 'none', width: '100%', height: 'auto' }}
      />
    </div>
  );
}

function PdfCarousel({ storedName, BASE }) {
  const canvasRef       = useRef(null);
  const renderTaskRef   = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [total, setTotal]   = useState(null);
  const [index, setIndex]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { GlobalWorkerOptions, getDocument } = await import('pdfjs-dist');
        GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url
        ).toString();
        const pdfUrl = `${BASE}/uploads/${encodeURIComponent(storedName)}/preview.pdf`;
        const pdf = await getDocument({ url: pdfUrl }).promise;
        if (cancelled) return;
        setPdfDoc(pdf);
        setTotal(pdf.numPages);
        setLoading(false);
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [storedName]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
    const render = async () => {
      try {
        const page     = await pdfDoc.getPage(index + 1);
        const dpr      = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: 1 });
        const canvas   = canvasRef.current;
        if (!canvas) return;
        const scale = (canvas.parentElement?.clientWidth || 560) / viewport.width * dpr;
        const vp    = page.getViewport({ scale });
        canvas.width  = vp.width;
        canvas.height = vp.height;
        canvas.style.width  = `${vp.width / dpr}px`;
        canvas.style.height = `${vp.height / dpr}px`;
        const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        renderTaskRef.current = task;
        await task.promise;
        renderTaskRef.current = null;
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') console.warn(e);
      }
    };
    render();
  }, [pdfDoc, index]);

  if (error) return null;

  const navBtn = (onClick, disabled, icon) => (
    <button onClick={onClick} disabled={disabled} style={{
      border: 'none', background: 'none', fontSize: 20, padding: '2px 6px',
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
      color: 'var(--text)',
    }}><i className={`ti ${icon}`} /></button>
  );

  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1.5px solid var(--border)', background: '#0f1f3a', marginBottom: 16, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', minHeight: 160 }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-loader-2 spinning" style={{ fontSize: 26, color: 'var(--gold)' }} />
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: loading ? 'none' : 'block', width: '100%' }} />
        {total && !loading && (
          <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#fff', fontWeight: 700 }}>
            {index + 1} / {total}
          </div>
        )}
      </div>
      {total > 1 && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {navBtn(() => setIndex(i => Math.max(0, i - 1)), index === 0, 'ti-chevron-left')}
          <div style={{ display: 'flex', gap: 5 }}>
            {Array.from({ length: Math.min(total, 10) }).map((_, i) => (
              <button key={i} onClick={() => setIndex(i)} style={{
                width: index === i ? 18 : 6, height: 6, borderRadius: 3,
                border: 'none', padding: 0, cursor: 'pointer',
                background: index === i ? 'var(--gold)' : 'rgba(255,255,255,0.25)',
                transition: 'width 0.2s, background 0.2s',
              }} />
            ))}
            {total > 10 && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>…</span>}
          </div>
          {navBtn(() => setIndex(i => Math.min(total - 1, i + 1)), index === total - 1, 'ti-chevron-right')}
        </div>
      )}
    </div>
  );
}

// ─── Slide stack: all PDF pages rendered top-to-bottom ───────────────────────
const SlideStack = React.forwardRef(function SlideStack({ storedName }, ref) {
  const BASE = 'http://localhost:8000/api';
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);
  const [highlighted, setHighlighted] = useState(null);
  const slideRefs = useRef([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE}/uploads/${encodeURIComponent(storedName)}/slides`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(({ count }) => { if (!cancelled) { setTotal(count); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [storedName]);

  React.useImperativeHandle(ref, () => ({
    jumpTo(index) {
      const el = slideRefs.current[index];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setHighlighted(index);
        setTimeout(() => setHighlighted(null), 2000);
      }
    }
  }), []);

  if (error) return (
    <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
      <i className="ti ti-file-off" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
      Preview not available for this file
    </div>
  );
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
      <i className="ti ti-loader-2 spinning" style={{ fontSize: 28, color: 'var(--gold)' }} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          ref={el => slideRefs.current[i] = el}
          style={{
            position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#eee',
            transition: 'box-shadow 0.3s',
            boxShadow: highlighted === i ? '0 0 0 3px var(--gold)' : 'none',
          }}
        >
          <img
            src={`${BASE}/uploads/${encodeURIComponent(storedName)}/slides/${i}.png`}
            alt={`Slide ${i + 1}`}
            style={{ display: 'block', width: '100%', height: 'auto' }}
            loading="lazy"
          />
          <div style={{
            position: 'absolute', bottom: 6, right: 8,
            background: highlighted === i ? 'var(--gold)' : 'rgba(0,0,0,0.55)',
            borderRadius: 4, padding: '2px 7px', fontSize: 10, color: '#fff', fontWeight: 700,
            transition: 'background 0.3s',
          }}>
            {i + 1} / {total}
          </div>
        </div>
      ))}
    </div>
  );
});

// ─── Screen 2: SME Validate ───────────────────────────────────────────────────
// A single batch checkpoint: one SME decision covers every file in the batch.
// For a single-file batch this renders exactly like the original one-file view.
function ScreenValidate({ selectedFile, files = [], onConfirm, onBack, defaultName = '', isDuplicate = false }) {
  const [decision, setDecision] = useState(() => isDuplicate ? 'note' : 'approve');
  const [smeName, setSmeName]   = useState(defaultName);
  const [smeNotes, setSmeNotes] = useState('');
  const [docChecks, setDocChecks] = useState({});
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const timestamp = useRef(new Date().toLocaleString());
  const batch = files.length ? files : (selectedFile ? [selectedFile] : []);
  const isMulti = batch.length > 1;

  // Run document checks on mount for uploaded files
  useEffect(() => {
    batch.forEach(f => {
      if (!f?.stored_name) return;
      checkUpload(f.stored_name, { client: f.client || '', publisher: f.publisher || '', year: f.year || '', original_filename: f.name || '' })
        .then(result => setDocChecks(prev => ({ ...prev, [f.stored_name]: result })))
        .catch(() => {});
    });
  }, []);

  // True when any checked file has at least one warning
  const hasWarnings = batch.some(f => f?.stored_name && docChecks[f.stored_name] && !docChecks[f.stored_name].is_ok);

  // If warnings appear after checks load, force the decision off 'approve'
  useEffect(() => {
    if (hasWarnings && decision === 'approve') setDecision('note');
  }, [hasWarnings]);

  const notesMissing = (decision === 'note' || isDuplicate) && !smeNotes.trim();
  const handleConfirm = () => {
    if (decision === 'flag') { onBack(); return; }
    onConfirm({ decision, smeName, smeNotes });
  };

  const OPTIONS = isDuplicate
    ? [
        {
          id: 'note',
          icon: 'ti-edit',
          title: 'Approve with notes — mandatory',
          sub: 'Provide a justification for processing this duplicate',
        },
        {
          id: 'flag',
          icon: 'ti-flag',
          title: 'Flag and Return — discard this file',
          sub: 'Flagged decision is recorded in the audit log',
        },
      ]
    : [
        {
          id: 'approve',
          icon: 'ti-circle-check',
          title: 'Approve — correct file, proceed',
          sub: 'Decision + timestamp stored in audit log',
          blockedWhenWarnings: true,
        },
        {
          id: 'flag',
          icon: 'ti-alert-triangle',
          title: 'Flag — wrong file, return to upload',
          sub: 'Flagged decision is still recorded',
        },
        {
          id: 'note',
          icon: 'ti-edit',
          title: 'Approve with notes',
          sub: 'Add a reason to override the warning',
        },
      ];

  return (
    <div className="sme-gate">
      <div className="sme-gate-header">
        <span className="sme-gate-badge">SME Checkpoint</span>
        <div>
          <div className="sme-gate-title">Subject Matter Expert Validation</div>
          <div className="sme-gate-sub">
            {isMulti
              ? `Review the ${batch.length} files before extraction proceeds`
              : 'Review the file before extraction proceeds'}
          </div>
        </div>
      </div>

      {/* ── Duplicate warning banner ── */}
      {isDuplicate && (
        <div style={{
          marginBottom: 14,
          borderRadius: 10,
          padding: '14px 18px',
          display: 'flex',
          gap: 13,
          alignItems: 'flex-start',
          background: '#fff1f2',
          border: '1.5px solid #fca5a5',
        }}>
          <i className="ti ti-copy-off" style={{ fontSize: 20, color: '#dc2626', marginTop: 1, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, color: '#b91c1c', fontSize: 14, marginBottom: 4 }}>
              Duplicate document detected
            </div>
            <div style={{ fontSize: 13, color: '#7f1d1d', lineHeight: 1.6 }}>
              A record with the same client, publisher, and year already exists. To continue, you must either
              provide a written justification (Approve with notes) or discard this file (Flag and Return).
              Notes are required — the Confirm button will remain locked until a reason is entered.
            </div>
          </div>
        </div>
      )}

      {/* ── Document validation banners ── */}
      {batch.filter(f => f?.stored_name && docChecks[f.stored_name]).map(f => {
        const check = docChecks[f.stored_name];
        return (
          <div key={f.stored_name} style={{
            marginBottom: 12,
            borderRadius: 10,
            padding: '12px 16px',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            background: check.is_ok ? 'var(--green-pale, #edfaf4)' : '#fff8ec',
            border: `1.5px solid ${check.is_ok ? 'var(--green, #22c55e)' : '#f59e0b'}`,
          }}>
            <i className={`ti ${check.is_ok ? 'ti-circle-check' : 'ti-alert-triangle'}`}
              style={{ fontSize: 20, color: check.is_ok ? 'var(--green, #22c55e)' : '#f59e0b', marginTop: 1 }} />
            <div>
              {isMulti && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 2 }}>{f.name}</div>}
              {check.is_ok ? (
                <div style={{ fontWeight: 700, color: '#15803d', fontSize: 14 }}>
                  Your document looks good — ready to continue.
                </div>
              ) : (
                <>
                  <div style={{ fontWeight: 700, color: '#b45309', fontSize: 14, marginBottom: 4 }}>
                    Are you sure this is the right document?
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#92400e' }}>
                    {check.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* ── File tabs (multi-file) ── */}
      {isMulti && (
        <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: 0, overflowX: 'auto' }}>
          {batch.map((f, i) => {
            const label = f?.name ? f.name.replace(/\.[^.]+$/, '').slice(0, 24) : `File ${i + 1}`;
            const isActive = activeTab === i;
            return (
              <button key={i} onClick={() => setActiveTab(i)} style={{
                padding: '7px 16px', border: 'none', borderBottom: isActive ? '2px solid var(--gold)' : '2px solid transparent',
                marginBottom: -2, background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                fontWeight: isActive ? 700 : 500, fontSize: 13,
                color: isActive ? 'var(--gold)' : 'var(--text-muted)',
              }}>
                <i className="ti ti-file-description" style={{ marginRight: 5, fontSize: 13 }} />
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Horizontal file info strip ── */}
      {(() => {
        const f = isMulti ? batch[activeTab] : (selectedFile || batch[0]);
        if (!f) return null;
        const chips = [
          { icon: 'ti-file-description', val: f.name },
          { icon: 'ti-building', val: f.client },
          { icon: 'ti-brand-windows', val: f.publisher },
          { icon: 'ti-calendar', val: f.year },
          { icon: 'ti-clock', val: timestamp.current },
        ].filter(c => c.val);
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
            {chips.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)', borderRadius: 6, padding: '4px 10px' }}>
                <i className={`ti ${c.icon}`} style={{ fontSize: 13 }} />
                <span style={{ color: 'var(--text)', fontWeight: 500 }}>{c.val}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Preview | Decision ── */}
      <div className="sme-two-col">
        <div className="sme-col-left">
          {(() => {
            const f = isMulti ? batch[activeTab] : batch[0];
            return f?.stored_name ? <SlideCarousel key={f.stored_name} storedName={f.stored_name} /> : null;
          })()}
        </div>

        <div className="sme-col-right">
          <div className="sme-decision-label">SME Decision — recorded to audit log</div>

          {OPTIONS.map(opt => {
            const blocked = hasWarnings && opt.blockedWhenWarnings;
            return (
              <button
                key={opt.id}
                className={`sme-option ${decision === opt.id ? 'selected' : ''} ${blocked ? 'is-disabled' : ''}`}
                onClick={() => !blocked && setDecision(opt.id)}
                disabled={blocked}
                title={blocked ? 'Cannot approve — document has unresolved warnings' : undefined}
              >
                <i
                  className={`ti ${opt.icon} sme-option-icon ${opt.id}`}
                  aria-hidden="true"
                />
                <div>
                  <div className="sme-option-title">{opt.title}</div>
                  <div className="sme-option-sub">
                    {blocked ? 'Not available — resolve warnings or add a note' : opt.sub}
                  </div>
                </div>
              </button>
            );
          })}

          <div className="field-group sme-name-field">
            <label className="field-label sme-field-label" htmlFor="sme-name">
              SME name / initials
            </label>
            <input
              id="sme-name"
              type="text"
              className="sme-input"
              placeholder="e.g. J. Rivera"
              value={smeName}
              onChange={e => setSmeName(e.target.value)}
            />
          </div>

          {(decision === 'note' || isDuplicate) && (
            <div className="field-group">
              <label className="field-label sme-field-label" htmlFor="sme-notes">
                Notes {isDuplicate && <span style={{ color: '#dc2626', marginLeft: 4 }}>— required</span>}
              </label>
              <textarea
                id="sme-notes"
                className="sme-input sme-notes-input"
                placeholder={isDuplicate
                  ? 'Provide a reason for processing this duplicate (e.g. updated figures, corrected data)…'
                  : 'Add context for the record…'}
                value={smeNotes}
                onChange={e => setSmeNotes(e.target.value)}
                style={isDuplicate && notesMissing ? { borderColor: '#dc2626' } : {}}
              />
              {isDuplicate && notesMissing && decision !== 'flag' && (
                <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>
                  A justification is required before you can proceed.
                </div>
              )}
            </div>
          )}

          <div className="sme-btn-row">
            <button
              className="btn sme-back-btn"
              onClick={() => setShowBackConfirm(true)}
            >
              <i className="ti ti-arrow-left" aria-hidden="true" /> Back
            </button>
            <button
              className="btn primary sme-confirm-btn"
              onClick={handleConfirm}
              disabled={decision !== 'flag' && notesMissing}
              title={decision !== 'flag' && notesMissing ? 'Add a justification note to proceed' : undefined}
            >
              {decision === 'flag'
                ? <><i className="ti ti-flag" aria-hidden="true" /> Flag &amp; Return</>
                : <><i className="ti ti-lock-open" aria-hidden="true" /> Confirm &amp; Extract</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── Back confirmation modal ── */}
      {showBackConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowBackConfirm(false)}>
          <div style={{
            background: '#ffffff', borderRadius: 14, padding: '28px 32px', width: 380,
            boxShadow: '0 8px 40px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', gap: 16,
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="ti ti-arrow-back-up" style={{ color: 'var(--gold)', fontSize: 22 }} />
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>Go back to upload?</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Going back will clear your uploaded {batch.length > 1 ? `${batch.length} files` : 'file'} and you'll need to start the upload over.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowBackConfirm(false)}
                style={{ padding: '7px 18px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                Stay here
              </button>
              <button
                onClick={onBack}
                style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: 'var(--navy)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                Yes, go back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Strip currency formatting and return a float (or NaN)
function parseDollar(str) {
  if (!str) return NaN;
  return parseFloat(String(str).replace(/[$,\s]/g, ''));
}

// Format a number as a dollar string, e.g. 42000 → "$42,000"
// Negative results are shown as "-$42,000"
function formatDollar(n) {
  if (isNaN(n) || n === 0) return null;
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return (n < 0 ? '-' : '') + '$' + formatted;
}

// ─── Batch aggregation helpers ────────────────────────────────────────────────
// Canonical field schema (label + variant) used to build the aggregate row.
const CANON_FIELDS = EXTRACTED_FIELDS.map(f => ({ label: f.label, variant: f.variant }));

// Sum each ROI field across every non-excluded file in the batch. A field that
// was skipped (or absent) in a file contributes 0; a field skipped in EVERY
// file stays skipped in the aggregate rather than showing a misleading $0.
function aggregateFinalFields(results) {
  const active = results.filter(r => !r.excluded && r.finalFields && r.finalFields.length);
  if (active.length === 0) return BLANK_FIELDS;
  if (active.length === 1) return active[0].finalFields;   // single file → its own values verbatim
  return CANON_FIELDS.map(({ label, variant }) => {
    let sum = 0, anyValue = false;
    active.forEach(r => {
      const f = r.finalFields.find(x => x.label === label);
      if (!f || f.flag === 'SME skipped — data not available') return;
      const n = parseDollar(f.value);
      if (!isNaN(n)) { sum += n; anyValue = true; }
    });
    if (!anyValue) {
      return { label, value: null, confidence: null, variant, source: null, flag: 'SME skipped — data not available', entryMode: null };
    }
    const value = sum === 0 ? '$0' : formatDollar(sum);
    return { label, value, confidence: null, variant, source: `Summed across ${active.length} files`, flag: null, entryMode: 'aggregated' };
  });
}

// Derive the shared client / publisher / year for a batch, flagging when files
// disagree so the Store step can warn before writing a combined record.
function deriveCommonMeta(results) {
  const metas = results.filter(r => !r.excluded).map(r => r.fileMeta || {});
  const distinct = (k, upK) => [...new Set(metas.map(m => m[k] || m[upK] || '').filter(Boolean))];
  const clients = distinct('client', 'upClient');
  const pubs    = distinct('publisher', 'upPublisher');
  const years   = distinct('year', 'upYear');
  return {
    client:      clients.length === 1 ? clients[0] : '',
    publisher:   pubs.length === 1 ? pubs[0] : '',
    year:        years.length === 1 ? years[0] : '',
    mixedClient: clients.length > 1,
    mixedYear:   years.length > 1,
  };
}

// Build the flat ROI record the backend expects from a file's meta + fields.
// Canonical UI label → backend model key. Used for BOTH value extraction and
// per-field provenance, so the two always stay in sync.
const LABEL_TO_KEY = {
  'Identified Risk':                'identified_risk',
  'Identified Cost Avoidance':      'id_cost_avoidance',
  'Accomplished Cost Avoidance':    'acc_cost_avoidance',
  'Identified Cost Optimization':   'id_cost_optimization',
  'Accomplished Cost Optimization': 'acc_cost_optimization',
  'Identified Cost Savings':        'realized_savings',
  'Realized Cost Savings':          'contract_spend',
};

// Build per-field provenance (source slide + confidence + alternates) from the
// script extractor's scriptData map, keyed by backend model field name. Returns
// null when there's no provenance to attach (e.g. aggregate records).
function buildFieldMeta(scriptData) {
  if (!scriptData || typeof scriptData !== 'object') return null;
  const out = {};
  for (const [label, key] of Object.entries(LABEL_TO_KEY)) {
    const s = scriptData[label];
    if (!s) continue;
    if (s.sourceSlide == null && s.confidence == null && !(s.alternates?.length)) continue;
    out[key] = {
      source_slide: s.sourceSlide ?? null,
      confidence:   s.confidence ?? null,
      alternates:   (s.alternates || []).map(a => ({ value: a.value, confidence: a.confidence })),
    };
  }
  return Object.keys(out).length ? out : null;
}

function buildRecord(meta, fields, sme, scriptData = null) {
  const getValue = (label) => {
    const f = fields.find(x => x.label === label);
    const n = parseDollar(f?.value);
    return isNaN(n) ? null : n;
  };
  return {
    client:                meta?.client    || meta?.upClient    || '',
    publisher:             meta?.publisher || meta?.upPublisher || '',
    year:                  parseInt(meta?.year || meta?.upYear || new Date().getFullYear()),
    identified_risk:       getValue('Identified Risk'),
    id_cost_avoidance:     getValue('Identified Cost Avoidance'),
    acc_cost_avoidance:    getValue('Accomplished Cost Avoidance'),
    id_cost_optimization:  getValue('Identified Cost Optimization'),
    acc_cost_optimization: getValue('Accomplished Cost Optimization'),
    realized_savings:      getValue('Identified Cost Savings'),
    contract_spend:        getValue('Realized Cost Savings'),
    confidence:            fields.find(x => x.confidence != null)?.confidence ?? null,
    source_file:           meta?.filename || meta?.name || meta?.file_path || '',
    stored_name:           meta?.stored_name || '',
    sme:                   sme || '',
    field_meta:            buildFieldMeta(scriptData),
  };
}

// ─── Script extractor (/api/roar/extract) → Compare "Script" column ───────────
// Maps the extractor's roi_fields keys to the canonical Compare labels.
// Note: 'identified_cost_savings' is intentionally omitted — the deterministic
// script extractor does not return it by design (it is not present in standard
// ROAR documents), so there is no key to map here.
const ROAR_KEY_TO_LABEL = {
  identified_risk:                'Identified Risk',
  identified_cost_avoidance:      'Identified Cost Avoidance',
  accomplished_cost_avoidance:    'Accomplished Cost Avoidance',
  identified_cost_optimization:   'Identified Cost Optimization',
  accomplished_cost_optimization: 'Accomplished Cost Optimization',
  realized_cost_savings:          'Realized Cost Savings',
};

// Shape the raw extractor response into { [label]: { value, confidence, uncertain, alternates } }
// for the Compare screen. A field is "uncertain" when the extractor found competing
// candidate values (alternates) — that's what flags the file for SME scrutiny.
function buildScriptData(roar) {
  const fields = roar?.roi_fields || {};
  const out = {};
  for (const [key, label] of Object.entries(ROAR_KEY_TO_LABEL)) {
    const f = fields[key];
    if (!f) continue;
    const alternates = Array.isArray(f.alternates) ? f.alternates : [];
    out[label] = {
      value: formatDollar(f.value),
      confidence: f.confidence,
      uncertain: alternates.length > 0,
      alternates: alternates.map(a => ({ value: formatDollar(a.value), confidence: a.confidence })),
      capacity: f.capacity,
      sourceSlide: f.source_slide,
      raw: f.raw ?? null,
    };
  }
  return out;
}

// ─── ROI Field Metadata (definitions, questions, types, formulas) ─────────────
const ROI_FIELD_META = {
  'Identified Risk': {
    definition: 'Quantified financial exposure due to non-compliance with software licensing or contractual terms.',
    questions: [
      'Which software publisher(s) or product(s) have a compliance shortfall?',
      'What is the unit cost (price per license)?',
      'How many licenses is the client entitled to per contract?',
      'How many licenses are currently deployed or in use?',
      'What contract period or date does this exposure apply to?',
    ],
    // 'text' | 'currency' | 'number' | 'date'
    questionTypes: ['text', 'currency', 'number', 'number', 'date'],
    formula: 'Calculated as: (Deployed Licenses − Entitled Licenses) × Unit Cost',
    // answers[1]=unitCost  answers[2]=entitled  answers[3]=deployed
    compute(answers) {
      const unitCost  = parseDollar(answers[1]);
      const entitled  = parseFloat(answers[2]);
      const deployed  = parseFloat(answers[3]);
      if (isNaN(unitCost) || isNaN(entitled) || isNaN(deployed)) return null;
      return formatDollar((deployed - entitled) * unitCost);
    },
  },
  'Identified Cost Avoidance': {
    definition: 'Potential unbudgeted costs that can be prevented through proactive compliance. Measurable in avoided liabilities. Client has NOT yet acted.',
    questions: [
      'What over-deployment or compliance gap did you identify that the client could remediate?',
      'How many excess licenses could be removed?',
      'What is the unit cost of those licenses?',
      'Can the client remediate this within their current contract terms?',
    ],
    questionTypes: ['text', 'number', 'currency', 'text'],
    formula: 'Calculated as: Excess Licenses × Unit Cost',
    // answers[1]=excessLicenses  answers[2]=unitCost
    compute(answers) {
      const excess    = parseFloat(answers[1]);
      const unitCost  = parseDollar(answers[2]);
      if (isNaN(excess) || isNaN(unitCost)) return null;
      return formatDollar(excess * unitCost);
    },
  },
  'Accomplished Cost Avoidance': {
    definition: 'The quantified result of actions taken to prevent unbudgeted costs. Requires client action to accomplish.',
    questions: [
      'What action did the client take (e.g. removed deployments, reduced installs)?',
      'How many licenses were removed or remediated?',
      'What is the unit cost of those licenses?',
      'What is the confirmation or evidence of the action taken?',
    ],
    questionTypes: ['text', 'number', 'currency', 'text'],
    formula: 'Calculated as: Remediated Licenses × Unit Cost',
    // answers[1]=remediatedLicenses  answers[2]=unitCost
    compute(answers) {
      const remediated = parseFloat(answers[1]);
      const unitCost   = parseDollar(answers[2]);
      if (isNaN(remediated) || isNaN(unitCost)) return null;
      return formatDollar(remediated * unitCost);
    },
  },
  'Identified Cost Optimization': {
    definition: 'Opportunities to reduce software, hardware, or cloud expenses through license optimization, contract negotiations, or strategic adjustments. Client has NOT yet acted.',
    questions: [
      'What optimization opportunity did you identify?',
      'How many licenses are surplus to actual need?',
      'What is the unit cost or annual contract value of those licenses?',
      'Is a contract mechanism available to right-size (e.g. true-down clause, renewal timing)?',
    ],
    questionTypes: ['text', 'number', 'currency', 'text'],
    formula: 'Calculated as: Surplus Licenses × Unit Cost, or estimated contract delta',
    // answers[1]=surplusLicenses  answers[2]=unitCost
    compute(answers) {
      const surplus   = parseFloat(answers[1]);
      const unitCost  = parseDollar(answers[2]);
      if (isNaN(surplus) || isNaN(unitCost)) return null;
      return formatDollar(surplus * unitCost);
    },
  },
  'Accomplished Cost Optimization': {
    definition: 'Verified cost reductions through renegotiations, contract adjustments, or technology shifts. Requires client action to accomplish.',
    // This field supports two input modes — pick one using the toggle on the form.
    modes: {
      contractValue: {
        label: 'Contract value change',
        questions: [
          'What specific action was taken?',
          'What was the original contract value?',
          'What is the new contract value after the change?',
          'What is the effective date of the change?',
        ],
        questionTypes: ['text', 'currency', 'currency', 'date'],
        formula: 'Calculated as: Original Contract Value − New Contract Value',
        // answers[1]=originalValue  answers[2]=newValue
        compute(answers) {
          const original = parseDollar(answers[1]);
          const newVal   = parseDollar(answers[2]);
          if (isNaN(original) || isNaN(newVal)) return null;
          return formatDollar(original - newVal);
        },
      },
      licenseCount: {
        label: 'License count change',
        questions: [
          'What specific action was taken?',
          'What was the original license count?',
          'What is the new license count after the change?',
          'What is the cost per license?',
          'What is the effective date of the change?',
        ],
        questionTypes: ['text', 'number', 'number', 'currency', 'date'],
        formula: 'Calculated as: (Original Count − New Count) × Cost Per License',
        // answers[1]=originalCount  answers[2]=newCount  answers[3]=costPerLicense
        compute(answers) {
          const original        = parseFloat(answers[1]);
          const newCount        = parseFloat(answers[2]);
          const costPerLicense  = parseDollar(answers[3]);
          if (isNaN(original) || isNaN(newCount) || isNaN(costPerLicense)) return null;
          return formatDollar((original - newCount) * costPerLicense);
        },
      },
    },
  },
  'Identified Cost Savings': {
    definition: 'A hard-dollar reduction opportunity has been identified but not yet realized.',
    questions: [
      'What is the current annual spend for this publisher or product?',
      'What specific mechanism would generate savings?',
      'What is the projected reduced spend if the opportunity is acted upon?',
    ],
    questionTypes: ['currency', 'text', 'currency'],
    formula: 'Calculated as: Current Spend − Projected Spend',
    // answers[0]=currentSpend  answers[2]=projectedSpend
    compute(answers) {
      const current   = parseDollar(answers[0]);
      const projected = parseDollar(answers[2]);
      if (isNaN(current) || isNaN(projected)) return null;
      return formatDollar(current - projected);
    },
  },
  'Realized Cost Savings': {
    definition: 'Hard-dollar savings reflected in budgets or financial statements due to negotiated reductions or decreased expenses.',
    questions: [
      "What was the client's spend for this publisher/product in the prior comparable period?",
      'What is the confirmed spend for this period?',
      'What drove the reduction?',
      'Is this reflected in an invoice, PO, or budget document?',
    ],
    questionTypes: ['currency', 'currency', 'text', 'text'],
    formula: 'Calculated as: Prior Period Spend − Current Period Spend',
    // answers[0]=priorSpend  answers[1]=currentSpend
    compute(answers) {
      const prior   = parseDollar(answers[0]);
      const current = parseDollar(answers[1]);
      if (isNaN(prior) || isNaN(current)) return null;
      return formatDollar(prior - current);
    },
  },
};

// ─── Claude extractor response → canonical 7-field array ──────────────────────
// When no data came back, fall back to the honest blank template (no mock numbers).
function buildClaudeFields(extractedData) {
  if (!extractedData) return BLANK_FIELDS;
  const fmt = (n) => n != null ? `$${Number(n).toLocaleString()}` : null;
  const fallbackConf = extractedData?.overall_confidence ?? extractedData?.confidence ?? null;
  // Support both new per-field format {value, confidence, source} and old flat format
  const fieldVal  = (key) => { const v = extractedData[key]; return (v && typeof v === 'object') ? v.value  : v; };
  const fieldConf = (key) => { const v = extractedData[key]; return (v && typeof v === 'object') ? (v.confidence ?? null) : fallbackConf; };
  const fieldSrc  = (key) => { const v = extractedData[key]; return (v && typeof v === 'object') ? (v.source  ?? null) : null; };
  const entry     = (key) => fieldVal(key) != null ? 'extracted' : null;
  return [
    { label: 'Identified Risk',                value: fmt(fieldVal('identified_risk')),         variant: 'green', confidence: fieldConf('identified_risk'),         source: fieldSrc('identified_risk'),         flag: null, entryMode: entry('identified_risk')         },
    { label: 'Identified Cost Avoidance',      value: fmt(fieldVal('id_cost_avoidance')),       variant: 'green', confidence: fieldConf('id_cost_avoidance'),       source: fieldSrc('id_cost_avoidance'),       flag: null, entryMode: entry('id_cost_avoidance')       },
    { label: 'Accomplished Cost Avoidance',    value: fmt(fieldVal('acc_cost_avoidance')),      variant: 'green', confidence: fieldConf('acc_cost_avoidance'),      source: fieldSrc('acc_cost_avoidance'),      flag: null, entryMode: entry('acc_cost_avoidance')      },
    { label: 'Identified Cost Optimization',   value: fmt(fieldVal('id_cost_optimization')),    variant: 'blue',  confidence: fieldConf('id_cost_optimization'),    source: fieldSrc('id_cost_optimization'),    flag: null, entryMode: entry('id_cost_optimization')    },
    { label: 'Accomplished Cost Optimization', value: fmt(fieldVal('acc_cost_optimization')),   variant: 'blue',  confidence: fieldConf('acc_cost_optimization'),   source: fieldSrc('acc_cost_optimization'),   flag: null, entryMode: entry('acc_cost_optimization')   },
    { label: 'Identified Cost Savings',        value: fmt(fieldVal('identified_cost_savings')), variant: 'green', confidence: fieldConf('identified_cost_savings'), source: fieldSrc('identified_cost_savings'), flag: null, entryMode: entry('identified_cost_savings') },
    { label: 'Realized Cost Savings',          value: fmt(fieldVal('realized_savings')),        variant: 'green', confidence: fieldConf('realized_savings'),        source: fieldSrc('realized_savings'),        flag: null, entryMode: entry('realized_savings')        },
  ];
}

// ─── Screen 3: Extract — per-file missing-field review (modal + Q&A fallback) ──
// Extraction itself now runs up front in BatchExtract; this screen receives the
// pre-extracted data for ONE file and lets the SME fill in or skip any missing
// fields before that file moves on to Compare.
function ScreenExtract({ selectedFile, extractedData = null, batchInfo = null, onNext }) {
  // Modal + fallback form state.
  // Initialize showModal synchronously so the overlay is present on the very
  // first paint when fields are missing — otherwise the card paints once and the
  // overlay pops in a frame later, making the dialog appear to jump.
  const [showModal, setShowModal]         = useState(
    () => buildClaudeFields(extractedData).some(f => !f.value)
  );
  const [fallbackMode, setFallbackMode]   = useState(false);
  const [fallbackIndex, setFallbackIndex] = useState(0);
  // answers keyed by field label — each value is an array of strings (one per question)
  const [fallbackAnswers, setFallbackAnswers] = useState({});
  // working copy of fields that will be passed to Store
  const [mergedFields, setMergedFields] = useState(null);
  // active mode key for multi-mode fields (e.g. Accomplished Cost Optimization)
  const [modeSelections, setModeSelections] = useState({});
  // direct value entry — SME types a known dollar amount instead of going through Q&A
  const [directValues, setDirectValues] = useState({});   // { [fieldLabel]: string } raw numeric
  const [directNotes,  setDirectNotes]  = useState({});   // { [fieldLabel]: string } optional commentary
  // Q&A accordion — collapsed by default, resets when advancing to next field
  const [qaOpen, setQaOpen] = useState(false);

  // Pre-extracted data arrives via props; map it to the canonical 7-field array.
  // Falls back to the honest blank template when the extractor returned nothing.
  const displayFields = buildClaudeFields(extractedData);

  const confidence = extractedData?.confidence ?? null;
  const confClass = c => c >= 90 ? 'conf-high' : c >= 75 ? 'conf-mid' : 'conf-low';

  // Fields with no extracted value
  const missingFields = displayFields.filter(f => !f.value);

  // ── Modal handlers ──
  const handleSkipAll = () => {
    const skipped = displayFields.map(f =>
      f.value ? f : { ...f, value: null, flag: 'SME skipped — data not available', entryMode: null }
    );
    setShowModal(false);
    onNext(skipped);
  };

  const handleFillIn = () => {
    setShowModal(false);
    setFallbackIndex(0);
    setFallbackAnswers(
      Object.fromEntries(missingFields.map(f => {
        const fieldMeta    = ROI_FIELD_META[f.label];
        // Mode-based fields (e.g. Accomplished Cost Optimization) have no top-level
        // questions array — initialize using the first mode's question count instead.
        const firstModeKey = fieldMeta?.modes ? Object.keys(fieldMeta.modes)[0] : null;
        const questionCount = firstModeKey
          ? fieldMeta.modes[firstModeKey].questions.length
          : (fieldMeta?.questions?.length || 0);
        return [f.label, Array(questionCount).fill('')];
      }))
    );
    setDirectValues(Object.fromEntries(missingFields.map(f => [f.label, ''])));
    setDirectNotes(Object.fromEntries(missingFields.map(f => [f.label, ''])));
    setFallbackMode(true);
  };

  // ── Fallback form handlers ──
  const advanceFallback = (updatedFields) => {
    if (fallbackIndex < missingFields.length - 1) {
      setFallbackIndex(i => i + 1);
      setMergedFields(updatedFields);
      setQaOpen(false);
    } else {
      // All missing fields handled — go to Store
      setFallbackMode(false);
      onNext(updatedFields);
    }
  };

  const handleFallbackNext = () => {
    const field          = missingFields[fallbackIndex];
    // Direct entry takes priority over the Q&A computation path
    const rawDirect      = (directValues[field.label] || '').trim();
    const directNum      = parseFloat(rawDirect);
    const hasDirectValue = !isNaN(directNum) && rawDirect !== '';

    let computed;
    if (hasDirectValue) {
      computed = formatDollar(directNum);
    } else {
      const answers       = fallbackAnswers[field.label] || [];
      const meta          = ROI_FIELD_META[field.label];
      const activeModeKey = modeSelections[field.label] || (meta?.modes ? Object.keys(meta.modes)[0] : null);
      const resolvedMeta  = activeModeKey ? meta.modes[activeModeKey] : meta;
      computed = resolvedMeta?.compute ? resolvedMeta.compute(answers) : null;
    }

    const updated = (mergedFields || displayFields).map(f =>
      f.label === field.label
        ? { ...f, value: computed, entryMode: computed ? 'manual' : null, flag: computed ? null : 'SME skipped — data not available' }
        : f
    );
    advanceFallback(updated);
  };

  const handleFallbackSkip = () => {
    const field = missingFields[fallbackIndex];
    const updated = (mergedFields || displayFields).map(f =>
      f.label === field.label
        ? { ...f, value: null, entryMode: null, flag: 'SME skipped — data not available' }
        : f
    );
    advanceFallback(updated);
  };

  const updateAnswer = (qIdx, val) => {
    const field = missingFields[fallbackIndex];
    setFallbackAnswers(prev => {
      const arr = [...(prev[field.label] || [])];
      arr[qIdx] = val;
      return { ...prev, [field.label]: arr };
    });
  };

  // ── Render: fallback form ──
  if (fallbackMode) {
    const field      = missingFields[fallbackIndex];
    const meta       = ROI_FIELD_META[field.label] || { definition: '', questions: [], questionTypes: [], formula: '' };
    const answers    = fallbackAnswers[field.label] || [];

    // If this field has multiple modes, resolve the active mode's sub-config
    const activeModeKey = modeSelections[field.label] || (meta.modes ? Object.keys(meta.modes)[0] : null);
    const activeMeta    = activeModeKey ? meta.modes[activeModeKey] : meta;

    const handleModeChange = (modeKey) => {
      setModeSelections(prev => ({ ...prev, [field.label]: modeKey }));
      // Reset answers for this field so stale answer indices don't bleed across modes
      setFallbackAnswers(prev => ({
        ...prev,
        [field.label]: Array(meta.modes[modeKey].questions.length).fill(''),
      }));
    };

    const liveComputed = activeMeta.compute ? activeMeta.compute(answers) : null;

    return (
      <div className="card">
        {batchInfo?.total > 1 && (
          <div className="batch-progress">
            <i className="ti ti-files" aria-hidden="true" />
            File {batchInfo.index + 1} of {batchInfo.total}{batchInfo.name ? ` — ${batchInfo.name}` : ''}
          </div>
        )}
        <div className="fallback-progress">
          <i className="ti ti-edit" aria-hidden="true" />
          Field {fallbackIndex + 1} of {missingFields.length} — Manual Entry
        </div>
        <div className="card-title">{field.label}</div>
        <p className="fallback-field-def">{meta.definition}</p>

        <div className="fallback-two-col">

          {/* ── Left: Direct Value Entry ───────────────────────────────────── */}
          <div className="fallback-direct-section">
            <div className="fallback-direct-header">
              <i className="ti ti-currency-dollar" aria-hidden="true" />
              <div>
                <div className="fallback-direct-title">Enter a Known Value</div>
                <div className="fallback-direct-sub">Already have the ROI figure? Type it here.</div>
              </div>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="fb-direct-val">Dollar Amount</label>
              <div className="input-prefix-group">
                <span className="input-prefix">$</span>
                <input
                  id="fb-direct-val"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={directValues[field.label] || ''}
                  onChange={e => setDirectValues(prev => ({ ...prev, [field.label]: e.target.value }))}
                />
              </div>
            </div>
            <div className="field-group field-group-flush">
              <label className="field-label" htmlFor="fb-direct-notes">
                Commentary Notes <span className="fallback-optional-label">(optional)</span>
              </label>
              <textarea
                id="fb-direct-notes"
                className="fallback-notes-input"
                placeholder="Add any context or source reference for this value…"
                value={directNotes[field.label] || ''}
                onChange={e => setDirectNotes(prev => ({ ...prev, [field.label]: e.target.value }))}
              />
            </div>
          </div>

          {/* ── Right: Q&A Collapsible ─────────────────────────────────────── */}
          <div className="fallback-qa-section">
            <button
              className="fallback-qa-toggle"
              onClick={() => setQaOpen(o => !o)}
              aria-expanded={qaOpen}
            >
              <i className={`ti ti-chevron-${qaOpen ? 'up' : 'down'}`} aria-hidden="true" />
              Calculate from Q&amp;A
              <span className="fallback-qa-toggle-hint">
                {qaOpen ? 'Hide questions' : 'Expand to calculate'}
              </span>
            </button>

            {qaOpen && (
              <div className="fallback-qa-body">
                {/* Mode toggle — only shown for multi-mode fields */}
                {meta.modes && (
                  <div className="fallback-mode-toggle">
                    {Object.entries(meta.modes).map(([key, modeMeta]) => (
                      <button
                        key={key}
                        className={`fallback-mode-btn ${activeModeKey === key ? 'active' : ''}`}
                        onClick={() => handleModeChange(key)}
                      >
                        {modeMeta.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="fallback-questions">
                  {activeMeta.questions.map((q, qi) => {
                    const qType = (activeMeta.questionTypes && activeMeta.questionTypes[qi]) || 'text';
                    const val   = answers[qi] || '';
                    return (
                      <div className="fallback-question" key={qi}>
                        <label className="field-label" htmlFor={`fb-q-${qi}`}>{q}</label>
                        {qType === 'currency' ? (
                          <div className="input-prefix-group">
                            <span className="input-prefix">$</span>
                            <input
                              id={`fb-q-${qi}`}
                              type="number"
                              min="0"
                              step="any"
                              placeholder="0"
                              value={val}
                              onChange={e => updateAnswer(qi, e.target.value)}
                            />
                          </div>
                        ) : qType === 'date' ? (
                          <input
                            id={`fb-q-${qi}`}
                            type="date"
                            value={val}
                            onChange={e => updateAnswer(qi, e.target.value)}
                          />
                        ) : qType === 'number' ? (
                          <input
                            id={`fb-q-${qi}`}
                            type="number"
                            min="0"
                            step="1"
                            placeholder="0"
                            value={val}
                            onChange={e => updateAnswer(qi, e.target.value)}
                          />
                        ) : (
                          <input
                            id={`fb-q-${qi}`}
                            type="text"
                            placeholder="Optional — leave blank to skip"
                            value={val}
                            onChange={e => updateAnswer(qi, e.target.value)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="fallback-formula">{activeMeta.formula}</div>

                {liveComputed && (
                  <div className="fallback-computed-preview">
                    <i className="ti ti-calculator" aria-hidden="true" />
                    Calculated value: <strong>{liveComputed}</strong>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        <div className="btn-row">
          <button className="btn ghost" onClick={handleFallbackSkip}>
            <i className="ti ti-forward" aria-hidden="true" /> Skip this field
          </button>
          <button className="btn primary" onClick={handleFallbackNext}>
            {fallbackIndex < missingFields.length - 1 ? 'Next Field' : 'Review & Store'}
            <i className="ti ti-arrow-right" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  // ── Render: extracted results + missing-field review ──
  return (
    <div className="card">
      {batchInfo?.total > 1 && (
        <div className="batch-progress">
          <i className="ti ti-files" aria-hidden="true" />
          File {batchInfo.index + 1} of {batchInfo.total}{batchInfo.name ? ` — ${batchInfo.name}` : ''}
        </div>
      )}
      <div className="card-title">
        <i className="ti ti-cpu" aria-hidden="true" />
        ROI Extraction{selectedFile?.name ? ` — ${selectedFile.name}` : ''}
      </div>
      <p className="extract-sub">
        Review the extracted values. Fill in or skip anything the extractor could not find.
      </p>

      {(
        <div className="extract-results">
          <div className="extract-results-title">Extracted Fields</div>
          <div className="extract-chips">
            {displayFields.map(f => (
              <div className={`extract-chip ${!f.value ? 'missing' : ''}`} key={f.label}>
                <span className="extract-chip-label">{f.label.split(' ')[0]}:</span>
                <strong>{f.value ?? <span className="extract-chip-missing">not found</span>}</strong>
              </div>
            ))}
            <div className="extract-chip">
              <span className="extract-chip-label">Confidence:</span>
              <strong className={confidence != null ? confClass(confidence) : ''}>
                {confidence != null ? `${confidence}%` : '—'}
              </strong>
            </div>
          </div>
          {!showModal && missingFields.length === 0 && (
            <div className="btn-row">
              <button className="btn primary" onClick={() => onNext(displayFields)}>
                Continue to Compare <i className="ti ti-arrow-right" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Missing-fields modal ── */}
      {/* Rendered through a portal to document.body so it escapes the card's
          screenIn entrance animation. A `transform` on any ancestor makes a
          position:fixed child anchor to that ancestor instead of the viewport,
          which caused the overlay to appear offset and then jump to center when
          the animation finished. The portal keeps it viewport-centered from the
          first frame, so the overlay and dialog appear together. */}
      {showModal && createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-box">
            <div className="modal-icon">
              <i className="ti ti-alert-circle" aria-hidden="true" />
            </div>
            <div className="modal-title" id="modal-title">
              Some fields couldn't be extracted from your documents. Would you like to fill them in manually?
            </div>
            <ul className="modal-missing-list">
              {missingFields.map(f => (
                <li key={f.label}>
                  <i className="ti ti-point-filled" aria-hidden="true" />
                  {f.label}
                </li>
              ))}
            </ul>
            <div className="modal-btn-row">
              <button className="btn ghost" onClick={handleSkipAll}>
                Skip — Continue to Store
              </button>
              <button className="btn primary" onClick={handleFillIn}>
                <i className="ti ti-pencil" aria-hidden="true" /> Fill In Missing Fields
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Screen 3 (host): Batch Extract ───────────────────────────────────────────
// Runs the deterministic script extractor + Claude AI across EVERY file in the
// batch up front, on one progress screen. Each file's results are collected and
// handed to the per-file review (Compare) step. A single-file batch behaves like
// the original flow — one file processed, one progress row.
function BatchExtract({ files = [], onComplete }) {
  const [statuses, setStatuses] = useState(() => files.map(() => 'pending'));
  const [done, setDone] = useState(false);
  const resultsRef = useRef([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const results = [];
      for (let i = 0; i < files.length; i++) {
        if (cancelled) return;
        setStatuses(prev => prev.map((s, idx) => idx === i ? 'running' : s));

        const file = files[i];
        let extractedData = null;
        let scriptData = null;
        const tasks = [];

        // Script extractor — only runs when a raw File is available (uploads and
        // folder-scanned files); skipped on the SharePoint-search path.
        if (file?.file) {
          tasks.push(
            extractROAR(file.file)
              .then(roar => { scriptData = buildScriptData(roar); })
              .catch(() => {})
          );
        }

        // Claude AI extractor — pass the whole file object so it can use
        // id / stored_name / path, falling back to the filename.
        const fileRef = (file?.path || file?.id || file?.stored_name) ? file : (file?.name || '');
        tasks.push(
          extractFromFile(fileRef)
            .then(res => { extractedData = res.data || res; })
            .catch(() => {})
        );

        await Promise.all(tasks);
        if (cancelled) return;

        results.push({ fileMeta: file, extractedData, scriptData });
        setStatuses(prev => prev.map((s, idx) => idx === i ? 'done' : s));
        await new Promise(r => setTimeout(r, 150));
      }
      if (!cancelled) {
        resultsRef.current = results;
        setDone(true);
      }
    }

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!files.length) {
    return (
      <div className="card">
        <div className="card-title">
          <i className="ti ti-cpu" aria-hidden="true" /> ROI Extraction
        </div>
        <p className="extract-sub">No files selected. Go back and choose one or more files to extract.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">
        <i className="ti ti-cpu" aria-hidden="true" /> ROI Extraction
      </div>
      <p className="extract-sub">
        Running the script extractor and Claude AI across {files.length} file{files.length !== 1 ? 's' : ''}…
      </p>

      <div className="extract-steps">
        {files.map((f, i) => {
          const status = statuses[i];
          return (
            <div className={`extract-step ${status}`} key={i}>
              <div className="extract-step-icon">
                {status === 'done'    && <i className="ti ti-check" aria-hidden="true" />}
                {status === 'running' && <i className="ti ti-loader-2 spinning" aria-hidden="true" />}
                {status === 'pending' && <i className="ti ti-circle" aria-hidden="true" />}
              </div>
              <span className="extract-step-label">{f.name || `File ${i + 1}`}</span>
              {status === 'done'    && <Badge color="green"><i className="ti ti-check" /> Done</Badge>}
              {status === 'running' && <Badge color="blue">Running…</Badge>}
              {status === 'pending' && <Badge color="navy">Pending</Badge>}
            </div>
          );
        })}
      </div>

      {done && (
        <div className="btn-row">
          <button className="btn primary" onClick={() => onComplete(resultsRef.current)}>
            Review {files.length > 1 ? `${files.length} Files` : 'File'} <i className="ti ti-arrow-right" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Field Card with View Source ──────────────────────────────────────────────
function FieldCard({ field, currentValue, isEditing, onStartEdit, onCommit, onKeyDown }) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const isSkipped  = field.flag === 'SME skipped — data not available';
  const isManual   = field.entryMode === 'manual';
  const isEdited   = !isSkipped && currentValue !== field.value;
  const confClass  = field.confidence >= 90 ? 'conf-high' : field.confidence >= 75 ? 'conf-mid' : 'conf-low';
  const dotClass   = field.confidence >= 90 ? 'high'      : field.confidence >= 75 ? 'mid'      : 'low';

  if (isSkipped) {
    return (
      <div className="field-card field-card-skipped">
        <div className="field-card-name">{field.label}</div>
        <div className="field-card-value field-card-na">Not available</div>
        <div className="field-card-meta">
          <span className="field-card-skip-tag">
            <i className="ti ti-ban" aria-hidden="true" /> SME skipped
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="field-card">
      <div className="field-card-name">{field.label}</div>
      {isEditing ? (
        <input
          autoFocus
          defaultValue={currentValue}
          onBlur={e => onCommit(field.label, e.target.value)}
          onKeyDown={e => onKeyDown(e, field.label)}
          className="field-card-edit-input"
        />
      ) : (
        <div className="field-card-value-row">
          <span className="field-card-value">{currentValue}</span>
          {isManual  && <span className="field-card-manual-tag">Manually entered</span>}
          {isEdited  && <Badge color="amber">edited</Badge>}
          <button
            className="field-edit-btn"
            onClick={() => onStartEdit(field.label)}
            aria-label={`Edit ${field.label}`}
          >
            <i className="ti ti-pencil" aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="field-card-meta">
        {field.entryMode === 'extracted' && (
          <span className={`${confClass} field-card-conf`}>
            <span className={`conf-dot ${dotClass}`} />
            {field.confidence}%
          </span>
        )}
        {field.source && (
          <button className="view-source-btn" onClick={() => setSourceOpen(s => !s)}>
            <i className={`ti ti-${sourceOpen ? 'chevron-up' : 'link'}`} aria-hidden="true" />
            {sourceOpen ? 'Hide' : 'View Source'}
          </button>
        )}
      </div>
      {sourceOpen && field.source && (
        <div className="source-citation">{field.source}</div>
      )}
    </div>
  );
}


// ─── Screen 4: Compare ───────────────────────────────────────────────────────

// Strip $ / commas → raw numeric string for the number input
function toRaw(val) {
  if (!val || val === '—') return '';
  return String(val).replace(/[$,\s]/g, '');
}
// Raw numeric string → formatted dollar string for display and storage
function toFormatted(raw) {
  const n = parseFloat(raw);
  if (isNaN(n)) return '—';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function CompareRow({ field, onResolve, onJumpToSlide }) {
  const isSkipped   = field.flag === 'SME skipped — data not available';
  const bestVal     = field.sme ?? field.claude;
  const scriptMatch = !isSkipped && field.script !== '—' && field.script === bestVal;

  const [editVal,     setEditVal]     = useState(toRaw(bestVal));
  const [confirmed,   setConfirmed]   = useState(true);
  const [expanded,    setExpanded]    = useState(false);
  const [smeApproved, setSmeApproved] = useState(false);

  const scriptConfMed  = field.scriptConfidence != null && field.scriptConfidence >= 70 && field.scriptConfidence < 90;
  const claudeConfMed  = field.claudeConfidence != null && field.claudeConfidence >= 70 && field.claudeConfidence < 90;
  const interMismatch  = !isSkipped && field.script !== '—' && field.claude != null && field.script !== field.claude;
  const isUncertain    = !isSkipped && (field.scriptUncertain || interMismatch || scriptConfMed || claudeConfMed);

  useEffect(() => {
    onResolve(field.label, confirmed && (!isUncertain || smeApproved) ? toFormatted(editVal) : null);
  }, [confirmed, editVal, smeApproved]);

  const rowState = isSkipped ? 'skipped' : isUncertain && !smeApproved ? 'uncertain' : confirmed ? 'match' : 'mismatch';
  const hasSource = field.scriptRaw || field.claudeSource;

  return (
    <div className={`compare-row ${rowState}`}>

      {/* Field name */}
      <span className="compare-cell-field">
        {field.label}
        {hasSource && (
          <button
            className={`compare-source-toggle ${expanded ? 'is-open' : ''}`}
            onClick={() => setExpanded(e => !e)}
            aria-label={expanded ? 'Hide extraction source' : 'View extraction source'}
          >
            <i className="ti ti-file-search" aria-hidden="true" />
            <span>{expanded ? 'Hide source' : 'View source'}</span>
            <i className={`ti ti-chevron-${expanded ? 'up' : 'down'}`} aria-hidden="true" />
          </button>
        )}
      </span>

      {/* Script value — always shown when the script found one, independent of
          the SME-skipped flag (skipping concerns the Claude/SME side, not the
          deterministic script extractor). */}
      {(!field.script || field.script === '—') ? (
        <span className="compare-na">—</span>
      ) : (
        <span className={`compare-script ${(!isSkipped && !scriptMatch) ? 'is-mismatch' : ''}`}>
          <span
            className="compare-conf-wrap"
            data-tip={field.scriptConfidence != null ? `${field.scriptConfidence}% — ${field.scriptConfidence >= 90 ? 'High confidence' : field.scriptConfidence >= 70 ? 'Medium confidence' : 'Low confidence'}` : undefined}
          >
            {field.scriptConfidence != null && (
              <span className={`compare-conf-dot ${field.scriptConfidence >= 90 ? 'high' : field.scriptConfidence >= 70 ? 'med' : 'low'}`} />
            )}
            {field.script}
          </span>
          {field.scriptUncertain && field.scriptAlternates.length > 0 && (
            <span className="compare-alt">
              also: {field.scriptAlternates.map(a => a.value).filter(Boolean).join(', ')}
            </span>
          )}
        </span>
      )}

      {/* Claude AI value */}
      {field.claude ? (
        <span
          className="compare-mono compare-conf-wrap"
          data-tip={field.claudeConfidence != null ? `${field.claudeConfidence}% — ${field.claudeConfidence >= 90 ? 'High' : field.claudeConfidence >= 70 ? 'Med' : 'Low'}` : undefined}
        >
          {field.claudeConfidence != null && (
            <span className={`compare-conf-dot ${field.claudeConfidence >= 90 ? 'high' : field.claudeConfidence >= 70 ? 'med' : 'low'}`} />
          )}
          {field.claude}
        </span>
      ) : (
        <span className="compare-na">—</span>
      )}

      {/* Final Value — confirmed: value + pencil; editing: input + Done */}
      <div className="compare-final">
        {isSkipped ? (
          <span className="compare-na">—</span>
        ) : confirmed ? (
          <div className="compare-final-confirmed">
            <span className="compare-final-value">
              {toFormatted(editVal)}
            </span>
            <button
              onClick={() => setConfirmed(false)}
              title="Edit final value"
              className="compare-edit-btn"
              aria-label="Edit final value"
            >
              <i className="ti ti-pencil" aria-hidden="true" />
            </button>
            {isUncertain && !smeApproved && (
              <button
                onClick={() => setSmeApproved(true)}
                title="Mark as reviewed by SME"
                className="compare-approve-btn"
              >
                <i className="ti ti-check" aria-hidden="true" /> Approve
              </button>
            )}
            {smeApproved && (
              <span className="compare-approved-badge">
                <i className="ti ti-circle-check" aria-hidden="true" /> Reviewed
              </span>
            )}
          </div>
        ) : (
          <div className="compare-final-editing">
            <div className="input-prefix-group compare-final-input">
              <span className="input-prefix">$</span>
              <input
                autoFocus
                type="number"
                min="0"
                step="any"
                value={editVal}
                onChange={e => setEditVal(e.target.value)}
                placeholder="0"
              />
            </div>
            <button
              className="compare-done-btn"
              disabled={!editVal.toString().trim()}
              onClick={() => { if (editVal.toString().trim()) setConfirmed(true); }}
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* Source panel — spans all columns, visible when expanded */}
      {expanded && hasSource && (
        <div className="compare-source-panel">
          {field.scriptRaw && (
            <div className="compare-source-item">
              <span className="compare-source-tag script">Script</span>
              {field.scriptSlide && (
                onJumpToSlide
                  ? <button className="compare-source-slide compare-source-slide--btn" onClick={() => onJumpToSlide(field.scriptSlide - 1)}>
                      <i className="ti ti-presentation" /> Slide {field.scriptSlide}
                    </button>
                  : <span className="compare-source-slide">Slide {field.scriptSlide}</span>
              )}
              <span className="compare-source-text">"{field.scriptRaw}"</span>
            </div>
          )}
          {field.claudeSource && (
            <div className="compare-source-item">
              <span className="compare-source-tag claude">Claude AI</span>
              <span className="compare-source-text">"{field.claudeSource}"</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScreenCompare({ fields, scriptData, batchInfo = null, onExclude = null, onNext, onBack, smeName = '', fileMeta = null }) {
  const [slideOpen, setSlideOpen] = useState(false);
  const slideStackRef = useRef(null);
  const isMulti = batchInfo?.total > 1;
  // Build rows from live extracted fields + the script extractor's values.
  // script = deterministic .pptx extractor — real values only (null when no file was
  //          uploaded, e.g. the SharePoint search path, where the Script column shows —).
  // claude = what the AI extracted (null if it couldn't find it).
  // sme    = what the SME computed via the fallback form (null if extracted or skipped).
  const hasRealScript = scriptData && Object.keys(scriptData).length > 0;
  const scriptFor = (label) => {
    if (hasRealScript) return scriptData[label] || null;   // {value, uncertain, alternates} | null
    return null;
  };

  const sourceFields = fields && fields.length > 0 ? fields : [];
  const compareRows = sourceFields.map(f => {
    const s = scriptFor(f.label);
    return {
      label:  f.label,
      script: s?.value ?? '—',
      scriptUncertain:  s?.uncertain ?? false,
      scriptAlternates: s?.alternates ?? [],
      scriptConfidence: s?.confidence ?? null,
      scriptRaw:        s?.raw ?? null,
      scriptSlide:      s?.sourceSlide ?? null,
      claude: f.entryMode === 'extracted' ? f.value : null,
      claudeConfidence: f.confidence ?? null,
      claudeSource:     f.source ?? null,
      sme:    f.entryMode === 'manual'    ? f.value : null,
      flag:   f.flag,
    };
  });

  const [resolved, setResolved] = useState({});

  const handleResolve = (label, val) => {
    setResolved(prev => ({ ...prev, [label]: val }));
  };

  // Skipped rows don't need SME resolution — only non-skipped rows must be confirmed
  const resolvableRows = compareRows.filter(f => f.flag !== 'SME skipped — data not available');
  const allDone = resolvableRows.every(f => resolved[f.label] !== null && resolved[f.label] !== undefined);

  // "Best available" value per row — prefer sme-computed, fall back to claude extracted
  const bestVal = (row) => row.sme ?? row.claude;

  // A row is "ok" only when both extractors agree on a high-confidence value
  const isInterMismatch = (r) => r.script !== '—' && r.claude != null && r.script !== r.claude;
  const confOk = (r) =>
    !r.scriptUncertain &&
    !isInterMismatch(r) &&
    (r.scriptConfidence == null || r.scriptConfidence >= 90) &&
    (r.claudeConfidence == null || r.claudeConfidence >= 90);

  // Group fields needing review by issue type
  const isCompeting = (r) => r.scriptUncertain || isInterMismatch(r);
  const isLowConf   = (r) => (r.scriptConfidence != null && r.scriptConfidence < 70) || (r.claudeConfidence != null && r.claudeConfidence < 70);
  const isMedConf   = (r) => (r.scriptConfidence != null && r.scriptConfidence >= 70 && r.scriptConfidence < 90) || (r.claudeConfidence != null && r.claudeConfidence >= 70 && r.claudeConfidence < 90);

  // Yellow rows = any of the uncertain conditions (mirrors CompareRow rowState logic)
  const isYellow    = (r) => isCompeting(r) || isLowConf(r) || isMedConf(r);
  const reviewCount = resolvableRows.filter(isYellow).length;
  const matchCount  = resolvableRows.length - reviewCount;
  const lowestConf  = (r) => { const vs = [r.scriptConfidence, r.claudeConfidence].filter(v => v != null); return vs.length ? Math.round(Math.min(...vs)) : null; };

  const reviewGroups = [
    { key: 'competing', label: 'Competing values',   items: resolvableRows.filter(isCompeting).map(r => r.label) },
    { key: 'lowconf',   label: 'Low confidence',     items: resolvableRows.filter(r => !isCompeting(r) && isLowConf(r)).map(r => { const p = lowestConf(r); return p != null ? `${r.label} (${p}%)` : r.label; }) },
    { key: 'medconf',   label: 'Medium confidence',  items: resolvableRows.filter(r => !isCompeting(r) && !isLowConf(r) && isMedConf(r)).map(r => { const p = lowestConf(r); return p != null ? `${r.label} (${p}%)` : r.label; }) },
  ].filter(g => g.items.length > 0);

  const handleNext = () => {
    const resolvedFields = sourceFields.map(f => {
      const finalVal = resolved[f.label];
      if (finalVal && finalVal !== f.value) {
        return { ...f, value: finalVal };
      }
      return f;
    });
    onNext(resolvedFields);
  };

  const storedName = fileMeta?.stored_name || null;

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

      {/* ── Review card ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="card compare-card">

      {/* Header */}
      <div className="compare-head">
        {isMulti && (
          <div className="batch-progress">
            <i className="ti ti-files" aria-hidden="true" />
            File {batchInfo.index + 1} of {batchInfo.total}{batchInfo.name ? ` — ${batchInfo.name}` : ''}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div className="card-title compare-title">
            <i className="ti ti-git-compare" aria-hidden="true" />
            Script vs. Claude AI — Field Comparison
          </div>
          {storedName && (
            <button
              onClick={() => setSlideOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                background: slideOpen ? 'var(--surface-2)' : 'var(--navy)',
                color: slideOpen ? 'var(--text)' : '#fff',
                border: slideOpen ? '1.5px solid var(--border)' : 'none',
                flexShrink: 0,
              }}
            >
              <i className={`ti ${slideOpen ? 'ti-layout-sidebar-left-collapse' : 'ti-presentation'}`} />
              {slideOpen ? 'Hide slides' : 'View slides'}
            </button>
          )}
        </div>
        <div className="compare-summary">
          <span className="compare-match">
            <i className="ti ti-circle-check" aria-hidden="true" />
            {matchCount} match{matchCount !== 1 ? 'es' : ''}
          </span>
          <span className="compare-mismatch-label">
            <i className="ti ti-alert-triangle" aria-hidden="true" />
            {reviewCount} need{reviewCount === 1 ? 's' : ''} review
          </span>
        </div>

        {reviewGroups.length > 0 && (
          <div className="compare-uncertain">
            <div className="compare-uncertain-header">
              <i className="ti ti-alert-triangle compare-uncertain-icon" aria-hidden="true" />
              <strong>Review required before saving</strong>
            </div>
            <ul className="compare-uncertain-list">
              {reviewGroups.map(g => (
                <li key={g.key}><strong>{g.label}:</strong> {g.items.join(' · ')}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Column headers */}
      <div className="compare-header">
        <span>Field</span>
        <span>Script</span>
        <span>Claude AI</span>
        <span>Final Value</span>
      </div>

      {/* Rows */}
      <div>
        {compareRows.map(f => (
          <CompareRow key={f.label} field={f} onResolve={handleResolve} onJumpToSlide={storedName ? (idx) => { setSlideOpen(true); setTimeout(() => slideStackRef.current?.jumpTo(idx), 80); } : null} />
        ))}
      </div>

      {/* What gets stored */}
      <div className="compare-stored">
        <div className="compare-stored-header">
          <div className="compare-stored-title">
            <i className="ti ti-database" aria-hidden="true" />
            WHAT GETS STORED
          </div>
          <span className="compare-stored-subtitle">Saved automatically when you click Save &amp; Done</span>
        </div>
        <div className="compare-stored-items">
          <div className="compare-stored-item">
            <div className="compare-stored-icon-wrap file">
              <i className="ti ti-file-text" aria-hidden="true" />
            </div>
            <div>
              <span className="compare-stored-label">Source file</span>
              <span className="compare-stored-value">{fileMeta?.name || batchInfo?.name || '—'}</span>
            </div>
          </div>
          <div className="compare-stored-item">
            <div className="compare-stored-icon-wrap sme">
              <i className="ti ti-user-check" aria-hidden="true" />
            </div>
            <div>
              <span className="compare-stored-label">SME checkpoint</span>
              <span className="compare-stored-value">{smeName || '—'}</span>
            </div>
          </div>
          <div className="compare-stored-item">
            <div className="compare-stored-icon-wrap audit">
              <i className="ti ti-clipboard-list" aria-hidden="true" />
            </div>
            <div>
              <span className="compare-stored-label">Audit record</span>
              <span className="compare-stored-value">Auto-created on save</span>
            </div>
          </div>
        </div>
        <div className="compare-stored-roi-section">
          <span className="compare-stored-label">ROI values</span>
          <div className="compare-stored-roi-chips">
            {resolvableRows.map(row => {
              const val = resolved[row.label];
              return (
                <span key={row.label} className={`compare-stored-chip ${val ? 'confirmed' : 'pending'}`}>
                  <i className={`ti ${val ? 'ti-circle-check' : 'ti-circle-dashed'}`} aria-hidden="true" />
                  {row.label}{val && <strong>{val}</strong>}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="compare-footer">
        <div className="compare-footer-left">
          <button className="btn ghost" onClick={onBack}>
            <i className="ti ti-arrow-left" aria-hidden="true" /> Back
          </button>
          {isMulti && onExclude && (
            <button className="btn ghost compare-exclude-btn" onClick={onExclude}>
              <i className="ti ti-file-off" aria-hidden="true" /> Exclude this file
            </button>
          )}
        </div>
        <div className="compare-footer-actions">
          {!allDone && (
            <span className="compare-resolve-hint">
              Confirm red fields · Approve yellow rows to continue
            </span>
          )}
          <button
            className="btn primary is-gated"
            disabled={!allDone}
            onClick={handleNext}
          >
            {isMulti && !batchInfo.isLast
              ? <>Confirm &amp; Next File <i className="ti ti-arrow-right" aria-hidden="true" /></>
              : <>Save &amp; Done <i className="ti ti-arrow-right" aria-hidden="true" /></>
            }
          </button>
        </div>
      </div>{/* end compare-footer */}
        </div>{/* end compare-card */}
      </div>{/* end review card wrapper */}

      {/* ── Slide panel: right side ── */}
      {storedName && slideOpen && (
        <div style={{
          width: 680, flexShrink: 0,
          background: 'var(--surface)',
          border: '1.5px solid var(--border)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          position: 'sticky', top: 20,
          alignSelf: 'flex-start',
          maxHeight: 'calc(100vh - 40px)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 7 }}>
              <i className="ti ti-presentation" /> Document Slides
            </span>
            <button
              onClick={() => setSlideOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1 }}
            >
              <i className="ti ti-x" />
            </button>
          </div>
          <div style={{ padding: 12, overflowY: 'auto', flex: 1 }} id="slide-scroll-container">
            <SlideStack ref={slideStackRef} storedName={storedName} />
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Screen 4 (host): per-file review ─────────────────────────────────────────
// For the current file: first let the SME fill/skip any missing fields (the
// ScreenExtract review), then resolve the Script-vs-Claude comparison. Remounted
// per file by the parent (keyed on the file index) so each file starts clean.
function FileReview({ fileResult, fileIndex, total, isLast, onConfirm, onExclude, onBack, allStatuses = [], files = [], smeName = '' }) {
  const currentStatus = allStatuses[fileIndex] ?? 'pending';

  if (currentStatus !== 'done') {
    return (
      <div className="card">
        <div className="card-title">
          <i className="ti ti-cpu" aria-hidden="true" /> ROI Extraction
        </div>
        <p className="extract-sub">
          Running the script extractor and Claude AI across {files.length} file{files.length !== 1 ? 's' : ''}…
        </p>
        <div className="extract-steps">
          {files.map((f, i) => {
            const status = allStatuses[i] || 'pending';
            return (
              <div className={`extract-step ${status}`} key={i}>
                <div className="extract-step-icon">
                  {status === 'done'    && <i className="ti ti-check" aria-hidden="true" />}
                  {status === 'running' && <i className="ti ti-loader-2 spinning" aria-hidden="true" />}
                  {status === 'pending' && <i className="ti ti-circle" aria-hidden="true" />}
                </div>
                <span className="extract-step-label">{f.name || `File ${i + 1}`}</span>
                {status === 'done'    && <Badge color="green"><i className="ti ti-check" /> Done</Badge>}
                {status === 'running' && <Badge color="blue">Running…</Badge>}
                {status === 'pending' && <Badge color="navy">Pending</Badge>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const batchInfo = { index: fileIndex, total, isLast, name: fileResult.fileMeta?.name };
  const fields = buildClaudeFields(fileResult.extractedData);

  return (
    <ScreenCompare
      fields={fields}
      scriptData={fileResult.scriptData}
      batchInfo={batchInfo}
      onExclude={total > 1 ? onExclude : null}
      onNext={onConfirm}
      onBack={onBack}
      smeName={smeName}
      fileMeta={fileResult.fileMeta}
    />
  );
}

// ─── Screen 5: Store ──────────────────────────────────────────────────────────
// For a single-file batch this is the original review-and-store screen. For a
// multi-file batch it adds the per-file breakdown, the combined annual aggregate
// (the editable cards), an aggregate-record toggle, and a mixed-batch warning.
function ScreenStore({ fileResults = [], aggregateFields, commonMeta = {}, storeAggregate, onToggleAggregate, smeName, multi = false, onNext, onBack }) {
  // Defensive default for reaching Store directly (e.g. jumping via the Journey Bar)
  // without any extracted fields — show the honest blank-field template, not mock numbers.
  const sourceFields = aggregateFields && aggregateFields.length > 0 ? aggregateFields : BLANK_FIELDS;
  const active = fileResults.filter(r => !r.excluded && r.finalFields);

  const [editValues, setEditValues] = useState(
    () => Object.fromEntries(sourceFields.map(f => [f.label, f.value]))
  );
  const [editingLabel, setEditingLabel] = useState(null);
  const [showFiles, setShowFiles] = useState(true);

  const commitEdit = (label, val) => {
    setEditValues(prev => ({ ...prev, [label]: val }));
    setEditingLabel(null);
  };

  const handleKeyDown = (e, label) => {
    if (e.key === 'Enter')  commitEdit(label, e.target.value);
    if (e.key === 'Escape') setEditingLabel(null);
  };

  const handleSave = () => {
    onNext(sourceFields.map(f => ({ ...f, value: editValues[f.label] })));
  };

  const manualCount = sourceFields.filter(f => f.entryMode === 'manual').length;
  const skippedCount = sourceFields.filter(f => f.flag === 'SME skipped — data not available').length;
  const mixed = commonMeta.mixedClient || commonMeta.mixedYear;
  const recordCount = active.length + (multi && storeAggregate ? 1 : 0);

  return (
    <div className="card">
      <div className="card-title">
        <i className="ti ti-database" aria-hidden="true" />
        Review
      </div>
      <p className="store-sub">
        {multi
          ? <>Combined annual total from <strong>{active.length}</strong> file{active.length !== 1 ? 's' : ''}. <strong>{recordCount}</strong> record{recordCount !== 1 ? 's' : ''} will be written to the ROI Tracker. Click the pencil icon to correct a value.</>
          : <>Review values before writing to the ROI Tracker. Click the pencil icon to correct a value.</>}
        {manualCount > 0 && <> <span className="field-card-manual-tag">Manually entered</span> fields were filled in by the SME.</>}
        {skippedCount > 0 && <> Greyed-out fields were skipped and will be stored as not available.</>}
      </p>

      {multi && (
        <>
          {mixed && (
            <div className="batch-warning">
              <i className="ti ti-alert-triangle batch-warning-icon" aria-hidden="true" />
              <span>
                The selected files span{commonMeta.mixedClient ? ' different clients' : ''}
                {commonMeta.mixedClient && commonMeta.mixedYear ? ' and' : ''}
                {commonMeta.mixedYear ? ' different years' : ''}. Confirm you want to combine them into one annual aggregate before storing it.
              </span>
            </div>
          )}

          <label className="batch-aggregate-toggle">
            <input
              type="checkbox"
              checked={storeAggregate}
              onChange={e => onToggleAggregate(e.target.checked)}
            />
            <span>Store the combined annual aggregate as its own record{mixed ? ' (review the warning above)' : ''}</span>
          </label>

          <button
            className="files-drafts-toggle"
            onClick={() => setShowFiles(s => !s)}
            aria-expanded={showFiles}
          >
            <i className={`ti ti-chevron-${showFiles ? 'down' : 'right'}`} aria-hidden="true" />
            Per-file breakdown ({active.length})
          </button>
          {showFiles && (
            <div className="batch-file-list">
              {active.map((r, i) => (
                <div className="batch-file-row" key={i}>
                  <div className="batch-file-name">
                    <i className="ti ti-file-description" aria-hidden="true" /> {r.fileMeta?.name || `File ${i + 1}`}
                  </div>
                  <div className="batch-file-fields">
                    {r.finalFields.map(f => (
                      <span className="batch-file-field" key={f.label}>
                        <span className="batch-file-field-label">{f.label.split(' ')[0]}</span>
                        <strong>{f.value ?? '—'}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <label className="field-label store-what-label">Combined annual total</label>
        </>
      )}

      <div className="field-cards">
        {sourceFields.map(f => (
          <FieldCard
            key={f.label}
            field={f}
            currentValue={editValues[f.label]}
            isEditing={editingLabel === f.label}
            onStartEdit={f.flag === 'SME skipped — data not available' ? () => {} : setEditingLabel}
            onCommit={commitEdit}
            onKeyDown={handleKeyDown}
          />
        ))}
      </div>

      <label className="field-label store-what-label">What gets stored</label>
      <div className="store-grid">
        {[
          { icon: 'ti-table',            title: multi ? `${recordCount} ROI records` : 'ROI values', sub: 'Client_ROI_Tracker.xlsx · sheet: All_ROI_Data' },
          { icon: 'ti-shield-check',     title: 'Audit record',    sub: 'Client_ROI_Tracker.xlsx · sheet: SME_Audit_Log' },
          { icon: 'ti-file-spreadsheet', title: 'Source file ref', sub: multi ? `${active.length} file${active.length !== 1 ? 's' : ''}` : (active[0]?.fileMeta?.name || '—') },
          { icon: 'ti-user-check',       title: 'SME checkpoint',  sub: `Approved · ${smeName || '—'}` },
        ].map(t => (
          <div className="store-tile" key={t.title}>
            <i className={`ti ${t.icon} store-tile-icon`} aria-hidden="true" />
            <div>
              <div className="store-tile-title">{t.title}</div>
              <div className="store-tile-sub">{t.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="btn-row">
        <button className="btn ghost" onClick={onBack}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back
        </button>
        <button className="btn primary" onClick={handleSave}>
          Save All &amp; Done <i className="ti ti-arrow-right" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ─── Screen 5: Done ───────────────────────────────────────────────────────────
// ─── Custom Recharts tooltip ──────────────────────────────────────────────────
function DollarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const fmtM = (n) => {
    if (!n) return '—';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
  };
  return (
    <div style={{ background: '#fff', border: '1px solid #dce3ef', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: '#001941', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.fill || p.color }}>{p.name}: {fmtM(p.value)}</div>
      ))}
    </div>
  );
}

// ─── ScreenDone: auto-generated dashboard draft ──────────────────────────────
function ScreenDone({ finalFields, selectedFile, onNewExtraction, onTracker, onDashboards }) {
  const [summary, setSummary]               = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError]     = useState(null);
  const [editMode, setEditMode]             = useState(false);
  const [dashSaved, setDashSaved]           = useState(false);
  const [dashSaveError, setDashSaveError]   = useState(null);
  const [hiddenSections, setHiddenSections] = useState({});
  const reportRef = useRef(null);

  const parseDollar = (v) => parseFloat(String(v || '').replace(/[$,]/g, '')) || 0;
  const fmtM = (n) => {
    if (!n) return '—';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
  };

  const fields        = finalFields || [];
  const get           = (label) => parseDollar(fields.find(f => f.label === label)?.value);
  const idRisk        = get('Identified Risk');
  const idAvoidance   = get('Identified Cost Avoidance');
  const accAvoidance  = get('Accomplished Cost Avoidance');
  const idOptim       = get('Identified Cost Optimization');
  const accOptim      = get('Accomplished Cost Optimization');
  const idSavings     = get('Identified Cost Savings');
  const realSavings   = get('Realized Cost Savings');
  const totalId       = idAvoidance + idOptim + idSavings || idRisk || 0;
  const totalAcc      = accAvoidance + accOptim || 0;

  const confidenceVals = fields.filter(f => f.confidence > 0).map(f => f.confidence);
  const avgConf = confidenceVals.length
    ? Math.round(confidenceVals.reduce((a, b) => a + b, 0) / confidenceVals.length)
    : null;

  const client    = selectedFile?.client    || '';
  const publisher = selectedFile?.publisher || '';
  const year      = String(selectedFile?.year || '');
  const today     = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Generate executive summary on mount
  useEffect(() => {
    if (!fields.length) return;
    setSummaryLoading(true);
    generateExecutiveSummary({
      client, publisher,
      year: parseInt(year) || null,
      identified_risk: idRisk || null,
      id_cost_avoidance: idAvoidance || null,
      acc_cost_avoidance: accAvoidance || null,
      id_cost_optimization: idOptim || null,
      acc_cost_optimization: accOptim || null,
      realized_savings: idSavings || null,
      contract_spend: realSavings || null,
      confidence: avgConf || null,
      stored_name: selectedFile?.stored_name || null,
      file_path: selectedFile?.file_path || null,
    })
      .then(data => {
        setSummary(data);
        const id = selectedFile?.record_id || selectedFile?.stored_name || selectedFile?.name;
        if (id) saveExecutiveSummary(id, data).catch(() => {});
      })
      .catch(() => setSummaryError('Could not generate summary.'))
      .finally(() => setSummaryLoading(false));
  }, []);

  const toggleSection = (key) => setHiddenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const buildDash = () => {
    const dashId = `auto-${selectedFile?.record_id || selectedFile?.stored_name || Date.now()}`;
    return {
      id: dashId,
      type: 'auto',
      name: [client, publisher, year].filter(Boolean).join(' — ') + ' Dashboard',
      client, publisher, year,
      fields: finalFields,
      summary,
      savedAt: new Date().toISOString(),
      sub: [publisher, year].filter(Boolean).join(' · '),
    };
  };

  const persistDash = (dash) => {
    const existing = JSON.parse(localStorage.getItem('domosapiens.dashboards') || '[]');
    const filtered = existing.filter(d => d.id !== dash.id);
    localStorage.setItem('domosapiens.dashboards', JSON.stringify([dash, ...filtered]));
  };

  // Auto-save when the dashboard is first loaded (summary may update later — that's OK)
  useEffect(() => {
    if (!fields.length) return;
    try { persistDash(buildDash()); } catch {}
  }, []);

  // Re-persist whenever the AI summary finishes generating
  useEffect(() => {
    if (!summary || !fields.length) return;
    try { persistDash(buildDash()); } catch {}
  }, [summary]);

  const handleSaveDashboard = () => {
    setDashSaveError(null);
    try {
      persistDash(buildDash());
      setDashSaved(true);
      setTimeout(() => onDashboards(), 1200);
    } catch (e) {
      setDashSaveError('Could not save — storage may be full. Try clearing old dashboards.');
    }
  };

  const handleDownloadPDF = () => {
    import('html2pdf.js').then(mod => {
      mod.default().set({
        margin: [10, 10, 10, 10],
        filename: `${[client, publisher, year].filter(Boolean).join('_') || 'ROAR'}_Dashboard.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      }).from(reportRef.current).save();
    });
  };

  // ── CSS-in-JS tokens matching the template ──
  const T = {
    navy: '#001941', yellow: '#ffad00', blue: '#005f86',
    green: '#00875a', teal: '#007b5f', red: '#c0392b',
    slate: '#4a5568', midGray: '#8a9ab0',
    navy5: 'rgba(0,25,65,.05)', navy10: 'rgba(0,25,65,.10)',
    radius: 16, radiusSm: 10,
  };

  const sectionStyle = (hidden) => ({
    background: '#fff', borderRadius: T.radius,
    border: `1px solid ${T.navy10}`,
    boxShadow: '0 6px 22px rgba(0,25,65,.06)',
    marginBottom: 20, overflow: 'hidden',
    opacity: hidden ? 0.45 : 1,
    transition: 'opacity 0.2s',
  });

  const sectionHead = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 28px', borderBottom: `1px solid ${T.navy10}`,
    background: T.navy5,
  };

  const SectionToggle = ({ skey }) => (
    editMode ? (
      <button onClick={() => toggleSection(skey)} style={{
        background: 'none', border: `1px solid ${T.navy10}`, borderRadius: 6,
        padding: '3px 10px', fontSize: 11, cursor: 'pointer', color: T.slate,
        fontFamily: 'inherit', fontWeight: 700,
      }}>
        {hiddenSections[skey] ? 'Show' : 'Hide'}
      </button>
    ) : null
  );

  // Shows a compact collapsed bar for sections hidden outside of edit mode
  const HiddenBar = ({ skey, label }) => hiddenSections[skey] ? (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: T.navy5, border: `1px dashed ${T.navy10}`,
      borderRadius: T.radiusSm, padding: '10px 18px', marginBottom: 20,
    }}>
      <span style={{ fontSize: 12, color: T.midGray, fontStyle: 'italic' }}>
        <i className="ti ti-eye-off" style={{ marginRight: 6 }} />{label} (hidden)
      </span>
      <button onClick={() => toggleSection(skey)} style={{
        background: 'none', border: `1px solid ${T.navy10}`, borderRadius: 6,
        padding: '3px 10px', fontSize: 11, cursor: 'pointer', color: T.blue,
        fontFamily: 'inherit', fontWeight: 700,
      }}>
        Show
      </button>
    </div>
  ) : null;

  const Editable = ({ tag: Tag = 'span', value, style, className }) => (
    <Tag
      contentEditable={editMode}
      suppressContentEditableWarning
      style={{ ...style, outline: editMode ? `2px dashed ${T.yellow}` : 'none', borderRadius: 4 }}
      className={className}
    >
      {value}
    </Tag>
  );

  return (
    <div style={{ fontFamily: "'Figtree', 'Inter', sans-serif" }}>

      {/* ── Toolbar (no-print) ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, gap: 10, flexWrap: 'wrap',
      }} className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            background: T.green, borderRadius: '50%', width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 16, flexShrink: 0,
          }}>
            <i className="ti ti-check" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: T.navy }}>Dashboard Draft Ready</div>
            <div style={{ fontSize: 12, color: T.slate }}>Records saved · Review and publish below</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn ghost small" onClick={() => setEditMode(e => !e)}>
            <i className={`ti ${editMode ? 'ti-eye' : 'ti-edit'}`} />
            {editMode ? 'Preview' : 'Edit'}
          </button>
          <button className="btn ghost small" onClick={onNewExtraction}>
            <i className="ti ti-plus" /> New Extraction
          </button>
          {dashSaveError && (
            <span style={{ fontSize: 12, color: T.red }}>{dashSaveError}</span>
          )}
          <button
            className="btn primary"
            onClick={handleSaveDashboard}
            disabled={dashSaved}
            style={dashSaved ? { background: T.green } : {}}
          >
            {dashSaved
              ? <><i className="ti ti-circle-check" /> Saved!</>
              : <><i className="ti ti-layout-dashboard" /> Save Dashboard</>}
          </button>
        </div>
      </div>

      <div ref={reportRef}>
        {/* ── Header / Hero ── */}
        <div style={{
          background: T.navy, borderRadius: T.radius,
          marginBottom: 20, overflow: 'hidden',
        }}>
          {/* yellow topbar */}
          <div style={{ height: 6, background: T.yellow }} />
          <div style={{ padding: '28px 32px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'center' }}>
            <div>
              {/* Co-brand */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <svg xmlns="http://www.w3.org/2000/svg" height="32" viewBox="0 0 236 87" style={{ fill: '#fff', fillRule: 'evenodd' }}>
                  <circle cx="27.851" cy="40.631" r="5.151" style={{ fill: T.yellow }} />
                  <path d="m58.878 27.974.411 1.156 4.058-6.43-6.837 3.651 1.079.412 3.489-1.96-36.02 28.666a20.02 20.02 0 0 0 17.553 10.413c10.972 0 20-9.028 20-20a20 20 0 0 0-5.703-13.985c.715-.7 1.378-1.346 1.97-1.923m-.813 25.592a8.51 8.51 0 0 1-8.016 5.685c-4.656 0-8.489-3.829-8.494-8.485 0-4.689 3.266-9.948 11.856-17.408.005.006 8.691 8.124 4.658 20.21z" style={{ fill: T.yellow, fillRule: 'nonzero' }} />
                  <path d="m50.775 31.042 4.316-2.725c-8.512-6.906-21.2-5.584-28.106 2.928l-.22.277c6.982-5.474 16.814-5.671 24.01-.48" style={{ fill: T.yellow, fillRule: 'nonzero' }} />
                  <path d="M96.395 39.875h3.145v1.249a4.66 4.66 0 0 1 3.661-1.6 4.52 4.52 0 0 1 3.979 1.831c.513.736.835 1.668.835 3.755v8.278h-3.146v-7.513c0-3.436-1.286-3.531-2.472-3.531-1.411 0-2.856.192-2.856 4.557v6.487h-3.145zM121.73 39.876h3.142v12.423c0 3.177-.353 5.455-2.215 7.029a6.87 6.87 0 0 1-4.486 1.443 5.97 5.97 0 0 1-4.431-1.668 7.6 7.6 0 0 1-1.99-4.2h3.051a4.47 4.47 0 0 0 1 2.119c.644.642 1.53.981 2.438.932a3.38 3.38 0 0 0 2.471-.9 4.45 4.45 0 0 0 1.028-3.4v-1.771a4.9 4.9 0 0 1-4.109 1.927 5.73 5.73 0 0 1-4.462-1.83 7.64 7.64 0 0 1-2.023-5.36 7.18 7.18 0 0 1 1.99-5.232 6.15 6.15 0 0 1 4.591-1.861 5.1 5.1 0 0 1 4.014 1.831zm-6 3.371a4.7 4.7 0 0 0-1.38 3.433 4.64 4.64 0 0 0 1.348 3.4 3.68 3.68 0 0 0 2.407.9 3.42 3.42 0 0 0 2.63-1.09 5.01 5.01 0 0 0-.1-6.577 3.34 3.34 0 0 0-2.538-.963 3.25 3.25 0 0 0-2.374.9zM131.875 32.418v20.97h-3.148V34.917zM187.986 32.418v4.313h-3.148v-1.814zM147.863 50.307a7.1 7.1 0 0 1-2.279 2.474 7.45 7.45 0 0 1-3.981 1.027 6 6 0 0 1-4.557-1.733 7.26 7.26 0 0 1-1.991-5.169 7.92 7.92 0 0 1 2.151-5.552 6.16 6.16 0 0 1 4.527-1.831 5.82 5.82 0 0 1 4.332 1.766 8.12 8.12 0 0 1 1.9 5.714v.388h-9.694a4.46 4.46 0 0 0 1.155 2.728c.647.609 1.52.924 2.407.867a3.32 3.32 0 0 0 2.152-.676 4.9 4.9 0 0 0 1.252-1.475zm-3.114-5.489a3.12 3.12 0 0 0-3.079-2.661c-.835 0-1.636.336-2.221.932a3.54 3.54 0 0 0-.961 1.732zM154.296 60.739h-3.148V39.875h3.147v1.478a5.08 5.08 0 0 1 4.009-1.831c3.564 0 6.58 2.729 6.58 7.029 0 4.559-3.337 7.255-6.547 7.255a5.36 5.36 0 0 1-4.044-1.99zm-.193-14.026c0 2.823 1.828 4.269 3.821 4.269 2.279 0 3.756-1.958 3.756-4.3 0-2.407-1.477-4.332-3.756-4.332-1.993 0-3.821 1.409-3.821 4.363M181.769 46.648l.001.097c0 3.962-3.261 7.223-7.223 7.223s-7.223-3.261-7.223-7.223c0-3.925 3.2-7.169 7.124-7.222h.1c3.851-.109 7.11 2.97 7.22 6.821q.003.152.001.304m-3.211.032c0-3.08-2.021-4.332-4.012-4.332s-4.012 1.253-4.012 4.332c0 2.6 1.54 4.3 4.012 4.3s4.012-1.699 4.012-4.3M184.853 39.876h3.142v13.513h-3.142zM191.832 39.875h3.15v1.249a4.66 4.66 0 0 1 3.661-1.6 4.52 4.52 0 0 1 3.979 1.831c.515.736.835 1.668.835 3.755v8.278h-3.146v-7.513c0-3.436-1.283-3.531-2.471-3.531-1.411 0-2.857.192-2.857 4.557v6.487h-3.145zM210.561 42.764v10.624h-3.146V42.764h-1.317v-2.889h1.317v-4.959l3.146-2.5v7.458h2.408v2.889zM93.859 53.389l-9.121-22.662-9.122 22.662h3.531l5.591-14.433 5.59 14.433z" style={{ fill: '#fff', fillRule: 'nonzero' }} />
                </svg>
                {client && <>
                  <span style={{ color: 'rgba(255,255,255,.35)', fontSize: 24, fontWeight: 300 }}>×</span>
                  <Editable tag="span" value={client} style={{ color: '#fff', fontWeight: 800, fontSize: 18 }} />
                </>}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.yellow, marginBottom: 8 }}>
                ROAR Executive Dashboard
              </div>
              <div style={{ fontSize: 'clamp(1.3rem,2.5vw,2rem)', fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 12 }}>
                <Editable value={[publisher, 'Risk & Opportunity Assessment'].filter(Boolean).join(' — ')} style={{ color: '#fff' }} />
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.65)' }}>
                {[year, today].filter(Boolean).join(' · ')}
                {avgConf ? ` · ${avgConf}% avg. confidence` : ''}
              </div>
            </div>
            {/* Headline stat */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 'clamp(2rem,4vw,3rem)', fontWeight: 800, color: T.yellow, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {fmtM(totalId)}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 6, maxWidth: 180 }}>
                Total Identified Value
              </div>
            </div>
          </div>
        </div>

        {/* ── KPI Tiles ── */}
        {!hiddenSections.kpis && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 14, marginBottom: 20,
          }}>
            {[
              { label: 'Identified Risk',             value: idRisk,       color: '#c0392b' },
              { label: 'Identified Cost Avoidance',   value: idAvoidance,  color: T.blue },
              { label: 'Accomplished Cost Avoidance', value: accAvoidance, color: T.teal },
              { label: 'Identified Cost Optimization',value: idOptim,      color: T.blue },
              { label: 'Accomplished Cost Optimization', value: accOptim,  color: T.teal },
              { label: 'Identified Cost Savings',     value: idSavings,    color: T.green },
              { label: 'Realized Cost Savings',       value: realSavings,  color: T.green },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: '#fff', border: `1px solid ${T.navy10}`,
                borderRadius: T.radiusSm, padding: '16px 18px',
                boxShadow: '0 4px 14px rgba(0,25,65,.05)',
                transition: 'transform .15s, box-shadow .15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 10px 22px rgba(0,25,65,.11)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,25,65,.05)'; }}
              >
                <div style={{ fontSize: 'clamp(1.1rem,2vw,1.5rem)', fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {fmtM(value)}
                </div>
                <div style={{ marginTop: 7, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.slate }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Executive Summary Section ── */}
        <HiddenBar skey="summary" label="01 — Executive Summary" />
        {!hiddenSections.summary && (
          <div style={sectionStyle(false)}>
            <div style={sectionHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: T.yellow, lineHeight: 0.9 }}>01</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.blue, marginBottom: 3 }}>
                    Executive Summary
                  </div>
                  <div style={{ fontSize: 'clamp(1rem,1.5vw,1.2rem)', fontWeight: 700, color: T.navy }}>
                    Strategic Findings & Recommendations
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {summaryLoading && (
                  <span style={{ fontSize: 12, color: T.slate, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-loader-2 spinning" /> Generating with Claude AI…
                  </span>
                )}
                {summary && !summaryLoading && (
                  <button className="btn ghost small no-print" onClick={() => {
                    setSummaryLoading(true); setSummary(null);
                    generateExecutiveSummary({ client, publisher, year: parseInt(year) || null, identified_risk: idRisk || null, id_cost_avoidance: idAvoidance || null, acc_cost_avoidance: accAvoidance || null, id_cost_optimization: idOptim || null, acc_cost_optimization: accOptim || null, realized_savings: idSavings || null, contract_spend: realSavings || null })
                      .then(d => setSummary(d)).catch(() => setSummaryError('Failed.')).finally(() => setSummaryLoading(false));
                  }}>
                    <i className="ti ti-refresh" /> Regenerate
                  </button>
                )}
                <SectionToggle skey="summary" />
              </div>
            </div>
            <div style={{ padding: '24px 28px' }}>
              {summaryLoading && !summary && (
                <div style={{ color: T.slate, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <i className="ti ti-loader-2 spinning" style={{ fontSize: 18, color: T.yellow }} />
                  Generating executive summary… This may take 15–30 seconds.
                </div>
              )}
              {summaryError && <div style={{ color: '#c0392b', fontSize: 13 }}>{summaryError}</div>}
              {summary && (
                <ExecutiveSummaryReport
                  summary={summary} subtitle={[client, publisher, year].filter(Boolean).join(' · ')}
                  client={client} publisher={publisher} kpiFields={fields}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Section 02: Value Analysis — card grid ── */}
        <HiddenBar skey="breakdown" label="02 — Value Analysis" />
        {!hiddenSections.breakdown && (() => {
          const categories = [
            {
              key: 'opt', title: 'Cost Optimization', kicker: 'Efficiency Gains',
              color: T.blue, accent: '--c-opt',
              lead: summary?.key_accomplishments?.[0] || `${publisher || 'Publisher'} optimization opportunities identified through ROAR analysis.`,
              tiles: [
                { val: fmtM(idOptim),   lbl: 'Identified',   meta: 'Total opportunity', cls: 'opt' },
                { val: fmtM(accOptim),  lbl: 'Accomplished',  meta: 'Realized to date',  cls: 'opt' },
                ...(avgConf ? [{ val: `${avgConf}%`, lbl: 'Confidence', meta: 'Avg. extraction score', cls: 'info' }] : []),
              ],
              slideField: fields.find(f => f.label === 'Identified Cost Optimization'),
              callout: summary?.recommendations?.[0] || null,
              show: idOptim > 0 || accOptim > 0,
            },
            {
              key: 'avoid', title: 'Cost Avoidance', kicker: 'Risk Prevention',
              color: T.teal, accent: '--c-save',
              lead: summary?.key_accomplishments?.[1] || `Cost avoidance opportunities captured through proactive ITAM engagement.`,
              tiles: [
                { val: fmtM(idAvoidance),  lbl: 'Identified',   meta: 'Potential avoided cost', cls: 'save' },
                { val: fmtM(accAvoidance), lbl: 'Accomplished',  meta: 'Confirmed avoidance',    cls: 'save' },
              ],
              slideField: fields.find(f => f.label === 'Identified Cost Avoidance'),
              callout: summary?.recommendations?.[1] || null,
              show: idAvoidance > 0 || accAvoidance > 0,
            },
            {
              key: 'risk', title: 'Savings & Risk Exposure', kicker: 'Financial Risk',
              color: '#c0392b', accent: '--c-risk',
              lead: summary?.primary_risks?.[0] || `Risk exposure and savings opportunities requiring attention.`,
              tiles: [
                ...(idSavings   ? [{ val: fmtM(idSavings),  lbl: 'Identified Savings', meta: 'Gross savings target', cls: 'save' }] : []),
                ...(realSavings ? [{ val: fmtM(realSavings), lbl: 'Realized Savings',   meta: 'Confirmed to date',   cls: 'save' }] : []),
                ...(idRisk      ? [{ val: fmtM(idRisk),      lbl: 'Identified Risk',    meta: 'Unmitigated exposure', cls: 'risk' }] : []),
              ],
              slideField: fields.find(f => f.label === 'Identified Risk'),
              callout: summary?.recommendations?.[2] || null,
              show: idSavings > 0 || realSavings > 0 || idRisk > 0,
            },
          ].filter(c => c.show);

          if (!categories.length) return null;
          return (
            <div style={sectionStyle(false)}>
              <div style={sectionHead}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '2rem', fontWeight: 800, color: T.yellow, lineHeight: 0.9 }}>02</span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.blue, marginBottom: 3 }}>
                      Value Analysis
                    </div>
                    <div style={{ fontSize: 'clamp(1rem,1.5vw,1.2rem)', fontWeight: 700, color: T.navy }}>
                      Findings by Category
                    </div>
                  </div>
                </div>
                <SectionToggle skey="breakdown" />
              </div>
              <div style={{ padding: '24px 28px' }}>
                {/* card grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 24 }}>
                  {categories.map(cat => (
                    <div key={cat.key} style={{
                      background: '#fff', border: `1px solid rgba(0,25,65,.10)`,
                      borderTop: `4px solid ${cat.color}`,
                      borderRadius: T.radiusSm,
                      padding: '20px 22px',
                      boxShadow: '0 4px 14px rgba(0,25,65,.05)',
                      display: 'flex', flexDirection: 'column', gap: 0,
                      transition: 'transform .18s ease, box-shadow .18s ease',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 16px 38px rgba(0,25,65,.13)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,25,65,.05)'; }}
                    >
                      {/* publisher pill + title */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                        <div style={{
                          fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                          background: `${cat.color}18`, color: cat.color,
                          border: `1px solid ${cat.color}40`,
                          borderRadius: 20, padding: '3px 10px', flexShrink: 0,
                        }}>
                          {cat.kicker}
                        </div>
                        {publisher && (
                          <div style={{ fontSize: 10, fontWeight: 700, color: T.midGray, textAlign: 'right', lineHeight: 1.3 }}>
                            {publisher}
                          </div>
                        )}
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: T.navy, lineHeight: 1.2, marginBottom: 8 }}>
                        {cat.title}
                      </div>
                      <div style={{ fontSize: '.9rem', color: T.slate, lineHeight: 1.5, marginBottom: 14 }}>
                        <Editable value={cat.lead} />
                      </div>

                      {/* tiles */}
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cat.tiles.length}, 1fr)`, gap: 8, marginBottom: 14 }}>
                        {cat.tiles.map(t => (
                          <div key={t.lbl} style={{
                            background: 'rgba(0,25,65,.04)', border: '1px solid rgba(0,25,65,.08)',
                            borderRadius: 8, padding: '10px 12px',
                            transition: 'transform .18s ease, box-shadow .18s ease',
                          }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.03)'; e.currentTarget.style.background = '#fff'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.background = 'rgba(0,25,65,.04)'; }}
                          >
                            <div style={{
                              fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1,
                              color: t.cls === 'risk' ? '#c0392b' : t.cls === 'info' ? T.blue : cat.color,
                            }}>
                              {t.val}
                            </div>
                            <div style={{ marginTop: 6, fontSize: '.7rem', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: T.slate }}>
                              {t.lbl}
                            </div>
                            <div style={{ marginTop: 4, fontSize: '.74rem', color: T.midGray }}>{t.meta}</div>
                          </div>
                        ))}
                      </div>

                      {/* callout */}
                      {cat.callout && (
                        <div style={{
                          borderLeft: `3px solid ${T.yellow}`, background: 'rgba(255,173,0,.08)',
                          borderRadius: '0 6px 6px 0', padding: '10px 14px', marginBottom: 12,
                          fontSize: '.84rem', color: T.navy, lineHeight: 1.5,
                        }}>
                          <Editable value={cat.callout} />
                        </div>
                      )}

                      {/* evidence */}
                      {cat.slideField && (cat.slideField.publisher || cat.slideField.scriptSlide) && (
                        <div style={{
                          marginTop: 'auto', paddingTop: 12, borderTop: '1px dashed rgba(0,25,65,.12)',
                          fontSize: '.78rem', color: T.slate, display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <i className="ti ti-file-text" style={{ color: T.blue, fontSize: 13 }} />
                          <span>
                            Source: <strong style={{ color: T.blue }}>{cat.slideField.publisher || publisher}</strong>
                            {cat.slideField.scriptSlide ? ` · Slide ${cat.slideField.scriptSlide}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* tieback row */}
                {summary && (summary.key_accomplishments?.length > 0 || summary.next_steps?.length > 0) && (
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
                    background: T.navy5, border: `1px solid ${T.navy10}`,
                    borderRadius: T.radiusSm, padding: '16px 20px',
                  }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: T.teal, marginBottom: 8 }}>
                        <i className="ti ti-trophy" style={{ marginRight: 4 }} /> Top Win
                      </div>
                      <div style={{ fontSize: '.88rem', color: T.navy, lineHeight: 1.5 }}>
                        <Editable value={summary.key_accomplishments?.[0] || '—'} />
                      </div>
                    </div>
                    <div style={{ borderLeft: `1px solid ${T.navy10}`, paddingLeft: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: T.yellow, marginBottom: 8 }}>
                        <i className="ti ti-arrow-right" style={{ marginRight: 4 }} /> Next Action
                      </div>
                      <div style={{ fontSize: '.88rem', color: T.navy, lineHeight: 1.5 }}>
                        <Editable value={summary.next_steps?.[0] || summary.recommendations?.[0] || '—'} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── ROI Journey Section ── */}
        <HiddenBar skey="journey" label="03 — ROI Journey" />
        {!hiddenSections.journey && (totalId > 0 || totalAcc > 0) && (
          <div style={sectionStyle(false)}>
            <div style={sectionHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: T.yellow, lineHeight: 0.9 }}>03</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.blue, marginBottom: 3 }}>
                    ROI Journey
                  </div>
                  <div style={{ fontSize: 'clamp(1rem,1.5vw,1.2rem)', fontWeight: 700, color: T.navy }}>
                    Identified → Accomplished
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: T.navy, letterSpacing: '-0.03em' }}>{fmtM(totalAcc)}</div>
                <div style={{ fontSize: 11, color: T.slate, marginTop: 4 }}>Total Accomplished</div>
              </div>
              <SectionToggle skey="journey" />
            </div>
            <div style={{ padding: '24px 28px' }}>
              {totalId > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, fontWeight: 700, color: T.slate }}>
                    <span>Identified ({fmtM(totalId)})</span>
                    <span>Accomplished ({fmtM(totalAcc)}) · {totalId ? Math.round(totalAcc / totalId * 100) : 0}%</span>
                  </div>
                  <div style={{ background: T.navy5, borderRadius: 8, height: 16, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 8,
                      background: `linear-gradient(90deg, ${T.teal}, ${T.green})`,
                      width: `${totalId ? Math.min(100, Math.round(totalAcc / totalId * 100)) : 0}%`,
                      transition: 'width 1s ease',
                    }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 20 }}>
                {[
                  { label: 'Identified', value: totalId, color: T.blue, icon: 'ti-target' },
                  { label: 'Accomplished', value: totalAcc, color: T.teal, icon: 'ti-circle-check' },
                  { label: 'Realization Rate', value: totalId ? `${Math.round(totalAcc / totalId * 100)}%` : '—', color: T.green, icon: 'ti-trending-up', raw: true },
                ].map(({ label, value, color, icon, raw }) => (
                  <div key={label} style={{
                    background: T.navy5, border: `1px solid ${T.navy10}`,
                    borderRadius: T.radiusSm, padding: '14px 16px', textAlign: 'center',
                  }}>
                    <i className={`ti ${icon}`} style={{ fontSize: 20, color, marginBottom: 6, display: 'block' }} />
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color, lineHeight: 1 }}>
                      {raw ? value : fmtM(value)}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: T.slate }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Section 04: Value Delivered Ledger ── */}
        <HiddenBar skey="ledger" label="04 — Value Ledger" />
        {!hiddenSections.ledger && fields.some(f => parseDollar(f.value) > 0) && (
          <div style={sectionStyle(false)}>
            <div style={sectionHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: T.yellow, lineHeight: 0.9 }}>04</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.blue, marginBottom: 3 }}>
                    Value Delivered
                  </div>
                  <div style={{ fontSize: 'clamp(1rem,1.5vw,1.2rem)', fontWeight: 700, color: T.navy }}>
                    Complete Metrics Ledger
                  </div>
                </div>
              </div>
              <SectionToggle skey="ledger" />
            </div>
            <div style={{ padding: '0 28px 24px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                <thead>
                  <tr style={{ background: T.navy5 }}>
                    <td style={{ padding: '11px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: T.navy }}>Metric</td>
                    <td style={{ padding: '11px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: T.navy }}>Description</td>
                    <td style={{ padding: '11px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: T.navy, textAlign: 'right' }}>Value</td>
                    <td style={{ padding: '11px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: T.navy, textAlign: 'center' }}>Conf.</td>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Identified Cost Avoidance',    desc: 'Future costs prevented through proactive ITAM',            val: idAvoidance,  color: T.teal,  vclass: 'save' },
                    { label: 'Accomplished Cost Avoidance',  desc: 'Confirmed avoidance already realized',                    val: accAvoidance, color: T.teal,  vclass: 'save' },
                    { label: 'Identified Cost Optimization', desc: 'Efficiency gains and spend reduction opportunities',       val: idOptim,      color: T.blue,  vclass: 'opt'  },
                    { label: 'Accomplished Cost Optimization',desc: 'Optimization actions confirmed and closed',               val: accOptim,     color: T.blue,  vclass: 'opt'  },
                    { label: 'Identified Cost Savings',      desc: 'Gross savings identified across agreements',               val: idSavings,    color: T.green, vclass: 'save' },
                    { label: 'Realized Cost Savings',        desc: 'Savings confirmed and applied to budget',                  val: realSavings,  color: T.green, vclass: 'save' },
                    { label: 'Identified Risk',              desc: 'Compliance and financial risk exposure uncovered',         val: idRisk,       color: '#c0392b', vclass: 'risk' },
                  ].filter(row => row.val > 0).map((row, i, arr) => {
                    const fieldConf = fields.find(f => f.label === row.label)?.confidence;
                    return (
                      <tr key={row.label} style={{ cursor: 'default' }}
                        onMouseEnter={e => { e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = T.navy5); }}
                        onMouseLeave={e => { e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = ''); }}
                      >
                        <td style={{ padding: '13px 16px', borderTop: `1px solid ${T.navy10}`, fontWeight: 700, color: T.navy, fontSize: '.92rem' }}>
                          {row.label}
                        </td>
                        <td style={{ padding: '13px 16px', borderTop: `1px solid ${T.navy10}`, color: T.slate, fontSize: '.84rem' }}>
                          {row.desc}
                        </td>
                        <td style={{ padding: '13px 16px', borderTop: `1px solid ${T.navy10}`, textAlign: 'right', fontWeight: 800, fontSize: '1rem', color: row.color, whiteSpace: 'nowrap' }}>
                          {fmtM(row.val)}
                        </td>
                        <td style={{ padding: '13px 16px', borderTop: `1px solid ${T.navy10}`, textAlign: 'center' }}>
                          {fieldConf ? (
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                              background: fieldConf >= 80 ? `${T.green}20` : fieldConf >= 60 ? `${T.yellow}30` : 'rgba(192,57,43,.12)',
                              color: fieldConf >= 80 ? T.green : fieldConf >= 60 ? '#b8860b' : '#c0392b',
                            }}>
                              {fieldConf}%
                            </span>
                          ) : <span style={{ color: T.midGray, fontSize: 12 }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {/* total row */}
                  <tr style={{ background: T.navy5 }}>
                    <td colSpan={2} style={{ padding: '13px 16px', fontWeight: 800, color: T.navy, fontSize: '.92rem', borderTop: `2px solid ${T.navy10}` }}>
                      Total Identified Value
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', fontWeight: 800, fontSize: '1.1rem', color: T.navy, borderTop: `2px solid ${T.navy10}`, whiteSpace: 'nowrap' }}>
                      {fmtM(totalId + (idRisk || 0))}
                    </td>
                    <td style={{ borderTop: `2px solid ${T.navy10}` }} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{
          background: T.navy5, border: `1px solid ${T.navy10}`,
          borderRadius: T.radius, padding: '20px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ fontSize: 12, color: T.slate }}>
            Generated by Anglepoint DOMOsapiens · {today}
          </div>
          <div style={{ fontSize: 11, color: T.midGray }}>Confidential — For internal use only</div>
        </div>
      </div>

      {editMode && (
        <div className="no-print" style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          background: T.navy, color: '#fff', borderRadius: 30, padding: '10px 20px',
          fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 8px 28px rgba(0,25,65,.35)', zIndex: 999,
        }}>
          <i className="ti ti-edit" style={{ color: T.yellow }} />
          Edit mode — click any text to edit · use Hide/Show to toggle sections
          <button onClick={() => setEditMode(false)} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 20, padding: '4px 12px', color: '#fff', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 700 }}>
            Done Editing
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ExtractionView ───────────────────────────────────────────────────────────
// Orchestrates the batch as a thin layer over the per-file screens. A single
// file is simply a batch of length one, so the original flow is preserved.
export default function ExtractionView({ onNav, clients, clientHandles, loggedInUser = '', initialClient = '', initialPublisher = '', onOpenRecord }) {
  const [step, setStep]                         = useState(0);
  const [files, setFiles]                       = useState([]);            // the batch
  const [currentFileIndex, setCurrentFileIndex] = useState(0);            // file under review at Compare
  const [fileResults, setFileResults]           = useState([]);          // [{ fileMeta, extractedData, scriptData, finalFields, excluded }]
  const [smeName, setSmeName]                   = useState('');
  const [aggregateFields, setAggregateFields]   = useState(null);
  const [filters, setFilters]                   = useState({});
  const [savedRecordId, setSavedRecordId]       = useState(null);
  const [fileStatuses, setFileStatuses]         = useState([]);           // 'pending' | 'running' | 'done' per file
  const extractionCancelRef = useRef(false);
  const [isDuplicate, setIsDuplicate]           = useState(false);        // lifted from ScreenRequest

  // Lifted request form state — persists when the user navigates back from SME Validate
  const [reqYear, setReqYear]           = useState('');
  const [reqClient, setReqClient]       = useState(initialClient);
  const [reqPublisher, setReqPublisher] = useState(initialPublisher);

  const startExtraction = (filesToExtract) => {
    extractionCancelRef.current = false;
    setFileStatuses(filesToExtract.map(() => 'pending'));
    setFileResults(filesToExtract.map(f => ({ fileMeta: f, extractedData: null, scriptData: null, finalFields: null, excluded: false })));

    (async () => {
      for (let i = 0; i < filesToExtract.length; i++) {
        if (extractionCancelRef.current) return;
        setFileStatuses(prev => prev.map((s, idx) => idx === i ? 'running' : s));

        const file = filesToExtract[i];
        let extractedData = null;
        let scriptData = null;
        const tasks = [];

        if (file?.file) {
          tasks.push(
            extractROAR(file.file)
              .then(roar => { scriptData = buildScriptData(roar); })
              .catch(() => {})
          );
        }

        const fileRef = (file?.path || file?.id || file?.stored_name) ? file : (file?.name || '');
        tasks.push(
          extractFromFile(fileRef)
            .then(res => { extractedData = res.data || res; })
            .catch(() => {})
        );

        await Promise.all(tasks);
        if (extractionCancelRef.current) return;

        const ed = extractedData;
        const sd = scriptData;
        setFileResults(prev => prev.map((r, idx) =>
          idx === i ? { ...r, extractedData: ed, scriptData: sd } : r
        ));
        setFileStatuses(prev => prev.map((s, idx) => idx === i ? 'done' : s));
      }
    })();
  };

  // Both the upload card and the Files scan hand back an array of files.
  const handleFilesSelected = (picked) => {
    const arr = Array.isArray(picked) ? picked : [picked];
    setFiles(arr);
    setCurrentFileIndex(0);
    setStep(2);
  };

  const handleSMEConfirm = ({ smeName: n }) => {
    setSmeName(n);
    startExtraction(files);
    setStep(4);
  };

  const performSave = async (results) => {
    const agg = aggregateFinalFields(results);
    const sme = smeName || loggedInUser || '';
    const active = results.filter(r => !r.excluded && r.finalFields);
    const isMulti = active.length > 1;
    const cm = deriveCommonMeta(results);

    let primaryRecordId = null;

    if (!isMulti) {
      const only = active[0];
      const meta = only?.fileMeta || files[0] || {};
      const saved = await saveRecord(buildRecord(meta, agg, sme, only?.scriptData))
        .catch(err => { console.error('[Store] saveRecord failed:', err); return null; });
      primaryRecordId = saved?.record_id || null;
    } else {
      const saved = await Promise.all(active.map(r =>
        saveRecord(buildRecord(r.fileMeta, r.finalFields, sme, r.scriptData))
          .catch(err => { console.error('[Store] saveRecord failed:', err); return null; })
      ));
      primaryRecordId = saved[0]?.record_id || null;
      const aggRecord = buildRecord({ client: cm.client, publisher: cm.publisher, year: cm.year }, agg, sme);
      aggRecord.source_file = `Aggregate — ${cm.client || 'Multi-client'} ${cm.year || ''}`.trim();
      const aggSaved = await saveRecord(aggRecord)
        .catch(err => { console.error('[Store] aggregate saveRecord failed:', err); return null; });
      if (!primaryRecordId) primaryRecordId = aggSaved?.record_id || null;
    }

    setSavedRecordId(primaryRecordId);
    setAggregateFields(agg);
    setFileResults(results);
    setStep(6);
    files.forEach(f => { if (f?.stored_name) deleteUpload(f.stored_name); });
  };

  // Advance to the next file, or save and go to Done on the last file.
  const advanceAfterFile = (results) => {
    const next = currentFileIndex + 1;
    if (next < results.length) {
      setFileResults(results);
      setCurrentFileIndex(next);
    } else {
      performSave(results);
    }
  };

  const handleFileConfirm = (resolvedFields) => {
    advanceAfterFile(
      fileResults.map((r, i) => i === currentFileIndex ? { ...r, finalFields: resolvedFields, excluded: false } : r)
    );
  };

  const handleFileExclude = () => {
    advanceAfterFile(
      fileResults.map((r, i) => i === currentFileIndex ? { ...r, excluded: true, finalFields: null } : r)
    );
  };

  const commonMeta = deriveCommonMeta(fileResults);


  // Reset the entire pipeline so a new extraction starts clean.
  const handleReset = () => {
    extractionCancelRef.current = true;
    setStep(0);
    setFiles([]);
    setCurrentFileIndex(0);
    setFileResults([]);
    setFileStatuses([]);
    setSmeName('');
    setAggregateFields(null);
    setFilters({});
    setReqYear(YEARS[0]);
    setReqClient('');
    setReqPublisher('');
  };

  // Resolve the loaded folder handle for the chosen client, if we have one,
  // so the Files step can scan it automatically.
  const clientDir = (clientHandles && filters.client)
    ? (clientHandles.get(filters.client) || null)
    : null;

  // A representative meta for the Done summary (common client/publisher/year,
  // first file's stored reference for the executive-summary call).
  const activeResults = fileResults.filter(r => !r.excluded);
  const doneMeta = {
    client:      commonMeta.client,
    publisher:   commonMeta.publisher,
    year:        commonMeta.year,
    stored_name: activeResults[0]?.fileMeta?.stored_name || null,
    file_path:   activeResults[0]?.fileMeta?.file_path   || null,
    name:        activeResults.length > 1 ? `${activeResults.length} files` : (activeResults[0]?.fileMeta?.name || ''),
    record_id:   savedRecordId,
  };

  const screens = [
    <ScreenRequest  key={0} onNext={(f) => { setFilters(f); setStep(1); }} onUploaded={handleFilesSelected} clients={clients}
      year={reqYear} onYearChange={setReqYear}
      client={reqClient}
      publisher={reqPublisher}
      existingBatch={files}
      onRemoveExisting={(idx) => setFiles(prev => prev.filter((_, i) => i !== idx))}
      onOpenRecord={onOpenRecord}
      onDuplicateChange={setIsDuplicate}
    />,
    <ScreenFiles    key={1} filters={filters} clientDir={clientDir} onSelect={handleFilesSelected} onBack={() => setStep(0)} />,
    <ScreenValidate key={2} selectedFile={files[0]} files={files} onConfirm={handleSMEConfirm} onBack={() => setStep(0)} defaultName={loggedInUser} isDuplicate={isDuplicate} />,
    null,
    <FileReview
      key={`4-${currentFileIndex}`}
      fileResult={fileResults[currentFileIndex]}
      fileIndex={currentFileIndex}
      total={files.length}
      isLast={currentFileIndex === files.length - 1}
      onConfirm={handleFileConfirm}
      onExclude={handleFileExclude}
      onBack={() => setStep(2)}
      allStatuses={fileStatuses}
      files={files}
      smeName={smeName}
    />,
    null,
    <ScreenDone     key={6} finalFields={aggregateFields} selectedFile={doneMeta} onNewExtraction={handleReset} onTracker={() => onNav('tracker')} onDashboards={() => onNav('dashboards')} />,
  ];

  return (
    <>
      <JourneyBar currentStep={STEP_TO_BAR[step] ?? 0} />
      {screens[step]}
    </>
  );
}
// (multi-file batch extraction + aggregation)
