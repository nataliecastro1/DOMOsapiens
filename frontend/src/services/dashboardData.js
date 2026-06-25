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

// ─── Storytelling aggregations ───────────────────────────────────────────────
// Shared math for the richer dashboard visuals (ROI journey, trend, contribution).
// Used identically by the in-app preview and the exported HTML so the two stay in sync.

/**
 * Sum a metric by calendar year, in CHRONOLOGICAL (ascending) order.
 * Unlike groupSum, records without a real numeric year are dropped — a time
 * axis needs actual years, not an 'Unassigned' bucket.
 * Returns [{ year, value }].
 */
export function yearSeries(records, metricKey) {
  const map = new Map();
  for (const r of records) {
    const yr = num(r.year);
    if (yr == null) continue;
    map.set(yr, (map.get(yr) || 0) + (num(r[metricKey]) || 0));
  }
  return [...map.entries()]
    .map(([year, value]) => ({ year, value }))
    .sort((a, b) => a.year - b.year);
}

/**
 * Annotate a yearSeries with year-over-year change.
 * deltaPct is null for the first point and whenever the prior value is 0
 * (avoids Infinity/NaN). deltaDir is 'up' | 'down' | 'flat' | null.
 * Returns [{ year, value, deltaPct, deltaDir }].
 */
export function yearDeltas(series) {
  return series.map((point, i) => {
    if (i === 0) return { ...point, deltaPct: null, deltaDir: null };
    const prev = series[i - 1].value;
    if (!(prev > 0)) {
      return { ...point, deltaPct: null, deltaDir: point.value > prev ? 'up' : point.value < prev ? 'down' : 'flat' };
    }
    const deltaPct = Math.round(((point.value - prev) / prev) * 100);
    const deltaDir = deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'flat';
    return { ...point, deltaPct, deltaDir };
  });
}

// Which metric keys roll up into each stage of the Identified → Accomplished →
// Realized pipeline. Edit here to include/exclude a metric from the journey.
const JOURNEY_STAGES = [
  { key: 'identified',   label: 'Identified',   metrics: ['id_cost_avoidance', 'id_cost_optimization', 'identified_risk'] },
  { key: 'accomplished', label: 'Accomplished', metrics: ['acc_cost_avoidance', 'acc_cost_optimization'] },
  { key: 'realized',     label: 'Realized',     metrics: ['realized_savings'] },
];

/**
 * Totals for the value pipeline. Always returns the 3 stages in order, even
 * when a stage is 0, so callers decide visibility.
 * `count` = records contributing any non-null value to the stage.
 * Returns [{ key, label, value, count }].
 */
export function journeyStages(records) {
  return JOURNEY_STAGES.map(({ key, label, metrics }) => {
    const value = metrics.reduce((acc, m) => acc + sum(records, m), 0);
    const count = records.reduce(
      (n, r) => n + (metrics.some(m => num(r[m]) != null) ? 1 : 0),
      0,
    );
    return { key, label, value, count };
  });
}

/**
 * Realization ratios between pipeline stages, as 0–1 fractions.
 * Any ratio whose denominator is <= 0 is null (divide-by-zero guard).
 * `accToId` is the headline realization rate.
 */
export function realizationRate(stages) {
  const by = Object.fromEntries(stages.map(s => [s.key, s.value]));
  const ratio = (numer, denom) => (denom > 0 ? numer / denom : null);
  return {
    accToId:  ratio(by.accomplished, by.identified),
    realToAcc: ratio(by.realized, by.accomplished),
    realToId:  ratio(by.realized, by.identified),
  };
}

/**
 * Annotate groupSum output with each row's share of the total and flag the top
 * contributor. `pct` is unrounded (round at render). When the total is <= 0 all
 * pct are 0 and nothing is flagged top.
 * Returns [{ label, value, pct, isTop }].
 */
export function withPercent(chartData) {
  const total = chartData.reduce((acc, d) => acc + (num(d.value) || 0), 0);
  let topIdx = -1;
  chartData.forEach((d, i) => { if (d.value > 0 && (topIdx < 0 || d.value > chartData[topIdx].value)) topIdx = i; });
  return chartData.map((d, i) => ({
    ...d,
    pct: total > 0 ? (d.value / total) * 100 : 0,
    isTop: i === topIdx,
  }));
}

/**
 * Format a 0–1 fraction as a percent string: 0.63 → '63%'.
 * With { signed: true }: 0.12 → '+12%', -0.12 → '-12%'.
 * null/NaN → '—'.
 */
export function formatPct(fraction, { signed = false } = {}) {
  const v = num(fraction);
  if (v == null) return '—';
  const pct = Math.round(v * 100);
  return signed && pct > 0 ? `+${pct}%` : `${pct}%`;
}
