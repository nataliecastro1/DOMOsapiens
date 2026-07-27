import React, { useState, useEffect } from 'react';

const METRICS = [
  { key: 'identified_risk',     label: 'Identified Risk',            color: '#e74c3c' },
  { key: 'id_cost_avoidance',   label: 'Cost Avoidance Identified',  color: '#f4c300' },
  { key: 'acc_cost_avoidance',  label: 'Avoidance Accomplished',     color: '#e67e22' },
  { key: '_remaining_risk',     label: 'Remaining Risk',             color: '#2980b9' },
  { key: 'id_cost_savings',     label: 'Potential Cost Savings',     color: '#16a085' },
  { key: 'realized_savings',    label: 'Realized Cost Savings',      color: '#27ae60' },
];

const sumMetric = (rows, key) => {
  if (key === '_remaining_risk') {
    const id  = rows.reduce((s, r) => s + (Number(r.identified_risk) || 0), 0);
    const acc = rows.reduce((s, r) => s + (Number(r.acc_cost_avoidance) || 0), 0);
    return Math.max(0, id - acc);
  }
  if (key === 'id_cost_savings') {
    const a = rows.reduce((s, r) => s + (Number(r.id_cost_optimization) || 0), 0);
    const b = rows.reduce((s, r) => s + (Number(r.id_cost_savings) || 0), 0);
    return a || b;
  }
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
};

const fmtVal = (v) => {
  if (!v) return '—';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

export default function ValueAtAGlance({ records = [] }) {
  const allYears = [...new Set(records.map(r => r.year).filter(Boolean))].sort();
  const [fromYear, setFromYear] = useState(allYears[0] ?? null);
  const [toYear,   setToYear]   = useState(allYears[allYears.length - 1] ?? null);

  useEffect(() => {
    const ys = [...new Set(records.map(r => r.year).filter(Boolean))].sort();
    setFromYear(ys[0] ?? null);
    setToYear(ys[ys.length - 1] ?? null);
  }, [records]);

  const yearFiltered = records.filter(r => {
    const y = r.year;
    if (!y) return true;
    if (fromYear && y < fromYear) return false;
    if (toYear   && y > toYear)   return false;
    return true;
  });

  const allPublishers = [...new Set(yearFiltered.map(r => r.publisher).filter(Boolean))].sort();
  const [selectedPubs, setSelectedPubs] = useState(null);
  const activePubs = selectedPubs ?? allPublishers;

  const togglePub = (pub) => {
    if (!selectedPubs) {
      setSelectedPubs(allPublishers.filter(p => p !== pub));
    } else if (selectedPubs.includes(pub)) {
      const next = selectedPubs.filter(p => p !== pub);
      setSelectedPubs(next.length === allPublishers.length ? null : next);
    } else {
      const next = [...selectedPubs, pub];
      setSelectedPubs(next.length === allPublishers.length ? null : next);
    }
  };

  const finalRecords = yearFiltered.filter(r =>
    !r.publisher ? activePubs.length === 0 : activePubs.includes(r.publisher)
  );

  const kpis    = METRICS.map(m => ({ ...m, value: sumMetric(finalRecords, m.key) }));
  const pubRows = allPublishers
    .filter(p => activePubs.includes(p))
    .map(pub => ({ pub, values: METRICS.map(m => sumMetric(finalRecords.filter(r => r.publisher === pub), m.key)) }));
  const totalRow = { values: METRICS.map(m => sumMetric(finalRecords, m.key)) };

  if (allYears.length === 0) return null;

  return (
    <div style={{ marginBottom: 28, borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.10)' }}>
      {/* Header */}
      <div style={{ background: '#001941', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, flex: '0 0 auto' }}>Value at a Glance</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <span style={{ color: '#aab4c4' }}>From</span>
          <select value={fromYear ?? ''} onChange={e => setFromYear(e.target.value || null)}
            style={{ background: '#0a2a5e', color: '#fff', border: '1px solid #2a4a7e', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontFamily: 'inherit' }}>
            {allYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <span style={{ color: '#aab4c4' }}>To</span>
          <select value={toYear ?? ''} onChange={e => setToYear(e.target.value || null)}
            style={{ background: '#0a2a5e', color: '#fff', border: '1px solid #2a4a7e', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontFamily: 'inherit' }}>
            {allYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {allPublishers.map(pub => {
            const on = activePubs.includes(pub);
            return (
              <button key={pub} onClick={() => togglePub(pub)} style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                fontFamily: 'inherit', cursor: 'pointer',
                background: on ? '#fff' : 'transparent',
                color: on ? '#001941' : '#aab4c4',
                border: `1px solid ${on ? '#fff' : '#2a4a7e'}`,
              }}>{pub}</button>
            );
          })}
        </div>
      </div>

      {/* KPI boxes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', background: '#f5f7fa' }}>
        {kpis.map(kpi => (
          <div key={kpi.key} style={{ background: '#fff', borderTop: `4px solid ${kpi.color}`, padding: '16px 14px', textAlign: 'center', borderRight: '1px solid #eaecf0' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#001941', lineHeight: 1.1 }}>{fmtVal(kpi.value)}</div>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 6, lineHeight: 1.3 }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Publisher table */}
      {pubRows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#001941', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 16px', textAlign: 'left', color: '#fff', fontWeight: 700, borderBottom: '1px solid #0a2a5e', background: '#0a1f4e' }}>Publisher</th>
              {METRICS.map(m => (
                <th key={m.key} style={{ padding: '10px 12px', textAlign: 'right', color: m.color, fontWeight: 700, borderBottom: '1px solid #0a2a5e', background: '#0a1f4e', fontSize: 12 }}>{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pubRows.map(({ pub, values }, ri) => (
              <tr key={pub} style={{ background: ri % 2 === 0 ? '#001941' : '#00204e' }}>
                <td style={{ padding: '9px 16px', color: '#fff', fontWeight: 600 }}>{pub}</td>
                {values.map((v, ci) => (
                  <td key={ci} style={{ padding: '9px 12px', textAlign: 'right', color: METRICS[ci].color, fontWeight: 500 }}>{fmtVal(v)}</td>
                ))}
              </tr>
            ))}
            <tr style={{ background: '#001030', borderTop: '2px solid #0a2a5e' }}>
              <td style={{ padding: '10px 16px', color: '#fff', fontWeight: 800 }}>Total</td>
              {totalRow.values.map((v, ci) => (
                <td key={ci} style={{ padding: '10px 12px', textAlign: 'right', color: METRICS[ci].color, fontWeight: 800 }}>{fmtVal(v)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
