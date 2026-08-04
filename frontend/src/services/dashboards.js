// Saved dashboards — server-backed, with a synchronous read cache.
//
// These used to live in localStorage, which made a saved dashboard invisible to
// colleagues and destroyed it whenever the browser cache was cleared. The server
// is now the source of truth.
//
// The read API stays synchronous (`getDashboards()`) because the views render
// from it directly. `hydrate()` fills the cache once at startup; writes update
// the cache immediately and persist in the background, so the UI never waits on
// a round-trip to feel responsive.
import { BASE } from './api';

const LEGACY_KEY = 'domosapiens.dashboards';

let cache = [];
let hydrated = false;

/** The dashboards known right now. Never returns null. */
export function getDashboards() {
  return cache;
}

export function isHydrated() {
  return hydrated;
}

async function fetchAll() {
  const res = await fetch(`${BASE}/dashboards`);
  if (!res.ok) throw new Error(`Could not load dashboards: ${res.status}`);
  const list = await res.json();
  return Array.isArray(list) ? list : [];
}

/** Dashboards stranded in this browser's localStorage, if any. */
function readLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(d => d && !d.seed) : [];
  } catch {
    return [];
  }
}

/**
 * Load dashboards from the server, adopting anything left in localStorage.
 *
 * The import is keyed by id and skips ids the server already has, so it cannot
 * clobber a dashboard someone has since edited. Once adopted, the local copy is
 * removed — leaving it would be a second, silently diverging source of truth.
 */
export async function hydrate() {
  try {
    const legacy = readLegacy();
    if (legacy.length) {
      try {
        const res = await fetch(`${BASE}/dashboards/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dashboards: legacy }),
        });
        if (res.ok) {
          const { adopted } = await res.json();
          console.info(`[dashboards] adopted ${adopted} dashboard(s) from this browser`);
          localStorage.removeItem(LEGACY_KEY);
        }
      } catch (e) {
        // Keep the local copy so the next load can retry the adoption.
        console.warn('[dashboards] could not adopt local dashboards:', e.message);
      }
    }
    cache = await fetchAll();
    hydrated = true;
  } catch (e) {
    console.warn('[dashboards] could not load from server:', e.message);
    // Fall back to whatever this browser has so the view is not empty.
    cache = readLegacy();
  }
  return cache;
}

async function putOne(dash) {
  const res = await fetch(`${BASE}/dashboards/${encodeURIComponent(dash.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dash),
  });
  if (!res.ok) throw new Error(`PUT ${dash.id} failed: ${res.status}`);
}

async function deleteOne(id) {
  const res = await fetch(`${BASE}/dashboards/${encodeURIComponent(id)}`, { method: 'DELETE' });
  // A 404 means it is already gone, which is the state we wanted.
  if (!res.ok && res.status !== 404) throw new Error(`DELETE ${id} failed: ${res.status}`);
}

/**
 * Replace the dashboard list, persisting the difference.
 *
 * Callers compute the next full list (the shape the old localStorage helper
 * took) and this works out which rows actually changed, so one edit costs one
 * request rather than rewriting every dashboard.
 */
export function syncDashboards(list) {
  const next = (Array.isArray(list) ? list : []).filter(d => d && d.id && !d.seed);
  const previous = cache;
  cache = next;

  const nextIds = new Set(next.map(d => d.id));
  const previousById = new Map(previous.map(d => [d.id, d]));

  const writes = [];
  for (const d of previous) {
    if (!nextIds.has(d.id)) writes.push(deleteOne(d.id));
  }
  for (const d of next) {
    const before = previousById.get(d.id);
    if (!before || JSON.stringify(before) !== JSON.stringify(d)) writes.push(putOne(d));
  }

  // Fire and forget: the cache already reflects the intent, so the UI stays
  // responsive. A failure is surfaced in the console and healed on next load.
  Promise.allSettled(writes).then(results => {
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length) {
      console.warn(`[dashboards] ${failed.length} change(s) did not persist:`,
        failed.map(f => f.reason?.message).join('; '));
    }
  });

  return next;
}

/** Save or replace a single dashboard, returning the updated list. */
export function saveDashboard(dash) {
  const withId = dash.id ? dash : { ...dash, id: `d_${Date.now()}` };
  return syncDashboards([withId, ...cache.filter(d => d.id !== withId.id)]);
}

/** Remove one dashboard, returning the updated list. */
export function removeDashboard(id) {
  return syncDashboards(cache.filter(d => d.id !== id));
}
