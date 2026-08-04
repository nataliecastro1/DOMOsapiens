import { withHubContext } from './hubContext';

// API base derived from Vite's base URL: '/' in local dev (the vite proxy
// forwards /api → localhost:3599), '/app/roi-prototype/' on Alfred (the
// gateway strips that prefix before forwarding, so the backend sees /api).
// Root-relative '/api' would hit Alfred's own platform API — never that.
export const BASE = `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, '/');

export async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

/**
 * Search local documents folder by client, year, publisher.
 * Returns { files: [...], total: N }
 */
export async function searchDocuments({ client = '', year = '', publisher = '' } = {}) {
  const params = new URLSearchParams({ client, year, publisher });
  return get(`/documents/search?${params}`);
}

/**
 * Extract ROI data from a local document file (selected from search results).
 * file_path is the path returned by searchDocuments.
 */
export async function extractFromFile(fileRef) {
  // fileRef can be a string path (from search results) or
  // an object with { id, stored_name, path } (from uploaded file)
  if (typeof fileRef === 'string') {
    return post('/extract', { file_path: fileRef });
  }
  return post('/extract', {
    file_path:   fileRef.path        || '',
    file_id:     fileRef.id          || '',
    stored_name: fileRef.stored_name || '',
  });
}

/**
 * Extract ROI data by sending raw document text to the backend.
 * Used by ScreenExtract in ExtractionView.
 */
export async function extractROI(documentText) {
  return post('/extract/text', { text: documentText });
}

/**
 * Extract ROI data from a file the user uploaded manually.
 * file is a browser File object.
 */
export async function extractFromUpload(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${BASE}/extract/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload extraction failed: ${res.status}`);
  return res.json();
}

/** Save an extracted ROI record to the tracker (upserts by source_file). */
export async function saveRecord(record) {
  // Carry the hub's deliverable/workstream references onto every record saved
  // in a session that started from the Status View ROI button.
  return post('/records', withHubContext(record));
}

/** Return all saved ROI records. */
export async function getRecords() {
  return get('/records');
}

/**
 * Return the field catalog — per-field label, type, notes, and the
 * ui_visible / editable / exportable / provenance flags. Single source of
 * truth for the Tracker columns and tooltips (backend models/field_catalog.py).
 */
export async function getFields() {
  return get('/fields');
}

/**
 * Apply a partial edit to a stored record. `changes` is a map of
 * { field_name: new_value }; `user` and `note` are logged to the audit trail.
 * Each changed field becomes one immutable audit event server-side.
 */
export async function updateRecord(recordId, { changes, user = '', note = '' }) {
  const res = await fetch(`${BASE}/records/${recordId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes, user, note }),
  });
  if (!res.ok) throw new Error(`PATCH /records/${recordId} failed: ${res.status}`);
  return res.json();
}

/** Return the append-only audit event history for one record (oldest-first). */
export async function getRecordAudit(recordId) {
  return get(`/records/${recordId}/audit`);
}

/** Return the full append-only audit event history across all records. */
export async function getAuditLog() {
  return get('/audit-log');
}

/** Download all records as an XLSX file. */
export async function downloadRecordsAsXlsx() {
  const url = `${BASE}/records/export.xlsx`;
  window.location.href = url;
}

/** Generate an executive summary via Claude for the given extraction data. */
export async function generateExecutiveSummary(data) {
  return post('/executive-summary', data);
}

/** Augment an existing summary with additional user-provided text via Claude. */
export async function augmentExecutiveSummary(data) {
  return post('/executive-summary/augment', data);
}

/** Check an uploaded file for red flags (draft/copy/version, client+publisher match). */
export async function checkUpload(storedName, { client = '', publisher = '', year = '', original_filename = '' } = {}) {
  const params = new URLSearchParams({ client, publisher, year, original_filename });
  return get(`/uploads/${encodeURIComponent(storedName)}/check?${params}`);
}

/** Extract year and text snippet from the first slide/page of an uploaded file. */
export async function getSlideMeta(storedName) {
  return get(`/uploads/${encodeURIComponent(storedName)}/slide-meta`);
}

/** Delete a record permanently. reason must be 'duplicate' or 'error'. */
export async function deleteRecord(recordId, reason) {
  const res = await fetch(`${BASE}/records/${recordId}?reason=${encodeURIComponent(reason)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.detail || `DELETE failed: ${res.status}`);
  }
  return res.json();
}

/** Save a generated executive summary onto an existing record.
 *  identifier can be a record_id, stored_name, or source_file. */
export async function saveExecutiveSummary(identifier, executive_summary) {
  const res = await fetch(`${BASE}/records/executive-summary`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, source_file: identifier, executive_summary }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(`PATCH executive-summary failed: ${res.status} — ${detail?.detail || ''}`);
  }
  return res.json();
}

/** Return the client roster (sorted names) for the dropdown. */
export async function getClients() {
  return get('/clients');
}

/**
 * Add a new client to the roster.
 * Returns { name: <canonical name>, clients: <updated sorted name list> }.
 */
export async function addClient(name) {
  return post('/clients', { name });
}

/**
 * Upload a source document (PPTX/PDF/XLSX) via multipart/form-data.
 * Returns the stored file's metadata { id, filename, size, content_type, uploaded_at }.
 */
export async function uploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/uploads`, { method: 'POST', body: form });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `Upload failed: ${res.status}`);
  }
  return res.json();
}

/** Delete a raw uploaded file from the server once extraction is complete. */
export async function deleteUpload(storedName) {
  await fetch(`${BASE}/uploads/${encodeURIComponent(storedName)}`, { method: 'DELETE' })
    .catch(() => {});  // best-effort — never throw
}

/**
 * Export the Value at a Glance view as a self-contained HTML file.
 * payload: { period, client, rows, total } — raw numeric values.
 */
export async function exportValueAtAGlanceHtml(payload) {
  const res = await fetch(`${BASE}/export/value-at-a-glance.html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `HTML export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const slug = (payload.client || 'Value_at_a_Glance').replace(/\s+/g, '_');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `${slug}_Value_at_a_Glance.html`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Export the Value at a Glance view as a PowerPoint slide (.pptx).
 * payload: { period, client, rows, total } — raw numeric values.
 */
export async function exportValueAtAGlancePptx(payload) {
  const res = await fetch(`${BASE}/export/value-at-a-glance.pptx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `PPTX export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const slug = (payload.client || 'Value_at_a_Glance').replace(/\s+/g, '_');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `${slug}_Value_at_a_Glance.pptx`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Export the Lifetime Value slide as a branded self-contained HTML file.
 * Triggers a file download; payload must match LifetimeValueExportRequest.
 */
export async function exportLifetimeValueHtml(payload) {
  const res = await fetch(`${BASE}/export/lifetime-value.html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `HTML export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const filename = `${(payload.client || 'Lifetime_Value').replace(/\s+/g, '_')}_Lifetime_Value.html`;
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Export the Lifetime Value slide as a PowerPoint file (.pptx).
 * Triggers a file download; payload must match LifetimeValueExportRequest.
 */
export async function exportLifetimeValuePptx(payload) {
  const res = await fetch(`${BASE}/export/lifetime-value.pptx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `PPTX export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const filename = `${(payload.client || 'Lifetime_Value').replace(/\s+/g, '_')}_Lifetime_Value.pptx`;
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Bulk-import ROI records from an XLSX or CSV file.
 * The server streams SSE progress events; XHR reads them progressively.
 *   onUploadProgress(ratio 0–1)  – fires while the file is being sent
 *   onProcessEvent(event)        – fires for each SSE event during processing
 *     event types: "start" | "sheet_start" | "progress" | "sheet_done" | "done" | "error"
 * Resolves with the final { batch_id, imported, flagged, sheets, errors } payload.
 */
export function bulkImport(file, onUploadProgress, onProcessEvent) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/bulk-import`);

    if (onUploadProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onUploadProgress(e.loaded / e.total);
      });
      xhr.upload.addEventListener('load', () => onUploadProgress(1));
    }

    // Parse SSE events from the portion of responseText not yet read
    let cursor = 0;
    function parseNewEvents() {
      const newText = xhr.responseText.slice(cursor);
      cursor = xhr.responseText.length;
      for (const line of newText.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try { onProcessEvent?.(JSON.parse(line.slice(6))); } catch { /* malformed chunk */ }
      }
    }

    // readyState 3 = LOADING (response body arriving but not complete)
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3 || xhr.readyState === 4) parseNewEvents();
    };

    xhr.onload = () => {
      parseNewEvents(); // flush any remaining
      // Scan full response for done/error events
      let finalResult = null;
      for (const line of xhr.responseText.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.type === 'error') { reject(new Error(ev.detail || 'Bulk import failed')); return; }
          if (ev.type === 'done')  { finalResult = ev; }
        } catch {}
      }
      if (finalResult) {
        resolve(finalResult);
      } else {
        let body; try { body = JSON.parse(xhr.responseText); } catch { body = null; }
        reject(new Error(body?.detail || `Bulk import failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Bulk import failed: network error'));
    xhr.send(form);
  });
}

/**
 * Delete all records from a bulk import batch (undo).
 * Returns { deleted: N, batch_id }.
 */
export async function undoBulkImport(batchId) {
  const res = await fetch(`${BASE}/bulk-import/${encodeURIComponent(batchId)}`, { method: 'DELETE' });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `Undo failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Run the deterministic ROAR script extractor on an uploaded .pptx.
 * `file` is a browser File object. Returns the full extractor result
 * (client, publisher, month, year, currency, roi_fields{…}, warnings).
 */
export async function extractROAR(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/roar/extract`, { method: 'POST', body: form });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `ROAR extraction failed: ${res.status}`);
  }
  return res.json();
}
