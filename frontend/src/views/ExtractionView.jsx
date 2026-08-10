import React, { useRef } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import StepUpload from '../components/extraction/StepUpload';
import StepValidate from '../components/extraction/StepValidate';
import { FileReview, buildClaudeFields, ROI_FIELD_META } from '../components/extraction/StepReview';
import { ScreenDone } from '../components/extraction/StepDone';
import { extractROAR, extractFromFile, saveRecord } from '../services/api';
import { getHubContext } from '../services/hubContext';
import { buildRecord, buildScriptData, aggregateFinalFields, deriveCommonMeta } from '../components/extraction/helpers';
import { YEARS } from '../data';
import useExtractionStore from '../store/extractionStore';

// ─── Journey Bar ──────────────────────────────────────────────────────────────
const STEP_DEFS = [
  { label: 'Request',      icon: 'ti-adjustments-horizontal' },
  { label: 'SME Validate', icon: 'ti-user-check'             },
  { label: 'Review',       icon: 'ti-database'               },
  { label: 'Done',         icon: 'ti-circle-check'           },
];

const STEP_TO_BAR = [0, 1, 1, 2, 2, 2, 3];

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

// ─── ExtractionView ───────────────────────────────────────────────────────────
export default function ExtractionView({ onNav, loggedInUser = '', initialClient = '', initialPublisher = '', onOpenRecord }) {
  // ── Zustand store ────────────────────────────────────────────────────────
  const step             = useExtractionStore(s => s.step);
  const setStep          = useExtractionStore(s => s.setStep);
  const files            = useExtractionStore(s => s.files);
  const setFiles         = useExtractionStore(s => s.setFiles);
  const currentFileIndex = useExtractionStore(s => s.currentFileIndex);
  const setCurrentFileIndex = useExtractionStore(s => s.setCurrentFileIndex);
  const fileResults      = useExtractionStore(s => s.fileResults);
  const setFileResults   = useExtractionStore(s => s.setFileResults);
  const updateFileResult = useExtractionStore(s => s.updateFileResult);
  const fileStatuses     = useExtractionStore(s => s.fileStatuses);
  const setFileStatuses  = useExtractionStore(s => s.setFileStatuses);
  const updateFileStatus = useExtractionStore(s => s.updateFileStatus);
  const smeName          = useExtractionStore(s => s.smeName);
  const setSmeName       = useExtractionStore(s => s.setSmeName);
  const aggregateFields  = useExtractionStore(s => s.aggregateFields);
  const setAggregateFields = useExtractionStore(s => s.setAggregateFields);
  const filters          = useExtractionStore(s => s.filters);
  const setFilters       = useExtractionStore(s => s.setFilters);
  const savedRecordId    = useExtractionStore(s => s.savedRecordId);
  const setSavedRecordId = useExtractionStore(s => s.setSavedRecordId);
  const duplicateRecord  = useExtractionStore(s => s.duplicateRecord);
  const setDuplicateRecord = useExtractionStore(s => s.setDuplicateRecord);
  const reqYear          = useExtractionStore(s => s.reqYear);
  const setReqYear       = useExtractionStore(s => s.setReqYear);
  const resetFlow        = useExtractionStore(s => s.resetFlow);

  // initialClient / initialPublisher are props that seed the store on mount
  const reqClient    = useExtractionStore(s => s.reqClient) || initialClient;
  const reqPublisher = useExtractionStore(s => s.reqPublisher) || initialPublisher;

  const extractionCancelRef = useRef(false);

  const startExtraction = (filesToExtract) => {
    (async () => {
      // Fire and forget all files to the backend queue
      const tasks = filesToExtract.map(file => {
        const fileRef = (file?.path || file?.id || file?.stored_name) ? file : (file?.name || '');
        return extractFromFile(fileRef, true).catch(err => console.error("Failed to submit job", err));
      });
      await Promise.all(tasks);
      onNav('queue');
    })();
  };

  const handleFilesSelected = (picked) => {
    const arr = Array.isArray(picked) ? picked : [picked];
    setFiles(arr);
    setCurrentFileIndex(0);
    setStep(2);
  };

  const handleSMEConfirm = ({ smeName: n }) => {
    setSmeName(n);
    startExtraction(files);
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
      const meta = { ...(only?.fileMeta || files[0] || {}), ...(only?.metaDetails || {}) };
      const saved = await saveRecord(buildRecord(meta, agg, sme, only?.scriptData))
        .catch(err => { console.error('[Store] saveRecord failed:', err); return null; });
      primaryRecordId = saved?.record_id || null;
    } else {
      const saved = await Promise.all(active.map(r =>
        saveRecord(buildRecord({ ...r.fileMeta, ...(r.metaDetails || {}) }, r.finalFields, sme, r.scriptData))
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
  };

  const advanceAfterFile = (results) => {
    const next = currentFileIndex + 1;
    if (next < results.length) {
      setFileResults(results);
      setCurrentFileIndex(next);
    } else {
      performSave(results);
    }
  };

  const handleFileConfirm = (resolvedFields, metaDetails) => {
    advanceAfterFile(
      fileResults.map((r, i) => i === currentFileIndex ? { ...r, finalFields: resolvedFields, metaDetails: metaDetails || {}, excluded: false } : r)
    );
  };

  const handleFileExclude = () => {
    advanceAfterFile(
      fileResults.map((r, i) => i === currentFileIndex ? { ...r, excluded: true, finalFields: null } : r)
    );
  };

  const commonMeta = deriveCommonMeta(fileResults);

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
    <StepUpload  key={0} onNext={(f) => { setFilters(f); setStep(1); }} onUploaded={handleFilesSelected}
      year={reqYear} onYearChange={setReqYear}
      client={reqClient}
      publisher={reqPublisher}
      existingBatch={files}
      onRemoveExisting={(idx) => setFiles(files.filter((_, i) => i !== idx))}
      onOpenRecord={onOpenRecord}
      onDuplicateChange={setDuplicateRecord}
    />,
    null,
    <StepValidate key={2} selectedFile={files[0]} files={files} onConfirm={handleSMEConfirm} onBack={() => setStep(0)} defaultName={loggedInUser} isDuplicate={!!duplicateRecord} />,
    null,
    <FileReview
      key={`4-${currentFileIndex}`}
      fileResult={fileResults[currentFileIndex]}
      fileIndex={currentFileIndex}
      duplicateRecord={duplicateRecord}
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
    <ScreenDone     key={6} finalFields={aggregateFields} selectedFile={doneMeta} onTracker={() => onNav('tracker')} onDashboards={(dashId) => onNav('dashboards', dashId)} loggedInUser={loggedInUser} onBack={() => setStep(4)} />,
  ];

  return (
    <>
      <JourneyBar currentStep={STEP_TO_BAR[step] ?? 0} />
      <ErrorBoundary onReset={resetFlow}>
        {screens[step]}
      </ErrorBoundary>
    </>
  );
}
