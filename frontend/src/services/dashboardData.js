// ─── Dashboard aggregation & formatting helpers ──────────────────────────────
// Pure functions over the raw ROIRecord array returned by getRecords().
// No React, no side effects — easy to reason about and test.

/** Real numeric metric fields, with client-facing labels. */
export const METRICS = [
  { key: 'realized_savings',      label: 'Realized Savings' },
  { key: 'identified_risk',       label: 'Identified Risk' },
  { key: 'id_cost_avoidance',     label: 'Identified Cost Avoidance' },
  { key: 'acc_cost_avoidance',    label: 'Accomplished Cost Avoidance' },
  { key: 'id_cost_optimization',  label: 'Identified Cost Optimization' },
  { key: 'acc_cost_optimization', label: 'Accomplished Cost Optimization' },
  { key: 'contract_spend',        label: 'Contract Spend' },
];

/** Friendly label for a metric key (falls back to the key itself). */
export const labelFor = (key) => (METRICS.find(m => m.key === key) || {}).label || key;

/** A finite number, or null for missing/garbage values. */
function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Derive filter option lists from the records actually present. */
export function deriveOptions(records) {
  const clients    = [...new Set(records.map(r => r.client).filter(Boolean))].sort();
  const publishers = [...new Set(records.map(r => r.publisher).filter(Boolean))].sort();
  const years      = [...new Set(records.map(r => r.year).filter(Boolean))].sort((a, b) => b - a);
  return { clients, publishers, years };
}

/** Sum a numeric field across records, ignoring nulls/non-numbers. */
export function sum(records, key) {
  return records.reduce((acc, r) => acc + (num(r[key]) || 0), 0);
}

/** How many records actually carry a value for this metric. */
export function countWithMetric(records, key) {
  return records.reduce((n, r) => n + (num(r[key]) != null ? 1 : 0), 0);
}

/**
 * Format a dollar amount as $2.1M / $740K / $0.
 * Returns '—' for null/NaN so callers never render NaN.
 */
export function formatCurrency(n) {
  const v = num(n);
  if (v == null) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}

/**
 * Filter records by client / publishers / years.
 * Pass `null` (or omit) for a dimension to mean "no filter / all".
 * `publishers` and `years` are arrays of allowed values when present.
 */
export function matchFilters(records, { client = null, publishers = null, years = null } = {}) {
  return records.filter(r => {
    if (client && r.client !== client) return false;
    if (Array.isArray(publishers) && !publishers.includes(r.publisher)) return false;
    if (Array.isArray(years) && !years.includes(r.year)) return false;
    return true;
  });
}

/**
 * Group records by a field and sum a metric within each group.
 * Empty/missing group values bucket into "Unassigned".
 * Returns [{ label, value }] sorted by value descending.
 */
export function groupSum(records, groupKey, metricKey) {
  const map = new Map();
  for (const r of records) {
    const raw = r[groupKey];
    const label = (raw === '' || raw == null) ? 'Unassigned' : String(raw);
    map.set(label, (map.get(label) || 0) + (num(r[metricKey]) || 0));
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
