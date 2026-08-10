import React, { useState, useEffect, useRef } from 'react';
import Badge from '../Badge';
import { SlideStack, SlideCarousel } from './SlideCarousel';
import { extractROAR } from '../../services/api';
import FieldCard from './FieldCard';
import { parseDollar, formatDollar, buildFieldMeta, BLANK_FIELDS, ROI_FIELD_META } from './helpers';

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


export default ScreenExtract;
