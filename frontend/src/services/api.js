const BASE = '/api';

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
 * Send document text to the backend, which calls Claude via Alfred proxy.
 * Returns extracted ROI fields.
 */
export async function extractROI(documentText) {
  return post('/extract', { document_text: documentText });
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
