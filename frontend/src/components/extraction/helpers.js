import { EXTRACTED_FIELDS } from '../../data';

function parseDollar(str) {
  if (!str) return NaN;
  return parseFloat(String(str).replace(/[$,\s]/g, ''));
}

// Format a number as a dollar string, e.g. 42000 → "$42,000"
// Negative results are shown as "-$42,000"
function formatDollar(n) {
  if (isNaN(n) || n === 0) return null;
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return (n < 0 ? '-' : '') + '$' + formatted;
}

// ─── Batch aggregation helpers ────────────────────────────────────────────────
// Canonical field schema (label + variant) used to build the aggregate row.
const CANON_FIELDS = EXTRACTED_FIELDS.map(f => ({ label: f.label, variant: f.variant }));

// Sum each ROI field across every non-excluded file in the batch. A field that
// was skipped (or absent) in a file contributes 0; a field skipped in EVERY
// file stays skipped in the aggregate rather than showing a misleading $0.
function aggregateFinalFields(results) {
  const active = results.filter(r => !r.excluded && r.finalFields && r.finalFields.length);
  if (active.length === 0) return BLANK_FIELDS;
  if (active.length === 1) return active[0].finalFields;   // single file → its own values verbatim
  return CANON_FIELDS.map(({ label, variant }) => {
    let sum = 0, anyValue = false;
    active.forEach(r => {
      const f = r.finalFields.find(x => x.label === label);
      if (!f || f.flag === 'SME skipped — data not available') return;
      const n = parseDollar(f.value);
      if (!isNaN(n)) { sum += n; anyValue = true; }
    });
    if (!anyValue) {
      return { label, value: null, confidence: null, variant, source: null, flag: 'SME skipped — data not available', entryMode: null };
    }
    const value = sum === 0 ? '$0' : formatDollar(sum);
    return { label, value, confidence: null, variant, source: `Summed across ${active.length} files`, flag: null, entryMode: 'aggregated' };
  });
}

// Derive the shared client / publisher / year for a batch, flagging when files
// disagree so the Store step can warn before writing a combined record.
function deriveCommonMeta(results) {
  const metas = results.filter(r => !r.excluded).map(r => r.fileMeta || {});
  const distinct = (k, upK) => [...new Set(metas.map(m => m[k] || m[upK] || '').filter(Boolean))];
  const clients = distinct('client', 'upClient');
  const pubs    = distinct('publisher', 'upPublisher');
  const years   = distinct('year', 'upYear');
  return {
    client:      clients.length === 1 ? clients[0] : '',
    publisher:   pubs.length === 1 ? pubs[0] : '',
    year:        years.length === 1 ? years[0] : '',
    mixedClient: clients.length > 1,
    mixedYear:   years.length > 1,
  };
}

// Monetary fields that carry per-field applicability date ranges.
const MONETARY_LABELS = new Set([
  'Identified Risk', 'Identified Cost Avoidance', 'Accomplished Cost Avoidance',
  'Identified Cost Optimization', 'Accomplished Cost Optimization',
  'Realized Cost Savings', 'Annual Publisher Contract',
]);

// Build the flat ROI record the backend expects from a file's meta + fields.
// Canonical UI label → backend model key. Used for BOTH value extraction and
// per-field provenance, so the two always stay in sync.
const LABEL_TO_KEY = {
  'Identified Risk':                'identified_risk',
  'Identified Cost Avoidance':      'id_cost_avoidance',
  'Accomplished Cost Avoidance':    'acc_cost_avoidance',
  'Identified Cost Optimization':   'id_cost_optimization',
  'Accomplished Cost Optimization': 'acc_cost_optimization',
  'Realized Cost Savings':          'realized_savings',
  'Annual Publisher Contract':      'contract_spend',
};

// Build per-field provenance (source slide + confidence + alternates) from the
// script extractor's scriptData map, keyed by backend model field name. Returns
// null when there's no provenance to attach (e.g. aggregate records).
function buildFieldMeta(scriptData) {
  if (!scriptData || typeof scriptData !== 'object') return null;
  const out = {};
  for (const [label, key] of Object.entries(LABEL_TO_KEY)) {
    const s = scriptData[label];
    if (!s) continue;
    if (s.sourceSlide == null && s.confidence == null && !(s.alternates?.length)) continue;
    out[key] = {
      source_slide: s.sourceSlide ?? null,
      confidence:   s.confidence ?? null,
      alternates:   (s.alternates || []).map(a => ({ value: a.value, confidence: a.confidence })),
    };
  }
  return Object.keys(out).length ? out : null;
}

function buildRecord(meta, fields, sme, scriptData = null) {
  const getValue = (label) => {
    const f = fields.find(x => x.label === label);
    const n = parseDollar(f?.value);
    return isNaN(n) ? null : n;
  };
  return {
    client:                meta?.client    || meta?.upClient    || '',
    publisher:             meta?.publisher || meta?.upPublisher || '',
    year:                  parseInt(meta?.year || meta?.upYear || new Date().getFullYear()),
    month:                 meta?.month          || null,
    currency:              meta?.currency         || 'USD',
    date_delivered:        meta?.date_delivered   || null,
    applicable_from:       meta?.applicable_from  || null,
    applicable_to:         meta?.applicable_to    || null,
    identified_risk:       getValue('Identified Risk'),
    id_cost_avoidance:     getValue('Identified Cost Avoidance'),
    acc_cost_avoidance:    getValue('Accomplished Cost Avoidance'),
    id_cost_optimization:  getValue('Identified Cost Optimization'),
    acc_cost_optimization: getValue('Accomplished Cost Optimization'),
    realized_savings:      getValue('Realized Cost Savings'),
    contract_spend:        getValue('Annual Publisher Contract'),
    confidence:            fields.find(x => x.confidence != null)?.confidence ?? null,
    source_file:           meta?.filename || meta?.name || meta?.file_path || '',
    stored_name:           meta?.stored_name || '',
    sme:                   sme || '',
    field_meta:            buildFieldMeta(scriptData),
    field_dates: (() => {
      if (!meta?.fieldDates) return null;
      const entries = Object.entries(meta.fieldDates)
        .filter(([, d]) => d?.from || d?.to)
        .map(([label, d]) => [LABEL_TO_KEY[label], d])
        .filter(([key]) => key);
      return entries.length ? Object.fromEntries(entries) : null;
    })(),
  };
}

// ─── Script extractor (/api/roar/extract) → Compare "Script" column ───────────
// Maps the extractor's roi_fields keys to the canonical Compare labels.
// Note: 'identified_cost_savings' is intentionally omitted — the deterministic
// script extractor does not return it by design (it is not present in standard
// ROAR documents), so there is no key to map here.
const ROAR_KEY_TO_LABEL = {
  identified_risk:                'Identified Risk',
  identified_cost_avoidance:      'Identified Cost Avoidance',
  accomplished_cost_avoidance:    'Accomplished Cost Avoidance',
  identified_cost_optimization:   'Identified Cost Optimization',
  accomplished_cost_optimization: 'Accomplished Cost Optimization',
  realized_cost_savings:          'Realized Cost Savings',
};

// Shape the raw extractor response into { [label]: { value, confidence, uncertain, alternates } }
// for the Compare screen. A field is "uncertain" when the extractor found competing
// candidate values (alternates) — that's what flags the file for SME scrutiny.
function buildScriptData(roar) {
  const fields = roar?.roi_fields || {};
  const out = {};
  for (const [key, label] of Object.entries(ROAR_KEY_TO_LABEL)) {
    const f = fields[key];
    if (!f) continue;
    const alternates = Array.isArray(f.alternates) ? f.alternates : [];
    out[label] = {
      value: formatDollar(f.value),
      confidence: f.confidence,
      uncertain: alternates.length > 0,
      alternates: alternates.map(a => ({ value: formatDollar(a.value), confidence: a.confidence })),
      capacity: f.capacity,
      sourceSlide: f.source_slide,
      raw: f.raw ?? null,
    };
  }
  return out;
}


export { parseDollar, formatDollar, aggregateFinalFields, deriveCommonMeta, buildFieldMeta, buildRecord, buildScriptData, MONETARY_LABELS };

// ─── Blank field template ─────────────────────────────────────────────────────
// The canonical 7 ROI fields with no data — derived from EXTRACTED_FIELDS so the
// field labels and variant colors stay in one place (its schema), but every value
// is nulled. Used as the honest empty state when extraction fails or when a step
// is reached without any extracted data, instead of substituting mock numbers.
const BLANK_FIELDS = EXTRACTED_FIELDS.map(f => ({
  ...f,
  value: null,
  confidence: null,
  source: null,
  flag: null,
  entryMode: null,
}));

const ROI_FIELD_META = {
  'Identified Risk': {
    definition: 'Quantified financial exposure due to non-compliance with software licensing or contractual terms.',
    questions: [
      'Which software publisher(s) or product(s) have a compliance shortfall?',
      'What is the unit cost (price per license)?',
      'How many licenses is the client entitled to per contract?',
      'How many licenses are currently deployed or in use?',
      'What contract period or date does this exposure apply to?',
    ],
    // 'text' | 'currency' | 'number' | 'date'
    questionTypes: ['text', 'currency', 'number', 'number', 'date'],
    formula: 'Calculated as: (Deployed Licenses − Entitled Licenses) × Unit Cost',
    // answers[1]=unitCost  answers[2]=entitled  answers[3]=deployed
    compute(answers) {
      const unitCost  = parseDollar(answers[1]);
      const entitled  = parseFloat(answers[2]);
      const deployed  = parseFloat(answers[3]);
      if (isNaN(unitCost) || isNaN(entitled) || isNaN(deployed)) return null;
      return formatDollar((deployed - entitled) * unitCost);
    },
  },
  'Identified Cost Avoidance': {
    definition: 'Potential unbudgeted costs that can be prevented through proactive compliance. Measurable in avoided liabilities. Client has NOT yet acted.',
    questions: [
      'What over-deployment or compliance gap did you identify that the client could remediate?',
      'How many excess licenses could be removed?',
      'What is the unit cost of those licenses?',
      'Can the client remediate this within their current contract terms?',
    ],
    questionTypes: ['text', 'number', 'currency', 'text'],
    formula: 'Calculated as: Excess Licenses × Unit Cost',
    // answers[1]=excessLicenses  answers[2]=unitCost
    compute(answers) {
      const excess    = parseFloat(answers[1]);
      const unitCost  = parseDollar(answers[2]);
      if (isNaN(excess) || isNaN(unitCost)) return null;
      return formatDollar(excess * unitCost);
    },
  },
  'Accomplished Cost Avoidance': {
    definition: 'The quantified result of actions taken to prevent unbudgeted costs. Requires client action to accomplish.',
    questions: [
      'What action did the client take (e.g. removed deployments, reduced installs)?',
      'How many licenses were removed or remediated?',
      'What is the unit cost of those licenses?',
      'What is the confirmation or evidence of the action taken?',
    ],
    questionTypes: ['text', 'number', 'currency', 'text'],
    formula: 'Calculated as: Remediated Licenses × Unit Cost',
    // answers[1]=remediatedLicenses  answers[2]=unitCost
    compute(answers) {
      const remediated = parseFloat(answers[1]);
      const unitCost   = parseDollar(answers[2]);
      if (isNaN(remediated) || isNaN(unitCost)) return null;
      return formatDollar(remediated * unitCost);
    },
  },
  'Identified Cost Optimization': {
    definition: 'Opportunities to reduce software, hardware, or cloud expenses through license optimization, contract negotiations, or strategic adjustments. Client has NOT yet acted.',
    questions: [
      'What optimization opportunity did you identify?',
      'How many licenses are surplus to actual need?',
      'What is the unit cost or annual contract value of those licenses?',
      'Is a contract mechanism available to right-size (e.g. true-down clause, renewal timing)?',
    ],
    questionTypes: ['text', 'number', 'currency', 'text'],
    formula: 'Calculated as: Surplus Licenses × Unit Cost, or estimated contract delta',
    // answers[1]=surplusLicenses  answers[2]=unitCost
    compute(answers) {
      const surplus   = parseFloat(answers[1]);
      const unitCost  = parseDollar(answers[2]);
      if (isNaN(surplus) || isNaN(unitCost)) return null;
      return formatDollar(surplus * unitCost);
    },
  },
  'Accomplished Cost Optimization': {
    definition: 'Verified cost reductions through renegotiations, contract adjustments, or technology shifts. Requires client action to accomplish.',
    // This field supports two input modes — pick one using the toggle on the form.
    modes: {
      contractValue: {
        label: 'Contract value change',
        questions: [
          'What specific action was taken?',
          'What was the original contract value?',
          'What is the new contract value after the change?',
          'What is the effective date of the change?',
        ],
        questionTypes: ['text', 'currency', 'currency', 'date'],
        formula: 'Calculated as: Original Contract Value − New Contract Value',
        // answers[1]=originalValue  answers[2]=newValue
        compute(answers) {
          const original = parseDollar(answers[1]);
          const newVal   = parseDollar(answers[2]);
          if (isNaN(original) || isNaN(newVal)) return null;
          return formatDollar(original - newVal);
        },
      },
      licenseCount: {
        label: 'License count change',
        questions: [
          'What specific action was taken?',
          'What was the original license count?',
          'What is the new license count after the change?',
          'What is the cost per license?',
          'What is the effective date of the change?',
        ],
        questionTypes: ['text', 'number', 'number', 'currency', 'date'],
        formula: 'Calculated as: (Original Count − New Count) × Cost Per License',
        // answers[1]=originalCount  answers[2]=newCount  answers[3]=costPerLicense
        compute(answers) {
          const original        = parseFloat(answers[1]);
          const newCount        = parseFloat(answers[2]);
          const costPerLicense  = parseDollar(answers[3]);
          if (isNaN(original) || isNaN(newCount) || isNaN(costPerLicense)) return null;
          return formatDollar((original - newCount) * costPerLicense);
        },
      },
    },
  },
  'Identified Cost Savings': {
    definition: 'A hard-dollar reduction opportunity has been identified but not yet realized.',
    questions: [
      'What is the current annual spend for this publisher or product?',
      'What specific mechanism would generate savings?',
      'What is the projected reduced spend if the opportunity is acted upon?',
    ],
    questionTypes: ['currency', 'text', 'currency'],
    formula: 'Calculated as: Current Spend − Projected Spend',
    // answers[0]=currentSpend  answers[2]=projectedSpend
    compute(answers) {
      const current   = parseDollar(answers[0]);
      const projected = parseDollar(answers[2]);
      if (isNaN(current) || isNaN(projected)) return null;
      return formatDollar(current - projected);
    },
  },
  'Realized Cost Savings': {
    definition: 'Hard-dollar savings reflected in budgets or financial statements due to negotiated reductions or decreased expenses.',
    questions: [
      "What was the client's spend for this publisher/product in the prior comparable period?",
      'What is the confirmed spend for this period?',
      'What drove the reduction?',
      'Is this reflected in an invoice, PO, or budget document?',
    ],
    questionTypes: ['currency', 'currency', 'text', 'text'],
    formula: 'Calculated as: Prior Period Spend − Current Period Spend',
    // answers[0]=priorSpend  answers[1]=currentSpend
    compute(answers) {
      const prior   = parseDollar(answers[0]);
      const current = parseDollar(answers[1]);
      if (isNaN(prior) || isNaN(current)) return null;
      return formatDollar(prior - current);
    },
  },
};
// ─── Claude extractor response → canonical 7-field array ──────────────────────
// When no data came back, fall back to the honest blank template (no mock numbers).
function buildClaudeFields(extractedData) {
  if (!extractedData) return BLANK_FIELDS;
  const fmt = (n) => n != null ? `$${Number(n).toLocaleString()}` : null;
  const fallbackConf = extractedData?.overall_confidence ?? extractedData?.confidence ?? null;
  // Support both new per-field format {value, confidence, source} and old flat format
  const fieldVal  = (key) => { const v = extractedData[key]; return (v && typeof v === 'object') ? v.value  : v; };
  const fieldConf = (key) => { const v = extractedData[key]; return (v && typeof v === 'object') ? (v.confidence ?? null) : fallbackConf; };
  const fieldSrc  = (key) => { const v = extractedData[key]; return (v && typeof v === 'object') ? (v.source  ?? null) : null; };
  const fieldSlide= (key) => { const v = extractedData[key]; return (v && typeof v === 'object') ? (v.source_slide ?? null) : null; };
  const entry     = (key) => fieldVal(key) != null ? 'extracted' : null;
  return [
    { label: 'Identified Risk',                value: fmt(fieldVal('identified_risk')),         variant: 'green', confidence: fieldConf('identified_risk'),         source: fieldSrc('identified_risk'),         source_slide: fieldSlide('identified_risk'),         flag: null, entryMode: entry('identified_risk')         },
    { label: 'Identified Cost Avoidance',      value: fmt(fieldVal('id_cost_avoidance')),       variant: 'green', confidence: fieldConf('id_cost_avoidance'),       source: fieldSrc('id_cost_avoidance'),       source_slide: fieldSlide('id_cost_avoidance'),       flag: null, entryMode: entry('id_cost_avoidance')       },
    { label: 'Accomplished Cost Avoidance',    value: fmt(fieldVal('acc_cost_avoidance')),      variant: 'green', confidence: fieldConf('acc_cost_avoidance'),      source: fieldSrc('acc_cost_avoidance'),      source_slide: fieldSlide('acc_cost_avoidance'),      flag: null, entryMode: entry('acc_cost_avoidance')      },
    { label: 'Identified Cost Optimization',   value: fmt(fieldVal('id_cost_optimization')),    variant: 'blue',  confidence: fieldConf('id_cost_optimization'),    source: fieldSrc('id_cost_optimization'),    source_slide: fieldSlide('id_cost_optimization'),    flag: null, entryMode: entry('id_cost_optimization')    },
    { label: 'Accomplished Cost Optimization', value: fmt(fieldVal('acc_cost_optimization')),   variant: 'blue',  confidence: fieldConf('acc_cost_optimization'),   source: fieldSrc('acc_cost_optimization'),   source_slide: fieldSlide('acc_cost_optimization'),   flag: null, entryMode: entry('acc_cost_optimization')   },
    { label: 'Identified Cost Savings',        value: fmt(fieldVal('identified_cost_savings')), variant: 'green', confidence: fieldConf('identified_cost_savings'), source: fieldSrc('identified_cost_savings'), source_slide: fieldSlide('identified_cost_savings'), flag: null, entryMode: entry('identified_cost_savings') },
    { label: 'Realized Cost Savings',          value: fmt(fieldVal('realized_savings')),        variant: 'green', confidence: fieldConf('realized_savings'),        source: fieldSrc('realized_savings'),        source_slide: fieldSlide('realized_savings'),        flag: null, entryMode: entry('realized_savings')        },
  ];
}


export { BLANK_FIELDS, ROI_FIELD_META, buildClaudeFields };
