// Delivery-hub integration — browser-mediated, no tokens.
//
// On Alfred both apps share one origin: this app is /app/roi-prototype/ and
// the hub is /app/delivery-hub/. The user's Alfred session cookie
// authenticates hub calls, and the gateway injects their X-Alfred-User-*
// headers — so hub RBAC and audit see the real user. App-to-app device
// tokens are NOT needed for this.
//
// In local dev the vite proxy maps /hub -> the hub backend (localhost:3501).
const onAlfred = import.meta.env.BASE_URL.startsWith('/app/');
export const HUB_BASE = onAlfred ? '/app/delivery-hub/v1' : '/hub/v1';

async function hubFetch(path, options = {}) {
  const res = await fetch(`${HUB_BASE}${path}`, {
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Not authorized on the delivery hub (check your hub workspace access).');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Hub ${options.method || 'GET'} ${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * What the signed-in user may do with ROI, per the hub's RBAC.
 * The hub is the single authority — it enforces the same answer server-side on
 * /v1/roi/extract (roster role) and /v1/roi/save (Status View edit).
 * Returns null when the hub can't be reached, so the UI can fail open locally
 * rather than locking a developer out.
 */
export async function getRoiAccess() {
  try {
    return await hubFetch('/roi/access');
  } catch (e) {
    console.warn('[hub] could not resolve ROI access:', e.message);
    return null;
  }
}

/** Hub client scopes as {id, name}. Uses /v1/sows because its `id` is the
 * client_scopes.id key that both the deliverables listing and roi/save
 * expect (client-scope-ids returns pathfinder ids — a different key). */
export async function getHubClientScopes() {
  const rows = await hubFetch('/sows');
  return rows
    .map((r) => ({
      id: r.id,
      name: r.client_scope_name || r.id,
      pathfinder_id: r.client_scope_pathfinder_id || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Deliverables belonging to a hub client scope. */
export function getHubDeliverables(scopeId) {
  return hubFetch(`/sows/${encodeURIComponent(scopeId)}/deliverables`);
}

/**
 * Push a reviewed ROI record into the hub's roi_metrics table.
 * The hub's SaveRoiRequest accepts this app's field names directly via
 * serde aliases (id_cost_avoidance, realized_savings, elevate_deliverable, …).
 */
export function saveRoiToHub(record, { deliverableId, clientScopeId }) {
  const payload = {
    deliverable_id: deliverableId,
    client_scope_id: String(clientScopeId),
    // Our own key, so the hub row can be traced back to this extraction and its
    // audit trail. The hub stores it as roi_metrics.source_record_id.
    record_id: record.record_id ?? null,

    year: record.year != null ? Number(record.year) : null,
    client: record.client ?? null,
    publisher: record.publisher ?? null,
    currency: record.currency ?? null,

    identified_risk: record.identified_risk ?? null,
    id_cost_avoidance: record.id_cost_avoidance ?? null,
    acc_cost_avoidance: record.acc_cost_avoidance ?? null,
    id_cost_optimization: record.id_cost_optimization ?? null,
    acc_cost_optimization: record.acc_cost_optimization ?? null,
    realized_savings: record.realized_savings ?? null,
    contract_spend: record.contract_spend ?? null,

    pricing_available: record.pricing_available != null ? String(record.pricing_available) : null,
    notes: record.notes ?? null,
    elevate_deliverable: record.elevate_deliverable ?? null,

    confidence: record.confidence != null ? Math.round(Number(record.confidence)) : null,
    source_file: record.source_file || record.stored_name || null,
    field_meta: record.field_meta ?? null,
    executive_summary: record.executive_summary ?? null,
  };
  return hubFetch('/roi/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
