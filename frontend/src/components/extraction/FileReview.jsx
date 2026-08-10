import React, { useState } from 'react';
import FieldCard from './FieldCard';
import { ScreenCompare } from './ScreenCompare';
import ScreenExtract from './ScreenExtract';
import { BLANK_FIELDS, buildClaudeFields } from './helpers';

// ─── Screen 4 (host): per-file review ─────────────────────────────────────────
// For the current file: first let the SME fill/skip any missing fields (the
// ScreenExtract review), then resolve the Script-vs-Claude comparison. Remounted
// per file by the parent (keyed on the file index) so each file starts clean.
function FileReview({ fileResult, fileIndex, total, isLast, onConfirm, onExclude, onBack, allStatuses = [], files = [], smeName = '', duplicateRecord = null }) {
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
      scriptMeta={fileResult.scriptMeta}
      batchInfo={batchInfo}
      onExclude={total > 1 ? onExclude : null}
      onNext={onConfirm}
      onBack={onBack}
      smeName={smeName}
      fileMeta={fileResult.fileMeta}
      duplicateRecord={duplicateRecord}
    />
  );
}

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
  const mixed = commonMeta.mixedPublisher;
  const recordCount = active.length + (multi && storeAggregate ? 1 : 0);

  return (
    <div className="card">
      <div className="card-title">
        <i className="ti ti-database" aria-hidden="true" />
        Review
      </div>
      <p className="store-sub">
        {multi
          ? <>Combined annual total from <strong>{active.length}</strong> file{active.length !== 1 ? 's' : ''}. <strong>{recordCount}</strong> record{recordCount !== 1 ? 's' : ''} will be written to the Delivery Hub and local database. Click the pencil icon to correct a value.</>
          : <>Review values before writing to the Delivery Hub. Click the pencil icon to correct a value.</>}
        {manualCount > 0 && <> <span className="field-card-manual-tag">Manually entered</span> fields were filled in by the SME.</>}
        {skippedCount > 0 && <> Greyed-out fields were skipped and will be stored as not available.</>}
      </p>

      {multi && (
        <>
          {mixed && (
            <div className="batch-warning">
              <i className="ti ti-alert-triangle batch-warning-icon" aria-hidden="true" />
              <span>
                The selected files span different metadata. Confirm you want to combine them into one annual aggregate before storing it.
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
          { icon: 'ti-table',            title: multi ? `${recordCount} ROI records` : 'ROI values', sub: 'Delivery Hub · roi_metrics' },
          { icon: 'ti-shield-check',     title: 'Audit record',    sub: 'Local Database · audit_events' },
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


export { FileReview, ScreenStore };
