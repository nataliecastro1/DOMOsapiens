// Which publishers the delivery hub's workstream may report ROI against.
//
// The hub hands us a workstream (its team) on the deep link; ROI is stored per
// publisher. This resolves one to the other so the SME picks a real publisher
// instead of free-typing a value that won't group in the dashboards.
import { BASE } from './api';

const EMPTY = { workstream: '', mapped: false, publishers: [] };

/**
 * Allowed publishers for a workstream, as
 * { workstream, mapped, publishers: [{ publisher, is_default }] }.
 *
 * `mapped: false` means no explicit mapping exists and `publishers` is every
 * publisher already in use — the caller should let the user choose freely
 * rather than constraining them to a guess.
 */
export async function getAllowedPublishers(workstream) {
  const name = (workstream || '').trim();
  try {
    if (name) {
      const res = await fetch(`${BASE}/workstreams/${encodeURIComponent(name)}/publishers`);
      if (res.ok) return await res.json();
    }
    const res = await fetch(`${BASE}/publishers`);
    if (!res.ok) return { ...EMPTY, workstream: name };
    const list = await res.json();
    return {
      workstream: name,
      mapped: false,
      publishers: (list || []).map(p => ({ publisher: p, is_default: false })),
    };
  } catch {
    // The picker degrades to a plain text field rather than blocking review.
    return { ...EMPTY, workstream: name };
  }
}

/** Every workstream → publisher mapping, grouped by workstream. */
export async function getWorkstreamMappings() {
  const res = await fetch(`${BASE}/workstreams`);
  if (!res.ok) throw new Error(`Could not load workstream mappings: ${res.status}`);
  return res.json();
}

/** Replace a workstream's allow-list. An empty list clears the mapping. */
export async function setWorkstreamPublishers(workstream, publishers, defaultPublisher = null) {
  const res = await fetch(`${BASE}/workstreams/${encodeURIComponent(workstream)}/publishers`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publishers, default: defaultPublisher }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Could not save mapping: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}
