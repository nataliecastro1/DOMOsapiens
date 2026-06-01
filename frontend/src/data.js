// ─── Mock data for the ROI Extraction App ────────────────────────────────────
// Replace these with real API calls / Excel reads when connecting to a backend.

export const CLIENTS     = ['Encova Insurance', 'Northgate LLC', 'Acme Corp'];
export const PUBLISHERS  = ['Oracle', 'Microsoft', 'SAP', 'IBM'];
export const YEARS       = ['2025', '2024', '2023', '2022'];

export const SAMPLE_FILES = [
  { name: 'Encova_Oracle_ROAR_2025_v3.xlsx', modified: 'Apr 12 2025', size: '142 KB', version: 'v3 (final)', tag: 'Latest',  tagColor: 'green' },
  { name: 'Encova_Oracle_ROAR_2025_v2.xlsx', modified: 'Mar 3 2025',  size: '138 KB', version: 'v2',          tag: 'Draft',   tagColor: 'navy'  },
  { name: 'Encova_Oracle_ROAR_2025_v1.xlsx', modified: 'Jan 15 2025', size: '129 KB', version: 'v1',          tag: 'Initial', tagColor: 'navy'  },
];

export const EXTRACTED_FIELDS = [
  { label: 'Total savings',           value: '$2,400,000', confidence: 97, variant: 'green', source: 'Sheet: All_ROI_Data · B14' },
  { label: 'License spend',           value: '$870,000',   confidence: 95, variant: 'green', source: 'Sheet: All_ROI_Data · C14' },
  { label: 'Compliance risk avoided', value: '$340,000',   confidence: 91, variant: 'green', source: 'Sheet: Compliance · D8'    },
  { label: 'Support cost reduction',  value: '18%',        confidence: 88, variant: 'blue',  source: 'Sheet: Summary · F22'      },
  { label: 'Net ROI',                 value: '$1,530,000', confidence: 93, variant: 'green', source: 'Sheet: All_ROI_Data · H14' },
];

export const ROI_ROWS = [
  { id: 1, client: 'Encova Insurance', publisher: 'Oracle',    year: 2025, savings: '$2,400,000', roi: '$1,530,000', confidence: '93%', sme: 'J. Rivera', sourceFile: 'ROAR_2025_v3.xlsx', status: 'Stored'  },
  { id: 2, client: 'Encova Insurance', publisher: 'Microsoft', year: 2025, savings: '$1,700,000', roi: '$1,040,000', confidence: '91%', sme: 'J. Rivera', sourceFile: 'ROAR_2025_v2.xlsx', status: 'Stored'  },
  { id: 3, client: 'Encova Insurance', publisher: 'Oracle',    year: 2024, savings: '$2,140,000', roi: '$1,420,000', confidence: '95%', sme: 'T. Nguyen', sourceFile: 'ROAR_2024_v4.xlsx', status: 'Stored'  },
  { id: 4, client: 'Northgate LLC',    publisher: 'Oracle',    year: 2025, savings: '$980,000',   roi: '$590,000',   confidence: '90%', sme: 'M. Patel',  sourceFile: 'ROAR_2025_v1.xlsx', status: 'Stored'  },
  { id: 5, client: 'Acme Corp',        publisher: 'Oracle',    year: 2025, savings: '$540,000',   roi: '$310,000',   confidence: '85%', sme: '—',         sourceFile: 'ROAR_2025_v1.xlsx', status: 'Pending' },
];

export const AUDIT_ROWS = [
  { ts: '2025-05-29 09:14', client: 'Encova Insurance', publisher: 'Oracle',    year: 2025, sme: 'J. Rivera', decision: 'Approved',      decisionColor: 'green', file: 'ROAR_2025_v3.xlsx', notes: '—' },
  { ts: '2025-05-27 14:02', client: 'Encova Insurance', publisher: 'Oracle',    year: 2025, sme: 'J. Rivera', decision: 'Flagged',       decisionColor: 'red',   file: 'ROAR_2025_v1.xlsx', notes: 'Wrong version, use v3' },
  { ts: '2025-05-26 11:30', client: 'Encova Insurance', publisher: 'Microsoft', year: 2025, sme: 'J. Rivera', decision: 'Approved',      decisionColor: 'green', file: 'ROAR_2025_v2.xlsx', notes: '—' },
  { ts: '2025-05-20 10:15', client: 'Northgate LLC',    publisher: 'Oracle',    year: 2025, sme: 'M. Patel',  decision: 'With notes',    decisionColor: 'amber', file: 'ROAR_2025_v1.xlsx', notes: 'Tab 3 only, ignore tab 5' },
];

export const SOURCE_FILE_ROWS = [
  { filename: 'Encova_Oracle_ROAR_2025_v3.xlsx',    client: 'Encova',   publisher: 'Oracle',    year: 2025, version: 'v3 (final)', modified: 'Apr 12 2025', size: '142 KB', usedOn: '2025-05-29', sme: 'J. Rivera' },
  { filename: 'Encova_MSFT_ROAR_2025_v2.xlsx',      client: 'Encova',   publisher: 'Microsoft', year: 2025, version: 'v2',         modified: 'Mar 3 2025',  size: '138 KB', usedOn: '2025-05-26', sme: 'J. Rivera' },
  { filename: 'Encova_Oracle_ROAR_2024_v4.xlsx',    client: 'Encova',   publisher: 'Oracle',    year: 2024, version: 'v4 (final)', modified: 'Nov 8 2024',  size: '136 KB', usedOn: '2025-03-14', sme: 'T. Nguyen' },
  { filename: 'Northgate_Oracle_ROAR_2025_v1.xlsx', client: 'Northgate',publisher: 'Oracle',    year: 2025, version: 'v1',         modified: 'May 1 2025',  size: '98 KB',  usedOn: '2025-05-20', sme: 'M. Patel'  },
];

export const ROW_DETAILS = [
  { title: 'Encova · Oracle · 2025',    file: 'Encova_Oracle_ROAR_2025_v3.xlsx', ver: 'v3 (final)', mod: 'Apr 12 2025', size: '142 KB', path: '/SharePoint/Clients/Encova/Oracle/2025/',     decision: 'Approved',          sme: 'J. Rivera', sme_ts: '2025-05-29 09:12', extract_ts: '2025-05-29 09:14', stored_ts: '2025-05-29 09:15', notes: '' },
  { title: 'Encova · Microsoft · 2025', file: 'Encova_MSFT_ROAR_2025_v2.xlsx',   ver: 'v2',         mod: 'Mar 3 2025',  size: '138 KB', path: '/SharePoint/Clients/Encova/Microsoft/2025/',  decision: 'Approved',          sme: 'J. Rivera', sme_ts: '2025-05-26 11:28', extract_ts: '2025-05-26 11:30', stored_ts: '2025-05-26 11:31', notes: '' },
  { title: 'Encova · Oracle · 2024',    file: 'Encova_Oracle_ROAR_2024_v4.xlsx', ver: 'v4 (final)', mod: 'Nov 8 2024',  size: '136 KB', path: '/SharePoint/Clients/Encova/Oracle/2024/',     decision: 'Approved with notes',sme: 'T. Nguyen', sme_ts: '2025-03-14 14:05', extract_ts: '2025-03-14 14:07', stored_ts: '2025-03-14 14:08', notes: 'Use cols D–G only' },
  { title: 'Northgate · Oracle · 2025', file: 'Northgate_Oracle_ROAR_2025_v1.xlsx', ver: 'v1',      mod: 'May 1 2025',  size: '98 KB',  path: '/SharePoint/Clients/Northgate/Oracle/2025/', decision: 'Approved with notes',sme: 'M. Patel',  sme_ts: '2025-05-20 10:13', extract_ts: '2025-05-20 10:15', stored_ts: '2025-05-20 10:16', notes: 'Tab 3 only, ignore tab 5' },
  { title: 'Acme · Oracle · 2025',      file: 'Acme_Oracle_ROAR_2025_v1.xlsx',   ver: 'v1',         mod: 'May 10 2025', size: '74 KB',  path: '/SharePoint/Clients/Acme/Oracle/2025/',      decision: 'Pending',           sme: '—',         sme_ts: '—',                extract_ts: '—',               stored_ts: '—',                notes: '' },
];

export const SAVED_DASHBOARDS = [
  { name: 'Encova — All Publishers 2025', sub: 'Client overview · updated 2 days ago', badge: '4 publishers', badgeColor: 'blue'  },
  { name: 'Encova — Oracle All Years',    sub: 'Trend view · 2022–2025',               badge: '4 years',       badgeColor: 'blue'  },
  { name: 'Northgate — Microsoft 2023–2025', sub: 'Custom · 3 years',                  badge: 'Custom',        badgeColor: 'gold'  },
];

export const EXTRACTION_STEPS = [
  'Parsing workbook structure',
  'Identifying ROI sections',
  'Extracting cost & savings values',
  'Mapping to standard schema',
  'Confidence scoring',
];
