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

// ─── Dashboard element catalog ───────────────────────────────────────────────
// A dashboard is now an ORDERED list of "elements". Each element is one of:
//   • a numeric ROI metric  → id "metric:<key>"   (renders as a summary card)
//   • an executive-summary field → id "summary:<field>"
//   • a chart                → id "chart:<journey|bar|trend>"
// The order the user picks them is the order they appear on the dashboard, so a
// summary can sit above, below, or between the charts. Summary text fields carry
// a short/long variant. The catalog below is the single source of truth shared
// by the builder UI, the live preview, and the HTML export.

/** Numeric metric elements — one per METRIC, in METRICS order. */
export const NUMERIC_ELEMENTS = METRICS.map(m => ({ id: `metric:${m.key}`, key: m.key, label: m.label }));

/**
 * Executive-summary field elements.
 *  type 'text'       → single paragraph (overview)
 *  type 'list'       → bulleted narrative list
 *  type 'metrics'    → label/value/context cards (key_metrics)
 *  type 'highlights' → headline label/value cards
 * `variantable` fields support a short/long toggle.
 */
export const SUMMARY_ELEMENTS = [
  { id: 'summary:overview',            field: 'overview',            label: 'Overview',            type: 'text',       variantable: true  },
  { id: 'summary:key_accomplishments', field: 'key_accomplishments', label: 'Key Accomplishments', type: 'list',       variantable: true  },
  { id: 'summary:recommendations',     field: 'recommendations',     label: 'Recommendations',     type: 'list',       variantable: true  },
  { id: 'summary:primary_risks',       field: 'primary_risks',       label: 'Primary Risks',       type: 'list',       variantable: true  },
  { id: 'summary:market_risks',        field: 'market_risks',        label: 'Market Risks',        type: 'list',       variantable: true  },
  { id: 'summary:additional_insights', field: 'additional_insights', label: 'Additional Insights', type: 'list',       variantable: true  },
  { id: 'summary:next_steps',          field: 'next_steps',          label: 'Next Steps',          type: 'list',       variantable: true  },
  { id: 'summary:key_metrics',         field: 'key_metrics',         label: 'Summary Metrics',     type: 'metrics',    variantable: false },
  { id: 'summary:highlights',          field: 'highlights',          label: 'Highlights',          type: 'highlights', variantable: false },
];

/** Chart elements. */
export const CHART_ELEMENTS = [
  { id: 'chart:journey', key: 'journey', label: 'ROI Journey' },
  { id: 'chart:bar',     key: 'bar',     label: 'Comparison Bars' },
  { id: 'chart:trend',   key: 'trend',   label: 'Year Trend' },
];

export const ELEMENT_CATALOG = [...NUMERIC_ELEMENTS, ...SUMMARY_ELEMENTS, ...CHART_ELEMENTS];

/** Look up a catalog entry by full id ("metric:realized_savings"). */
export const elementById = (id) => ELEMENT_CATALOG.find(e => e.id === id);

/** Split an element id into { kind, key }, e.g. "summary:overview" → {summary, overview}. */
export function parseElementId(id) {
  const i = String(id).indexOf(':');
  return i === -1 ? { kind: id, key: '' } : { kind: id.slice(0, i), key: id.slice(i + 1) };
}

/** Does this element support a short/long variant? */
export const isVariantable = (id) => Boolean(elementById(id)?.variantable);

/**
 * Group an ordered element list into render blocks: consecutive numeric-metric
 * elements collapse into one grid block; every other element is its own block.
 * Order is preserved. Returns [{ type:'metrics', items:[...] } | { type, el }].
 */
export function groupElements(selElements) {
  const blocks = [];
  for (const e of (selElements || [])) {
    const { kind } = parseElementId(e.id);
    if (kind === 'metric') {
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'metrics') last.items.push(e);
      else blocks.push({ type: 'metrics', items: [e] });
    } else {
      blocks.push({ type: kind, el: e });
    }
  }
  return blocks;
}

// ─── Executive-summary content extraction ────────────────────────────────────

// Narrative list sections — used to validate a summary has real content.
const INSIGHT_SECTIONS = ['key_accomplishments', 'recommendations', 'primary_risks',
  'market_risks', 'additional_insights', 'next_steps'];

/**
 * Is this a real, populated summary — not the empty/placeholder junk a record
 * can carry (e.g. `{ "test": true }`)? Requires a non-empty overview or at
 * least one populated narrative list.
 */
export function isValidSummary(s) {
  if (!s || typeof s !== 'object') return false;
  if (typeof s.overview === 'string' && s.overview.trim()) return true;
  return INSIGHT_SECTIONS.some(key => Array.isArray(s[key]) && s[key].some(x => typeof x === 'string' && x.trim()));
}

/** Truncate to a word boundary near `max` chars, adding an ellipsis. */
export function truncate(text, max = 160) {
  const t = String(text).trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:]+$/, '')}…`;
}

// First sentence of a paragraph (for the 'short' overview), falling back to a
// truncation when no sentence boundary is found.
function firstSentence(t) {
  const m = String(t).trim().match(/^.*?[.!?](\s|$)/);
  return m ? m[0].trim() : truncate(t, 200);
}

// Sort key for "most recent" — date_delivered when present, else saved_at.
function deliveredAt(r) {
  return r.date_delivered || r.saved_at || '';
}

/**
 * The most-recently-delivered matched record that carries a valid summary.
 * Per product decision, every summary element draws from this one engagement.
 * Returns { summary, source, count } or null.
 */
export function mostRecentSummary(records) {
  const withSummary = (records || [])
    .filter(r => isValidSummary(r.executive_summary))
    .sort((a, b) => String(deliveredAt(b)).localeCompare(String(deliveredAt(a))));
  if (!withSummary.length) return null;
  const r = withSummary[0];
  return {
    summary: r.executive_summary,
    source: [r.client, r.publisher, r.year].filter(Boolean).join(' · '),
    count: withSummary.length,
  };
}

/**
 * Render-ready content for one summary field at the given variant, or null when
 * the field is empty/absent. Shapes by field type:
 *   text       → { text }
 *   list       → { items: [string] }   (short = single top item; long = full)
 *   metrics    → { metrics: [{label,value,context}] }
 *   highlights → { highlights: [{label,value}] }
 * Short list picks the highest-signal item ($-bearing if any), truncated.
 */
export function summaryFieldContent(summary, field, variant = 'short') {
  if (!summary) return null;
  const def = SUMMARY_ELEMENTS.find(e => e.field === field);
  if (!def) return null;
  const raw = summary[field];

  if (def.type === 'text') {
    const t = typeof raw === 'string' ? raw.trim() : '';
    if (!t) return null;
    return { text: variant === 'long' ? t : firstSentence(t) };
  }
  if (def.type === 'list') {
    const items = (Array.isArray(raw) ? raw : []).filter(x => typeof x === 'string' && x.trim());
    if (!items.length) return null;
    if (variant === 'long') return { items: items.map(x => x.trim()) };
    const top = items.find(x => x.includes('$')) || items[0];
    return { items: [truncate(top)] };
  }
  if (def.type === 'metrics') {
    const metrics = (Array.isArray(raw) ? raw : [])
      .filter(m => m && (m.label || m.value))
      .map(m => ({ label: m.label || '', value: String(m.value ?? ''), context: m.context || '' }));
    return metrics.length ? { metrics } : null;
  }
  if (def.type === 'highlights') {
    const highlights = (Array.isArray(raw) ? raw : [])
      .filter(h => h && (h.label || h.value))
      .map(h => ({ label: h.label || '', value: String(h.value ?? '') }));
    return highlights.length ? { highlights } : null;
  }
  return null;
}

/**
 * Migrate a saved dashboard config to the ordered-element model. Configs saved
 * before this feature carry `selMetrics` (a key array) but no `selElements`.
 */
export function normalizeElements(cfg) {
  if (Array.isArray(cfg?.selElements) && cfg.selElements.length) return cfg.selElements;
  if (Array.isArray(cfg?.selMetrics) && cfg.selMetrics.length) {
    return cfg.selMetrics.map(k => ({ id: `metric:${k}` }));
  }
  return null;
}
