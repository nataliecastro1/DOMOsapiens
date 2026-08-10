import React, { useState, useEffect, useRef } from 'react';
import ExecutiveSummaryReport from '../ExecutiveSummaryReport';
import { generateExecutiveSummary, saveExecutiveSummary } from '../../services/api';
import { saveDashboard } from '../../services/dashboards';
import { DashboardBuilder } from '../../views/DashboardsView';
import { deriveOptions } from '../../services/dashboardData';
import AutoDashViewer from '../AutoDashViewer';
import { PieChart, Pie, Cell, Legend, ResponsiveContainer } from 'recharts';

// ─── Custom Recharts tooltip ──────────────────────────────────────────────────
function DollarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const fmtM = (n) => {
    if (!n) return '—';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
  };
  return (
    <div style={{ background: '#fff', border: '1px solid #dce3ef', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, color: '#001941', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.fill || p.color }}>{p.name}: {fmtM(p.value)}</div>
      ))}
    </div>
  );
}
// ─── ScreenDone: auto-generated dashboard draft ──────────────────────────────
function ScreenDone({ finalFields, selectedFile, onTracker, onDashboards, loggedInUser = '', onBack }) {
  const [summary, setSummary]               = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError]     = useState(null);
  const [editMode, setEditMode]             = useState(false);
  const [dashSaved, setDashSaved]           = useState(false);
  const [dashSaveError, setDashSaveError]   = useState(null);
  const [hiddenSections, setHiddenSections] = useState({});
  const [editedFields, setEditedFields]     = useState(null); // overrides finalFields after edits
  const reportRef = useRef(null);

  const parseDollar = (v) => parseFloat(String(v || '').replace(/[$,]/g, '')) || 0;
  const fmtM = (n) => {
    if (!n) return '—';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
  };

  const fields        = editedFields || finalFields || [];
  const get           = (label) => parseDollar(fields.find(f => f.label === label)?.value);
  const idRisk        = get('Identified Risk');
  const idAvoidance   = get('Identified Cost Avoidance');
  const accAvoidance  = get('Accomplished Cost Avoidance');
  const idOptim       = get('Identified Cost Optimization');
  const accOptim      = get('Accomplished Cost Optimization');
  const idSavings     = get('Identified Cost Savings');
  const realSavings   = get('Realized Cost Savings');
  const contractSpend = get('Contract Spend') || get('Annual Publisher Contract');
  const totalId       = idAvoidance + idOptim + idSavings || idRisk || 0;
  const totalAcc      = accAvoidance + accOptim || 0;

  const confidenceVals = fields.filter(f => f.confidence > 0).map(f => f.confidence);
  const avgConf = confidenceVals.length
    ? Math.round(confidenceVals.reduce((a, b) => a + b, 0) / confidenceVals.length)
    : null;

  const client    = selectedFile?.client    || '';
  const publisher = selectedFile?.publisher || '';
  const year      = String(selectedFile?.year || '');
  const today     = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Generate executive summary on mount
  useEffect(() => {
    if (!fields.length) return;
    setSummaryLoading(true);
    generateExecutiveSummary({
      client, publisher,
      year: parseInt(year) || null,
      identified_risk: idRisk || null,
      id_cost_avoidance: idAvoidance || null,
      acc_cost_avoidance: accAvoidance || null,
      id_cost_optimization: idOptim || null,
      acc_cost_optimization: accOptim || null,
      id_cost_savings: idSavings || null,
      realized_savings: realSavings || null,
      contract_spend: contractSpend || null,
      confidence: avgConf || null,
      stored_name: selectedFile?.stored_name || null,
      file_path: selectedFile?.file_path || null,
    })
      .then(data => {
        setSummary(data);
        const id = selectedFile?.record_id || selectedFile?.stored_name || selectedFile?.name;
        if (id) saveExecutiveSummary(id, data).catch(() => {});
      })
      .catch(() => setSummaryError('Could not generate summary.'))
      .finally(() => setSummaryLoading(false));
  }, []);

  const toggleSection = (key) => setHiddenSections(prev => ({ ...prev, [key]: !prev[key] }));

  // Helpers to persist inline edits back into state
  const updateSummaryList = (field, idx, text) => setSummary(prev => {
    const list = [...(prev[field] || [])];
    list[idx] = text;
    return { ...prev, [field]: list };
  });
  const updateSummaryText = (field, text) => setSummary(prev => ({ ...prev, [field]: text }));
  const updateField = (idx, key, text) => setEditedFields(prev => {
    const arr = [...(prev || finalFields)];
    arr[idx] = { ...arr[idx], [key]: text };
    return arr;
  });

  const activeFields = editedFields || finalFields;

  const buildDash = () => {
    const dashId = `auto-${selectedFile?.record_id || selectedFile?.stored_name || Date.now()}`;
    return {
      id: dashId,
      type: 'auto',
      name: [client, publisher, year].filter(Boolean).join(' — ') + ' Dashboard',
      client, publisher, year,
      fields: activeFields,
      summary,
      createdBy: loggedInUser,
      savedAt: new Date().toISOString(),
      sub: [publisher, year].filter(Boolean).join(' · '),
    };
  };

  const persistDash = (dash) => { saveDashboard(dash); };

  // Auto-save when the dashboard is first loaded (summary may update later — that's OK)
  useEffect(() => {
    if (!fields.length) return;
    try { persistDash(buildDash()); } catch {}
  }, []);

  // Re-persist whenever the AI summary finishes generating
  useEffect(() => {
    if (!summary || !fields.length) return;
    try { persistDash(buildDash()); } catch {}
  }, [summary]);

  const handleSaveDashboard = () => {
    setDashSaveError(null);
    const dash = buildDash();
    try {
      persistDash(dash);
    } catch (e) {
      setDashSaveError('Could not save — storage may be full.');
    }
    onDashboards(dash.id);
  };

  const handleDownloadPDF = () => {
    import('html2pdf.js').then(mod => {
      mod.default().set({
        margin: [10, 10, 10, 10],
        filename: `${[client, publisher, year].filter(Boolean).join('_') || 'ROAR'}_Dashboard.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      }).from(reportRef.current).save();
    });
  };

  // ── CSS-in-JS tokens matching the template ──
  const T = {
    navy: '#001941', yellow: '#ffad00', blue: '#005f86',
    green: '#00875a', teal: '#007b5f', red: '#c0392b',
    slate: '#4a5568', midGray: '#8a9ab0',
    navy5: 'rgba(0,25,65,.05)', navy10: 'rgba(0,25,65,.10)',
    radius: 16, radiusSm: 10,
  };

  const sectionStyle = (hidden) => ({
    background: '#fff', borderRadius: T.radius,
    border: `1px solid ${T.navy10}`,
    boxShadow: '0 6px 22px rgba(0,25,65,.06)',
    marginBottom: 20, overflow: 'hidden',
    opacity: hidden ? 0.45 : 1,
    transition: 'opacity 0.2s',
  });

  const sectionHead = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 28px', borderBottom: `1px solid ${T.navy10}`,
    background: T.navy5,
  };

  const SectionToggle = ({ skey }) => (
    <button onClick={() => toggleSection(skey)} style={{
      background: 'none', border: `1px solid ${T.navy10}`, borderRadius: 6,
      padding: '3px 10px', fontSize: 11, cursor: 'pointer',
      color: hiddenSections[skey] ? T.blue : T.slate,
      fontFamily: 'inherit', fontWeight: 700,
    }}>
      {hiddenSections[skey] ? 'Show' : 'Hide'}
    </button>
  );

  // Shows a compact collapsed bar for sections hidden outside of edit mode
  const HiddenBar = ({ skey, label }) => hiddenSections[skey] ? (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: T.navy5, border: `1px dashed ${T.navy10}`,
      borderRadius: T.radiusSm, padding: '10px 18px', marginBottom: 20,
    }}>
      <span style={{ fontSize: 12, color: T.midGray, fontStyle: 'italic' }}>
        <i className="ti ti-eye-off" style={{ marginRight: 6 }} />{label} (hidden)
      </span>
      <button onClick={() => toggleSection(skey)} style={{
        background: 'none', border: `1px solid ${T.navy10}`, borderRadius: 6,
        padding: '3px 10px', fontSize: 11, cursor: 'pointer', color: T.blue,
        fontFamily: 'inherit', fontWeight: 700,
      }}>
        Show
      </button>
    </div>
  ) : null;

  const Editable = ({ tag: Tag = 'span', value, onSave, style, className }) => (
    <Tag
      contentEditable={editMode}
      suppressContentEditableWarning
      onBlur={editMode && onSave ? (e) => onSave(e.currentTarget.textContent) : undefined}
      style={{ ...style, outline: editMode ? `2px dashed ${T.yellow}` : 'none', borderRadius: 4 }}
      className={className}
    >
      {value}
    </Tag>
  );

  return (
    <div style={{ fontFamily: "'Figtree', 'Inter', sans-serif" }}>

      {/* ── Toolbar (no-print) ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, gap: 10, flexWrap: 'wrap',
      }} className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onBack && (
            <button className="btn ghost small" onClick={onBack}>
              <i className="ti ti-arrow-left" /> Back to Review
            </button>
          )}
          <div style={{
            background: T.green, borderRadius: '50%', width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 16, flexShrink: 0,
          }}>
            <i className="ti ti-check" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: T.navy }}>Dashboard Draft Ready</div>
            <div style={{ fontSize: 12, color: T.slate }}>Records saved · Review and publish below</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {dashSaveError && (
            <span style={{ fontSize: 12, color: T.red }}>{dashSaveError}</span>
          )}
          <button
            className="btn ghost"
            onClick={() => window.location.href = '/app/delivery-hub/'}
          >
            <i className="ti ti-arrow-back-up" /> Return to Hub
          </button>
          <button
            className="btn primary"
            onClick={handleSaveDashboard}
          >
            <i className="ti ti-layout-dashboard" /> Go to Dashboards
          </button>
        </div>
      </div>

      <div ref={reportRef}>
        {/* ── Header / Hero ── */}
        <div style={{
          background: T.navy, borderRadius: T.radius,
          marginBottom: 20, overflow: 'hidden',
        }}>
          {/* yellow topbar */}
          <div style={{ height: 6, background: T.yellow }} />
          <div style={{ padding: '28px 32px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'center' }}>
            <div>
              {/* Co-brand */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <svg xmlns="http://www.w3.org/2000/svg" height="32" viewBox="0 0 236 87" style={{ fill: '#fff', fillRule: 'evenodd' }}>
                  <circle cx="27.851" cy="40.631" r="5.151" style={{ fill: T.yellow }} />
                  <path d="m58.878 27.974.411 1.156 4.058-6.43-6.837 3.651 1.079.412 3.489-1.96-36.02 28.666a20.02 20.02 0 0 0 17.553 10.413c10.972 0 20-9.028 20-20a20 20 0 0 0-5.703-13.985c.715-.7 1.378-1.346 1.97-1.923m-.813 25.592a8.51 8.51 0 0 1-8.016 5.685c-4.656 0-8.489-3.829-8.494-8.485 0-4.689 3.266-9.948 11.856-17.408.005.006 8.691 8.124 4.658 20.21z" style={{ fill: T.yellow, fillRule: 'nonzero' }} />
                  <path d="m50.775 31.042 4.316-2.725c-8.512-6.906-21.2-5.584-28.106 2.928l-.22.277c6.982-5.474 16.814-5.671 24.01-.48" style={{ fill: T.yellow, fillRule: 'nonzero' }} />
                  <path d="M96.395 39.875h3.145v1.249a4.66 4.66 0 0 1 3.661-1.6 4.52 4.52 0 0 1 3.979 1.831c.513.736.835 1.668.835 3.755v8.278h-3.146v-7.513c0-3.436-1.286-3.531-2.472-3.531-1.411 0-2.856.192-2.856 4.557v6.487h-3.145zM121.73 39.876h3.142v12.423c0 3.177-.353 5.455-2.215 7.029a6.87 6.87 0 0 1-4.486 1.443 5.97 5.97 0 0 1-4.431-1.668 7.6 7.6 0 0 1-1.99-4.2h3.051a4.47 4.47 0 0 0 1 2.119c.644.642 1.53.981 2.438.932a3.38 3.38 0 0 0 2.471-.9 4.45 4.45 0 0 0 1.028-3.4v-1.771a4.9 4.9 0 0 1-4.109 1.927 5.73 5.73 0 0 1-4.462-1.83 7.64 7.64 0 0 1-2.023-5.36 7.18 7.18 0 0 1 1.99-5.232 6.15 6.15 0 0 1 4.591-1.861 5.1 5.1 0 0 1 4.014 1.831zm-6 3.371a4.7 4.7 0 0 0-1.38 3.433 4.64 4.64 0 0 0 1.348 3.4 3.68 3.68 0 0 0 2.407.9 3.42 3.42 0 0 0 2.63-1.09 5.01 5.01 0 0 0-.1-6.577 3.34 3.34 0 0 0-2.538-.963 3.25 3.25 0 0 0-2.374.9zM131.875 32.418v20.97h-3.148V34.917zM187.986 32.418v4.313h-3.148v-1.814zM147.863 50.307a7.1 7.1 0 0 1-2.279 2.474 7.45 7.45 0 0 1-3.981 1.027 6 6 0 0 1-4.557-1.733 7.26 7.26 0 0 1-1.991-5.169 7.92 7.92 0 0 1 2.151-5.552 6.16 6.16 0 0 1 4.527-1.831 5.82 5.82 0 0 1 4.332 1.766 8.12 8.12 0 0 1 1.9 5.714v.388h-9.694a4.46 4.46 0 0 0 1.155 2.728c.647.609 1.52.924 2.407.867a3.32 3.32 0 0 0 2.152-.676 4.9 4.9 0 0 0 1.252-1.475zm-3.114-5.489a3.12 3.12 0 0 0-3.079-2.661c-.835 0-1.636.336-2.221.932a3.54 3.54 0 0 0-.961 1.732zM154.296 60.739h-3.148V39.875h3.147v1.478a5.08 5.08 0 0 1 4.009-1.831c3.564 0 6.58 2.729 6.58 7.029 0 4.559-3.337 7.255-6.547 7.255a5.36 5.36 0 0 1-4.044-1.99zm-.193-14.026c0 2.823 1.828 4.269 3.821 4.269 2.279 0 3.756-1.958 3.756-4.3 0-2.407-1.477-4.332-3.756-4.332-1.993 0-3.821 1.409-3.821 4.363M181.769 46.648l.001.097c0 3.962-3.261 7.223-7.223 7.223s-7.223-3.261-7.223-7.223c0-3.925 3.2-7.169 7.124-7.222h.1c3.851-.109 7.11 2.97 7.22 6.821q.003.152.001.304m-3.211.032c0-3.08-2.021-4.332-4.012-4.332s-4.012 1.253-4.012 4.332c0 2.6 1.54 4.3 4.012 4.3s4.012-1.699 4.012-4.3M184.853 39.876h3.142v13.513h-3.142zM191.832 39.875h3.15v1.249a4.66 4.66 0 0 1 3.661-1.6 4.52 4.52 0 0 1 3.979 1.831c.515.736.835 1.668.835 3.755v8.278h-3.146v-7.513c0-3.436-1.283-3.531-2.471-3.531-1.411 0-2.857.192-2.857 4.557v6.487h-3.145zM210.561 42.764v10.624h-3.146V42.764h-1.317v-2.889h1.317v-4.959l3.146-2.5v7.458h2.408v2.889zM93.859 53.389l-9.121-22.662-9.122 22.662h3.531l5.591-14.433 5.59 14.433z" style={{ fill: '#fff', fillRule: 'nonzero' }} />
                </svg>
                {client && <>
                  <span style={{ color: 'rgba(255,255,255,.35)', fontSize: 24, fontWeight: 300 }}>×</span>
                  <Editable tag="span" value={client} style={{ color: '#fff', fontWeight: 800, fontSize: 18 }} />
                </>}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.yellow, marginBottom: 8 }}>
                ROAR Executive Dashboard
              </div>
              <div style={{ fontSize: 'clamp(1.3rem,2.5vw,2rem)', fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 12 }}>
                <Editable value={[publisher, 'Risk & Opportunity Assessment'].filter(Boolean).join(' — ')} style={{ color: '#fff' }} />
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.65)' }}>
                {[year, today].filter(Boolean).join(' · ')}
                {avgConf ? ` · ${avgConf}% avg. confidence` : ''}
              </div>
            </div>
            {/* Headline stat */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 'clamp(2rem,4vw,3rem)', fontWeight: 800, color: T.yellow, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {fmtM(totalId)}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 6, maxWidth: 180 }}>
                Total Identified Value
              </div>
            </div>
          </div>
        </div>

        {/* ── KPI Tiles ── */}
        <HiddenBar skey="kpis" label="KPI Tiles" />
        {!hiddenSections.kpis && (
          <div style={{ background:'#fff', borderRadius: T.radius, border:`1px solid ${T.navy10}`, boxShadow:'0 6px 22px rgba(0,25,65,.06)', marginBottom:20, overflow:'hidden' }}>
            <div style={{ ...sectionHead }}>
              <div style={{ fontSize:13, fontWeight:700, color: T.navy }}>KPI Tiles</div>
              <SectionToggle skey="kpis" />
            </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 14, padding: '16px 20px',
          }}>
            {[
              { label: 'Identified Risk',             value: idRisk,       color: '#c0392b' },
              { label: 'Identified Cost Avoidance',   value: idAvoidance,  color: T.blue },
              { label: 'Accomplished Cost Avoidance', value: accAvoidance, color: T.teal },
              { label: 'Identified Cost Optimization',value: idOptim,      color: T.blue },
              { label: 'Accomplished Cost Optimization', value: accOptim,  color: T.teal },
              { label: 'Identified Cost Savings',     value: idSavings,    color: T.green },
              { label: 'Realized Cost Savings',       value: realSavings,  color: T.green },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: '#fff', border: `1px solid ${T.navy10}`,
                borderRadius: T.radiusSm, padding: '16px 18px',
                boxShadow: '0 4px 14px rgba(0,25,65,.05)',
                transition: 'transform .15s, box-shadow .15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 10px 22px rgba(0,25,65,.11)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,25,65,.05)'; }}
              >
                <div style={{ fontSize: 'clamp(1.1rem,2vw,1.5rem)', fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {fmtM(value)}
                </div>
                <div style={{ marginTop: 7, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.slate }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
          </div>
        )}

        {/* ── Executive Summary Section ── */}
        <HiddenBar skey="summary" label="01 — Executive Summary" />
        {!hiddenSections.summary && (
          <div style={sectionStyle(false)}>
            <div style={sectionHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: T.yellow, lineHeight: 0.9 }}>01</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.blue, marginBottom: 3 }}>
                    Executive Summary
                  </div>
                  <div style={{ fontSize: 'clamp(1rem,1.5vw,1.2rem)', fontWeight: 700, color: T.navy }}>
                    Strategic Findings & Recommendations
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {summaryLoading && (
                  <span style={{ fontSize: 12, color: T.slate, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-loader-2 spinning" /> Generating with Claude AI…
                  </span>
                )}
                <SectionToggle skey="summary" />
              </div>
            </div>
            <div style={{ padding: '24px 28px' }}>
              {summaryLoading && !summary && (
                <div style={{ color: T.slate, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <i className="ti ti-loader-2 spinning" style={{ fontSize: 18, color: T.yellow }} />
                  Generating executive summary… This may take 15–30 seconds.
                </div>
              )}
              {summaryError && <div style={{ color: '#c0392b', fontSize: 13 }}>{summaryError}</div>}
              {summary && (
                <ExecutiveSummaryReport
                  summary={summary} subtitle={[client, publisher, year].filter(Boolean).join(' · ')}
                  client={client} publisher={publisher} kpiFields={fields}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Section 02: Value Analysis — card grid ── */}
        <HiddenBar skey="breakdown" label="02 — Value Analysis" />
        {!hiddenSections.breakdown && (() => {
          const categories = [
            {
              key: 'opt', title: 'Cost Optimization', kicker: 'Efficiency Gains',
              color: T.blue, accent: '--c-opt',
              lead: summary?.key_accomplishments?.[0] || `${publisher || 'Publisher'} optimization opportunities identified through ROAR analysis.`,
              leadField: ['key_accomplishments', 0],
              tiles: [
                { val: fmtM(idOptim),   lbl: 'Identified',   meta: 'Total opportunity', cls: 'opt' },
                { val: fmtM(accOptim),  lbl: 'Accomplished',  meta: 'Realized to date',  cls: 'opt' },
                ...(avgConf ? [{ val: `${avgConf}%`, lbl: 'Confidence', meta: 'Avg. extraction score', cls: 'info' }] : []),
              ],
              slideField: fields.find(f => f.label === 'Identified Cost Optimization'),
              callout: summary?.recommendations?.[0] || null,
              calloutField: ['recommendations', 0],
              show: idOptim > 0 || accOptim > 0,
            },
            {
              key: 'avoid', title: 'Cost Avoidance', kicker: 'Risk Prevention',
              color: T.teal, accent: '--c-save',
              lead: summary?.key_accomplishments?.[1] || `Cost avoidance opportunities captured through proactive ITAM engagement.`,
              leadField: ['key_accomplishments', 1],
              tiles: [
                { val: fmtM(idAvoidance),  lbl: 'Identified',   meta: 'Potential avoided cost', cls: 'save' },
                { val: fmtM(accAvoidance), lbl: 'Accomplished',  meta: 'Confirmed avoidance',    cls: 'save' },
              ],
              slideField: fields.find(f => f.label === 'Identified Cost Avoidance'),
              callout: summary?.recommendations?.[1] || null,
              calloutField: ['recommendations', 1],
              show: idAvoidance > 0 || accAvoidance > 0,
            },
            {
              key: 'risk', title: 'Savings & Risk Exposure', kicker: 'Financial Risk',
              color: '#c0392b', accent: '--c-risk',
              lead: summary?.primary_risks?.[0] || `Risk exposure and savings opportunities requiring attention.`,
              leadField: ['primary_risks', 0],
              tiles: [
                ...(idSavings   ? [{ val: fmtM(idSavings),  lbl: 'Identified Savings', meta: 'Gross savings target', cls: 'save' }] : []),
                ...(realSavings ? [{ val: fmtM(realSavings), lbl: 'Realized Savings',   meta: 'Confirmed to date',   cls: 'save' }] : []),
                ...(idRisk      ? [{ val: fmtM(idRisk),      lbl: 'Identified Risk',    meta: 'Unmitigated exposure', cls: 'risk' }] : []),
              ],
              slideField: fields.find(f => f.label === 'Identified Risk'),
              callout: summary?.recommendations?.[2] || null,
              calloutField: ['recommendations', 2],
              show: idSavings > 0 || realSavings > 0 || idRisk > 0,
            },
          ].filter(c => c.show);

          if (!categories.length) return null;
          return (
            <div style={sectionStyle(false)}>
              <div style={sectionHead}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '2rem', fontWeight: 800, color: T.yellow, lineHeight: 0.9 }}>02</span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.blue, marginBottom: 3 }}>
                      Value Analysis
                    </div>
                    <div style={{ fontSize: 'clamp(1rem,1.5vw,1.2rem)', fontWeight: 700, color: T.navy }}>
                      Findings by Category
                    </div>
                  </div>
                </div>
                <SectionToggle skey="breakdown" />
              </div>
              <div style={{ padding: '24px 28px' }}>
                {/* card grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 24 }}>
                  {categories.map(cat => (
                    <div key={cat.key} style={{
                      background: '#fff', border: `1px solid rgba(0,25,65,.10)`,
                      borderTop: `4px solid ${cat.color}`,
                      borderRadius: T.radiusSm,
                      padding: '20px 22px',
                      boxShadow: '0 4px 14px rgba(0,25,65,.05)',
                      display: 'flex', flexDirection: 'column', gap: 0,
                      transition: 'transform .18s ease, box-shadow .18s ease',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 16px 38px rgba(0,25,65,.13)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,25,65,.05)'; }}
                    >
                      {/* publisher pill + title */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                        <div style={{
                          fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                          background: `${cat.color}18`, color: cat.color,
                          border: `1px solid ${cat.color}40`,
                          borderRadius: 20, padding: '3px 10px', flexShrink: 0,
                        }}>
                          {cat.kicker}
                        </div>
                        {publisher && (
                          <div style={{ fontSize: 10, fontWeight: 700, color: T.midGray, textAlign: 'right', lineHeight: 1.3 }}>
                            {publisher}
                          </div>
                        )}
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '1.1rem', color: T.navy, lineHeight: 1.2, marginBottom: 8 }}>
                        {cat.title}
                      </div>
                      <div style={{ fontSize: '.9rem', color: T.slate, lineHeight: 1.5, marginBottom: 14 }}>
                        <Editable value={cat.lead} onSave={t => updateSummaryList(cat.leadField[0], cat.leadField[1], t)} />
                      </div>

                      {/* tiles */}
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cat.tiles.length}, 1fr)`, gap: 8, marginBottom: 14 }}>
                        {cat.tiles.map(t => (
                          <div key={t.lbl} style={{
                            background: 'rgba(0,25,65,.04)', border: '1px solid rgba(0,25,65,.08)',
                            borderRadius: 8, padding: '10px 12px',
                            transition: 'transform .18s ease, box-shadow .18s ease',
                          }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.03)'; e.currentTarget.style.background = '#fff'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.background = 'rgba(0,25,65,.04)'; }}
                          >
                            <div style={{
                              fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1,
                              color: t.cls === 'risk' ? '#c0392b' : t.cls === 'info' ? T.blue : cat.color,
                            }}>
                              {t.val}
                            </div>
                            <div style={{ marginTop: 6, fontSize: '.7rem', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: T.slate }}>
                              {t.lbl}
                            </div>
                            <div style={{ marginTop: 4, fontSize: '.74rem', color: T.midGray }}>{t.meta}</div>
                          </div>
                        ))}
                      </div>

                      {/* callout */}
                      {cat.callout && (
                        <div style={{
                          borderLeft: `3px solid ${T.yellow}`, background: 'rgba(255,173,0,.08)',
                          borderRadius: '0 6px 6px 0', padding: '10px 14px', marginBottom: 12,
                          fontSize: '.84rem', color: T.navy, lineHeight: 1.5,
                        }}>
                          <Editable value={cat.callout} onSave={t => updateSummaryList(cat.calloutField[0], cat.calloutField[1], t)} />
                        </div>
                      )}

                      {/* evidence */}
                      {cat.slideField && (cat.slideField.publisher || cat.slideField.scriptSlide) && (
                        <div style={{
                          marginTop: 'auto', paddingTop: 12, borderTop: '1px dashed rgba(0,25,65,.12)',
                          fontSize: '.78rem', color: T.slate, display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <i className="ti ti-file-text" style={{ color: T.blue, fontSize: 13 }} />
                          <span>
                            Source: <strong style={{ color: T.blue }}>{cat.slideField.publisher || publisher}</strong>
                            {cat.slideField.scriptSlide ? ` · Slide ${cat.slideField.scriptSlide}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* tieback row */}
                {summary && (summary.key_accomplishments?.length > 0 || summary.next_steps?.length > 0) && (
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
                    background: T.navy5, border: `1px solid ${T.navy10}`,
                    borderRadius: T.radiusSm, padding: '16px 20px',
                  }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: T.teal, marginBottom: 8 }}>
                        <i className="ti ti-trophy" style={{ marginRight: 4 }} /> Top Win
                      </div>
                      <div style={{ fontSize: '.88rem', color: T.navy, lineHeight: 1.5 }}>
                        <Editable value={summary.key_accomplishments?.[0] || '—'} onSave={t => updateSummaryList('key_accomplishments', 0, t)} />
                      </div>
                    </div>
                    <div style={{ borderLeft: `1px solid ${T.navy10}`, paddingLeft: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: T.yellow, marginBottom: 8 }}>
                        <i className="ti ti-arrow-right" style={{ marginRight: 4 }} /> Next Action
                      </div>
                      <div style={{ fontSize: '.88rem', color: T.navy, lineHeight: 1.5 }}>
                        <Editable value={summary.next_steps?.[0] || summary.recommendations?.[0] || '—'} onSave={t => summary.next_steps?.[0] !== undefined ? updateSummaryList('next_steps', 0, t) : updateSummaryList('recommendations', 0, t)} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── ROI Journey Section ── */}
        <HiddenBar skey="journey" label="03 — ROI Journey" />
        {!hiddenSections.journey && (totalId > 0 || totalAcc > 0) && (
          <div style={sectionStyle(false)}>
            <div style={sectionHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: T.yellow, lineHeight: 0.9 }}>03</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.blue, marginBottom: 3 }}>
                    ROI Journey
                  </div>
                  <div style={{ fontSize: 'clamp(1rem,1.5vw,1.2rem)', fontWeight: 700, color: T.navy }}>
                    Identified → Accomplished
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: T.navy, letterSpacing: '-0.03em' }}>{fmtM(totalAcc)}</div>
                <div style={{ fontSize: 11, color: T.slate, marginTop: 4 }}>Total Accomplished</div>
              </div>
              <SectionToggle skey="journey" />
            </div>
            <div style={{ padding: '24px 28px' }}>
              {totalId > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, fontWeight: 700, color: T.slate }}>
                    <span>Identified ({fmtM(totalId)})</span>
                    <span>Accomplished ({fmtM(totalAcc)}) · {totalId ? Math.round(totalAcc / totalId * 100) : 0}%</span>
                  </div>
                  <div style={{ background: T.navy5, borderRadius: 8, height: 16, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 8,
                      background: `linear-gradient(90deg, ${T.teal}, ${T.green})`,
                      width: `${totalId ? Math.min(100, Math.round(totalAcc / totalId * 100)) : 0}%`,
                      transition: 'width 1s ease',
                    }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 20 }}>
                {[
                  { label: 'Identified', value: totalId, color: T.blue, icon: 'ti-target' },
                  { label: 'Accomplished', value: totalAcc, color: T.teal, icon: 'ti-circle-check' },
                  { label: 'Realization Rate', value: totalId ? `${Math.round(totalAcc / totalId * 100)}%` : '—', color: T.green, icon: 'ti-trending-up', raw: true },
                ].map(({ label, value, color, icon, raw }) => (
                  <div key={label} style={{
                    background: T.navy5, border: `1px solid ${T.navy10}`,
                    borderRadius: T.radiusSm, padding: '14px 16px', textAlign: 'center',
                  }}>
                    <i className={`ti ${icon}`} style={{ fontSize: 20, color, marginBottom: 6, display: 'block' }} />
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color, lineHeight: 1 }}>
                      {raw ? value : fmtM(value)}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: T.slate }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Section 04: Value Delivered Ledger ── */}
        <HiddenBar skey="ledger" label="04 — Value Ledger" />
        {!hiddenSections.ledger && fields.some(f => parseDollar(f.value) > 0) && (
          <div style={sectionStyle(false)}>
            <div style={sectionHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: T.yellow, lineHeight: 0.9 }}>04</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.blue, marginBottom: 3 }}>
                    Value Delivered
                  </div>
                  <div style={{ fontSize: 'clamp(1rem,1.5vw,1.2rem)', fontWeight: 700, color: T.navy }}>
                    Complete Metrics Ledger
                  </div>
                </div>
              </div>
              <SectionToggle skey="ledger" />
            </div>
            <div style={{ padding: '0 28px 24px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                <thead>
                  <tr style={{ background: T.navy5 }}>
                    <td style={{ padding: '11px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: T.navy }}>Metric</td>
                    <td style={{ padding: '11px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: T.navy }}>Description</td>
                    <td style={{ padding: '11px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: T.navy, textAlign: 'right' }}>Value</td>
                    <td style={{ padding: '11px 16px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: T.navy, textAlign: 'center' }}>Conf.</td>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Identified Cost Avoidance',    desc: 'Future costs prevented through proactive ITAM',            val: idAvoidance,  color: T.teal,  vclass: 'save' },
                    { label: 'Accomplished Cost Avoidance',  desc: 'Confirmed avoidance already realized',                    val: accAvoidance, color: T.teal,  vclass: 'save' },
                    { label: 'Identified Cost Optimization', desc: 'Efficiency gains and spend reduction opportunities',       val: idOptim,      color: T.blue,  vclass: 'opt'  },
                    { label: 'Accomplished Cost Optimization',desc: 'Optimization actions confirmed and closed',               val: accOptim,     color: T.blue,  vclass: 'opt'  },
                    { label: 'Identified Cost Savings',      desc: 'Gross savings identified across agreements',               val: idSavings,    color: T.green, vclass: 'save' },
                    { label: 'Realized Cost Savings',        desc: 'Savings confirmed and applied to budget',                  val: realSavings,  color: T.green, vclass: 'save' },
                    { label: 'Identified Risk',              desc: 'Compliance and financial risk exposure uncovered',         val: idRisk,       color: '#c0392b', vclass: 'risk' },
                  ].filter(row => row.val > 0).map((row, i, arr) => {
                    const fieldConf = fields.find(f => f.label === row.label)?.confidence;
                    return (
                      <tr key={row.label} style={{ cursor: 'default' }}
                        onMouseEnter={e => { e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = T.navy5); }}
                        onMouseLeave={e => { e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = ''); }}
                      >
                        <td style={{ padding: '13px 16px', borderTop: `1px solid ${T.navy10}`, fontWeight: 700, color: T.navy, fontSize: '.92rem' }}>
                          {row.label}
                        </td>
                        <td style={{ padding: '13px 16px', borderTop: `1px solid ${T.navy10}`, color: T.slate, fontSize: '.84rem' }}>
                          {row.desc}
                        </td>
                        <td style={{ padding: '13px 16px', borderTop: `1px solid ${T.navy10}`, textAlign: 'right', fontWeight: 800, fontSize: '1rem', color: row.color, whiteSpace: 'nowrap' }}>
                          {fmtM(row.val)}
                        </td>
                        <td style={{ padding: '13px 16px', borderTop: `1px solid ${T.navy10}`, textAlign: 'center' }}>
                          {fieldConf ? (
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                              background: fieldConf >= 80 ? `${T.green}20` : fieldConf >= 60 ? `${T.yellow}30` : 'rgba(192,57,43,.12)',
                              color: fieldConf >= 80 ? T.green : fieldConf >= 60 ? '#b8860b' : '#c0392b',
                            }}>
                              {fieldConf}%
                            </span>
                          ) : <span style={{ color: T.midGray, fontSize: 12 }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {/* total row */}
                  <tr style={{ background: T.navy5 }}>
                    <td colSpan={2} style={{ padding: '13px 16px', fontWeight: 800, color: T.navy, fontSize: '.92rem', borderTop: `2px solid ${T.navy10}` }}>
                      Total Identified Value
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', fontWeight: 800, fontSize: '1.1rem', color: T.navy, borderTop: `2px solid ${T.navy10}`, whiteSpace: 'nowrap' }}>
                      {fmtM(totalId + (idRisk || 0))}
                    </td>
                    <td style={{ borderTop: `2px solid ${T.navy10}` }} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{
          background: T.navy5, border: `1px solid ${T.navy10}`,
          borderRadius: T.radius, padding: '20px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ fontSize: 12, color: T.slate }}>
            Generated by Anglepoint DOMOsapiens · {today}
          </div>
          <div style={{ fontSize: 11, color: T.midGray }}>Confidential — For internal use only</div>
        </div>
      </div>

    </div>
  );
}

export { ScreenDone, DollarTooltip };
