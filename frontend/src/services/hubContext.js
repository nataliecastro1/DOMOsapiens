// Context handed over when the wizard is opened from the delivery hub's
// Status View ROI button (see the hub's src/lib/roiWizard.ts).
//
// The hub deep-links with ?scope_id=&deliverable_id=&pathfinder_id=&workstream=
// so a finished extraction can be traced back to the exact deliverable, and the
// push to /v1/roi/save can target the right row without the user re-picking it.
//
// Read once at startup and cached, then the query string is cleaned up so a
// refresh doesn't look like a fresh handoff.

let cached = null;

function parse() {
  const p = new URLSearchParams(window.location.search);
  const deliverableId = p.get('deliverable_id');
  const scopeId = p.get('scope_id');
  if (!deliverableId && !scopeId) return null;
  return {
    hub_scope_id: scopeId || null,
    hub_deliverable_id: deliverableId ? Number(deliverableId) : null,
    hub_deliverable_name: p.get('deliverable_name') || null,
    hub_pathfinder_id: p.get('pathfinder_id') || null,
    workstream: p.get('workstream') || null,
    client: p.get('client') || null,
  };
}

/** The hub handoff for this session, or null when opened directly. */
export function getHubContext() {
  if (cached === null) {
    cached = parse() || false;
    if (cached) {
      // Keep it for the session but drop it from the URL — a reload should not
      // re-apply a stale handoff, and the params clutter the address bar.
      try {
        sessionStorage.setItem('roi_hub_context', JSON.stringify(cached));
        window.history.replaceState({}, '', window.location.pathname);
      } catch {}
    } else {
      try {
        const saved = sessionStorage.getItem('roi_hub_context');
        if (saved) cached = JSON.parse(saved);
      } catch {}
    }
  }
  return cached || null;
}

/** Attach the hub references to a record before it is saved. */
export function withHubContext(record) {
  const ctx = getHubContext();
  if (!ctx) return record;
  return {
    ...record,
    hub_scope_id: ctx.hub_scope_id,
    hub_deliverable_id: ctx.hub_deliverable_id,
    hub_deliverable_name: ctx.hub_deliverable_name,
    hub_pathfinder_id: ctx.hub_pathfinder_id,
    workstream: ctx.workstream,
  };
}

export function clearHubContext() {
  cached = false;
  try {
    sessionStorage.removeItem('roi_hub_context');
  } catch {}
}
