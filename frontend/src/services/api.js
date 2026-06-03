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
export async function extractFromFile(filePath) {
  return post('/extract', { file_path: filePath });
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
