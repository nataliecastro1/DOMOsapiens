import React, { useState, useEffect, useRef } from 'react';
import ScreenExtract from './ScreenExtract';
import { extractFromFile } from '../../services/api';

// ─── Screen 3 (host): Batch Extract ───────────────────────────────────────────
// Runs the deterministic script extractor + Claude AI across EVERY file in the
// batch up front, on one progress screen. Each file's results are collected and
// handed to the per-file review (Compare) step. A single-file batch behaves like
// the original flow — one file processed, one progress row.
function BatchExtract({ files = [], onComplete }) {
  const [statuses, setStatuses] = useState(() => files.map(() => 'pending'));
  const [done, setDone] = useState(false);
  const resultsRef = useRef([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const results = [];
      for (let i = 0; i < files.length; i++) {
        if (cancelled) return;
        setStatuses(prev => prev.map((s, idx) => idx === i ? 'running' : s));

        const file = files[i];
        let extractedData = null;
        let scriptData = null;
        const tasks = [];

        // Script extractor — only runs when a raw File is available (uploads and
        // folder-scanned files); skipped on the SharePoint-search path.
        let scriptMeta = null;
        if (file?.file) {
          tasks.push(
            extractROAR(file.file)
              .then(roar => {
                scriptData = buildScriptData(roar);
                scriptMeta = {
                  client_scope_name: roar?.client_scope_name || null,
                  applicable_from:   roar?.applicable_from || null,
                  applicable_to:     roar?.applicable_to || null,
                  publisher:         roar?.publisher || null,
                };
              })
              .catch(() => {})
          );
        }

        // Claude AI extractor — pass the whole file object so it can use
        // id / stored_name / path, falling back to the filename.
        const fileRef = (file?.path || file?.id || file?.stored_name) ? file : (file?.name || '');
        tasks.push(
          extractFromFile(fileRef)
            .then(res => { extractedData = res.data || res; })
            .catch(() => {})
        );

        await Promise.all(tasks);
        if (cancelled) return;

        results.push({ fileMeta: file, extractedData, scriptData, scriptMeta });
        setStatuses(prev => prev.map((s, idx) => idx === i ? 'done' : s));
        await new Promise(r => setTimeout(r, 150));
      }
      if (!cancelled) {
        resultsRef.current = results;
        setDone(true);
      }
    }

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!files.length) {
    return (
      <div className="card">
        <div className="card-title">
          <i className="ti ti-cpu" aria-hidden="true" /> ROI Extraction
        </div>
        <p className="extract-sub">No files selected. Go back and choose one or more files to extract.</p>
      </div>
    );
  }

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
          const status = statuses[i];
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

      {done && (
        <div className="btn-row">
          <button className="btn primary" onClick={() => onComplete(resultsRef.current)}>
            Review {files.length > 1 ? `${files.length} Files` : 'File'} <i className="ti ti-arrow-right" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

export default BatchExtract;
