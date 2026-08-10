import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import AutoDashViewer from '../AutoDashViewer';
import { DashboardBuilder } from '../../views/DashboardsView';
import { getRecords, uploadFile, getSlideMeta } from '../../services/api';
import { getDashboards, saveDashboard } from '../../services/dashboards';
import { getHubContext } from '../../services/hubContext';
import { deriveOptions } from '../../services/dashboardData';

const MAX_FILES = 5;

export default function StepUpload({ onNext, onUploaded, publisher, existingBatch = [], onRemoveExisting, onOpenRecord, onDuplicateChange }) {
  // removed useHub()
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  // Start with whatever files were passed back (if we navigated Back from Step 2)
  const [newFiles, setNewFiles] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [previewRecord, setPreviewRecord] = useState(null);
  const [detectedYear, setDetectedYear]   = useState(null); // year extracted from PPTX first slide

  useEffect(() => {
    getRecords()
      .then(res => setHistory(Array.isArray(res) ? res : res.records || []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);  
  // Hub file: derive from hub context
  const hubCtx = getHubContext();
  const hubS3Key = hubCtx?.s3_key || null;
  const hubFileName = hubCtx?.attached_file_name || null;
  const hubStoredName = hubS3Key ? hubS3Key.replace(/^uploads\//, '') : null;
  const hasHubFile = !!(hubStoredName && hubFileName);
  const fileInputRef = useRef(null);

  // Find the saved dashboard config matching the clicked record
  const savedDash = useMemo(() => {
    if (!previewRecord) return null;
    try {
      const saved = getDashboards();
      const rClient    = (previewRecord.client    || '').toLowerCase();
      const rPublisher = (previewRecord.publisher || '').toLowerCase();
      const rYear      = String(previewRecord.year || '');
      return saved.find(d => {
        if (d.type === 'auto') {
          // Auto-saved dashboards
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

  const totalCount = existingBatch.length + newFiles.length + (hasHubFile ? 1 : 0);
  const totalCost  = totalCount * 12;

  // We no longer rely on frontend duplicate checks for client/year here.
  const duplicateRecords = [];
  const hasDuplicate = duplicateRecords.length > 0;

  useEffect(() => { onDuplicateChange?.(hasDuplicate ? duplicateRecords[0] : null); }, [hasDuplicate, duplicateRecords[0]]);

  const addFiles = async (incoming) => {
    setUploadError(null);
    const arr = Array.from(incoming);
    const combined = existingBatch.length + newFiles.length + arr.length;
    if (combined > MAX_FILES) {
      setUploadError(`You can upload a maximum of ${MAX_FILES} files at a time.`);
      return;
    }
    setUploading(true);
    try {
      const staged = [];
      for (const file of arr) {
        const meta = await uploadFile(file);
        staged.push({ ...meta, name: meta.filename, version: 'Uploaded', source: 'uploaded', file });
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
      return next;
    });
  };

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); };
  const handleFileChange = (e) => { addFiles(e.target.files); e.target.value = ''; };

  const handleUpload = async () => {
    if (totalCount === 0 && !hasHubFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const hubCtxLocal = getHubContext();
      const client_scope_name = (hubCtxLocal?.client_scope_name || '').trim();
      const applicable_from = (hubCtxLocal?.start_dates || [])[0] || null;
      const applicable_to = (hubCtxLocal?.end_dates || [])[0] || null;
      const publisher = (hubCtxLocal?.workstream || '').trim();

      const hubEntry = hasHubFile ? [{
        name: hubFileName,
        stored_name: hubStoredName,
        source: 'hub',
        version: 'Synced from Hub',
        client_scope_name, applicable_from, applicable_to, publisher,
      }] : [];

      const batch = [
        ...hubEntry,
        ...existingBatch.map(f => ({ ...f, client_scope_name, applicable_from, applicable_to, publisher })),
        ...newFiles.map(f => ({ ...f, client_scope_name, applicable_from, applicable_to, publisher })),
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
      {getHubContext()?.mode === 'edit' && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: '#fff5f5', border: '1.5px solid #f87171',
          borderRadius: 8, padding: '10px 14px', marginBottom: 12,
        }}>
          <i className="ti ti-alert-circle" style={{ color: '#dc2626', fontSize: 18, flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#991b1b' }}>Re-extracting will overwrite existing ROI data</div>
            <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 2 }}>
              This deliverable already has ROI metrics recorded in the Hub. <strong>Submitting</strong> this new extraction will overwrite any manual edits you previously made to those numbers.
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
        {/* ── LEFT: Primary Hub File ── */}
        <div id="upload-card" className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="card-title">
            <i className="ti ti-file-check" aria-hidden="true" />
            Primary Deliverable File
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {getHubContext()?.attached_file_name ? (
              <div style={{ 
                background: 'var(--surface-alt)', border: '1px solid var(--border)', 
                borderRadius: 'var(--radius)', padding: '20px', textAlign: 'center' 
              }}>
                <i className="ti ti-file-description" style={{ fontSize: 32, color: 'var(--blue)', marginBottom: 12, display: 'block' }} />
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                  {getHubContext()?.attached_file_name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--green, #16a34a)' }}>
                      <i className="ti ti-check" /> Synced from Delivery Hub
                    </span>
                </div>
              </div>
            ) : (
              <div style={{ 
                background: '#fffbeb', border: '1px solid #fef3c7', 
                borderRadius: 'var(--radius)', padding: '20px', textAlign: 'center' 
              }}>
                <i className="ti ti-file-unknown" style={{ fontSize: 32, color: '#d97706', marginBottom: 12, display: 'block' }} />
                <div style={{ fontWeight: 600, fontSize: 14, color: '#92400e', marginBottom: 4 }}>
                  No Primary File Attached
                </div>
                <div style={{ fontSize: 12, color: '#b45309' }}>
                  This deliverable does not have a primary file in the Hub.<br />
                  You can upload files manually in the Additional Documents zone.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Additional Documents ── */}
        <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="card-title">
            <i className="ti ti-files" aria-hidden="true" />
            Additional Documents
            <span className="upload-count">{totalCount}/{MAX_FILES}</span>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Drag and drop supplementary files (e.g., raw data sheets, email exports) to extract along with the main deliverable.
          </div>

          <div
            className={`upload-dropzone ${dragOver ? 'is-dragover' : ''} ${totalCount >= MAX_FILES ? 'is-full' : ''}`}
            onClick={() => totalCount < MAX_FILES && fileInputRef.current.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{ flex: 1 }}
          >
            <i className="ti ti-file-upload upload-dropzone-icon" aria-hidden="true" />
            <div className="upload-dropzone-title">
              {totalCount >= MAX_FILES ? 'Maximum files reached' : 'Drag & drop additional files'}
            </div>
            <div className="upload-dropzone-hint">
              {totalCount < MAX_FILES
                ? `or click to browse · PDF, PPTX, XLSX`
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

          {/* File list */}
          {(existingBatch.length > 0 || newFiles.length > 0) && (
            <div className="upload-file-list" style={{ marginTop: 12 }}>
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
              {newFiles.map((f, i) => {
                const isHubFile = getHubContext()?.attached_file_name === f.name;
                return (
                  <div key={`new-${i}`} className="upload-file-chip">
                    <i className="ti ti-file-description upload-file-chip-icon" />
                    <span className="upload-file-chip-name">{f.name}</span>
                    <span className="upload-file-chip-size">{(f.size / 1024).toFixed(0)} KB</span>
                    {!isHubFile && (
                      <button onClick={() => removeNew(i)} className="upload-file-chip-remove" title="Remove">
                        <i className="ti ti-x" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {uploadError && (
        <div className="upload-error" style={{ marginTop: 0 }}>
          <i className="ti ti-alert-triangle" aria-hidden="true" /> {uploadError}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          className="btn primary is-gated"
          disabled={(totalCount === 0 && !hasHubFile) || uploading}
          onClick={handleUpload}
          style={{ minWidth: 160 }}
        >
          {uploading
            ? <><i className="ti ti-loader-2 spinning" aria-hidden="true" /> Uploading…</>
            : <>Continue Extraction <i className="ti ti-arrow-right" aria-hidden="true" /></>
          }
        </button>
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
            width: 'min(900px, 96vw)',
            maxHeight: '92vh',
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
                {[previewRecord.client_scope_name, previewRecord.publisher].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button
              onClick={() => setPreviewRecord(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', lineHeight: 1, padding: 4, borderRadius: 6 }}
            >
              <i className="ti ti-x" />
            </button>
          </div>

          {/* Dashboard content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
            {savedDash?.type === 'auto' ? (
              <AutoDashViewer d={savedDash} viewOnly />
            ) : savedDash ? (
              <DashboardBuilder
                templateId={savedDash.templateId}
                options={dashOptions}
                records={history}
                initial={savedDash}
                embedded
                onClose={() => setPreviewRecord(null)}
                onSave={updated => { saveDashboard(updated); }}
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
