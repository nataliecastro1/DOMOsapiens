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
