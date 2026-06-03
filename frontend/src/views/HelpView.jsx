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
    sub: 'Every decision (approve, flag, approve with notes) is timestamped and written to the SME_Audit_Log sheet. Flags are preserved even when a file is later re-selected and approved — giving a complete change history per project.',
  },
  {
    icon: 'ti-table',
    title: 'Where data is stored',
    sub: 'Three sheets in Client_ROI_Tracker.xlsx: All_ROI_Data (extracted values), SME_Audit_Log (validation checkpoints), Source_File_Log (file references with version, path, and modification date).',
  },
  {
    icon: 'ti-layout-dashboard',
    title: 'Building dashboards',
    sub: 'Use the Dashboards view to build cross-publisher or cross-year comparisons. Choose a preset template or use custom filters to select any combination of clients, publishers, and years.',
  },
];

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
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
        For full technical documentation, open a chat and ask:{' '}
        <em>"Generate the technical documentation for the ROI Extraction app as a Word document."</em>
      </p>
    </>
  );
}
