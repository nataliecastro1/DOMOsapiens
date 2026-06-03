import React, { useState, useEffect, useRef } from 'react';
import Badge from '../components/Badge';
import { extractROI } from '../services/api';
import {
  CLIENTS, PUBLISHERS, YEARS,
  SAMPLE_FILES, EXTRACTED_FIELDS, EXTRACTION_STEPS,
} from '../data';

// ─── Journey Bar ──────────────────────────────────────────────────────────────
const STEP_DEFS = [
  { label: 'Request',      icon: 'ti-adjustments-horizontal' },
  { label: 'Files',        icon: 'ti-files'                  },
  { label: 'SME Validate', icon: 'ti-user-check'             },
  { label: 'Extract',      icon: 'ti-cpu'                    },
  { label: 'Store',        icon: 'ti-database'               },
  { label: 'Done',         icon: 'ti-circle-check'           },
];

function JourneyBar({ currentStep, onStep }) {
  return (
    <div className="journey-bar" role="list" aria-label="Extraction pipeline">
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
function ScreenRequest({ onNext }) {
  const [client, setClient] = useState(CLIENTS[0]);
  const [year, setYear]     = useState(YEARS[0]);
  const [publisher, setPub] = useState(PUBLISHERS[0]);

  return (
    <div className="card">
      <div className="card-title">
        <i className="ti ti-adjustments-horizontal" aria-hidden="true" />
        New Extraction Request
      </div>
      <div className="field-group">
        <label className="field-label" htmlFor="req-client">Client</label>
        <select id="req-client" value={client} onChange={e => setClient(e.target.value)}>
          {CLIENTS.map(c => <option key={c}>{c}</option>)}
        </select>
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
      <div className="card-title">
        <i className="ti ti-files" aria-hidden="true" />
        Matched Files
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
        3 files found for{' '}
        <strong style={{ color: 'var(--navy)' }}>Encova / Oracle / 2025</strong>.
        Select one to route for SME validation.
      </p>
      {SAMPLE_FILES.map(f => (
        <div className={`file-card ${f.tag === 'Latest' ? 'featured' : ''}`} key={f.name}>
          <i
            className={`ti ti-file-spreadsheet file-card-icon ${f.tag === 'Latest' ? 'featured' : ''}`}
            aria-hidden="true"
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="file-card-name">{f.name}</div>
            <div className="file-card-meta">
              <span>{f.modified}</span>
              <span>·</span>
              <span>{f.size}</span>
              <Badge color={f.tagColor}>{f.tag}</Badge>
            </div>
          </div>
          <button
            className={`btn small ${f.tag === 'Latest' ? 'primary' : 'ghost'}`}
            onClick={() => onSelect(f)}
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
              <span className="sme-info-val">Encova · Oracle · 2025</span>
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

// ─── ROI Field Metadata (definitions, questions, formulas) ───────────────────
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
    formula: 'Calculated as: (Deployed Licenses − Entitled Licenses) × Unit Cost',
  },
  'Identified Cost Avoidance': {
    definition: 'Potential unbudgeted costs that can be prevented through proactive compliance. Measurable in avoided liabilities. Client has NOT yet acted.',
    questions: [
      'What over-deployment or compliance gap did you identify that the client could remediate?',
      'How many excess licenses could be removed?',
      'What is the unit cost of those licenses?',
      'Can the client remediate this within their current contract terms?',
    ],
    formula: 'Calculated as: Excess Licenses × Unit Cost',
  },
  'Accomplished Cost Avoidance': {
    definition: 'The quantified result of actions taken to prevent unbudgeted costs. Requires client action to accomplish.',
    questions: [
      'What action did the client take (e.g. removed deployments, reduced installs)?',
      'How many licenses were removed or remediated?',
      'What is the unit cost of those licenses?',
      'What is the confirmation or evidence of the action taken?',
    ],
    formula: 'Calculated as: Remediated Licenses × Unit Cost',
  },
  'Identified Cost Optimization': {
    definition: 'Opportunities to reduce software, hardware, or cloud expenses through license optimization, contract negotiations, or strategic adjustments. Client has NOT yet acted.',
    questions: [
      'What optimization opportunity did you identify?',
      'How many licenses are surplus to actual need?',
      'What is the unit cost or annual contract value of those licenses?',
      'Is a contract mechanism available to right-size (e.g. true-down clause, renewal timing)?',
    ],
    formula: 'Calculated as: Surplus Licenses × Unit Cost, or estimated contract delta',
  },
  'Accomplished Cost Optimization': {
    definition: 'Verified cost reductions through renegotiations, contract adjustments, or technology shifts. Requires client action to accomplish.',
    questions: [
      'What specific action was taken?',
      'What was the original license count or contract value?',
      'What is the new license count or contract value after the change?',
      'What is the effective date of the change?',
    ],
    formula: 'Calculated as: (Original Value − New Value) for the period',
  },
  'Identified Cost Savings': {
    definition: 'A hard-dollar reduction opportunity has been identified but not yet realized.',
    questions: [
      'What is the current annual spend for this publisher or product?',
      'What specific mechanism would generate savings?',
      'What is the projected reduced spend if the opportunity is acted upon?',
    ],
    formula: 'Calculated as: Current Spend − Projected Spend',
  },
  'Realized Cost Savings': {
    definition: 'Hard-dollar savings reflected in budgets or financial statements due to negotiated reductions or decreased expenses.',
    questions: [
      "What was the client's spend for this publisher/product in the prior comparable period?",
      'What is the confirmed spend for this period?',
      'What drove the reduction?',
      'Is this reflected in an invoice, PO, or budget document?',
    ],
    formula: 'Calculated as: Prior Period Spend − Current Period Spend',
  },
};

// ─── Screen 3: Extract ────────────────────────────────────────────────────────
function ScreenExtract({ selectedFile, onNext }) {
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

  useEffect(() => {
    let cancelled = false;

    async function runExtraction() {
      for (let i = 0; i < EXTRACTION_STEPS.length; i++) {
        if (cancelled) return;
        setStepStatuses(prev => prev.map((s, idx) => idx === i ? 'running' : s));

        if (i === EXTRACTION_STEPS.length - 1) {
          try {
            const documentText = selectedFile
              ? `Document: ${selectedFile.name}\nVersion: ${selectedFile.version}\nClient: Encova Insurance | Publisher: Oracle | Year: 2025`
              : 'Sample ROI document for Encova Insurance Oracle 2025';
            const result = await extractROI(documentText);
            if (!cancelled) setExtractedData(result);
          } catch (err) {
            if (!cancelled) setError(err.message);
          }
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

  const displayFields = extractedData ? [
    { label: 'Identified Risk',                value: extractedData.identified_risk                || null, variant: 'green', confidence: 0, source: null, flag: null, entryMode: extractedData.identified_risk ? 'extracted' : null },
    { label: 'Identified Cost Avoidance',      value: extractedData.identified_cost_avoidance      || null, variant: 'green', confidence: 0, source: null, flag: null, entryMode: extractedData.identified_cost_avoidance ? 'extracted' : null },
    { label: 'Accomplished Cost Avoidance',    value: extractedData.accomplished_cost_avoidance    || null, variant: 'green', confidence: 0, source: null, flag: null, entryMode: extractedData.accomplished_cost_avoidance ? 'extracted' : null },
    { label: 'Identified Cost Optimization',   value: extractedData.identified_cost_optimization   || null, variant: 'blue',  confidence: 0, source: null, flag: null, entryMode: extractedData.identified_cost_optimization ? 'extracted' : null },
    { label: 'Accomplished Cost Optimization', value: extractedData.accomplished_cost_optimization || null, variant: 'blue',  confidence: 0, source: null, flag: null, entryMode: extractedData.accomplished_cost_optimization ? 'extracted' : null },
    { label: 'Identified Cost Savings',        value: extractedData.identified_cost_savings        || null, variant: 'green', confidence: 0, source: null, flag: null, entryMode: extractedData.identified_cost_savings ? 'extracted' : null },
    { label: 'Realized Cost Savings',          value: extractedData.realized_cost_savings          || null, variant: 'green', confidence: 0, source: null, flag: null, entryMode: extractedData.realized_cost_savings ? 'extracted' : null },
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
      Object.fromEntries(missingFields.map(f => [f.label, Array(ROI_FIELD_META[f.label]?.questions.length || 0).fill('')]))
    );
    setFallbackMode(true);
  };

  // ── Fallback form handlers ──
  const advanceFallback = (updatedFields) => {
    if (fallbackIndex < missingFields.length - 1) {
      setFallbackIndex(i => i + 1);
      setMergedFields(updatedFields);
    } else {
      // All missing fields handled — go to Store
      setFallbackMode(false);
      onNext(updatedFields);
    }
  };

  const handleFallbackNext = () => {
    const field = missingFields[fallbackIndex];
    const answers = fallbackAnswers[field.label] || [];
    const combinedValue = answers.filter(Boolean).join(' / ') || null;
    const updated = (mergedFields || displayFields).map(f =>
      f.label === field.label
        ? { ...f, value: combinedValue, entryMode: combinedValue ? 'manual' : null, flag: combinedValue ? null : 'SME skipped — data not available' }
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
    const field   = missingFields[fallbackIndex];
    const meta    = ROI_FIELD_META[field.label] || { definition: '', questions: [], formula: '' };
    const answers = fallbackAnswers[field.label] || [];
    return (
      <div className="card">
        <div className="fallback-progress">
          <i className="ti ti-edit" aria-hidden="true" />
          Field {fallbackIndex + 1} of {missingFields.length} — Manual Entry
        </div>
        <div className="card-title">{field.label}</div>
        <p className="fallback-field-def">{meta.definition}</p>

        <div className="fallback-questions">
          {meta.questions.map((q, qi) => (
            <div className="fallback-question" key={qi}>
              <label className="field-label" htmlFor={`fb-q-${qi}`}>{q}</label>
              <input
                id={`fb-q-${qi}`}
                type="text"
                placeholder="Optional — leave blank to skip"
                value={answers[qi] || ''}
                onChange={e => updateAnswer(qi, e.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="fallback-formula">{meta.formula}</div>

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

// ─── Screen 4: Store ──────────────────────────────────────────────────────────
function ScreenStore({ selectedFile, smeName, fields, onNext, onBack }) {
  // Fall back to EXTRACTED_FIELDS if no fields were passed (e.g. direct step navigation)
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
function ScreenDone({ onNewExtraction, onTracker, onDashboards }) {
  return (
    <>
      <div className="done-hero">
        <div className="done-check">
          <i className="ti ti-check" aria-hidden="true" />
        </div>
        <div>
          <div className="done-title">Extraction Complete</div>
          <div className="done-sub">Encova · Oracle · 2025 — All records stored successfully</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Badge color="green">
            <i className="ti ti-circle-check" aria-hidden="true" /> All records stored
          </Badge>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-label">Total Savings</div>
          <div className="metric-value">$2.4M</div>
          <div className="metric-delta">↑ +12% vs 2024</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Net ROI</div>
          <div className="metric-value">$1.53M</div>
          <div className="metric-delta">↑ +8% vs 2024</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg Confidence</div>
          <div className="metric-value">93%</div>
          <div className="metric-delta muted">across all fields</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <i className="ti ti-chart-bar" aria-hidden="true" />
          Savings Breakdown
        </div>
        {[
          { label: 'License spend',     pct: '62%', color: 'var(--blue)',       val: '$870K' },
          { label: 'Compliance risk',   pct: '24%', color: 'var(--blue-light)', val: '$340K' },
          { label: 'Support reduction', pct: '14%', color: 'var(--gold)',       val: '18%'   },
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

  const handleFileSelect = file              => { setFile(file);    setStep(2); };
  const handleSMEConfirm = ({ smeName: n }) => { setSmeName(n);    setStep(3); };
  const handleStore      = fields            => { setFinalFields(fields); setStep(5); };

  const screens = [
    <ScreenRequest  key={0} onNext={() => setStep(1)} />,
    <ScreenFiles    key={1} onSelect={handleFileSelect}  onBack={() => setStep(0)} />,
    <ScreenValidate key={2} selectedFile={selectedFile}  onConfirm={handleSMEConfirm} onBack={() => setStep(1)} />,
    <ScreenExtract  key={3} selectedFile={selectedFile}  onNext={(fields) => { setFinalFields(fields); setStep(4); }} />,
    <ScreenStore    key={4} selectedFile={selectedFile}  smeName={smeName} fields={finalFields} onNext={handleStore} onBack={() => setStep(3)} />,
    <ScreenDone     key={5} onNewExtraction={() => setStep(0)} onTracker={() => onNav('tracker')} onDashboards={() => onNav('dashboards')} />,
  ];

  return (
    <>
      <JourneyBar currentStep={step} onStep={setStep} />
      {screens[step]}
    </>
  );
}
