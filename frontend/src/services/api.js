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
