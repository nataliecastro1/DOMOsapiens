import React, { useState, useEffect, useRef } from 'react';
import Badge from '../components/Badge';
import {
  CLIENTS, PUBLISHERS, YEARS,
  SAMPLE_FILES, EXTRACTED_FIELDS, EXTRACTION_STEPS,
} from '../data';

// ─── Step Bar ──────────────────────────────────────────────────────────────────
function StepBar({ currentStep, onStep }) {
  const labels = ['Request', 'Files', 'SME Validate', 'Extract', 'Store', 'Done'];
  return (
    <div className="step-bar" role="list" aria-label="Extraction steps">
      {labels.map((label, i) => {
        const isDone   = i < currentStep;
        const isActive = i === currentStep;
        return (
          <button
            key={i}
            className={`step-item ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}
            onClick={() => onStep(i)}
            role="listitem"
          >
            <span className="step-num">{isDone ? '✓' : i + 1}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Screen 0: Request ────────────────────────────────────────────────────────
function ScreenRequest({ onNext }) {
  const [client, setClient]   = useState(CLIENTS[0]);
  const [year, setYear]       = useState(YEARS[0]);
  const [publisher, setPub]   = useState(PUBLISHERS[0]);

  return (
    <div className="card">
      <div className="card-title"><i className="ti ti-adjustments-horizontal" aria-hidden="true" /> Request Parameters</div>
      <div className="field-group">
        <label className="field-label">Client</label>
        <select value={client} onChange={e => setClient(e.target.value)}>
          {CLIENTS.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="grid-2">
        <div className="field-group">
          <label className="field-label">Year</label>
          <select value={year} onChange={e => setYear(e.target.value)}>
            {YEARS.map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Publisher</label>
          <select value={publisher} onChange={e => setPub(e.target.value)}>
            {PUBLISHERS.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="btn-row">
        <button className="btn primary" onClick={onNext}>
          Find Files <i className="ti ti-arrow-right" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ─── Screen 1: Files ──────────────────────────────────────────────────────────
function ScreenFiles({ onSelect, onBack }) {
  return (
    <div className="card">
      <div className="card-title"><i className="ti ti-files" aria-hidden="true" /> Matched Files</div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
        3 files found for <strong>Encova / Oracle / 2025</strong>. Select one to route for SME validation.
      </p>
      {SAMPLE_FILES.map(f => (
        <div className="file-row" key={f.name}>
          <div>
            <div className="file-name">
              <i className="ti ti-file-spreadsheet" aria-hidden="true" />
              {f.name}
            </div>
            <div className="file-meta">
              {f.modified} · {f.size}
              <Badge color={f.tagColor} style={{ marginLeft: 8 }}>{f.tag}</Badge>
            </div>
          </div>
          <button
            className={`btn small ${f.tag === 'Latest' ? 'primary' : ''}`}
            onClick={() => onSelect(f)}
          >
            Select
          </button>
        </div>
      ))}
      <div className="btn-row">
        <button className="btn" onClick={onBack}>
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
    { id: 'approve', icon: 'ti-circle-check', iconColor: 'var(--green)', title: 'Approve — correct file, proceed',         sub: 'Decision + timestamp stored in audit log' },
    { id: 'flag',    icon: 'ti-alert-triangle',iconColor: 'var(--amber-border)', title: 'Flag — wrong file, return to selection', sub: 'Flagged decision is still recorded' },
    { id: 'note',    icon: 'ti-edit',          iconColor: 'var(--blue)', title: 'Approve with notes',                      sub: 'Notes attached to the audit record' },
  ];

  return (
    <div className="card">
      <div className="card-title"><i className="ti ti-user-check" aria-hidden="true" /> SME Validation — Checkpoint</div>
      <div className="info-box" style={{ marginBottom: 16 }}>
        <div className="info-row"><span className="info-key">File</span>                   <span className="info-val">{selectedFile?.name || '—'}</span></div>
        <div className="info-row"><span className="info-key">Version</span>                <span className="info-val">{selectedFile?.version || '—'}</span></div>
        <div className="info-row"><span className="info-key">Client / Publisher / Year</span><span className="info-val">Encova · Oracle · 2025</span></div>
        <div className="info-row"><span className="info-key">Timestamp</span>              <span className="info-val">{timestamp.current}</span></div>
      </div>

      <label className="field-label" style={{ marginBottom: 10 }}>
        SME Decision{' '}
        <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(recorded to audit log)</span>
      </label>

      {OPTIONS.map(opt => (
        <button
          key={opt.id}
          className={`radio-card ${decision === opt.id ? 'selected' : ''}`}
          onClick={() => setDecision(opt.id)}
        >
          <i className={`ti ${opt.icon}`} style={{ fontSize: 20, color: opt.iconColor, marginTop: 1 }} aria-hidden="true" />
          <div>
            <div className="radio-card-title">{opt.title}</div>
            <div className="radio-card-sub">{opt.sub}</div>
          </div>
        </button>
      ))}

      <div className="field-group" style={{ marginTop: 12 }}>
        <label className="field-label" htmlFor="sme-name">SME name / initials</label>
        <input id="sme-name" type="text" placeholder="e.g. J. Rivera" value={smeName} onChange={e => setSmeName(e.target.value)} />
      </div>

      {decision === 'note' && (
        <div className="field-group">
          <label className="field-label" htmlFor="sme-notes">Notes</label>
          <textarea id="sme-notes" style={{ height: 56 }} placeholder="Add context for the record…" value={smeNotes} onChange={e => setSmeNotes(e.target.value)} />
        </div>
      )}

      <div className="btn-row">
        <button className="btn" onClick={onBack}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back
        </button>
        <button className="btn primary" onClick={handleConfirm}>
          {decision === 'flag' ? 'Return to Files' : <>Confirm &amp; Extract <i className="ti ti-arrow-right" aria-hidden="true" /></>}
        </button>
      </div>
    </div>
  );
}

// ─── Screen 3: Extract ────────────────────────────────────────────────────────
function ScreenExtract({ onNext }) {
  const [stepStatuses, setStepStatuses] = useState(EXTRACTION_STEPS.map(() => 'pending'));
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    function advance() {
      if (i >= EXTRACTION_STEPS.length) { setDone(true); return; }
      setStepStatuses(prev => prev.map((s, idx) => idx === i ? 'running' : s));
      setTimeout(() => {
        setStepStatuses(prev => prev.map((s, idx) => idx === i ? 'done' : s));
        i++;
        setTimeout(advance, 300);
      }, 750);
    }
    advance();
  }, []);

  const statusBadge = (s) => {
    if (s === 'done')    return <Badge color="green"><i className="ti ti-check" aria-hidden="true" /> Done</Badge>;
    if (s === 'running') return <Badge color="blue">Running…</Badge>;
    return <Badge color="navy">Pending</Badge>;
  };

  return (
    <div className="card">
      <div className="card-title"><i className="ti ti-cpu" aria-hidden="true" /> ROI Extraction</div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Processing validated file against extraction schema…</p>

      {EXTRACTION_STEPS.map((step, i) => (
        <div className="progress-row" key={i} style={{ color: stepStatuses[i] === 'pending' ? 'var(--text-faint)' : 'var(--text)' }}>
          <span>{step}</span>
          {statusBadge(stepStatuses[i])}
        </div>
      ))}

      {done && (
        <>
          <div style={{ marginTop: 14 }}>
            <label className="field-label">Extracted Fields</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {EXTRACTED_FIELDS.map(f => (
                <Badge key={f.label} color={f.variant}>{f.label.split(' ')[0]}: {f.value}</Badge>
              ))}
              <Badge color="gold">Confidence: 94%</Badge>
            </div>
          </div>
          <div className="btn-row">
            <button className="btn primary" onClick={onNext}>
              Review &amp; Store <i className="ti ti-arrow-right" aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Screen 4: Store ──────────────────────────────────────────────────────────
function ScreenStore({ selectedFile, smeName, onNext, onBack }) {
  return (
    <div className="card">
      <div className="card-title"><i className="ti ti-database" aria-hidden="true" /> Store Results</div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Review extracted values before writing to the ROI Tracker.</p>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, padding: '0 0 8px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Field</span>
        <span style={{ display: 'flex', gap: 40 }}><span>Value</span><span>Conf.</span></span>
      </div>

      {EXTRACTED_FIELDS.map(f => (
        <div className="list-row" key={f.label}>
          <span>{f.label}</span>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>{f.value}</span>
            <Badge color={f.variant}>{f.confidence}%</Badge>
          </div>
        </div>
      ))}

      <label className="field-label" style={{ marginTop: 16, marginBottom: 10 }}>What gets stored</label>
      <div className="store-grid">
        {[
          { icon: 'ti-table',         title: 'ROI values',      sub: 'Client_ROI_Tracker.xlsx · sheet: All_ROI_Data' },
          { icon: 'ti-shield-check',  title: 'Audit record',    sub: 'Client_ROI_Tracker.xlsx · sheet: SME_Audit_Log' },
          { icon: 'ti-file-spreadsheet', title: 'Source file ref', sub: selectedFile?.name || '—' },
          { icon: 'ti-user-check',    title: 'SME checkpoint',  sub: `Approved · ${smeName || '—'}` },
        ].map(t => (
          <div className="store-tile" key={t.title}>
            <div className="store-tile-title">
              <i className={`ti ${t.icon}`} style={{ fontSize: 13, verticalAlign: -2, color: 'var(--blue)', marginRight: 4 }} aria-hidden="true" />
              {t.title}
            </div>
            <div className="store-tile-sub">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="btn-row">
        <button className="btn" onClick={onBack}><i className="ti ti-arrow-left" aria-hidden="true" /> Back</button>
        <button className="btn primary" onClick={onNext}>Save All &amp; Done <i className="ti ti-arrow-right" aria-hidden="true" /></button>
      </div>
    </div>
  );
}

// ─── Screen 5: Done ───────────────────────────────────────────────────────────
function ScreenDone({ onNewExtraction, onTracker, onDashboards }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Extraction Complete</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Encova · Oracle · 2025</div>
        </div>
        <Badge color="green"><i className="ti ti-circle-check" aria-hidden="true" /> All records stored</Badge>
      </div>

      <div className="metric-grid">
        <div className="metric-card"><div className="metric-label">Total Savings</div><div className="metric-value">$2.4M</div><div className="metric-delta">↑ +12% vs 2024</div></div>
        <div className="metric-card"><div className="metric-label">Net ROI</div><div className="metric-value">$1.53M</div><div className="metric-delta">↑ +8% vs 2024</div></div>
        <div className="metric-card"><div className="metric-label">Avg Confidence</div><div className="metric-value">93%</div><div className="metric-delta muted">all fields</div></div>
      </div>

      <div className="card">
        <div className="card-title"><i className="ti ti-chart-bar" aria-hidden="true" /> Savings Breakdown</div>
        {[
          { label: 'License spend',     pct: '62%', color: 'var(--blue)',       val: '$870K' },
          { label: 'Compliance risk',   pct: '24%', color: 'var(--blue-light)', val: '$340K' },
          { label: 'Support reduction', pct: '14%', color: 'var(--gold)',       val: '18%'   },
        ].map(b => (
          <div className="bar-row" key={b.label}>
            <span style={{ width: 160 }}>{b.label}</span>
            <div className="bar-bg"><div className="bar-fill" style={{ width: b.pct, background: b.color }} /></div>
            <span style={{ width: 60, textAlign: 'right', color: 'var(--text-muted)' }}>{b.val}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn primary" onClick={onNewExtraction}><i className="ti ti-plus" aria-hidden="true" /> New Extraction</button>
        <button className="btn" onClick={onTracker}><i className="ti ti-table" aria-hidden="true" /> View Tracker &amp; Audit Log</button>
        <button className="btn" onClick={onDashboards}><i className="ti ti-layout-dashboard" aria-hidden="true" /> Build Dashboard</button>
      </div>
    </>
  );
}

// ─── ExtractionView ───────────────────────────────────────────────────────────
export default function ExtractionView({ onNav }) {
  const [step, setStep]           = useState(1);
  const [selectedFile, setFile]   = useState(null);
  const [smeName, setSmeName]     = useState('');

  const handleFileSelect = (file) => { setFile(file); setStep(2); };
  const handleSMEConfirm = ({ smeName: name }) => { setSmeName(name); setStep(3); };

  const screens = [
    <ScreenRequest key={0} onNext={() => setStep(1)} />,
    <ScreenFiles   key={1} onSelect={handleFileSelect} onBack={() => setStep(0)} />,
    <ScreenValidate key={2} selectedFile={selectedFile} onConfirm={handleSMEConfirm} onBack={() => setStep(1)} />,
    <ScreenExtract key={3} onNext={() => setStep(4)} />,
    <ScreenStore   key={4} selectedFile={selectedFile} smeName={smeName} onNext={() => setStep(5)} onBack={() => setStep(3)} />,
    <ScreenDone    key={5} onNewExtraction={() => setStep(0)} onTracker={() => onNav('tracker')} onDashboards={() => onNav('dashboards')} />,
  ];

  return (
    <>
      <StepBar currentStep={step} onStep={setStep} />
      {screens[step]}
    </>
  );
}
