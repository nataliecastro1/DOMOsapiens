const BASE = 'http://localhost:8000/api';

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
  return post('/records', record);
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
export async function checkUpload(storedName, { client = '', publisher = '', original_filename = '' } = {}) {
  const params = new URLSearchParams({ client, publisher, original_filename });
  return get(`/uploads/${encodeURIComponent(storedName)}/check?${params}`);
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
