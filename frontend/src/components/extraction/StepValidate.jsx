import React, { useState, useEffect, useRef } from 'react';
import { checkUpload } from '../../services/api';
import { SlideCarousel } from './SlideCarousel';

export default function StepValidate({ selectedFile, files = [], onConfirm, onBack, defaultName = '', isDuplicate = false }) {
  const [decision, setDecision] = useState(() => isDuplicate ? 'note' : 'approve');
  const [smeNotes, setSmeNotes] = useState('');
  const [docChecks, setDocChecks] = useState({});
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const timestamp = useRef(new Date().toLocaleString());
  const batch = files.length ? files : (selectedFile ? [selectedFile] : []);
  const isMulti = batch.length > 1;

  useEffect(() => {
    batch.forEach(f => {
      if (!f?.stored_name) return;
      checkUpload(f.stored_name, { publisher: f.publisher || '', original_filename: f.name || '' })
        .then(result => setDocChecks(prev => ({ ...prev, [f.stored_name]: result })))
        .catch(() => {});
    });
  }, []);

  const hasWarnings = batch.some(f => f?.stored_name && docChecks[f.stored_name] && !docChecks[f.stored_name].is_ok);

  useEffect(() => {
    if (hasWarnings && decision === 'approve') setDecision('note');
  }, [hasWarnings]);

  const notesMissing = (decision === 'note' || isDuplicate) && !smeNotes.trim();
  const handleConfirm = () => {
    if (decision === 'flag') { onBack(); return; }
    onConfirm({ decision, smeName: defaultName, smeNotes });
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
              A duplicate record already exists. To continue, you must either
              provide a written justification (Approve with notes) or discard this file (Flag and Return).
              Notes are required — the Confirm button will remain locked until a reason is entered.
            </div>
          </div>
        </div>
      )}

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

      {(() => {
        const f = isMulti ? batch[activeTab] : (selectedFile || batch[0]);
        if (!f) return null;
        const chips = [
          { icon: 'ti-file-description', val: f.name },
          { icon: 'ti-brand-windows', val: f.publisher },
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
