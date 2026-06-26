import React from 'react';

const ITEMS = [
  {
    icon: 'ti-report-analytics',
    title: 'Running an extraction',
    sub: 'Request → select file → SME validates → extract → store. Each step is logged automatically. Flagged SME decisions are recorded but do not proceed to extraction — the SME must re-select a file.',
  },
  {
    icon: 'ti-shield-check',
    title: 'SME audit trail',
    sub: 'Every store and every later edit is appended to an immutable audit log (old value → new value, who, when, and a note). Nothing is overwritten, so each record keeps a full change history.',
  },
  {
    icon: 'ti-edit',
    title: 'Editing stored values',
    sub: 'Some ROI fields aren’t known until later. Click any value on the ROI Data tab to edit it, add a note (e.g. "client confirmed via stakeholder X"), and Review & save — every change is logged.',
  },
  {
    icon: 'ti-table',
    title: 'Where data is stored',
    sub: 'Three sheets in Client_ROI_Tracker.xlsx, all joined on record_id: All_ROI_Data (clean ROI values), SME_Audit_Log (the change history), and Field_Provenance (per-field source slide + confidence).',
  },
  {
    icon: 'ti-lock',
    title: 'Secure API access',
    sub: 'Domo and BI apps can ingest tracker rows from GET /api/records/secure with Authorization: Bearer <TRACKER_API_KEY> or X-Tracker-Api-Key.',
  },
  {
    icon: 'ti-layout-dashboard',
    title: 'Building dashboards',
    sub: 'Use the Dashboards view to build cross-publisher or cross-year comparisons. Choose a preset template or use custom filters to select any combination of clients, publishers, and years.',
  },
];

// Compact API endpoint reference.
const ENDPOINTS = [
  { method: 'GET',   path: '/api/records/secure',        desc: 'All ROI records (API-key protected) — for BI ingestion' },
  { method: 'GET',   path: '/api/records',               desc: 'All ROI records (open, local use)' },
  { method: 'PATCH', path: '/api/records/{record_id}',   desc: 'Edit fields; each change is logged to the audit trail' },
  { method: 'GET',   path: '/api/audit-log',             desc: 'Full append-only audit event history' },
  { method: 'GET',   path: '/api/records/export.xlsx',   desc: 'Download the 3-sheet workbook' },
];

const METHOD_COLOR = { GET: '#1f8a4c', PATCH: '#b8860b', POST: '#005f86' };

const SAMPLE_PYTHON = `import requests

KEY = "your-secret-key"            # matches backend TRACKER_API_KEY
res = requests.get(
    "http://localhost:8000/api/records/secure",
    headers={"X-Tracker-Api-Key": KEY},
)
records = res.json()
print(len(records), "records")`;

const SAMPLE_KEYS = `# An admin issues a named key (the full key prints ONCE):
python manage_keys.py create "Domo-prod"
#   ✓ Issued key 'Domo-prod'  (id: f3659c0927f8)
#       tk_-LMWA2SpxvmnFaePCmLA-Lz0lPrUXg0vYWwbkz9Zpjo

python manage_keys.py list           # all keys (no secrets shown)
python manage_keys.py revoke <id>    # revoke one, anytime`;

const SAMPLE_CURL = `curl -H "X-Tracker-Api-Key: $TRACKER_API_KEY" \\
  http://localhost:8000/api/records/secure`;

const SAMPLE_OUTPUT = `[
  {
    "record_id": "r_2cc46a833b73",
    "client": "Encova Insurance",
    "publisher": "IBM",
    "year": 2026,
    "identified_risk": 222000.0,
    "id_cost_avoidance": 222000.0,
    "realized_savings": null,
    "confidence": 91,
    "source_file": "2025 December_Encova Insurance_IBM_ROAR_v1.pptx",
    …  // + date_delivered, contract_spend, notes, sme, saved_at, …
    "field_meta": {
      "identified_risk": { "source_slide": 13, "confidence": 90.0, "alternates": null },
      "acc_cost_optimization": {
        "source_slide": 13, "confidence": 95.0,
        "alternates": [ { "value": "$507,000", "confidence": 62 } ]
      }
      …  // one entry per extracted metric
    }
  }
  …  // one object per record
]`;

const SAMPLE_PATCH = `curl -X PATCH http://localhost:8000/api/records/r_2cc46a833b73 \\
  -H "Content-Type: application/json" \\
  -d '{"changes": {"realized_savings": 500000},
       "user": "Integration Bot",
       "note": "Backfilled from client confirmation"}'`;

function CodeBlock({ title, icon = 'ti-code', children }) {
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', marginTop: 10 }}>
      <div style={{
        background: 'var(--navy)', color: 'rgba(255,255,255,0.82)', fontSize: 11, fontWeight: 700,
        letterSpacing: 0.5, padding: '7px 12px', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <i className={`ti ${icon}`} aria-hidden="true" />{title}
      </div>
      <pre style={{
        margin: 0, background: '#0d1b2e', color: '#e6edf6', fontSize: 12.5, lineHeight: 1.6,
        padding: '14px 16px', overflowX: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      }}>{children}</pre>
    </div>
  );
}

export default function HelpView() {
  return (
    <>
      <div className="card">
        <div className="card-title"><i className="ti ti-help-circle" aria-hidden="true" /> Quick Reference</div>
        {ITEMS.map(item => (
          <div className="help-item" key={item.title}>
            <div className="help-icon"><i className={`ti ${item.icon}`} aria-hidden="true" /></div>
            <div>
              <div className="help-title">{item.title}</div>
              <div className="help-sub">{item.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Developer / API integration ───────────────────────────────────── */}
      <div className="card">
        <div className="card-title"><i className="ti ti-plug-connected" aria-hidden="true" /> Developer · API Integration</div>
        <p className="help-sub" style={{ marginBottom: 4 }}>
          Pull tracker data into Domo or any BI pipeline. Access is protected by API keys.
          An admin issues a <strong>named key</strong> with the CLI below (each is revocable and
          stored hashed); the integrator receives it over a secure channel and sends it as the
          <strong> X-Tracker-Api-Key</strong> header (or <strong>Authorization: Bearer</strong>).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <CodeBlock title="Issue / manage keys (admin)" icon="ti-key">{SAMPLE_KEYS}</CodeBlock>
          <CodeBlock title="Fetch records — curl" icon="ti-terminal-2">{SAMPLE_CURL}</CodeBlock>
          <CodeBlock title="Fetch records — Python" icon="ti-brand-python">{SAMPLE_PYTHON}</CodeBlock>
          <CodeBlock title="Sample response" icon="ti-code">{SAMPLE_OUTPUT}</CodeBlock>
          <CodeBlock title="Edit a value (logged to audit) — curl" icon="ti-pencil">{SAMPLE_PATCH}</CodeBlock>
        </div>

        <div className="help-title" style={{ marginTop: 18, marginBottom: 8 }}>Endpoints</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ENDPOINTS.map(e => (
            <div key={e.path} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13 }}>
              <span style={{
                fontFamily: 'monospace', fontWeight: 700, fontSize: 11, color: '#fff',
                background: METHOD_COLOR[e.method] || 'var(--text-muted)',
                borderRadius: 5, padding: '2px 7px', minWidth: 52, textAlign: 'center', flexShrink: 0,
              }}>{e.method}</span>
              <code style={{ fontFamily: 'monospace', color: 'var(--navy)', fontWeight: 600, flexShrink: 0 }}>{e.path}</code>
              <span className="help-sub" style={{ margin: 0 }}>{e.desc}</span>
            </div>
          ))}
        </div>

        <p className="help-sub" style={{ marginTop: 16 }}>
          A runnable, zero-dependency example client lives at{' '}
          <code style={{ fontFamily: 'monospace' }}>backend/examples/tracker_api_client.py</code> —
          run it with <code style={{ fontFamily: 'monospace' }}>python tracker_api_client.py</code>.
        </p>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
        For full technical documentation, open a chat and ask:{' '}
        <em>"Generate the technical documentation for the ROI Extraction app as a Word document."</em>
      </p>
    </>
  );
}
