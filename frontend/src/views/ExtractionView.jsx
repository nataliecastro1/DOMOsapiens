import React, { useState, useEffect, useRef } from 'react';
import Badge from '../components/Badge';
import ClientSelect from '../components/ClientSelect';
import { extractROAR, extractFromFile, uploadFile, searchDocuments } from '../services/api';
import {
  PUBLISHERS, YEARS,
  SAMPLE_FILES, EXTRACTED_FIELDS, EXTRACTION_STEPS,
} from '../data';

// ─── Journey Bar ──────────────────────────────────────────────────────────────
const STEP_DEFS = [
  { label: 'Request',      icon: 'ti-adjustments-horizontal' },
  { label: 'Files',        icon: 'ti-files'                  },
  { label: 'SME Validate', icon: 'ti-user-check'             },
  { label: 'Extract',      icon: 'ti-cpu'                    },
  { label: 'Compare',      icon: 'ti-git-compare'            },
  { label: 'Store',        icon: 'ti-database'               },
  { label: 'Done',         icon: 'ti-circle-check'           },
];

function JourneyBar({ currentStep, onStep }) {
  return (
    <div id="journey-bar" className="journey-bar" role="list" aria-label="Extraction pipeline">
      {STEP_DEFS.map((step, i) => {
        const isDone   = i < currentStep;
        const isActive = i === currentStep;
        return (
          <React.Fragment key={i}>
            <button
              className={`journey-step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}
              onClick={() => onStep(i)}
              role="listitem"
              aria-current={isActive ? 'step' : undefined}
            >
              <div className="journey-step-icon">
                {isDone
                  ? <i className="ti ti-check" aria-hidden="true" />
                  : <i className={`ti ${step.icon}`} aria-hidden="true" />
                }
              </div>
              <div className="journey-step-label">{step.label}</div>
            </button>
            {i < STEP_DEFS.length - 1 && (
              <div className={`journey-connector ${isDone ? 'done' : ''}`} aria-hidden="true" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Screen 0: Request ────────────────────────────────────────────────────────
function ScreenRequest({ onNext, onUploaded }) {
  const [client, setClient]   = useState('');
  const [year, setYear]       = useState(YEARS[0]);
  const [publisher, setPub]   = useState(PUBLISHERS[0]);

  // Upload card state — up to 4 files
  const MAX_FILES = 4;
  const [dragOver, setDragOver]       = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [docType, setDocType]         = useState('ROAR');
  const [uploading, setUploading]     = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef                  = useRef(null);

  const [upClient, setUpClient]       = useState('');
  const [upYear, setUpYear]           = useState(YEARS[0]);
  const [upPublisher, setUpPublisher] = useState(PUBLISHERS[0]);

  const addFiles = (incoming) => {
    setUploadError(null);
    const all = [...selectedFiles, ...Array.from(incoming)];
    if (all.length > MAX_FILES) {
      setUploadError(`You can upload a maximum of ${MAX_FILES} files at a time.`);
      setSelectedFiles(all.slice(0, MAX_FILES));
    } else {
      setSelectedFiles(all);
    }
  };

  const removeFile = (idx) => setSelectedFiles(prev => prev.filter((_, i) => i !== idx));

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleFileChange = (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  };

  const handleUpload = async () => {
    if (!selectedFiles.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      // Upload first file and proceed — the rest can be queued in future iterations
      const meta = await uploadFile(selectedFiles[0]);
      onUploaded({
        ...meta,
        name: meta.filename,
        version: 'Uploaded',
        docType,
        client: upClient,
        publisher: upPublisher,
        year: upYear,
        source: 'uploaded',
        file: selectedFiles[0],   // raw File retained so the Extract step can run the script extractor
      });
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'stretch' }}>

      {/* ── Card 1: SharePoint Search ── */}
      <div id="search-card" className="card">
        <div className="card-title">
          <i className="ti ti-adjustments-horizontal" aria-hidden="true" />
          Search SharePoint
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="req-client">Client</label>
          <ClientSelect value={client} onChange={setClient} />
        </div>
        <div className="grid-2">
          <div className="field-group">
            <label className="field-label" htmlFor="req-year">Year</label>
            <select id="req-year" value={year} onChange={e => setYear(e.target.value)}>
              {YEARS.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="req-publisher">Publisher</label>
            <select id="req-publisher" value={publisher} onChange={e => setPub(e.target.value)}>
              {PUBLISHERS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn primary" onClick={() => onNext({ client, year, publisher })}>
            Find Files <i className="ti ti-arrow-right" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── Card 2: Manual Upload ── */}
      <div id="upload-card" className="card">
        <div className="card-title">
          <i className="ti ti-upload" aria-hidden="true" />
          Upload Files
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 400, color: '#6b7fa3' }}>
            {selectedFiles.length}/{MAX_FILES} files
          </span>
        </div>

        {/* Drag & drop zone */}
        <div
          onClick={() => selectedFiles.length < MAX_FILES && fileInputRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent)' : '#c8d4e8'}`,
            borderRadius: 8,
            padding: '20px 16px',
            textAlign: 'center',
            cursor: selectedFiles.length < MAX_FILES ? 'pointer' : 'default',
            background: dragOver ? 'rgba(0,82,204,0.04)' : '#f7f9fc',
            transition: 'border-color 0.15s, background 0.15s',
            marginBottom: 12,
            opacity: selectedFiles.length >= MAX_FILES ? 0.5 : 1,
          }}
        >
          <i className="ti ti-file-upload"
            style={{ fontSize: 28, color: dragOver ? 'var(--accent)' : '#6b7fa3', display: 'block', marginBottom: 6 }}
            aria-hidden="true"
          />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
            {selectedFiles.length >= MAX_FILES ? 'Maximum files reached' : 'Drag & drop files here'}
          </div>
          <div style={{ fontSize: 11, color: '#6b7fa3', marginTop: 3 }}>
            {selectedFiles.length < MAX_FILES
              ? `or click to browse · up to ${MAX_FILES} files · PDF, PPTX, XLSX`
              : 'Remove a file to add another'}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.pptx,.xlsx,.ppt"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* File list */}
        {selectedFiles.length > 0 && (
          <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {selectedFiles.map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#f7f9fc', borderRadius: 7, padding: '7px 10px',
                border: '1px solid #e2e8f0',
              }}>
                <i className="ti ti-file-description" style={{ color: '#0052cc', fontSize: 15, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--navy)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </span>
                <span style={{ fontSize: 11, color: '#6b7fa3', flexShrink: 0 }}>
                  {(f.size / 1024).toFixed(0)} KB
                </span>
                <button
                  onClick={() => removeFile(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', padding: 0, flexShrink: 0 }}
                  title="Remove"
                >
                  <i className="ti ti-x" style={{ fontSize: 13 }} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Document type */}
        <div className="field-group">
          <label className="field-label">Document Type</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {['ROAR', 'ELP'].map(type => (
              <button
                key={type}
                onClick={() => setDocType(type)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 6,
                  border: `1.5px solid ${docType === type ? 'var(--accent)' : '#d0d9ea'}`,
                  background: docType === type ? 'rgba(0,82,204,0.07)' : '#fff',
                  color: docType === type ? 'var(--accent)' : '#6b7fa3',
                  fontWeight: docType === type ? 700 : 400,
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {type}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#6b7fa3', marginTop: 6 }}>
            {docType === 'ROAR'
              ? 'Return on Anglepoint Relationship — PowerPoint (.pptx)'
              : 'ELP deliverable — PowerPoint / slide deck'}
          </div>
        </div>

        {/* Client / Publisher / Year — manually set for this upload */}
        <div className="field-group">
          <label className="field-label">Client</label>
          <ClientSelect value={upClient} onChange={setUpClient} />
        </div>
        <div className="grid-2">
          <div className="field-group">
            <label className="field-label">Year</label>
            <select value={upYear} onChange={e => setUpYear(e.target.value)}>
              {YEARS.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label">Publisher</label>
            <select value={upPublisher} onChange={e => setUpPublisher(e.target.value)}>
              {PUBLISHERS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {uploadError && (
          <div style={{
            marginBottom: 12, padding: 10,
            background: 'var(--red-pale)', borderRadius: 'var(--radius-sm)',
            fontSize: 12, color: 'var(--red-text)',
          }}>
            <i className="ti ti-alert-triangle" style={{ marginRight: 6 }} aria-hidden="true" />
            {uploadError}
          </div>
        )}

        <div className="btn-row">
          <button
            className="btn primary"
            disabled={!selectedFiles.length || uploading}
            onClick={handleUpload}
            style={{ opacity: (selectedFiles.length && !uploading) ? 1 : 0.45, cursor: (selectedFiles.length && !uploading) ? 'pointer' : 'not-allowed' }}
          >
            {uploading
              ? <><i className="ti ti-loader-2" style={{ animation: 'spin 0.8s linear infinite' }} aria-hidden="true" /> Uploading…</>
              : <>Upload &amp; Use This File <i className="ti ti-arrow-right" aria-hidden="true" /></>
            }
          </button>
        </div>
      </div>

    </div>
  );
}

// ─── Screen 1: Files ──────────────────────────────────────────────────────────
function ScreenFiles({ filters = {}, onSelect, onBack }) {
  const [files, setFiles]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    setLoading(true);
    searchDocuments(filters)
      .then(res => { setFiles(res.files || []); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const { client = '', year = '', publisher = '' } = filters;
  const subtitle = [client, publisher, year].filter(Boolean).join(' / ') || 'all documents';

  return (
    <div className="card">
      <div className="card-title">
        <i className="ti ti-files" aria-hidden="true" />
        Matched Files
      </div>

      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
        {loading ? 'Searching…' : (
          <>
            <strong style={{ color: 'var(--navy)' }}>{files.length}</strong>
            {' '}file{files.length !== 1 ? 's' : ''} found for{' '}
            <strong style={{ color: 'var(--navy)' }}>{subtitle}</strong>.
            {files.length > 0 && ' Select one to continue.'}
          </>
        )}
      </p>

      {error && (
        <div style={{ padding: 12, background: 'var(--red-pale)', borderRadius: 8, fontSize: 13, color: 'var(--red-text)', marginBottom: 16 }}>
          <i className="ti ti-alert-triangle" style={{ marginRight: 6 }} />
          Could not reach backend: {error}
        </div>
      )}

      {!loading && files.length === 0 && !error && (
        <div style={{ padding: 24, textAlign: 'center', color: '#6b7fa3', fontSize: 14 }}>
          <i className="ti ti-folder-off" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
          No documents found for these filters.
          <br />
          <span style={{ fontSize: 12 }}>Try different filters or upload a file manually.</span>
        </div>
      )}

      {files.map((f, i) => (
        <div className={`file-card ${i === 0 ? 'featured' : ''}`} key={f.name}>
          <i
            className={`ti ti-file-description file-card-icon ${i === 0 ? 'featured' : ''}`}
            aria-hidden="true"
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="file-card-name">{f.name}</div>
            <div className="file-card-meta">
              <span>{f.modified}</span>
              <span>·</span>
              <span>{f.size}</span>
              <Badge color={i === 0 ? 'green' : 'navy'}>{i === 0 ? 'Best match' : f.extension}</Badge>
            </div>
          </div>
          <button
            className={`btn small ${i === 0 ? 'primary' : 'ghost'}`}
            onClick={() => onSelect({ ...f, version: f.modified, source: 'local' })}
          >
            Select
          </button>
        </div>
      ))}

      <div className="btn-row">
        <button className="btn ghost" onClick={onBack}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back
        </button>
      </div>
    </div>
  );
}

// ─── Screen 2: SME Validate ───────────────────────────────────────────────────
function ScreenValidate({ selectedFile, onConfirm, onBack }) {
  const [decision, setDecision] = useState('approve');
  const [smeName, setSmeName]   = useState('');
  const [smeNotes, setSmeNotes] = useState('');
  const timestamp = useRef(new Date().toLocaleString());

  const handleConfirm = () => {
    if (decision === 'flag') { onBack(); return; }
    onConfirm({ decision, smeName, smeNotes });
  };

  const OPTIONS = [
    {
      id: 'approve', iconColor: '#4ade80',
      icon: 'ti-circle-check',
      title: 'Approve — correct file, proceed',
      sub: 'Decision + timestamp stored in audit log',
    },
    {
      id: 'flag', iconColor: '#fbbf24',
      icon: 'ti-alert-triangle',
      title: 'Flag — wrong file, return to selection',
      sub: 'Flagged decision is still recorded',
    },
    {
      id: 'note', iconColor: '#60a5fa',
      icon: 'ti-edit',
      title: 'Approve with notes',
      sub: 'Notes attached to the audit record',
    },
  ];

  return (
    <div className="sme-gate">
      <div className="sme-gate-header">
        <span className="sme-gate-badge">SME Checkpoint</span>
        <div>
          <div className="sme-gate-title">Subject Matter Expert Validation</div>
          <div className="sme-gate-sub">Review the file before extraction proceeds</div>
        </div>
      </div>

      <div className="sme-two-col">
        <div className="sme-col-left">
          <div className="sme-info-box">
            <div className="sme-info-row">
              <span className="sme-info-key">File</span>
              <span className="sme-info-val">{selectedFile?.name || '—'}</span>
            </div>
            <div className="sme-info-row">
              <span className="sme-info-key">Version</span>
              <span className="sme-info-val">{selectedFile?.version || '—'}</span>
            </div>
            <div className="sme-info-row">
              <span className="sme-info-key">Client / Publisher / Year</span>
              <span className="sme-info-val">
                {(selectedFile?.client || selectedFile?.publisher || selectedFile?.year)
                  ? [selectedFile?.client, selectedFile?.publisher, selectedFile?.year].map(v => v || '—').join(' · ')
                  : 'Encova · Oracle · 2025'}
              </span>
            </div>
            <div className="sme-info-row">
              <span className="sme-info-key">Timestamp</span>
              <span className="sme-info-val">{timestamp.current}</span>
            </div>
          </div>
        </div>

        <div className="sme-col-right">
          <div className="sme-decision-label">SME Decision — recorded to audit log</div>

          {OPTIONS.map(opt => (
            <button
              key={opt.id}
              className={`sme-option ${decision === opt.id ? 'selected' : ''}`}
              onClick={() => setDecision(opt.id)}
            >
              <i
                className={`ti ${opt.icon} sme-option-icon`}
                style={{ color: opt.iconColor }}
                aria-hidden="true"
              />
              <div>
                <div className="sme-option-title">{opt.title}</div>
                <div className="sme-option-sub">{opt.sub}</div>
              </div>
            </button>
          ))}

          <div className="field-group" style={{ marginTop: 20 }}>
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

          {decision === 'note' && (
            <div className="field-group">
              <label className="field-label sme-field-label" htmlFor="sme-notes">Notes</label>
              <textarea
                id="sme-notes"
                className="sme-input"
                style={{ height: 80 }}
                placeholder="Add context for the record…"
                value={smeNotes}
                onChange={e => setSmeNotes(e.target.value)}
              />
            </div>
          )}

          <div className="sme-btn-row">
            <button
              className="btn"
              style={{ background: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.18)', color: '#fff' }}
              onClick={onBack}
            >
              <i className="ti ti-arrow-left" aria-hidden="true" /> Back
            </button>
            <button className="btn primary sme-confirm-btn" onClick={handleConfirm}>
              {decision === 'flag'
                ? 'Return to Files'
                : <><i className="ti ti-lock-open" aria-hidden="true" /> Confirm &amp; Extract</>
              }
            </button>
          </div>
        </div>
      </div>
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

// ─── Script extractor (/api/roar/extract) → Compare "Script" column ───────────
// Maps the extractor's roi_fields keys to the canonical Compare labels.
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

// ─── Screen 3: Extract ────────────────────────────────────────────────────────
function ScreenExtract({ selectedFile, onNext, onScriptData }) {
  const [stepStatuses, setStepStatuses] = useState(EXTRACTION_STEPS.map(() => 'pending'));
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState(null);

  // Modal + fallback form state
  const [showModal, setShowModal]         = useState(false);
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

  useEffect(() => {
    let cancelled = false;

    async function runExtraction() {
      for (let i = 0; i < EXTRACTION_STEPS.length; i++) {
        if (cancelled) return;
        setStepStatuses(prev => prev.map((s, idx) => idx === i ? 'running' : s));

        if (i === EXTRACTION_STEPS.length - 1) {
          // Run both extractions in parallel:
          // 1. Script extractor (deterministic parser) → Compare "Script" column
          // 2. Claude AI → Compare "Claude AI" column
          const tasks = [];

          if (selectedFile?.file) {
            tasks.push(
              extractROAR(selectedFile.file)
                .then(roar => { if (!cancelled) onScriptData?.(buildScriptData(roar)); })
                .catch(() => {})
            );
          }

          // Pass the full selectedFile object so extractFromFile can use id/stored_name/path
          console.log('[Extract] selectedFile:', selectedFile);
          if (selectedFile) {
            const fileRef = selectedFile.path || selectedFile.id
              ? selectedFile
              : (selectedFile.name || '');
            console.log('[Extract] calling extractFromFile with:', fileRef);
            tasks.push(
              extractFromFile(fileRef)
                .then(res => { console.log('[Extract] Claude result:', res); if (!cancelled) setExtractedData(res.data || res); })
                .catch(err => { console.error('[Extract] Claude error:', err); if (!cancelled) setError(err.message); })
            );
          }

          if (tasks.length) await Promise.all(tasks);
        } else {
          await new Promise(r => setTimeout(r, 700));
        }

        if (!cancelled) {
          setStepStatuses(prev => prev.map((s, idx) => idx === i ? 'done' : s));
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }

    runExtraction();
    return () => { cancelled = true; };
  }, []);

  const isDone = stepStatuses.every(s => s === 'done');

  const fmt = (n) => n != null ? `$${Number(n).toLocaleString()}` : null;
  const displayFields = extractedData ? [
    { label: 'Identified Risk',                value: fmt(extractedData.identified_risk),       variant: 'green', confidence: extractedData.confidence ?? 0, source: null, flag: null, entryMode: extractedData.identified_risk       != null ? 'extracted' : null },
    { label: 'Identified Cost Avoidance',      value: fmt(extractedData.id_cost_avoidance),     variant: 'green', confidence: extractedData.confidence ?? 0, source: null, flag: null, entryMode: extractedData.id_cost_avoidance     != null ? 'extracted' : null },
    { label: 'Accomplished Cost Avoidance',    value: fmt(extractedData.acc_cost_avoidance),    variant: 'green', confidence: extractedData.confidence ?? 0, source: null, flag: null, entryMode: extractedData.acc_cost_avoidance    != null ? 'extracted' : null },
    { label: 'Identified Cost Optimization',   value: fmt(extractedData.id_cost_optimization),  variant: 'blue',  confidence: extractedData.confidence ?? 0, source: null, flag: null, entryMode: extractedData.id_cost_optimization  != null ? 'extracted' : null },
    { label: 'Accomplished Cost Optimization', value: fmt(extractedData.acc_cost_optimization), variant: 'blue',  confidence: extractedData.confidence ?? 0, source: null, flag: null, entryMode: extractedData.acc_cost_optimization != null ? 'extracted' : null },
    { label: 'Identified Cost Savings',        value: fmt(extractedData.realized_savings),      variant: 'green', confidence: extractedData.confidence ?? 0, source: null, flag: null, entryMode: extractedData.realized_savings      != null ? 'extracted' : null },
    { label: 'Realized Cost Savings',          value: fmt(extractedData.contract_spend),        variant: 'green', confidence: extractedData.confidence ?? 0, source: null, flag: null, entryMode: extractedData.contract_spend        != null ? 'extracted' : null },
  ] : EXTRACTED_FIELDS;

  const confidence = extractedData?.confidence ?? 94;
  const confClass = c => c >= 90 ? 'conf-high' : c >= 75 ? 'conf-mid' : 'conf-low';

  // Fields with no extracted value
  const missingFields = displayFields.filter(f => !f.value);

  // Show modal once extraction finishes (only if there are missing fields)
  useEffect(() => {
    if (isDone && missingFields.length > 0 && !showModal && !fallbackMode && !mergedFields) {
      setShowModal(true);
    }
  }, [isDone]);

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
            <div className="field-group" style={{ marginBottom: 0 }}>
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

  // ── Render: extraction progress + results ──
  return (
    <div className="card">
      <div className="card-title">
        <i className="ti ti-cpu" aria-hidden="true" />
        ROI Extraction
      </div>
      <p className="extract-sub">
        Processing validated file against extraction schema…
      </p>

      <div className="extract-steps">
        {EXTRACTION_STEPS.map((step, i) => {
          const status = stepStatuses[i];
          return (
            <div className={`extract-step ${status}`} key={i}>
              <div className="extract-step-icon">
                {status === 'done'    && <i className="ti ti-check" aria-hidden="true" />}
                {status === 'running' && (
                  <i
                    className="ti ti-loader-2"
                    style={{ animation: 'spin 0.8s linear infinite' }}
                    aria-hidden="true"
                  />
                )}
                {status === 'pending' && <i className="ti ti-circle" aria-hidden="true" />}
              </div>
              <span className="extract-step-label">{step}</span>
              {status === 'done'    && <Badge color="green"><i className="ti ti-check" /> Done</Badge>}
              {status === 'running' && <Badge color="blue">Running…</Badge>}
              {status === 'pending' && <Badge color="navy">Pending</Badge>}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="extract-error">
          <strong>Backend unavailable:</strong> showing preview data. ({error})
        </div>
      )}

      {isDone && (
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
              <strong className={confClass(confidence)}>{confidence}%</strong>
            </div>
          </div>
          {!showModal && missingFields.length === 0 && (
            <div className="btn-row">
              <button className="btn primary" onClick={() => onNext(displayFields)}>
                Review &amp; Store <i className="ti ti-arrow-right" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Missing-fields modal ── */}
      {showModal && (
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
          <span className={confClass} style={{ fontSize: 13 }}>
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
// Mocked "what the script found" — keyed by canonical ROI field label.
// Two intentional mismatches (Identified Cost Optimization, Realized Cost Savings)
// so the compare screen has something meaningful to resolve during testing.
// When the real script is deployed, replace these values with the API response.
const SCRIPT_VALUES = {
  'Identified Risk':                '$2,400,000',
  'Identified Cost Avoidance':      '$870,000',
  'Accomplished Cost Avoidance':    '$340,000',
  'Identified Cost Optimization':   '$195,000',
  'Accomplished Cost Optimization': '$98,000',
  'Identified Cost Savings':        '$1,530,000',
  'Realized Cost Savings':          '$412,000',
};

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

function CompareRow({ field, onResolve }) {
  const isSkipped   = field.flag === 'SME skipped — data not available';
  const bestVal     = field.sme ?? field.claude;
  const scriptMatch = !isSkipped && field.script !== '—' && field.script === bestVal;

  // Store raw number string; format only for display and when notifying parent
  const [editVal,   setEditVal]   = useState(toRaw(bestVal));
  const [confirmed, setConfirmed] = useState(true);

  useEffect(() => {
    onResolve(field.label, confirmed ? toFormatted(editVal) : null);
  }, [confirmed, editVal]);

  const rowColor    = isSkipped  ? 'rgba(107,127,163,0.06)'
                    : confirmed  ? 'rgba(34,197,94,0.07)'
                    : 'rgba(239,68,68,0.06)';
  const borderColor = isSkipped  ? 'rgba(107,127,163,0.25)'
                    : confirmed  ? 'rgba(34,197,94,0.25)'
                    : 'rgba(239,68,68,0.22)';

  const monoStyle = { fontSize: 13, fontFamily: 'monospace', color: '#374151' };
  const naStyle   = { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1.4fr 0.9fr 0.9fr 0.9fr 1.3fr',
      alignItems: 'center',
      gap: 0,
      borderBottom: '1px solid #edf0f6',
      padding: '11px 16px',
      background: rowColor,
      borderLeft: `3px solid ${borderColor}`,
      transition: 'background 0.2s, border-color 0.2s',
    }}>

      {/* Field name */}
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
        {field.label}
      </span>

      {/* Script value — always shown when the script found one, independent of
          the SME-skipped flag (skipping concerns the Claude/SME side, not the
          deterministic script extractor). */}
      {(!field.script || field.script === '—') ? (
        <span style={naStyle}>—</span>
      ) : (
        <span style={{ ...monoStyle, color: (!isSkipped && !scriptMatch) ? '#b91c1c' : '#374151', fontWeight: (!isSkipped && !scriptMatch) ? 600 : 400, display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
          <span>
            {field.script}
            {field.scriptUncertain && (
              <i
                className="ti ti-alert-triangle"
                style={{ marginLeft: 5, fontSize: 11, color: '#d97706' }}
                title={`Competing values found: ${field.scriptAlternates.map(a => a.value).filter(Boolean).join(', ')}`}
                aria-hidden="true"
              />
            )}
            {!field.scriptUncertain && !isSkipped && !scriptMatch && (
              <i className="ti ti-alert-triangle" style={{ marginLeft: 5, fontSize: 11 }} aria-hidden="true" />
            )}
          </span>
          {field.scriptUncertain && field.scriptAlternates.length > 0 && (
            <span style={{ fontSize: 10, color: '#d97706', fontWeight: 400 }}>
              also: {field.scriptAlternates.map(a => a.value).filter(Boolean).join(', ')}
            </span>
          )}
        </span>
      )}

      {/* Claude AI value */}
      <span style={field.claude ? monoStyle : naStyle}>
        {field.claude ?? '—'}
      </span>

      {/* SME Derived value */}
      <span style={field.sme ? { ...monoStyle, color: '#0369a1', fontWeight: 600 } : naStyle}>
        {isSkipped ? <span style={naStyle}>Skipped</span> : (field.sme ?? '—')}
      </span>

      {/* Final Value — confirmed: value + pencil; editing: input + Done */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {isSkipped ? (
          <span style={naStyle}>—</span>
        ) : confirmed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d', fontFamily: 'monospace' }}>
              {toFormatted(editVal)}
            </span>
            <button
              onClick={() => setConfirmed(false)}
              title="Edit final value"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                color: '#6b7fa3', fontSize: 13, lineHeight: 1, flexShrink: 0,
              }}
              aria-label="Edit final value"
            >
              <i className="ti ti-pencil" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 5, width: '100%', alignItems: 'center' }}>
            <div className="input-prefix-group" style={{ flex: 1 }}>
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
              disabled={!editVal.toString().trim()}
              onClick={() => { if (editVal.toString().trim()) setConfirmed(true); }}
              style={{
                padding: '4px 10px', fontSize: 12, fontWeight: 700,
                background: editVal.toString().trim() ? '#22c55e' : '#d1fae5',
                color: '#fff', border: 'none', borderRadius: 6,
                cursor: editVal.toString().trim() ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s', flexShrink: 0,
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ScreenCompare({ fields, scriptData, onNext, onBack }) {
  // Build rows from live extracted fields + the script extractor's values.
  // script = deterministic .pptx extractor (real values when a file was uploaded,
  //          otherwise the mock SCRIPT_VALUES so the SharePoint path still demos).
  // claude = what the AI extracted (null if it couldn't find it).
  // sme    = what the SME computed via the fallback form (null if extracted or skipped).
  const hasRealScript = scriptData && Object.keys(scriptData).length > 0;
  const scriptFor = (label) => {
    if (hasRealScript) return scriptData[label] || null;   // {value, uncertain, alternates} | null
    const v = SCRIPT_VALUES[label];
    return v ? { value: v, uncertain: false, alternates: [] } : null;
  };

  const sourceFields = fields && fields.length > 0 ? fields : [];
  const compareRows = sourceFields.map(f => {
    const s = scriptFor(f.label);
    return {
      label:  f.label,
      script: s?.value ?? '—',
      scriptUncertain:  s?.uncertain ?? false,
      scriptAlternates: s?.alternates ?? [],
      claude: f.entryMode === 'extracted' ? f.value : null,
      sme:    f.entryMode === 'manual'    ? f.value : null,
      flag:   f.flag,
    };
  });

  const uncertainLabels = compareRows.filter(r => r.scriptUncertain).map(r => r.label);

  const [resolved, setResolved] = useState({});

  const handleResolve = (label, val) => {
    setResolved(prev => ({ ...prev, [label]: val }));
  };

  // Skipped rows don't need SME resolution — only non-skipped rows must be confirmed
  const resolvableRows = compareRows.filter(f => f.flag !== 'SME skipped — data not available');
  const allDone = resolvableRows.every(f => resolved[f.label] !== null && resolved[f.label] !== undefined);

  // "Best available" value per row — prefer sme-computed, fall back to claude extracted
  const bestVal = (row) => row.sme ?? row.claude;
  const matchCount    = compareRows.filter(f => f.flag !== 'SME skipped — data not available' && f.script === bestVal(f)).length;
  const mismatchCount = resolvableRows.length - matchCount;

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

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #edf0f6' }}>
        <div className="card-title" style={{ marginBottom: 6 }}>
          <i className="ti ti-git-compare" aria-hidden="true" />
          Script vs. Claude AI — Field Comparison
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
          <span style={{ color: '#15803d', fontWeight: 600 }}>
            <i className="ti ti-circle-check" style={{ marginRight: 4 }} aria-hidden="true" />
            {matchCount} match{matchCount !== 1 ? 'es' : ''}
          </span>
          <span style={{ color: '#b91c1c', fontWeight: 600 }}>
            <i className="ti ti-alert-triangle" style={{ marginRight: 4 }} aria-hidden="true" />
            {mismatchCount} mismatch{mismatchCount !== 1 ? 'es' : ''} — review required
          </span>
        </div>

        {uncertainLabels.length > 0 && (
          <div style={{
            marginTop: 12, padding: '10px 12px',
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6,
            fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }} aria-hidden="true" />
            <span>
              <strong>Uncertain extraction</strong> — the script found competing values for{' '}
              {uncertainLabels.length} field{uncertainLabels.length !== 1 ? 's' : ''}
              {' '}({uncertainLabels.join(', ')}). Verify the Script column against the source before storing.
            </span>
          </div>
        )}
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.4fr 0.9fr 0.9fr 0.9fr 1.3fr',
        padding: '8px 16px',
        background: '#f7f9fc',
        borderBottom: '1px solid #edf0f6',
        fontSize: 11,
        fontWeight: 700,
        color: '#6b7fa3',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        <span>Field</span>
        <span>Script</span>
        <span>Claude AI</span>
        <span>SME Derived</span>
        <span>Final Value</span>
      </div>

      {/* Rows */}
      <div>
        {compareRows.map(f => (
          <CompareRow key={f.label} field={f} onResolve={handleResolve} />
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid #edf0f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn ghost" onClick={onBack}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {!allDone && (
            <span style={{ fontSize: 12, color: '#b91c1c' }}>
              Resolve all red fields to continue
            </span>
          )}
          <button
            className="btn primary"
            disabled={!allDone}
            onClick={handleNext}
            style={{ opacity: allDone ? 1 : 0.45, cursor: allDone ? 'pointer' : 'not-allowed' }}
          >
            Confirm &amp; Store <i className="ti ti-arrow-right" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 5: Store ──────────────────────────────────────────────────────────
function ScreenStore({ selectedFile, smeName, fields, onNext, onBack }) {
  const sourceFields = fields && fields.length > 0 ? fields : EXTRACTED_FIELDS;

  const [editValues, setEditValues] = useState(
    () => Object.fromEntries(sourceFields.map(f => [f.label, f.value]))
  );
  const [editingLabel, setEditingLabel] = useState(null);

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

  return (
    <div className="card">
      <div className="card-title">
        <i className="ti ti-database" aria-hidden="true" />
        Store Results
      </div>
      <p className="store-sub">
        Review values before writing to the ROI Tracker. Click the pencil icon to correct a value.
        {manualCount > 0 && <> <span className="field-card-manual-tag">Manually entered</span> fields were filled in by the SME.</>}
        {skippedCount > 0 && <> Greyed-out fields were skipped and will be stored as not available.</>}
      </p>

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
          { icon: 'ti-table',            title: 'ROI values',      sub: 'Client_ROI_Tracker.xlsx · sheet: All_ROI_Data' },
          { icon: 'ti-shield-check',     title: 'Audit record',    sub: 'Client_ROI_Tracker.xlsx · sheet: SME_Audit_Log' },
          { icon: 'ti-file-spreadsheet', title: 'Source file ref', sub: selectedFile?.name || '—' },
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
function ScreenDone({ finalFields, selectedFile, onNewExtraction, onTracker, onDashboards }) {
  // Parse a dollar string like "$1,080,000" → number
  const parseDollar = (v) => {
    if (!v) return 0;
    return parseFloat(String(v).replace(/[$,]/g, '')) || 0;
  };

  const fmtM = (n) => {
    if (!n) return '—';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
  };

  const fields = finalFields || [];
  const get = (label) => parseDollar(fields.find(f => f.label === label)?.value);

  const totalSavings   = get('Identified Cost Savings') || get('Identified Risk') || 0;
  const netROI         = get('Accomplished Cost Avoidance') + get('Accomplished Cost Optimization') || get('Realized Cost Savings') || 0;
  const idAvoidance    = get('Identified Cost Avoidance');
  const accAvoidance   = get('Accomplished Cost Avoidance');
  const idOptimization = get('Identified Cost Optimization');

  const confidenceVals = fields.filter(f => f.confidence > 0).map(f => f.confidence);
  const avgConfidence  = confidenceVals.length
    ? Math.round(confidenceVals.reduce((a, b) => a + b, 0) / confidenceVals.length)
    : (fields.length ? 85 : null);

  const client    = selectedFile?.client    || selectedFile?.upClient    || '—';
  const publisher = selectedFile?.publisher || selectedFile?.upPublisher || '—';
  const year      = selectedFile?.year      || selectedFile?.upYear      || '—';
  const subtitle  = [client, publisher, year].filter(v => v && v !== '—').join(' · ');

  // Build breakdown bars from real data
  const breakdownTotal = idAvoidance + idOptimization || 1;
  const breakdown = [
    { label: 'Identified Cost Avoidance',   val: idAvoidance,    color: 'var(--blue)'       },
    { label: 'Identified Cost Optimization', val: idOptimization, color: 'var(--blue-light)' },
    { label: 'Accomplished Cost Avoidance',  val: accAvoidance,   color: 'var(--gold)'       },
  ].filter(b => b.val > 0);

  return (
    <>
      <div className="done-hero">
        <div className="done-check">
          <i className="ti ti-check" aria-hidden="true" />
        </div>
        <div>
          <div className="done-title">Extraction Complete</div>
          <div className="done-sub">
            {subtitle ? `${subtitle} — ` : ''}All records stored successfully
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Badge color="green">
            <i className="ti ti-circle-check" aria-hidden="true" /> All records stored
          </Badge>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Total Identified Savings</div>
          <div className="metric-value">{fmtM(totalSavings)}</div>
          <div className="metric-delta muted">from extraction</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Accomplished ROI</div>
          <div className="metric-value">{fmtM(netROI)}</div>
          <div className="metric-delta muted">realized value</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg Confidence</div>
          <div className="metric-value">{avgConfidence ? `${avgConfidence}%` : '—'}</div>
          <div className="metric-delta muted">across all fields</div>
        </div>
      </div>

      {breakdown.length > 0 && (
        <div className="card">
          <div className="card-title">
            <i className="ti ti-chart-bar" aria-hidden="true" />
            Savings Breakdown
          </div>
          {breakdown.map(b => (
            <div className="bar-row" key={b.label}>
              <span className="bar-label">{b.label}</span>
              <div className="bar-bg">
                <div className="bar-fill" style={{
                  width: `${Math.round((b.val / breakdownTotal) * 100)}%`,
                  background: b.color,
                }} />
              </div>
              <span className="bar-val">{fmtM(b.val)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={onNewExtraction}>
          <i className="ti ti-plus" aria-hidden="true" /> New Extraction
        </button>
        <button className="btn ghost" onClick={onTracker}>
          <i className="ti ti-table" aria-hidden="true" /> View Tracker &amp; Audit Log
        </button>
        <button className="btn ghost" onClick={onDashboards}>
          <i className="ti ti-layout-dashboard" aria-hidden="true" /> Build Dashboard
        </button>
      </div>
    </>
  );
}

// ─── ExtractionView ───────────────────────────────────────────────────────────
export default function ExtractionView({ onNav }) {
  const [step, setStep]               = useState(0);
  const [selectedFile, setFile]       = useState(null);
  const [smeName, setSmeName]         = useState('');
  const [finalFields, setFinalFields] = useState(null);
  const [filters, setFilters]         = useState({});
  const [scriptData, setScriptData] = useState(null);

  const handleFileSelect = file              => { setFile(file);    setStep(2); };
  const handleSMEConfirm = ({ smeName: n }) => { setSmeName(n);    setStep(3); };
  const handleStore      = fields            => { setFinalFields(fields); setStep(6); };

  const screens = [
    <ScreenRequest  key={0} onNext={(f) => { setFilters(f); setStep(1); }} onUploaded={handleFileSelect} />,
    <ScreenFiles    key={1} filters={filters} onSelect={handleFileSelect} onBack={() => setStep(0)} />,
    <ScreenValidate key={2} selectedFile={selectedFile}   onConfirm={handleSMEConfirm} onBack={() => setStep(1)} />,
    <ScreenExtract  key={3} selectedFile={selectedFile}   onScriptData={setScriptData} onNext={(fields) => { setFinalFields(fields); setStep(4); }} />,
    <ScreenCompare  key={4} fields={finalFields} scriptData={scriptData} onNext={(resolvedFields) => { setFinalFields(resolvedFields); setStep(5); }} onBack={() => setStep(3)} />,
    <ScreenStore    key={5} selectedFile={selectedFile}   smeName={smeName} fields={finalFields} onNext={handleStore} onBack={() => setStep(4)} />,
    <ScreenDone     key={6} finalFields={finalFields} selectedFile={selectedFile} onNewExtraction={() => setStep(0)} onTracker={() => onNav('tracker')} onDashboards={() => onNav('dashboards')} />,
  ];

  return (
    <>
      <JourneyBar currentStep={step} onStep={setStep} />
      {screens[step]}
    </>
  );
}
