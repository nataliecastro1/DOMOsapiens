import React, { useState, useEffect, useRef } from 'react';
import Badge from '../components/Badge';
import ClientSelect from '../components/ClientSelect';
import { extractROAR, extractFromFile, uploadFile, searchDocuments, saveRecord, generateExecutiveSummary } from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  PUBLISHERS, YEARS,
  SAMPLE_FILES, EXTRACTED_FIELDS, EXTRACTION_STEPS,
} from '../data';

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
function ScreenRequest({ onNext, onUploaded, clients }) {
  const [client, setClient]   = useState('');
  const [year, setYear]       = useState('');
  const [publisher, setPub]   = useState('');

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
    <div className="request-grid">

      {/* ── Card 1: SharePoint Search ── */}
      <div id="search-card" className="card">
        <div className="card-title">
          <i className="ti ti-adjustments-horizontal" aria-hidden="true" />
          Search SharePoint
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="req-client">Client</label>
          <ClientSelect value={client} onChange={setClient} clients={clients} />
        </div>
        <div className="grid-2">
          <div className="field-group">
            <label className="field-label" htmlFor="req-year">Year</label>
            <select id="req-year" value={year} onChange={e => setYear(e.target.value)}>
              <option value="">Any year</option>
              {YEARS.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="req-publisher">Publisher</label>
            <select id="req-publisher" value={publisher} onChange={e => setPub(e.target.value)}>
              <option value="">Any publisher</option>
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
          <span className="upload-count">
            {selectedFiles.length}/{MAX_FILES} files
          </span>
        </div>

        {/* Drag & drop zone */}
        <div
          className={`upload-dropzone ${dragOver ? 'is-dragover' : ''} ${selectedFiles.length >= MAX_FILES ? 'is-full' : ''}`}
          onClick={() => selectedFiles.length < MAX_FILES && fileInputRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <i className="ti ti-file-upload upload-dropzone-icon" aria-hidden="true" />
          <div className="upload-dropzone-title">
            {selectedFiles.length >= MAX_FILES ? 'Maximum files reached' : 'Drag & drop files here'}
          </div>
          <div className="upload-dropzone-hint">
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
          className="upload-file-input"
          onChange={handleFileChange}
        />

        {/* File list */}
        {selectedFiles.length > 0 && (
          <div className="upload-file-list">
            {selectedFiles.map((f, i) => (
              <div key={i} className="upload-file-chip">
                <i className="ti ti-file-description upload-file-chip-icon" />
                <span className="upload-file-chip-name">
                  {f.name}
                </span>
                <span className="upload-file-chip-size">
                  {(f.size / 1024).toFixed(0)} KB
                </span>
                <button
                  onClick={() => removeFile(i)}
                  className="upload-file-chip-remove"
                  title="Remove"
                >
                  <i className="ti ti-x" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Document type */}
        <div className="field-group">
          <label className="field-label">Document Type</label>
          <div className="doctype-row">
            {['ROAR', 'ELP'].map(type => (
              <button
                key={type}
                onClick={() => setDocType(type)}
                className={`doctype-btn ${docType === type ? 'active' : ''}`}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="doctype-hint">
            {docType === 'ROAR'
              ? 'Return on Anglepoint Relationship — PowerPoint (.pptx)'
              : 'ELP deliverable — PowerPoint / slide deck'}
          </div>
        </div>

        {/* Client / Publisher / Year — manually set for this upload */}
        <div className="field-group">
          <label className="field-label">Client</label>
          <ClientSelect value={upClient} onChange={setUpClient} clients={clients} />
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
            <ClientSelect value={upPublisher} onChange={setUpPublisher} clients={PUBLISHERS} />
          </div>
        </div>

        {uploadError && (
          <div className="upload-error">
            <i className="ti ti-alert-triangle" aria-hidden="true" />
            {uploadError}
          </div>
        )}

        <div className="btn-row">
          <button
            className="btn primary is-gated"
            disabled={!selectedFiles.length || uploading}
            onClick={handleUpload}
          >
            {uploading
              ? <><i className="ti ti-loader-2 spinning" aria-hidden="true" /> Uploading…</>
              : <>Upload &amp; Use This File <i className="ti ti-arrow-right" aria-hidden="true" /></>
            }
          </button>
        </div>
      </div>

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

function ScreenFiles({ filters = {}, clientDir = null, onSelect, onBack }) {
  const [files, setFiles]           = useState([]);
  const [scanning, setScanning]     = useState(Boolean(clientDir));
  const [scanned, setScanned]       = useState(false);
  const [error, setError]           = useState(null);
  const [folderName, setFolderName] = useState(clientDir ? clientDir.name : '');

  const { client = '', year = '', publisher = '' } = filters;

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
        f._draft = /draft/i.test(f.name);   // a draft is never a best match
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
          {files.length > 0 && '. Select one to continue.'}
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

      {files.map((f) => (
        <div className={`file-card ${f._best ? 'featured' : ''}`} key={`${f.path}/${f.name}`}>
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
          <button
            className={`btn small ${f._best ? 'primary' : 'ghost'}`}
            onClick={() => onSelect({ ...f, version: f.modified, source: 'local', client: client || folderName })}
          >
            Select
          </button>
        </div>
      ))}

      <div className="btn-row">
        <button className="btn ghost" onClick={onBack}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back
        </button>
        {supported && scanned && (
          <button className="btn" onClick={handlePick}>
            <i className="ti ti-folder-open" aria-hidden="true" /> Choose a different folder
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Screen 2: SME Validate ───────────────────────────────────────────────────
function ScreenValidate({ selectedFile, onConfirm, onBack, defaultName = '' }) {
  const [decision, setDecision] = useState('approve');
  const [smeName, setSmeName]   = useState(defaultName);
  const [smeNotes, setSmeNotes] = useState('');
  const timestamp = useRef(new Date().toLocaleString());

  const handleConfirm = () => {
    if (decision === 'flag') { onBack(); return; }
    onConfirm({ decision, smeName, smeNotes });
  };

  const OPTIONS = [
    {
      id: 'approve',
      icon: 'ti-circle-check',
      title: 'Approve — correct file, proceed',
      sub: 'Decision + timestamp stored in audit log',
    },
    {
      id: 'flag',
      icon: 'ti-alert-triangle',
      title: 'Flag — wrong file, return to selection',
      sub: 'Flagged decision is still recorded',
    },
    {
      id: 'note',
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
                  : '— · — · —'}
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
                className={`ti ${opt.icon} sme-option-icon ${opt.id}`}
                aria-hidden="true"
              />
              <div>
                <div className="sme-option-title">{opt.title}</div>
                <div className="sme-option-sub">{opt.sub}</div>
              </div>
            </button>
          ))}

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

          {decision === 'note' && (
            <div className="field-group">
              <label className="field-label sme-field-label" htmlFor="sme-notes">Notes</label>
              <textarea
                id="sme-notes"
                className="sme-input sme-notes-input"
                placeholder="Add context for the record…"
                value={smeNotes}
                onChange={e => setSmeNotes(e.target.value)}
              />
            </div>
          )}

          <div className="sme-btn-row">
            <button
              className="btn sme-back-btn"
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
          if (selectedFile) {
            const fileRef = selectedFile.path || selectedFile.id
              ? selectedFile
              : (selectedFile.name || '');
            tasks.push(
              extractFromFile(fileRef)
                .then(res => { if (!cancelled) setExtractedData(res.data || res); })
                .catch(err => { if (!cancelled) setError(err.message); })
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

  // Per-field confidence: prefer a field-specific score if the backend ever returns one
  // (via a `confidences` map keyed by the field's response key), otherwise fall back to the
  // single top-level confidence, otherwise null. Today only the top-level value exists, so
  // this preserves current behavior without discarding per-field data the backend may add later.
  const confidenceFor = (key) =>
    extractedData?.confidences?.[key] ?? extractedData?.confidence ?? null;

  // When extraction returns no data (e.g. the Claude extractor failed), fall back to the
  // honest blank-field template rather than substituting mock numbers from data.js. The
  // empty values route the SME into the existing manual-entry / skip flow.
  const displayFields = extractedData ? [
    { label: 'Identified Risk',                value: fmt(extractedData.identified_risk),       variant: 'green', confidence: confidenceFor('identified_risk'),       source: null, flag: null, entryMode: extractedData.identified_risk       != null ? 'extracted' : null },
    { label: 'Identified Cost Avoidance',      value: fmt(extractedData.id_cost_avoidance),     variant: 'green', confidence: confidenceFor('id_cost_avoidance'),     source: null, flag: null, entryMode: extractedData.id_cost_avoidance     != null ? 'extracted' : null },
    { label: 'Accomplished Cost Avoidance',    value: fmt(extractedData.acc_cost_avoidance),    variant: 'green', confidence: confidenceFor('acc_cost_avoidance'),    source: null, flag: null, entryMode: extractedData.acc_cost_avoidance    != null ? 'extracted' : null },
    { label: 'Identified Cost Optimization',   value: fmt(extractedData.id_cost_optimization),  variant: 'blue',  confidence: confidenceFor('id_cost_optimization'),  source: null, flag: null, entryMode: extractedData.id_cost_optimization  != null ? 'extracted' : null },
    { label: 'Accomplished Cost Optimization', value: fmt(extractedData.acc_cost_optimization), variant: 'blue',  confidence: confidenceFor('acc_cost_optimization'), source: null, flag: null, entryMode: extractedData.acc_cost_optimization != null ? 'extracted' : null },
    // identified_cost_savings is intentionally absent from the Claude AI extractor prompt, so the backend
    // never returns it — this will always be null/undefined here and correctly triggers the manual entry fallback.
    { label: 'Identified Cost Savings',        value: fmt(extractedData.identified_cost_savings), variant: 'green', confidence: confidenceFor('identified_cost_savings'), source: null, flag: null, entryMode: extractedData.identified_cost_savings != null ? 'extracted' : null },
    { label: 'Realized Cost Savings',          value: fmt(extractedData.realized_savings),        variant: 'green', confidence: confidenceFor('realized_savings'),        source: null, flag: null, entryMode: extractedData.realized_savings        != null ? 'extracted' : null },
  ] : BLANK_FIELDS;

  const confidence = extractedData?.confidence ?? null;
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
                    className="ti ti-loader-2 spinning"
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
          <strong>Extraction failed:</strong> no values were returned. Enter the fields manually or skip them below. ({error})
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
              <strong className={confidence != null ? confClass(confidence) : ''}>
                {confidence != null ? `${confidence}%` : '—'}
              </strong>
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

  const rowState = isSkipped ? 'skipped' : confirmed ? 'match' : 'mismatch';

  return (
    <div className={`compare-row ${rowState}`}>

      {/* Field name */}
      <span className="compare-cell-field">
        {field.label}
      </span>

      {/* Script value — always shown when the script found one, independent of
          the SME-skipped flag (skipping concerns the Claude/SME side, not the
          deterministic script extractor). */}
      {(!field.script || field.script === '—') ? (
        <span className="compare-na">—</span>
      ) : (
        <span className={`compare-script ${(!isSkipped && !scriptMatch) ? 'is-mismatch' : ''}`}>
          <span>
            {field.script}
            {field.scriptUncertain && (
              <i
                className="ti ti-alert-triangle compare-flag-icon warn"
                title={`Competing values found: ${field.scriptAlternates.map(a => a.value).filter(Boolean).join(', ')}`}
                aria-hidden="true"
              />
            )}
            {!field.scriptUncertain && !isSkipped && !scriptMatch && (
              <i className="ti ti-alert-triangle compare-flag-icon" aria-hidden="true" />
            )}
          </span>
          {field.scriptUncertain && field.scriptAlternates.length > 0 && (
            <span className="compare-alt">
              also: {field.scriptAlternates.map(a => a.value).filter(Boolean).join(', ')}
            </span>
          )}
        </span>
      )}

      {/* Claude AI value */}
      <span className={field.claude ? 'compare-mono' : 'compare-na'}>
        {field.claude ?? '—'}
      </span>

      {/* SME Derived value */}
      <span className={field.sme ? 'compare-sme' : 'compare-na'}>
        {isSkipped ? <span className="compare-na">Skipped</span> : (field.sme ?? '—')}
      </span>

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
    </div>
  );
}

function ScreenCompare({ fields, scriptData, onNext, onBack }) {
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
    <div className="card compare-card">

      {/* Header */}
      <div className="compare-head">
        <div className="card-title compare-title">
          <i className="ti ti-git-compare" aria-hidden="true" />
          Script vs. Claude AI — Field Comparison
        </div>
        <div className="compare-summary">
          <span className="compare-match">
            <i className="ti ti-circle-check" aria-hidden="true" />
            {matchCount} match{matchCount !== 1 ? 'es' : ''}
          </span>
          <span className="compare-mismatch-label">
            <i className="ti ti-alert-triangle" aria-hidden="true" />
            {mismatchCount} mismatch{mismatchCount !== 1 ? 'es' : ''} — review required
          </span>
        </div>

        {uncertainLabels.length > 0 && (
          <div className="compare-uncertain">
            <i className="ti ti-alert-triangle compare-uncertain-icon" aria-hidden="true" />
            <span>
              <strong>Uncertain extraction</strong> — the script found competing values for{' '}
              {uncertainLabels.length} field{uncertainLabels.length !== 1 ? 's' : ''}
              {' '}({uncertainLabels.join(', ')}). Verify the Script column against the source before storing.
            </span>
          </div>
        )}
      </div>

      {/* Column headers */}
      <div className="compare-header">
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
      <div className="compare-footer">
        <button className="btn ghost" onClick={onBack}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back
        </button>
        <div className="compare-footer-actions">
          {!allDone && (
            <span className="compare-resolve-hint">
              Resolve all red fields to continue
            </span>
          )}
          <button
            className="btn primary is-gated"
            disabled={!allDone}
            onClick={handleNext}
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
  // Defensive default for reaching Store directly (e.g. jumping via the Journey Bar)
  // without any extracted fields — show the honest blank-field template, not mock numbers.
  const sourceFields = fields && fields.length > 0 ? fields : BLANK_FIELDS;

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

function ScreenDone({ finalFields, selectedFile, onNewExtraction, onTracker, onDashboards }) {
  const [summary, setSummary]       = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError]     = useState(null);
  const doneRef = useRef(null);

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

  const idRisk         = get('Identified Risk');
  const idAvoidance    = get('Identified Cost Avoidance');
  const accAvoidance   = get('Accomplished Cost Avoidance');
  const idOptimization = get('Identified Cost Optimization');
  const accOptimization= get('Accomplished Cost Optimization');
  const realizedSavings= get('Identified Cost Savings');
  const contractSpend  = get('Realized Cost Savings');

  const totalSavings = idAvoidance + idOptimization + realizedSavings || idRisk || 0;
  const netROI       = accAvoidance + accOptimization || 0;

  const confidenceVals = fields.filter(f => f.confidence > 0).map(f => f.confidence);
  const avgConfidence  = confidenceVals.length
    ? Math.round(confidenceVals.reduce((a, b) => a + b, 0) / confidenceVals.length)
    : null;

  const client    = selectedFile?.client    || selectedFile?.upClient    || '';
  const publisher = selectedFile?.publisher || selectedFile?.upPublisher || '';
  const year      = selectedFile?.year      || selectedFile?.upYear      || '';
  const subtitle  = [client, publisher, year].filter(Boolean).join(' · ');

  // Bar chart data
  const COLORS = ['#005f86', '#0089af', '#ffad00', '#2d9e5c', '#001941', '#4a6a9c'];
  const barData = [
    { name: 'Id. Risk',      value: idRisk },
    { name: 'Id. Avoidance', value: idAvoidance },
    { name: 'Acc. Avoidance',value: accAvoidance },
    { name: 'Id. Optim.',    value: idOptimization },
    { name: 'Acc. Optim.',   value: accOptimization },
    { name: 'Realized',      value: realizedSavings },
  ].filter(d => d.value > 0);

  // Donut chart: Identified vs Accomplished
  const donutData = [
    { name: 'Accomplished', value: netROI },
    { name: 'Remaining',    value: Math.max(0, totalSavings - netROI) },
  ].filter(d => d.value > 0);
  const DONUT_COLORS = ['#005f86', '#e6e8ec'];

  // Fetch executive summary once on mount
  useEffect(() => {
    if (!fields.length) return;
    setSummaryLoading(true);
    generateExecutiveSummary({
      client, publisher,
      year:                  parseInt(year) || null,
      identified_risk:       idRisk          || null,
      id_cost_avoidance:     idAvoidance     || null,
      acc_cost_avoidance:    accAvoidance    || null,
      id_cost_optimization:  idOptimization  || null,
      acc_cost_optimization: accOptimization || null,
      realized_savings:      realizedSavings || null,
      contract_spend:        contractSpend   || null,
      confidence:            avgConfidence   || null,
      stored_name:           selectedFile?.stored_name || null,
      file_path:             selectedFile?.file_path   || null,
    })
      .then(data => setSummary(data))
      .catch(() => setSummaryError('Could not generate summary. Check your API key.'))
      .finally(() => setSummaryLoading(false));
  }, []);

  const handleDownloadPDF = () => {
    import('html2pdf.js').then(mod => {
      const html2pdf = mod.default;
      html2pdf()
        .set({
          margin: [12, 12, 12, 12],
          filename: `${[client, publisher, year].filter(Boolean).join('_') || 'ROI'}_Summary.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        })
        .from(doneRef.current)
        .save();
    });
  };

  return (
    <div ref={doneRef}>
      {/* Header */}
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
        <div className="done-badge-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge color="green">
            <i className="ti ti-circle-check" aria-hidden="true" /> All records stored
          </Badge>
          <button className="btn ghost small no-print" onClick={handleDownloadPDF}>
            <i className="ti ti-file-type-pdf" aria-hidden="true" /> Download PDF
          </button>
        </div>
      </div>

      {/* KPI Cards */}
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

      {/* Charts */}
      {barData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: donutData.length > 1 ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 16 }}>

          {/* Bar chart */}
          <div className="card">
            <div className="card-title">
              <i className="ti ti-chart-bar" aria-hidden="true" />
              ROI Breakdown{client ? ` — ${client}` : ''}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#5a6e8c' }} />
                <YAxis tickFormatter={v => v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v}`} tick={{ fontSize: 10, fill: '#5a6e8c' }} width={52} />
                <Tooltip content={<DollarTooltip />} />
                <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]}>
                  {barData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Donut chart */}
          {donutData.length > 1 && (
            <div className="card">
              <div className="card-title">
                <i className="ti ti-chart-donut" aria-hidden="true" />
                Accomplished vs Remaining
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={2}>
                    {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} />)}
                  </Pie>
                  <Tooltip content={<DollarTooltip />} />
                  <Legend formatter={(v) => <span style={{ fontSize: 12, color: '#001941' }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Executive Summary */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>
          <i className="ti ti-file-description" aria-hidden="true" />
          Executive Summary{subtitle ? ` — ${subtitle}` : ''}
        </div>

        {summaryLoading && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }} />
            Generating executive summary with Claude AI…
          </div>
        )}

        {summaryError && (
          <div style={{ color: 'var(--red)', fontSize: 13 }}>{summaryError}</div>
        )}

        {summary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Objective */}
            <div style={{ background: 'var(--navy)', borderRadius: 8, padding: '14px 18px', color: '#fff' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 6 }}>Engagement Objective</div>
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>{summary.objective}</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Accomplishments */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--blue)', marginBottom: 10 }}>
                  <i className="ti ti-circle-check" /> Accomplishments
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(summary.accomplishments || []).map((item, i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
                      <span style={{ color: 'var(--green)', fontWeight: 700, flexShrink: 0 }}>✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommendations */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--blue)', marginBottom: 10 }}>
                  <i className="ti ti-bulb" /> Recommendations
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(summary.recommendations || []).map((item, i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
                      <span style={{ color: 'var(--gold)', fontWeight: 700, flexShrink: 0 }}>→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Highlights */}
            {summary.highlights?.length > 0 && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {summary.highlights.map((h, i) => (
                  <div key={i} style={{ background: 'var(--blue-pale)', borderRadius: 8, padding: '10px 16px', flex: '1 1 140px' }}>
                    <div style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>{h.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{h.value}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--text-faint)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              Generated by Claude AI · Anglepoint ROI Extraction Platform · {new Date().toLocaleDateString()}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="done-actions no-print">
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
    </div>
  );
}

// ─── ExtractionView ───────────────────────────────────────────────────────────
export default function ExtractionView({ onNav, clients, clientHandles, loggedInUser = '' }) {
  const [step, setStep]               = useState(0);
  const [selectedFile, setFile]       = useState(null);
  const [smeName, setSmeName]         = useState('');
  const [finalFields, setFinalFields] = useState(null);
  const [filters, setFilters]         = useState({});
  const [scriptData, setScriptData] = useState(null);

  const handleFileSelect = file              => { setFile(file);    setStep(2); };
  const handleSMEConfirm = ({ smeName: n }) => { setSmeName(n);    setStep(3); };
  const handleStore = (fields) => {
    setFinalFields(fields);
    setStep(6);

    const getValue = (label) => {
      const f = fields.find(x => x.label === label);
      const n = parseFloat((f?.value || '').toString().replace(/,/g, ''));
      return isNaN(n) ? null : n;
    };

    const record = {
      client:                selectedFile?.client    || selectedFile?.upClient    || '',
      publisher:             selectedFile?.publisher || selectedFile?.upPublisher || '',
      year:                  parseInt(selectedFile?.year || selectedFile?.upYear  || new Date().getFullYear()),
      identified_risk:       getValue('Identified Risk'),
      id_cost_avoidance:     getValue('Identified Cost Avoidance'),
      acc_cost_avoidance:    getValue('Accomplished Cost Avoidance'),
      id_cost_optimization:  getValue('Identified Cost Optimization'),
      acc_cost_optimization: getValue('Accomplished Cost Optimization'),
      realized_savings:      getValue('Identified Cost Savings'),
      contract_spend:        getValue('Realized Cost Savings'),
      confidence:            fields.find(x => x.confidence != null)?.confidence ?? null,
      source_file:           selectedFile?.filename || selectedFile?.name || selectedFile?.file_path || '',
      stored_name:           selectedFile?.stored_name || '',
      sme:                   smeName || loggedInUser || '',
    };

    saveRecord(record).catch(err => console.error('[Store] saveRecord failed:', err));
  };

  // Reset the entire pipeline so a new extraction starts clean — resetting only
  // the step would leave selectedFile, smeName, finalFields, filters, and
  // scriptData populated with stale data from the previous run.
  const handleReset = () => {
    setStep(0);
    setFile(null);
    setSmeName('');
    setFinalFields(null);
    setFilters({});
    setScriptData(null);
  };

  // Resolve the loaded folder handle for the chosen client, if we have one,
  // so the Files step can scan it automatically (Phase 2).
  const clientDir = (clientHandles && filters.client)
    ? (clientHandles.get(filters.client) || null)
    : null;

  const screens = [
<ScreenRequest  key={0} onNext={(f) => { setFilters(f); setStep(1); }} onUploaded={handleFileSelect} clients={clients} />,
    <ScreenFiles    key={1} filters={filters} clientDir={clientDir} onSelect={handleFileSelect} onBack={() => setStep(0)} />,
    <ScreenValidate key={2} selectedFile={selectedFile}   onConfirm={handleSMEConfirm} onBack={() => setStep(1)} defaultName={loggedInUser} />,
    <ScreenExtract  key={3} selectedFile={selectedFile}   onScriptData={setScriptData} onNext={(fields) => { setFinalFields(fields); setStep(4); }} />,
    <ScreenCompare  key={4} fields={finalFields} scriptData={scriptData} onNext={(resolvedFields) => { setFinalFields(resolvedFields); setStep(5); }} onBack={() => setStep(3)} />,
    <ScreenStore    key={5} selectedFile={selectedFile}   smeName={smeName} fields={finalFields} onNext={handleStore} onBack={() => setStep(4)} />,
    <ScreenDone     key={6} finalFields={finalFields} selectedFile={selectedFile} onNewExtraction={handleReset} onTracker={() => onNav('tracker')} onDashboards={() => onNav('dashboards')} />,
  ];

  return (
    <>
      <JourneyBar currentStep={step} onStep={setStep} />
      {screens[step]}
    </>
  );
}
