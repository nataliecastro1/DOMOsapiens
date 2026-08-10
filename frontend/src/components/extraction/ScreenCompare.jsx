import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Badge from '../Badge';
import { SlideCarousel } from './SlideCarousel';
import FieldCard from './FieldCard';
import PublisherField from './PublisherField';
import { formatDollar, parseDollar, BLANK_FIELDS, ROI_FIELD_META, MONETARY_LABELS } from './helpers';
import { getRecords } from '../../services/api';
import { getHubContext } from '../../services/hubContext';

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
function CompareRow({ field, onResolve, onJumpToSlide, nudgeValue = null, onPendingChange = null }) {
  const isSkipped   = field.flag === 'SME skipped — data not available';
  const bestVal     = field.sme ?? field.claude;
  const scriptMatch = !isSkipped && field.script !== '—' && field.script === bestVal;

  // Duplicate-aware: only active when pastValue !== undefined (i.e. a duplicate record exists)
  const pastValue   = field.pastValue; // undefined = no duplicate, null = dup exists but field missing
  const dupMode     = pastValue !== undefined;
  const newValue    = bestVal ?? field.script;
  const isNewField  = dupMode && pastValue === null && newValue != null && newValue !== '—';
  const isChanged   = dupMode && pastValue !== null && newValue != null && newValue !== '—' && toRaw(newValue) !== toRaw(pastValue);
  const isPastOnly  = dupMode && pastValue !== null && (newValue == null || newValue === '—');

  const [editVal,     setEditVal]     = useState(toRaw(bestVal));
  const [confirmed,   setConfirmed]   = useState(true);
  const [expanded,    setExpanded]    = useState(false);
  const [smeApproved, setSmeApproved] = useState(false);

  const prevNudgeRef   = useRef(null);
  const savedEditRef   = useRef('');   // snapshot of editVal when entering edit mode

  useEffect(() => {
    if (nudgeValue !== null && nudgeValue !== prevNudgeRef.current) {
      prevNudgeRef.current = nudgeValue;
      setEditVal(toRaw(nudgeValue));
      setConfirmed(true);
      setSmeApproved(false);
    }
  }, [nudgeValue]);

  const enterEdit = () => { savedEditRef.current = editVal; setConfirmed(false); };
  const cancelEdit = () => { setEditVal(savedEditRef.current); setConfirmed(true); };

  // Report the current confirmed value to ScreenCompare even before the row is
  // approved — so the aggregate check and dup check can react to pending edits.
  useEffect(() => {
    if (onPendingChange) {
      onPendingChange(field.label, confirmed ? toFormatted(editVal) : null);
    }
  }, [confirmed, editVal]);

  const scriptConfMed  = field.scriptConfidence != null && field.scriptConfidence >= 70 && field.scriptConfidence < 90;
  const claudeConfMed  = field.claudeConfidence != null && field.claudeConfidence >= 70 && field.claudeConfidence < 90;
  const interMismatch  = !isSkipped && field.script !== '—' && field.claude != null && field.script !== field.claude;
  const isUncertain    = !isSkipped && (field.scriptUncertain || interMismatch || scriptConfMed || claudeConfMed || field.dupFlag);

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
        {isNewField && (
          <span style={{ display:'inline-flex', alignItems:'center', gap:4, marginLeft:8, background:'#fef3c7', color:'#92400e', fontSize:10, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', padding:'2px 7px', borderRadius:20, border:'1px solid #fcd34d' }}>
            <i className="ti ti-sparkles" style={{ fontSize:11 }} /> New information
          </span>
        )}
        {isChanged && (
          <span style={{ display:'inline-flex', alignItems:'center', gap:4, marginLeft:8, background:'#fef3c7', color:'#92400e', fontSize:10, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', padding:'2px 7px', borderRadius:20, border:'1px solid #fcd34d' }}>
            <i className="ti ti-refresh" style={{ fontSize:11 }} /> Updated
          </span>
        )}
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
            <span
              className="compare-final-value compare-final-value--clickable"
              onClick={enterEdit}
              title="Click to edit"
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') enterEdit(); }}
            >
              {toFormatted(editVal)}
            </span>
            <button
              onClick={enterEdit}
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
              onClick={() => setConfirmed(true)}
            >
              Done
            </button>
            <button
              className="compare-cancel-btn"
              onClick={cancelEdit}
              title="Cancel edit"
            >
              Cancel
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
              {(() => {
                const slideNum = field.claudeSlide ?? (() => {
                  const m = String(field.claudeSource).match(/^Slide\s+(\d+)/i);
                  return m ? parseInt(m[1], 10) : null;
                })();
                return slideNum && onJumpToSlide
                  ? <button className="compare-source-slide compare-source-slide--btn" onClick={() => onJumpToSlide(slideNum - 1)}>
                      <i className="ti ti-presentation" /> Slide {slideNum}
                    </button>
                  : slideNum
                  ? <span className="compare-source-slide">Slide {slideNum}</span>
                  : null;
              })()}
              <span className="compare-source-text">"{field.claudeSource}"</span>
            </div>
          )}
        </div>
      )}

      {/* Duplicate value notice — shown until SME approves */}
      {field.dupFlag && !smeApproved && (
        <div className="compare-dup-notice">
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          This field has the same value as a related field. This is very unlikely — please verify both before approving.
        </div>
      )}

      {/* Past information row — shown when a duplicate record exists */}
      {(pastValue || isPastOnly) && (
        <div style={{ gridColumn:'1 / -1', display:'flex', alignItems:'center', gap:10, padding:'8px 14px', marginTop:4, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, opacity:0.75 }}>
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:'#94a3b8', flexShrink:0 }}>Past information</span>
          <span style={{ fontSize:13, color:'#64748b', fontFamily:'monospace', fontWeight:600 }}>{pastValue}</span>
          {(isChanged || isPastOnly) && (
            <span style={{ fontSize:11, color:'#94a3b8', fontStyle:'italic' }}>
              {isChanged ? 'Value updated in new document' : 'Not found in new document'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
function ScreenCompare({ fields, scriptData, scriptMeta = null, batchInfo = null, onExclude = null, onNext, onBack, smeName = '', fileMeta = null, duplicateRecord = null }) {
  const [slideOpen, setSlideOpen] = useState(false);
  const slideStackRef = useRef(null);
  const isMulti = batchInfo?.total > 1;

  // scriptMeta (from ROAR) takes priority — it reflects what's actually in the document.
  // fileMeta is the fallback from the user-entered form values.
  const _initMeta = useMemo(() => {
    const client_scope_name = String(scriptMeta?.client_scope_name || fileMeta?.client_scope_name || fileMeta?.upClient || '');
    return {
      publisher:        String(scriptMeta?.publisher || fileMeta?.publisher || fileMeta?.upPublisher || ''),
      currency:         String(scriptMeta?.currency || fileMeta?.currency || 'USD'),
      date_delivered:   String(scriptMeta?.date_delivered || fileMeta?.date_delivered || new Date().toISOString().split('T')[0]),
      client_scope_name: client_scope_name,
      applicable_from:  String(scriptMeta?.applicable_from || fileMeta?.applicable_from || ''),
      applicable_to:    String(scriptMeta?.applicable_to || fileMeta?.applicable_to || ''),
    };
  }, [scriptMeta, fileMeta]);
  const [metaDetails, setMetaDetails] = useState(_initMeta);

  // Safety net: re-sync if scriptMeta arrived after first render (async extraction).
  useEffect(() => {
    setMetaDetails(prev => {
      const next = _initMeta;
      return {
        publisher:        prev.publisher || next.publisher,
        currency:         prev.currency  || next.currency,
        date_delivered:   prev.date_delivered || next.date_delivered,
        client_scope_name: prev.client_scope_name || next.client_scope_name,
        applicable_from:  prev.applicable_from || next.applicable_from,
        applicable_to:    prev.applicable_to || next.applicable_to,
      };
    });
  }, [scriptMeta]);
  const [clientRecords, setClientRecords] = useState(null);
  const [suggestedOverrides, setSuggestedOverrides] = useState({});
  // pendingValues: confirmed-but-possibly-not-yet-approved edits from CompareRow.
  // Used by the aggregate check and dup check so they react even when a yellow row
  // hasn't been approved yet (resolved[label] stays null until approval).
  const [pendingValues, setPendingValues] = useState({});

  // Per-field date overrides — only populated when a field's window differs from the record default.
  const [fieldDates, setFieldDates] = useState(() => {
    const hubCtx = getHubContext();
    const startDates = hubCtx?.start_dates || [];
    const endDates = hubCtx?.end_dates || [];
    const entries = [...MONETARY_LABELS].map((label, idx) => [
      label, 
      { 
        from: startDates[idx] || '', 
        to: endDates[idx] || '' 
      }
    ]);
    return Object.fromEntries(entries);
  });
  const setFieldDate = (label, key, val) =>
    setFieldDates(prev => ({ ...prev, [label]: { ...prev[label], [key]: val } }));
  const [overridesOpen, setOverridesOpen] = useState(false);

  const handlePendingChange = (label, val) => {
    setPendingValues(prev => ({ ...prev, [label]: val }));
  };

  useEffect(() => {
    const client = fileMeta?.client || fileMeta?.upClient;
    getRecords()
      .then(recs => {
        setClientRecords(client ? (recs || []).filter(r => r.client === client) : []);
      })
      .catch(() => setClientRecords([]));
  }, []);
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

  // Map label → flat API key on the existing duplicate record
  const PAST_FIELD_KEY = {
    'Identified Risk':                'identified_risk',
    'Identified Cost Avoidance':      'id_cost_avoidance',
    'Accomplished Cost Avoidance':    'acc_cost_avoidance',
    'Identified Cost Optimization':   'id_cost_optimization',
    'Accomplished Cost Optimization': 'acc_cost_optimization',
    'Identified Cost Savings':        'id_cost_savings',
    'Realized Cost Savings':          'realized_savings',
  };
  const fmtPast = (n) => {
    const num = Number(n);
    if (!num) return null;
    return `$${num.toLocaleString()}`;
  };
  const pastFor = (label) => {
    if (!duplicateRecord) return undefined; // no duplicate context — don't show any tags
    const key = PAST_FIELD_KEY[label];
    return key ? fmtPast(duplicateRecord[key]) : null; // null = field not in past record
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
      claudeSlide:      f.source_slide ?? null,
      sme:    f.entryMode === 'manual'    ? f.value : null,
      flag:   f.flag,
      pastValue: pastFor(f.label),
    };
  });

  // dupFlag phase 1: check initial extracted values (no state needed yet)
  const _rowBest = (label) => {
    const r = compareRows.find(x => x.label === label);
    return r ? (r.sme ?? r.claude) : null;
  };
  const _accOptBest  = _rowBest('Accomplished Cost Optimization');
  const _realSavBest = _rowBest('Realized Cost Savings');
  const _hasDupFlag  = Boolean(
    _accOptBest && _realSavBest &&
    _accOptBest !== '—' && _realSavBest !== '—' &&
    parseDollar(_accOptBest) > 0 && parseDollar(_realSavBest) > 0 &&
    _accOptBest === _realSavBest
  );

  const [resolved, setResolved] = useState({});

  const handleResolve = (label, val) => {
    setResolved(prev => ({ ...prev, [label]: val }));
  };

  // dupFlag phase 2: also flag when the user's resolved/pending values become equal
  // (now safe to reference resolved and pendingValues, both declared above)
  const _resolvedAccOpt  = resolved['Accomplished Cost Optimization']  ?? pendingValues['Accomplished Cost Optimization'];
  const _resolvedRealSav = resolved['Realized Cost Savings']           ?? pendingValues['Realized Cost Savings'];
  const _resolvedDupActive = Boolean(
    _resolvedAccOpt && _resolvedRealSav &&
    parseDollar(_resolvedAccOpt) > 0 && parseDollar(_resolvedRealSav) > 0 &&
    _resolvedAccOpt === _resolvedRealSav
  );
  const _anyDupFlag = _hasDupFlag || _resolvedDupActive;
  const finalCompareRows = _anyDupFlag
    ? compareRows.map(r =>
        r.label === 'Accomplished Cost Optimization' || r.label === 'Realized Cost Savings'
          ? { ...r, dupFlag: true }
          : r
      )
    : compareRows;

  // Skipped rows don't need SME resolution — only non-skipped rows must be confirmed
  const resolvableRows = finalCompareRows.filter(f => f.flag !== 'SME skipped — data not available');
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
  const isYellow    = (r) => isCompeting(r) || isLowConf(r) || isMedConf(r) || r.dupFlag;
  const reviewCount = resolvableRows.filter(isYellow).length;
  const matchCount  = resolvableRows.length - reviewCount;
  const lowestConf  = (r) => { const vs = [r.scriptConfidence, r.claudeConfidence].filter(v => v != null); return vs.length ? Math.round(Math.min(...vs)) : null; };

  const reviewGroups = [
    { key: 'competing', label: 'Competing values',   items: resolvableRows.filter(isCompeting).map(r => r.label) },
    { key: 'lowconf',   label: 'Low confidence',     items: resolvableRows.filter(r => !isCompeting(r) && isLowConf(r)).map(r => { const p = lowestConf(r); return p != null ? `${r.label} (${p}%)` : r.label; }) },
    { key: 'medconf',   label: 'Medium confidence',  items: resolvableRows.filter(r => !isCompeting(r) && !isLowConf(r) && isMedConf(r)).map(r => { const p = lowestConf(r); return p != null ? `${r.label} (${p}%)` : r.label; }) },
    { key: 'dupflag',   label: 'Duplicate value — verify', items: resolvableRows.filter(r => r.dupFlag).map(r => r.label) },
  ].filter(g => g.items.length > 0);

  const handleNext = () => {
    const resolvedFields = sourceFields.map(f => {
      const finalVal = resolved[f.label];
      if (finalVal && finalVal !== f.value) {
        return { ...f, value: finalVal };
      }
      return f;
    });
    onNext(resolvedFields, { ...metaDetails, fieldDates });
  };

  // Aggregate consistency check: accomplished ≤ identified across all client history + current
  // Uses the user's resolved value when available, falls back to the initial extraction value.
  const aggWarnings = useMemo(() => {
    if (!clientRecords) return [];
    const warnings = [];
    const getNum = (label) => {
      const r = finalCompareRows.find(x => x.label === label);
      // resolved is set only when confirmed+approved; pendingValues when confirmed but not yet approved
      const v = resolved[label] ?? pendingValues[label] ?? (r ? (r.sme ?? r.claude) : null);
      const n = parseDollar(v);
      return isNaN(n) ? 0 : n;
    };
    const sum = (field) => clientRecords.reduce((acc, r) => acc + (r[field] || 0), 0);

    const histAccAvd = sum('acc_cost_avoidance');
    const histIdAvd  = sum('id_cost_avoidance');
    const currAccAvd = getNum('Accomplished Cost Avoidance');
    const currIdAvd  = getNum('Identified Cost Avoidance');
    if ((histAccAvd + currAccAvd) > (histIdAvd + currIdAvd) && (histAccAvd + currAccAvd) > 0) {
      const gap = (histAccAvd + currAccAvd) - (histIdAvd + currIdAvd);
      warnings.push({
        label:     'Identified Cost Avoidance',
        pair:      'cost avoidance',
        gap,
        suggested: currIdAvd + gap,
      });
    }

    const histAccOpt = sum('acc_cost_optimization');
    const histIdOpt  = sum('id_cost_optimization');
    const currAccOpt = getNum('Accomplished Cost Optimization');
    const currIdOpt  = getNum('Identified Cost Optimization');
    if ((histAccOpt + currAccOpt) > (histIdOpt + currIdOpt) && (histAccOpt + currAccOpt) > 0) {
      const gap = (histAccOpt + currAccOpt) - (histIdOpt + currIdOpt);
      warnings.push({
        label:     'Identified Cost Optimization',
        pair:      'cost optimization',
        gap,
        suggested: currIdOpt + gap,
      });
    }

    return warnings;
  }, [clientRecords, finalCompareRows, resolved, pendingValues]);

  // Reactive dup-value check: warns if the user edits resolved values into equality.
  // Suppressed if the original extracted values were ALREADY equal (_hasDupFlag) —
  // the row-level warning + approval flow covers that case.
  const resolvedDupWarning = useMemo(() => {
    if (_anyDupFlag) return false; // rows are already highlighted — no need for a separate banner
    const v1 = resolved['Accomplished Cost Optimization'] ?? pendingValues['Accomplished Cost Optimization'];
    const v2 = resolved['Realized Cost Savings']          ?? pendingValues['Realized Cost Savings'];
    if (!v1 || !v2) return false;
    const n1 = parseDollar(v1);
    const n2 = parseDollar(v2);
    return !isNaN(n1) && !isNaN(n2) && n1 > 0 && n2 > 0 && v1 === v2;
  }, [resolved, pendingValues, _anyDupFlag]);

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
        {finalCompareRows.map(f => (
          <CompareRow
            key={f.label}
            field={f}
            onResolve={handleResolve}
            onPendingChange={handlePendingChange}
            onJumpToSlide={storedName ? (idx) => { setSlideOpen(true); setTimeout(() => slideStackRef.current?.jumpTo(idx), 80); } : null}
            nudgeValue={suggestedOverrides[f.label] ?? null}
          />
        ))}
      </div>

      {/* Aggregate consistency warnings + reactive dup-value warning */}
      {(aggWarnings.length > 0 || resolvedDupWarning) && (
        <div className="compare-agg-warnings">
          {resolvedDupWarning && (
            <div className="compare-agg-warning">
              <div className="compare-agg-warning-body">
                <i className="ti ti-alert-triangle" aria-hidden="true" />
                <span>
                  <strong>Duplicate value detected:</strong> Accomplished Cost Optimization and Realized Cost Savings
                  have been set to the same value. This is very unlikely — please verify both fields.
                </span>
              </div>
            </div>
          )}
          {aggWarnings.map(w => (
            <div key={w.label} className="compare-agg-warning">
              <div className="compare-agg-warning-body">
                <i className="ti ti-chart-bar" aria-hidden="true" />
                <span>
                  <strong>Aggregate check:</strong> Across all {fileMeta?.client_scope_name || fileMeta?.upClient || 'this client'}'s records,
                  accomplished {w.pair} would exceed identified {w.pair} by{' '}
                  <strong>{formatDollar(w.gap)}</strong> after this extraction.
                  Suggested minimum for <em>{w.label}</em>:{' '}
                  <strong>{formatDollar(w.suggested)}</strong>.
                </span>
              </div>
              <button
                className="btn ghost compare-agg-apply-btn"
                onClick={() => setSuggestedOverrides(prev => ({ ...prev, [w.label]: formatDollar(w.suggested) }))}
              >
                Apply suggested value
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Record Details — non-ROI metadata fields for review before save */}
      <div className="compare-record-details">
        <div className="compare-record-details-header">
          <i className="ti ti-info-circle" aria-hidden="true" />
          Record Details
        </div>
        <div className="compare-record-details-grid">
          {[
            { key: 'publisher',      label: 'Publisher',      type: 'text',   placeholder: 'e.g. Microsoft' },
            { key: 'currency',       label: 'Currency',       type: 'text',   placeholder: 'USD' },
            { key: 'date_delivered', label: 'Date Extracted', type: 'text',   placeholder: 'e.g. 2024-03-15' },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key} className="compare-record-detail-item">
              <label className="compare-record-detail-label">{label}</label>
              {key === 'publisher' ? (
                <PublisherField
                  value={metaDetails[key]}
                  onChange={v => setMetaDetails(prev => ({ ...prev, publisher: v }))}
                  placeholder={placeholder}
                />
              ) : (
                <input
                  type={type}
                  className="compare-record-detail-input"
                  value={metaDetails[key]}
                  onChange={e => setMetaDetails(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                />
              )}
            </div>
          ))}
        </div>

        {/* Applicability date range */}
        <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(0,95,134,0.06)', borderRadius: 6, border: '1px solid rgba(0,95,134,0.14)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <i className="ti ti-calendar-stats" style={{ fontSize: 13, color: '#005f86' }} aria-hidden="true" />
            <span style={{ fontWeight: 600, fontSize: 12, color: '#005f86' }}>Value applicability period</span>
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 11.5, color: '#475569', lineHeight: 1.5 }}>
            The date range during which this engagement's ROI values are considered active.
            This is used for time-based reporting — for example, to show only savings that were
            in effect during a given quarter. Defaults to the full delivery year.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <label style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>From</label>
              <input
                type="date"
                className="compare-record-detail-input"
                value={metaDetails.applicable_from || ''}
                onChange={e => setMetaDetails(prev => ({ ...prev, applicable_from: e.target.value }))}
                style={{ fontSize: 12, padding: '3px 7px' }}
              />
            </div>
            <span style={{ color: '#94a3b8', fontSize: 13 }}>→</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <label style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>To</label>
              <input
                type="date"
                className="compare-record-detail-input"
                value={metaDetails.applicable_to || ''}
                onChange={e => setMetaDetails(prev => ({ ...prev, applicable_to: e.target.value }))}
                style={{ fontSize: 12, padding: '3px 7px' }}
              />
            </div>
          </div>
        </div>

        {/* Per-field overrides — collapsed by default */}
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => setOverridesOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, width: '100%',
              background: 'none', border: 'none', padding: '6px 2px',
              fontSize: 11.5, color: '#64748b', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <i className={`ti ti-chevron-${overridesOpen ? 'down' : 'right'}`} style={{ fontSize: 11 }} aria-hidden="true" />
            <span style={{ fontWeight: 500 }}>Override dates for individual values</span>
            <span style={{ marginLeft: 4, opacity: 0.65 }}>(optional — only if a specific value has a different window)</span>
          </button>
          {overridesOpen && (
            <div style={{ marginTop: 4, padding: '8px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <p style={{ margin: '0 0 10px', fontSize: 11, color: '#64748b', lineHeight: 1.45 }}>
                All values inherit the period above by default. Use these only when a specific
                value was active for a meaningfully different window — for example, if identified
                risk applied January through June but realized savings continued through December.
              </p>
              {[...MONETARY_LABELS].map(label => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, color: '#334155', fontWeight: 500, minWidth: 210 }}>{label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <label style={{ fontSize: 11, color: '#94a3b8' }}>From</label>
                    <input
                      type="date"
                      value={fieldDates[label]?.from || ''}
                      onChange={e => setFieldDate(label, 'from', e.target.value)}
                      placeholder={metaDetails.applicable_from || ''}
                      style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: '1px solid #cbd5e1', color: '#334155', background: '#fff', fontFamily: 'inherit' }}
                    />
                  </div>
                  <span style={{ color: '#cbd5e1', fontSize: 12 }}>→</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <label style={{ fontSize: 11, color: '#94a3b8' }}>To</label>
                    <input
                      type="date"
                      value={fieldDates[label]?.to || ''}
                      onChange={e => setFieldDate(label, 'to', e.target.value)}
                      placeholder={metaDetails.applicable_to || ''}
                      style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: '1px solid #cbd5e1', color: '#334155', background: '#fff', fontFamily: 'inherit' }}
                    />
                  </div>
                  {(fieldDates[label]?.from || fieldDates[label]?.to) && (
                    <button
                      onClick={() => { setFieldDate(label, 'from', ''); setFieldDate(label, 'to', ''); }}
                      style={{ fontSize: 10, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
                      title="Clear override — revert to record default"
                    >clear</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
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
              const confirmedVal = resolved[row.label];
              const tentativeVal = pendingValues[row.label];
              const displayVal   = confirmedVal ?? tentativeVal;
              const hasValue     = displayVal && displayVal !== '—';
              const isApproved   = confirmedVal != null && hasValue;
              const needsApproval = !isApproved && hasValue;
              const chipClass    = isApproved ? 'confirmed' : needsApproval ? 'needs-approval' : 'pending';
              return (
                <span key={row.label} className={`compare-stored-chip ${chipClass}`}>
                  <i className={`ti ${isApproved ? 'ti-circle-check' : 'ti-circle-dashed'}`} aria-hidden="true" />
                  {row.label}{displayVal && displayVal !== '—' && <strong>{displayVal}</strong>}
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
              Approve yellow rows to continue
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

export { ScreenCompare, CompareRow };
