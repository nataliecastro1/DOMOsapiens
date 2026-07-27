import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import ValueAtAGlance from './ValueAtAGlance';

const T = { navy:'#001941', yellow:'#ffad00', blue:'#005f86', green:'#00875a', teal:'#007b5f', red:'#c0392b', slate:'#4a5568', midGray:'#8a9ab0', navy5:'rgba(0,25,65,.05)', navy10:'rgba(0,25,65,.10)', radius:16, radiusSm:10 };
const parseDollar = (v) => parseFloat(String(v || '').replace(/[$,]/g, '')) || 0;
const fmtM = (n) => { if (!n) return '—'; if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`; if (n >= 1_000) return `$${(n/1_000).toFixed(0)}K`; return `$${n.toLocaleString()}`; };

function buildDashboardHTML(d) {
  const fields = d.fields || [];
  const get = (lbl) => parseDollar(fields.find(f => f.label === lbl)?.value);
  const idRisk      = get('Identified Risk');
  const idAvoidance = get('Identified Cost Avoidance');
  const accAvoidance= get('Accomplished Cost Avoidance');
  const idOptim     = get('Identified Cost Optimization');
  const accOptim    = get('Accomplished Cost Optimization');
  const idSavings   = get('Identified Cost Savings');
  const realSavings = get('Realized Cost Savings');
  const totalId     = idAvoidance + idOptim + idSavings || idRisk || 0;
  const totalAcc    = accAvoidance + accOptim || 0;
  const summary     = d.summary;
  const client      = d.client || '';
  const publisher   = d.publisher || '';
  const today       = new Date(d.savedAt || Date.now()).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
  const esc = (v) => String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const kpiRows = [
    { label:'Identified Risk', value:idRisk, color:'#c0392b' },
    { label:'Identified Cost Avoidance', value:idAvoidance, color:'#005f86' },
    { label:'Accomplished Cost Avoidance', value:accAvoidance, color:'#007b5f' },
    { label:'Identified Cost Optimization', value:idOptim, color:'#005f86' },
    { label:'Accomplished Cost Optimization', value:accOptim, color:'#007b5f' },
    { label:'Identified Cost Savings', value:idSavings, color:'#00875a' },
    { label:'Realized Cost Savings', value:realSavings, color:'#00875a' },
  ].filter(k => k.value > 0);

  const ledgerRows = [
    { label:'Identified Cost Avoidance', val:idAvoidance, color:'#007b5f', desc:'Future costs prevented through proactive ITAM' },
    { label:'Accomplished Cost Avoidance', val:accAvoidance, color:'#007b5f', desc:'Confirmed avoidance already realized' },
    { label:'Identified Cost Optimization', val:idOptim, color:'#005f86', desc:'Efficiency gains and spend reduction opportunities' },
    { label:'Accomplished Cost Optimization', val:accOptim, color:'#005f86', desc:'Optimization actions confirmed and closed' },
    { label:'Identified Cost Savings', val:idSavings, color:'#00875a', desc:'Gross savings identified across agreements' },
    { label:'Realized Cost Savings', val:realSavings, color:'#00875a', desc:'Savings confirmed and applied to budget' },
    { label:'Identified Risk', val:idRisk, color:'#c0392b', desc:'Compliance and financial risk exposure uncovered' },
  ].filter(r => r.val > 0);

  const kpiHTML = kpiRows.length > 0 ? `
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:20px">
    ${kpiRows.map(k => `<div style="background:#fff;border:1px solid rgba(0,25,65,.1);border-radius:10px;padding:16px 18px;box-shadow:0 4px 14px rgba(0,25,65,.05)">
      <div style="font-size:1.4rem;font-weight:800;color:${k.color};line-height:1">${esc(fmtM(k.value))}</div>
      <div style="margin-top:7px;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#4a5568">${esc(k.label)}</div>
    </div>`).join('')}
  </div>` : '';

  const summaryHTML = summary ? `
  <div style="background:#fff;border-radius:16px;border:1px solid rgba(0,25,65,.1);box-shadow:0 6px 22px rgba(0,25,65,.06);margin-bottom:20px;overflow:hidden">
    <div style="display:flex;align-items:center;gap:12px;padding:20px 28px;border-bottom:1px solid rgba(0,25,65,.1);background:rgba(0,25,65,.05)">
      <span style="font-size:2rem;font-weight:800;color:#ffad00;line-height:.9">01</span>
      <div>
        <div style="font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#005f86;margin-bottom:3px">Executive Summary</div>
        <div style="font-size:1.1rem;font-weight:700;color:#001941">Strategic Findings &amp; Recommendations</div>
      </div>
    </div>
    <div style="padding:24px 28px">
      ${summary.overview ? `<p style="font-size:14px;color:#4a5568;line-height:1.75;margin-top:0">${esc(summary.overview)}</p>` : ''}
      ${summary.key_accomplishments?.length > 0 ? `<div style="margin-top:16px"><div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#00875a;margin-bottom:8px">Key Accomplishments</div><ul style="padding-left:18px;color:#4a5568;font-size:13px;line-height:1.7;margin:0">${summary.key_accomplishments.map(a=>`<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
      ${summary.recommendations?.length > 0 ? `<div style="margin-top:16px"><div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#ffad00;margin-bottom:8px">Recommendations</div><ul style="padding-left:18px;color:#4a5568;font-size:13px;line-height:1.7;margin:0">${summary.recommendations.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
      ${summary.primary_risks?.length > 0 ? `<div style="margin-top:16px"><div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#c0392b;margin-bottom:8px">Primary Risks</div><ul style="padding-left:18px;color:#4a5568;font-size:13px;line-height:1.7;margin:0">${summary.primary_risks.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
      ${summary.next_steps?.length > 0 ? `<div style="margin-top:16px"><div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#005f86;margin-bottom:8px">Next Steps</div><ul style="padding-left:18px;color:#4a5568;font-size:13px;line-height:1.7;margin:0">${summary.next_steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
    </div>
  </div>` : '';

  const journeyHTML = (totalId > 0 || totalAcc > 0) ? `
  <div style="background:#fff;border-radius:16px;border:1px solid rgba(0,25,65,.1);box-shadow:0 6px 22px rgba(0,25,65,.06);margin-bottom:20px;overflow:hidden">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 28px;border-bottom:1px solid rgba(0,25,65,.1);background:rgba(0,25,65,.05)">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:2rem;font-weight:800;color:#ffad00;line-height:.9">03</span>
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#005f86;margin-bottom:3px">ROI Journey</div>
          <div style="font-size:1.1rem;font-weight:700;color:#001941">Identified → Accomplished</div>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:1.6rem;font-weight:800;color:#001941;letter-spacing:-.03em">${esc(fmtM(totalAcc))}</div>
        <div style="font-size:11px;color:#4a5568;margin-top:4px">Total Accomplished</div>
      </div>
    </div>
    <div style="padding:24px 28px">
      ${totalId > 0 ? `
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px;font-weight:700;color:#4a5568">
          <span>Identified (${esc(fmtM(totalId))})</span>
          <span>Accomplished (${esc(fmtM(totalAcc))}) · ${totalId ? Math.round(totalAcc/totalId*100) : 0}%</span>
        </div>
        <div style="background:rgba(0,25,65,.05);border-radius:8px;height:16px;overflow:hidden">
          <div style="height:100%;border-radius:8px;background:linear-gradient(90deg,#007b5f,#00875a);width:${totalId ? Math.min(100, Math.round(totalAcc/totalId*100)) : 0}%"></div>
        </div>
      </div>` : ''}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:20px">
        <div style="background:rgba(0,25,65,.05);border:1px solid rgba(0,25,65,.1);border-radius:10px;padding:14px 16px;text-align:center">
          <div style="font-size:1.3rem;font-weight:800;color:#005f86;line-height:1">${esc(fmtM(totalId))}</div>
          <div style="margin-top:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#4a5568">Identified</div>
        </div>
        <div style="background:rgba(0,25,65,.05);border:1px solid rgba(0,25,65,.1);border-radius:10px;padding:14px 16px;text-align:center">
          <div style="font-size:1.3rem;font-weight:800;color:#007b5f;line-height:1">${esc(fmtM(totalAcc))}</div>
          <div style="margin-top:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#4a5568">Accomplished</div>
        </div>
        <div style="background:rgba(0,25,65,.05);border:1px solid rgba(0,25,65,.1);border-radius:10px;padding:14px 16px;text-align:center">
          <div style="font-size:1.3rem;font-weight:800;color:#00875a;line-height:1">${totalId ? `${Math.round(totalAcc/totalId*100)}%` : '—'}</div>
          <div style="margin-top:6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#4a5568">Realization Rate</div>
        </div>
      </div>
    </div>
  </div>` : '';

  const ledgerHTML = ledgerRows.length > 0 ? `
  <div style="background:#fff;border-radius:16px;border:1px solid rgba(0,25,65,.1);box-shadow:0 6px 22px rgba(0,25,65,.06);margin-bottom:20px;overflow:hidden">
    <div style="display:flex;align-items:center;gap:12px;padding:20px 28px;border-bottom:1px solid rgba(0,25,65,.1);background:rgba(0,25,65,.05)">
      <span style="font-size:2rem;font-weight:800;color:#ffad00;line-height:.9">04</span>
      <div>
        <div style="font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#005f86;margin-bottom:3px">Value Delivered</div>
        <div style="font-size:1.1rem;font-weight:700;color:#001941">Complete Metrics Ledger</div>
      </div>
    </div>
    <div style="padding:0 28px 24px">
      <table style="width:100%;border-collapse:collapse;background:#fff">
        <thead>
          <tr style="background:rgba(0,25,65,.05)">
            <td style="padding:11px 16px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#001941">Metric</td>
            <td style="padding:11px 16px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#001941">Description</td>
            <td style="padding:11px 16px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#001941;text-align:right">Value</td>
          </tr>
        </thead>
        <tbody>
          ${ledgerRows.map(row => `<tr>
            <td style="padding:13px 16px;border-top:1px solid rgba(0,25,65,.1);font-weight:700;color:#001941;font-size:.92rem">${esc(row.label)}</td>
            <td style="padding:13px 16px;border-top:1px solid rgba(0,25,65,.1);color:#4a5568;font-size:.84rem">${esc(row.desc)}</td>
            <td style="padding:13px 16px;border-top:1px solid rgba(0,25,65,.1);text-align:right;font-weight:800;font-size:1rem;color:${row.color}">${esc(fmtM(row.val))}</td>
          </tr>`).join('')}
          <tr style="background:rgba(0,25,65,.05)">
            <td colspan="2" style="padding:13px 16px;font-weight:800;color:#001941;font-size:.92rem;border-top:2px solid rgba(0,25,65,.1)">Total Identified Value</td>
            <td style="padding:13px 16px;text-align:right;font-weight:800;font-size:1.1rem;color:#001941;border-top:2px solid rgba(0,25,65,.1)">${esc(fmtM(totalId + (idRisk||0)))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>` : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(d.name || 'ROAR Dashboard')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Figtree', 'Inter', sans-serif; margin: 0; padding: 32px; background: #eef1f6; color: #001941; }
    .wrap { max-width: 960px; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="wrap">
    <!-- Hero -->
    <div style="background:#001941;border-radius:16px;margin-bottom:20px;overflow:hidden">
      <div style="height:6px;background:#ffad00"></div>
      <div style="padding:28px 32px;display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center">
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#ffad00;margin-bottom:8px">ROAR Executive Dashboard</div>
          <div style="font-size:1.6rem;font-weight:800;color:#fff;line-height:1.2;margin-bottom:12px">${esc([publisher, 'Risk &amp; Opportunity Assessment'].filter(Boolean).join(' — '))}</div>
          <div style="font-size:13px;color:rgba(255,255,255,.65)">${esc([client, d.year, today].filter(Boolean).join(' · '))}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:2.5rem;font-weight:800;color:#ffad00;letter-spacing:-.03em;line-height:1">${esc(fmtM(totalId))}</div>
          <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:6px">Total Identified Value</div>
        </div>
      </div>
    </div>
    ${kpiHTML}
    ${summaryHTML}
    ${journeyHTML}
    ${ledgerHTML}
    <!-- Footer -->
    <div style="background:rgba(0,25,65,.05);border:1px solid rgba(0,25,65,.1);border-radius:16px;padding:18px 28px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div style="font-size:12px;color:#4a5568">Generated by Anglepoint DOMOsapiens · ${esc(today)}</div>
      <div style="font-size:11px;color:#8a9ab0">Confidential — For internal use only</div>
    </div>
  </div>
</body>
</html>`;
}

export default function AutoDashViewer({ d, viewOnly = false, currentUser = '', allRecords = [], onBack, onRename, onDuplicate, onDelete }) {
  const [editMode, setEditMode] = useState(false);
  const [hidden, setHidden]     = useState({});
  const toggleHide = (k) => setHidden(p => ({ ...p, [k]: !p[k] }));

  const fields = d.fields || [];
  const get = (lbl) => parseDollar(fields.find(f => f.label === lbl)?.value);
  const idRisk      = get('Identified Risk');
  const idAvoidance = get('Identified Cost Avoidance');
  const accAvoidance= get('Accomplished Cost Avoidance');
  const idOptim     = get('Identified Cost Optimization');
  const accOptim    = get('Accomplished Cost Optimization');
  const idSavings   = get('Identified Cost Savings');
  const realSavings = get('Realized Cost Savings');
  const totalId     = idAvoidance + idOptim + idSavings || idRisk || 0;
  const totalAcc    = accAvoidance + accOptim || 0;
  const summary     = d.summary;
  const client      = d.client || '';
  const publisher   = d.publisher || '';
  const today       = new Date(d.savedAt || Date.now()).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });

  const sectionStyle = (key) => ({ background:'#fff', borderRadius:T.radius, border:`1px solid ${T.navy10}`, boxShadow:'0 6px 22px rgba(0,25,65,.06)', marginBottom:20, overflow:'hidden', opacity: hidden[key] ? 0.4 : 1, transition:'opacity .2s' });
  const sectionHead  = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 28px', borderBottom:`1px solid ${T.navy10}`, background:T.navy5 };
  const SNum = ({ n }) => <span style={{ fontSize:'2rem', fontWeight:800, color:T.yellow, lineHeight:0.9 }}>{n}</span>;

  const E = ({ tag: Tag = 'span', value, style }) => (
    <Tag contentEditable={!viewOnly && editMode} suppressContentEditableWarning
      style={{ ...style, outline: (!viewOnly && editMode) ? `2px dashed ${T.yellow}` : 'none', borderRadius:3, minHeight:'1em', display: Tag === 'span' ? 'inline' : 'block' }}>
      {value}
    </Tag>
  );

  const HideToggle = ({ skey }) => (!viewOnly && editMode) ? (
    <button onClick={() => toggleHide(skey)} style={{ background:'none', border:`1px solid ${T.navy10}`, borderRadius:6, padding:'3px 10px', fontSize:11, cursor:'pointer', color:T.slate, fontFamily:'inherit', fontWeight:700 }}>
      {hidden[skey] ? 'Show' : 'Hide'}
    </button>
  ) : null;

  const HiddenBar = ({ skey, label }) => hidden[skey] ? (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:T.navy5, border:`1px dashed ${T.navy10}`, borderRadius:T.radiusSm, padding:'10px 18px', marginBottom:20 }}>
      <span style={{ fontSize:12, color:T.midGray, fontStyle:'italic' }}><i className="ti ti-eye-off" style={{ marginRight:6 }} />{label} (hidden)</span>
      <button onClick={() => toggleHide(skey)} style={{ background:'none', border:`1px solid ${T.navy10}`, borderRadius:6, padding:'3px 10px', fontSize:11, cursor:'pointer', color:T.blue, fontFamily:'inherit', fontWeight:700 }}>Show</button>
    </div>
  ) : null;

  const kpiRows = [
    { label:'Identified Risk',              value:idRisk,      color:T.red  },
    { label:'Identified Cost Avoidance',    value:idAvoidance, color:T.blue },
    { label:'Accomplished Cost Avoidance',  value:accAvoidance,color:T.teal },
    { label:'Identified Cost Optimization', value:idOptim,     color:T.blue },
    { label:'Accomplished Cost Optimization',value:accOptim,   color:T.teal },
    { label:'Identified Cost Savings',      value:idSavings,   color:T.green},
    { label:'Realized Cost Savings',        value:realSavings, color:T.green},
  ];

  const categories = [
    { key:'opt',   title:'Cost Optimization', kicker:'Efficiency Gains',  color:T.blue,  tiles:[{val:fmtM(idOptim),cls:'opt',lbl:'Identified',meta:'Total opportunity'},{val:fmtM(accOptim),cls:'opt',lbl:'Accomplished',meta:'Realized to date'}], callout:summary?.recommendations?.[0], slideField:fields.find(f=>f.label==='Identified Cost Optimization'), show:idOptim>0||accOptim>0 },
    { key:'avoid', title:'Cost Avoidance',     kicker:'Risk Prevention',   color:T.teal,  tiles:[{val:fmtM(idAvoidance),cls:'save',lbl:'Identified',meta:'Potential avoided cost'},{val:fmtM(accAvoidance),cls:'save',lbl:'Accomplished',meta:'Confirmed avoidance'}], callout:summary?.recommendations?.[1], slideField:fields.find(f=>f.label==='Identified Cost Avoidance'), show:idAvoidance>0||accAvoidance>0 },
    { key:'risk',  title:'Savings & Risk',     kicker:'Financial Risk',    color:T.red,   tiles:[...(idSavings?[{val:fmtM(idSavings),cls:'save',lbl:'Identified Savings',meta:'Gross savings target'}]:[]),...(realSavings?[{val:fmtM(realSavings),cls:'save',lbl:'Realized Savings',meta:'Confirmed to date'}]:[]),...(idRisk?[{val:fmtM(idRisk),cls:'risk',lbl:'Identified Risk',meta:'Unmitigated exposure'}]:[])], callout:summary?.recommendations?.[2], slideField:fields.find(f=>f.label==='Identified Risk'), show:idSavings>0||realSavings>0||idRisk>0 },
  ].filter(c => c.show);

  const ledgerRows = [
    { label:'Identified Cost Avoidance',    val:idAvoidance,  color:T.teal,  desc:'Future costs prevented through proactive ITAM' },
    { label:'Accomplished Cost Avoidance',  val:accAvoidance, color:T.teal,  desc:'Confirmed avoidance already realized' },
    { label:'Identified Cost Optimization', val:idOptim,      color:T.blue,  desc:'Efficiency gains and spend reduction opportunities' },
    { label:'Accomplished Cost Optimization',val:accOptim,    color:T.blue,  desc:'Optimization actions confirmed and closed' },
    { label:'Identified Cost Savings',      val:idSavings,    color:T.green, desc:'Gross savings identified across agreements' },
    { label:'Realized Cost Savings',        val:realSavings,  color:T.green, desc:'Savings confirmed and applied to budget' },
    { label:'Identified Risk',              val:idRisk,       color:T.red,   desc:'Compliance and financial risk exposure uncovered' },
  ].filter(r => r.val > 0);

  const barData  = (summary?.charts?.roi_breakdown || []).filter(x => x.value > 0);
  const donutRaw = summary?.charts?.accomplishment_rate || {};
  const donutData = [
    ...(donutRaw.accomplished > 0 ? [{ name:'Accomplished', value: donutRaw.accomplished }] : []),
    ...(donutRaw.remaining    > 0 ? [{ name:'Remaining',    value: donutRaw.remaining    }] : []),
  ];
  const CHART_COLORS = [T.blue, T.teal, T.green, T.red, T.yellow];

  return (
    <div style={{ fontFamily:"'Figtree','Inter',sans-serif" }}>
      {/* ── Toolbar (hidden in viewOnly mode) ── */}
      {!viewOnly && (
        <>
          {(() => {
            const cu = (currentUser || '').trim().toLowerCase();
            const cb = (d.createdBy || '').trim().toLowerCase();
            const isOwner = !cu || !cb || cu === cb;
            const handleDownloadHTML = () => {
              const html = buildDashboardHTML(d);
              const a = document.createElement('a');
              a.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
              a.download = (d.name || 'dashboard') + '.html';
              a.click();
            };
            return (
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, flexWrap:'wrap' }}>
                <button className="btn ghost small" onClick={onBack}><i className="ti ti-arrow-left" /> All dashboards</button>
                <div style={{ fontWeight:700, fontSize:15, color:T.navy, flex:1 }}>{d.name}</div>
                <div style={{ fontSize:12, color:T.midGray }}>Saved {today}</div>
                {isOwner && (
                  <button className="btn ghost small" onClick={() => setEditMode(e => !e)}>
                    <i className={`ti ${editMode ? 'ti-eye' : 'ti-edit'}`} /> {editMode ? 'Preview' : 'Edit'}
                  </button>
                )}
                {isOwner && (
                  <button className="btn ghost small" title="Rename" onClick={() => { const n = window.prompt('Rename dashboard:', d.name); if (n?.trim()) onRename?.(n.trim()); }}>
                    <i className="ti ti-pencil" /> Rename
                  </button>
                )}
                <button className="btn ghost small" title="Duplicate" onClick={onDuplicate}>
                  <i className="ti ti-copy" /> Duplicate
                </button>
                <button className="btn ghost small" title="Download HTML" onClick={handleDownloadHTML}>
                  <i className="ti ti-download" /> Download HTML
                </button>
                {isOwner && (
                  <button className="btn ghost small" title="Delete" onClick={() => { if (window.confirm('Delete this dashboard?')) onDelete?.(); }} style={{ color:T.red }}>
                    <i className="ti ti-trash" /> Delete
                  </button>
                )}
              </div>
            );
          })()}
          {editMode && (
            <div style={{ position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)', background:T.navy, color:'#fff', borderRadius:30, padding:'10px 20px', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:10, boxShadow:'0 8px 28px rgba(0,25,65,.35)', zIndex:999 }}>
              <i className="ti ti-edit" style={{ color:T.yellow }} />
              Edit mode — click any text to edit · use Hide/Show to toggle sections
              <button onClick={() => setEditMode(false)} style={{ background:'rgba(255,255,255,.15)', border:'none', borderRadius:20, padding:'4px 12px', color:'#fff', cursor:'pointer', fontSize:12, fontFamily:'inherit', fontWeight:700 }}>Done Editing</button>
            </div>
          )}
        </>
      )}

      {/* ── Value at a Glance banner (optional) ── */}
      {d.includeValueAtAGlance && allRecords.length > 0 && (
        <ValueAtAGlance records={allRecords} />
      )}

      {/* ── Hero ── */}
      <div style={{ background:T.navy, borderRadius:T.radius, marginBottom:20, overflow:'hidden' }}>
        <div style={{ height:6, background:T.yellow }} />
        <div style={{ padding:'28px 32px', display:'grid', gridTemplateColumns:'1fr auto', gap:24, alignItems:'center' }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.09em', textTransform:'uppercase', color:T.yellow, marginBottom:8 }}>ROAR Executive Dashboard</div>
            <div style={{ fontSize:'clamp(1.3rem,2.5vw,2rem)', fontWeight:800, color:'#fff', lineHeight:1.2, marginBottom:12 }}>
              {[publisher, 'Risk & Opportunity Assessment'].filter(Boolean).join(' — ')}
            </div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,.65)' }}>{[client, d.year, today].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <div style={{ fontSize:'clamp(2rem,4vw,3rem)', fontWeight:800, color:T.yellow, letterSpacing:'-0.03em', lineHeight:1 }}>{fmtM(totalId)}</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,.6)', marginTop:6 }}>Total Identified Value</div>
          </div>
        </div>
      </div>

      {/* ── KPI Tiles ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:20 }}>
        {kpiRows.filter(k=>k.value>0).map(k => (
          <div key={k.label} style={{ background:'#fff', border:`1px solid ${T.navy10}`, borderRadius:T.radiusSm, padding:'16px 18px', boxShadow:'0 4px 14px rgba(0,25,65,.05)' }}>
            <div style={{ fontSize:'clamp(1.1rem,2vw,1.5rem)', fontWeight:800, color:k.color, letterSpacing:'-0.02em', lineHeight:1 }}>{fmtM(k.value)}</div>
            <div style={{ marginTop:7, fontSize:11, fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase', color:T.slate }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Section 01: Executive Summary ── */}
      <HiddenBar skey="summary" label="01 — Executive Summary" />
      {summary && !hidden.summary && (
        <div style={sectionStyle('summary')}>
          <div style={sectionHead}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <SNum n="01" />
              <div>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.09em', textTransform:'uppercase', color:T.blue, marginBottom:3 }}>Executive Summary</div>
                <div style={{ fontSize:'clamp(1rem,1.5vw,1.2rem)', fontWeight:700, color:T.navy }}>Strategic Findings & Recommendations</div>
              </div>
            </div>
            <HideToggle skey="summary" />
          </div>
          <div style={{ padding:'24px 28px' }}>
            {summary.overview && <E tag="p" value={summary.overview} style={{ fontSize:14, color:T.slate, lineHeight:1.75, marginTop:0 }} />}
            {summary.key_accomplishments?.length > 0 && (
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:T.green, marginBottom:8 }}>Key Accomplishments</div>
                <ul style={{ paddingLeft:18, color:T.slate, fontSize:13, lineHeight:1.7, margin:0 }}>
                  {summary.key_accomplishments.map((a,i) => <li key={i}><E value={a} /></li>)}
                </ul>
              </div>
            )}
            {summary.recommendations?.length > 0 && (
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:T.yellow, marginBottom:8 }}>Recommendations</div>
                <ul style={{ paddingLeft:18, color:T.slate, fontSize:13, lineHeight:1.7, margin:0 }}>
                  {summary.recommendations.map((r,i) => <li key={i}><E value={r} /></li>)}
                </ul>
              </div>
            )}
            {summary.primary_risks?.length > 0 && (
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:T.red, marginBottom:8 }}>Primary Risks</div>
                <ul style={{ paddingLeft:18, color:T.slate, fontSize:13, lineHeight:1.7, margin:0 }}>
                  {summary.primary_risks.map((r,i) => <li key={i}><E value={r} /></li>)}
                </ul>
              </div>
            )}
            {summary.next_steps?.length > 0 && (
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:T.blue, marginBottom:8 }}>Next Steps</div>
                <ul style={{ paddingLeft:18, color:T.slate, fontSize:13, lineHeight:1.7, margin:0 }}>
                  {summary.next_steps.map((s,i) => <li key={i}><E value={s} /></li>)}
                </ul>
              </div>
            )}
            {(barData.length > 0 || donutData.length > 1) && (
              <div style={{ display:'grid', gridTemplateColumns: barData.length > 0 && donutData.length > 1 ? '1fr 1fr' : '1fr', gap:20, marginTop:20 }}>
                {barData.length > 0 && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:T.slate, marginBottom:8 }}>ROI Breakdown</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={barData} margin={{ top:4, right:8, left:0, bottom:4 }}>
                        <XAxis dataKey="name" tick={{ fontSize:10 }} />
                        <YAxis tick={{ fontSize:10 }} tickFormatter={v => `$${(v/1e6).toFixed(1)}M`} />
                        <Tooltip formatter={v => `$${Number(v).toLocaleString()}`} />
                        <Bar dataKey="value" radius={[4,4,0,0]}>
                          {barData.map((_,i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {donutData.length > 1 && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:T.slate, marginBottom:8 }}>Accomplishment Rate</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={donutData} dataKey="value" innerRadius={40} outerRadius={65} paddingAngle={3}>
                          {donutData.map((_,i) => <Cell key={i} fill={i === 0 ? T.green : T.navy10} />)}
                        </Pie>
                        <Legend iconSize={10} wrapperStyle={{ fontSize:11 }} />
                        <Tooltip formatter={v => `$${Number(v).toLocaleString()}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Section 02: Value Analysis ── */}
      <HiddenBar skey="breakdown" label="02 — Value Analysis" />
      {categories.length > 0 && !hidden.breakdown && (
        <div style={sectionStyle('breakdown')}>
          <div style={sectionHead}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <SNum n="02" />
              <div>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.09em', textTransform:'uppercase', color:T.blue, marginBottom:3 }}>Value Analysis</div>
                <div style={{ fontSize:'clamp(1rem,1.5vw,1.2rem)', fontWeight:700, color:T.navy }}>Findings by Category</div>
              </div>
            </div>
            <HideToggle skey="breakdown" />
          </div>
          <div style={{ padding:'24px 28px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:20, marginBottom:24 }}>
              {categories.map(cat => (
                <div key={cat.key} style={{ background:'#fff', border:`1px solid rgba(0,25,65,.10)`, borderTop:`4px solid ${cat.color}`, borderRadius:T.radiusSm, padding:'20px 22px', boxShadow:'0 4px 14px rgba(0,25,65,.05)' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:10 }}>
                    <div style={{ fontSize:10, fontWeight:800, letterSpacing:'0.08em', textTransform:'uppercase', background:`${cat.color}18`, color:cat.color, border:`1px solid ${cat.color}40`, borderRadius:20, padding:'3px 10px' }}>{cat.kicker}</div>
                    {publisher && <div style={{ fontSize:10, fontWeight:700, color:T.midGray }}>{publisher}</div>}
                  </div>
                  <div style={{ fontWeight:800, fontSize:'1.1rem', color:T.navy, lineHeight:1.2, marginBottom:8 }}>{cat.title}</div>
                  <div style={{ display:'grid', gridTemplateColumns:`repeat(${cat.tiles.length},1fr)`, gap:8, marginBottom:14 }}>
                    {cat.tiles.map(t => (
                      <div key={t.lbl} style={{ background:'rgba(0,25,65,.04)', border:'1px solid rgba(0,25,65,.08)', borderRadius:8, padding:'10px 12px' }}>
                        <div style={{ fontSize:'1.2rem', fontWeight:800, letterSpacing:'-0.02em', lineHeight:1, color:t.cls==='risk'?T.red:cat.color }}>{t.val}</div>
                        <div style={{ marginTop:6, fontSize:'.7rem', fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase', color:T.slate }}>{t.lbl}</div>
                        <div style={{ marginTop:4, fontSize:'.74rem', color:T.midGray }}>{t.meta}</div>
                      </div>
                    ))}
                  </div>
                  {cat.callout && (
                    <div style={{ borderLeft:`3px solid ${T.yellow}`, background:'rgba(255,173,0,.08)', borderRadius:'0 6px 6px 0', padding:'10px 14px', fontSize:'.84rem', color:T.navy, lineHeight:1.5 }}>
                      {cat.callout}
                    </div>
                  )}
                  {cat.slideField?.publisher && (
                    <div style={{ marginTop:12, paddingTop:10, borderTop:'1px dashed rgba(0,25,65,.12)', fontSize:'.78rem', color:T.slate }}>
                      <i className="ti ti-file-text" style={{ color:T.blue, marginRight:5 }} />
                      Source: <strong style={{ color:T.blue }}>{cat.slideField.publisher}</strong>
                      {cat.slideField.scriptSlide ? ` · Slide ${cat.slideField.scriptSlide}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {summary && (summary.key_accomplishments?.length > 0 || summary.next_steps?.length > 0) && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, background:T.navy5, border:`1px solid ${T.navy10}`, borderRadius:T.radiusSm, padding:'16px 20px' }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase', color:T.teal, marginBottom:8 }}><i className="ti ti-trophy" style={{ marginRight:4 }} /> Top Win</div>
                  <div style={{ fontSize:'.88rem', color:T.navy, lineHeight:1.5 }}>{summary.key_accomplishments?.[0] || '—'}</div>
                </div>
                <div style={{ borderLeft:`1px solid ${T.navy10}`, paddingLeft:16 }}>
                  <div style={{ fontSize:10, fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase', color:T.yellow, marginBottom:8 }}><i className="ti ti-arrow-right" style={{ marginRight:4 }} /> Next Action</div>
                  <div style={{ fontSize:'.88rem', color:T.navy, lineHeight:1.5 }}>{summary.next_steps?.[0] || summary.recommendations?.[0] || '—'}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Section 03: ROI Journey ── */}
      <HiddenBar skey="journey" label="03 — ROI Journey" />
      {(totalId > 0 || totalAcc > 0) && !hidden.journey && (
        <div style={sectionStyle('journey')}>
          <div style={sectionHead}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <SNum n="03" />
              <div>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.09em', textTransform:'uppercase', color:T.blue, marginBottom:3 }}>ROI Journey</div>
                <div style={{ fontSize:'clamp(1rem,1.5vw,1.2rem)', fontWeight:700, color:T.navy }}>Identified → Accomplished</div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:'1.6rem', fontWeight:800, color:T.navy, letterSpacing:'-0.03em' }}>{fmtM(totalAcc)}</div>
                <div style={{ fontSize:11, color:T.slate, marginTop:4 }}>Total Accomplished</div>
              </div>
              <HideToggle skey="journey" />
            </div>
          </div>
          <div style={{ padding:'24px 28px' }}>
            {totalId > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12, fontWeight:700, color:T.slate }}>
                  <span>Identified ({fmtM(totalId)})</span>
                  <span>Accomplished ({fmtM(totalAcc)}) · {totalId ? Math.round(totalAcc/totalId*100) : 0}%</span>
                </div>
                <div style={{ background:T.navy5, borderRadius:8, height:16, overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:8, background:`linear-gradient(90deg,${T.teal},${T.green})`, width:`${totalId ? Math.min(100, Math.round(totalAcc/totalId*100)) : 0}%` }} />
                </div>
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12, marginTop:20 }}>
              {[
                { label:'Identified', value:totalId, color:T.blue, icon:'ti-target' },
                { label:'Accomplished', value:totalAcc, color:T.teal, icon:'ti-circle-check' },
                { label:'Realization Rate', value:totalId ? `${Math.round(totalAcc/totalId*100)}%` : '—', color:T.green, icon:'ti-trending-up', raw:true },
              ].map(({ label, value, color, icon, raw }) => (
                <div key={label} style={{ background:T.navy5, border:`1px solid ${T.navy10}`, borderRadius:T.radiusSm, padding:'14px 16px', textAlign:'center' }}>
                  <i className={`ti ${icon}`} style={{ fontSize:20, color, marginBottom:6, display:'block' }} />
                  <div style={{ fontSize:'1.3rem', fontWeight:800, color, lineHeight:1 }}>{raw ? value : fmtM(value)}</div>
                  <div style={{ marginTop:6, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:T.slate }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Section 04: Value Ledger ── */}
      <HiddenBar skey="ledger" label="04 — Value Ledger" />
      {ledgerRows.length > 0 && !hidden.ledger && (
        <div style={sectionStyle('ledger')}>
          <div style={sectionHead}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <SNum n="04" />
              <div>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.09em', textTransform:'uppercase', color:T.blue, marginBottom:3 }}>Value Delivered</div>
                <div style={{ fontSize:'clamp(1rem,1.5vw,1.2rem)', fontWeight:700, color:T.navy }}>Complete Metrics Ledger</div>
              </div>
            </div>
            <HideToggle skey="ledger" />
          </div>
          <div style={{ padding:'0 28px 24px' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', background:'#fff' }}>
              <thead>
                <tr style={{ background:T.navy5 }}>
                  {['Metric','Description','Value'].map(h => (
                    <td key={h} style={{ padding:'11px 16px', fontSize:11, fontWeight:800, letterSpacing:'.06em', textTransform:'uppercase', color:T.navy, textAlign:h==='Value'?'right':'left' }}>{h}</td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map(row => (
                  <tr key={row.label}>
                    <td style={{ padding:'13px 16px', borderTop:`1px solid ${T.navy10}`, fontWeight:700, color:T.navy, fontSize:'.92rem' }}>{row.label}</td>
                    <td style={{ padding:'13px 16px', borderTop:`1px solid ${T.navy10}`, color:T.slate, fontSize:'.84rem' }}>{row.desc}</td>
                    <td style={{ padding:'13px 16px', borderTop:`1px solid ${T.navy10}`, textAlign:'right', fontWeight:800, fontSize:'1rem', color:row.color }}>{fmtM(row.val)}</td>
                  </tr>
                ))}
                <tr style={{ background:T.navy5 }}>
                  <td colSpan={2} style={{ padding:'13px 16px', fontWeight:800, color:T.navy, fontSize:'.92rem', borderTop:`2px solid ${T.navy10}` }}>Total Identified Value</td>
                  <td style={{ padding:'13px 16px', textAlign:'right', fontWeight:800, fontSize:'1.1rem', color:T.navy, borderTop:`2px solid ${T.navy10}` }}>{fmtM(totalId + (idRisk||0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ background:T.navy5, border:`1px solid ${T.navy10}`, borderRadius:T.radius, padding:'18px 28px', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div style={{ fontSize:12, color:T.slate }}>Generated by Anglepoint DOMOsapiens · {today}</div>
        <div style={{ fontSize:11, color:T.midGray }}>Confidential — For internal use only</div>
      </div>
    </div>
  );
}
