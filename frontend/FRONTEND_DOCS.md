# Frontend Documentation — DOMOsapiens

> Generated: 2026-06-03

---

## 1. Framework & Libraries

| Item | Detail |
|---|---|
| **Framework** | React 18.2.0 |
| **Build Tool** | Vite 7.0.0 (`@vitejs/plugin-react` 4.0.0) |
| **Component Library** | None — all UI is hand-rolled with custom CSS |
| **Icons** | Tabler Icons (CDN, class prefix `ti-`) |
| **Typography** | TT Norms Pro (loaded via `@font-face` in `index.css`) |
| **API Proxy** | Vite dev proxy → `http://localhost:8000` |

No external UI framework (MUI, Chakra, etc.) is used.

---

## 2. Component & File Inventory

### `src/components/`

| File | Purpose |
|---|---|
| `Badge.jsx` | Inline colored status pill. Accepts a `color` prop (`blue`, `gold`, `navy`, `green`, `red`, `amber`) and `children`. Maps to `.badge.{color}` CSS classes. |
| `ClientScopesButton.jsx` | Dev/debug button that triggers a DOMO device-auth flow (`/api/auth/start`, `/api/auth/status`) and fetches client scopes from `/api/client-scopes`. Logs results to console. Not wired into the main UI layout. |
| `Sidebar.jsx` | Left-side navigation. Renders two groups: top nav (`ROI Extraction`, `Dashboards`, `ROI Tracker`, `Clients`) and bottom nav (`Help & Docs`, `Settings`). Accepts `activeView` and `onNav` props. |
| `TopBar.jsx` | Top application bar. Displays the Anglepoint logo, a context breadcrumb (`ctxLabel`), and a user avatar/dropdown for "Christina D." with a logout action. |

### `src/views/`

| File | Purpose |
|---|---|
| `LoginView.jsx` | Full-page login form. Hardcoded credentials: `username === 'christina'` / `password === '123456'`. Calls `onLogin()` on success. |
| `ExtractionView.jsx` | Primary view. Hosts the 6-step Journey Bar and manages the full extraction pipeline (see Section 3). |
| `DashboardsView.jsx` | Shows saved dashboards and four dashboard templates. Clicking a template opens a `DashboardBuilder` sub-component with filter controls (client, publisher, year, metrics) and a preview panel. |
| `TrackerView.jsx` | ROI Tracker with three tabs: `ROI Data`, `SME Audit Log`, `Source Files`. Renders from `ROI_ROWS`, `AUDIT_ROWS`, `SOURCE_FILE_ROWS`. Rows in `ROI Data` are clickable and open a `RowDetailPanel`. |
| `ClientsView.jsx` | Card list of active client accounts with name, extraction count summary, and a status `Badge`. |
| `HelpView.jsx` | Static quick-reference documentation for four help topics covering the extraction workflow, SME audit trail, data storage, and dashboard building. |

### `src/` (root)

| File | Purpose |
|---|---|
| `App.jsx` | Root component. Manages `loggedIn` state (gates to `LoginView`), `activeView` state, and renders `TopBar` + `Sidebar` + the active view. Defines `VIEW_META` for page titles/subtitles. |
| `main.jsx` | React entry point. Calls `ReactDOM.createRoot` and renders `<App />` in `StrictMode`. |
| `data.js` | Central mock data module. Exports: `CLIENTS`, `PUBLISHERS`, `YEARS`, `SAMPLE_FILES`, `EXTRACTED_FIELDS`, `ROI_ROWS`, `AUDIT_ROWS`, `SOURCE_FILE_ROWS`, `ROW_DETAILS`, `SAVED_DASHBOARDS`, `EXTRACTION_STEPS`. |
| `index.css` | All application styles — CSS custom properties (design tokens), layout, component styles, responsive breakpoints, and `@font-face` declarations. |
| `services/api.js` | Thin fetch wrapper. Base URL `/api`. Exports `get(path)`, `post(path, body)`, and `extractROI(documentText)` which posts `{ document_text: documentText }` to `/extract`. |

---

## 3. Stepper — Journey Bar

The stepper is called the **Journey Bar** and lives in `ExtractionView.jsx`.

### Step Definitions

```js
const STEP_DEFS = [
  { label: 'Request',      icon: 'ti-adjustments-horizontal' },
  { label: 'Files',        icon: 'ti-files'                  },
  { label: 'SME Validate', icon: 'ti-user-check'             },
  { label: 'Extract',      icon: 'ti-cpu'                    },
  { label: 'Store',        icon: 'ti-database'               },
  { label: 'Done',         icon: 'ti-circle-check'           },
];
```

The six steps, in order: **Request → Files → SME Validate → Extract → Store → Done**

### Implementation Mechanics

- `ExtractionView` holds a `step` integer in state (`useState(0)`).
- The `JourneyBar` sub-component receives `currentStep` and computes:
  - `isDone = i < currentStep` → icon turns blue, shows a checkmark
  - `isActive = i === currentStep` → icon pulses gold (CSS `pulse-ring` keyframe)
- Steps are **clickable** — users can jump back to any prior step via `onStep(i)`.
- Between step icons, a `journey-connector` div turns blue when that step is complete.

### State Transitions

| From screen | Trigger | Next step |
|---|---|---|
| `ScreenRequest` | `onNext` | 1 — Files |
| `ScreenFiles` | `onSelect(file)` | 2 — SME Validate |
| `ScreenValidate` | `onConfirm(smeName)` | 3 — Extract |
| `ScreenExtract` | `onNext(fields)` | 4 — Store |
| `ScreenStore` | `onNext(handleStore)` | 5 — Done |
| `ScreenDone` | `onNewExtraction` | 0 — Request (reset) |

---

## 4. ROI Field Data — State Shape

### Mock data (`data.js` → `EXTRACTED_FIELDS`)

Each field is an object with five keys:

```js
{
  label:      string,   // human-readable field name
  value:      string,   // formatted dollar amount or percentage
  confidence: number,   // integer 0–100
  variant:    string,   // badge color: 'green' | 'blue'
  source:     string,   // spreadsheet cell reference, e.g. 'Sheet: All_ROI_Data · B14'
}
```

Current mock values:

```js
export const EXTRACTED_FIELDS = [
  { label: 'Total savings',           value: '$2,400,000', confidence: 97, variant: 'green', source: 'Sheet: All_ROI_Data · B14' },
  { label: 'License spend',           value: '$870,000',   confidence: 95, variant: 'green', source: 'Sheet: All_ROI_Data · C14' },
  { label: 'Compliance risk avoided', value: '$340,000',   confidence: 91, variant: 'green', source: 'Sheet: Compliance · D8'    },
  { label: 'Support cost reduction',  value: '18%',        confidence: 88, variant: 'blue',  source: 'Sheet: Summary · F22'      },
  { label: 'Net ROI',                 value: '$1,530,000', confidence: 93, variant: 'green', source: 'Sheet: All_ROI_Data · H14' },
];
```

### Parent state (`ExtractionView`)

```js
const [step, setStep]               = useState(0);
const [selectedFile, setFile]       = useState(null);
const [smeName, setSmeName]         = useState('');
const [finalFields, setFinalFields] = useState(null);
```

`finalFields` is set twice during the flow:
1. **From `ScreenExtract`** — either the API response mapped to field objects, or `EXTRACTED_FIELDS` as fallback.
2. **From `ScreenStore`** — `EXTRACTED_FIELDS.map(f => ({ ...f, value: editValues[f.label] }))`, merging any user edits back into the original field shape.

### Edit state (`ScreenStore`)

```js
const [editValues, setEditValues] = useState(
  () => Object.fromEntries(EXTRACTED_FIELDS.map(f => [f.label, f.value]))
);
const [editingLabel, setEditingLabel] = useState(null);
```

`editValues` is a plain object keyed by label string: `{ 'Total savings': '$2,400,000', ... }`. `editingLabel` is the label string of whichever card is in edit mode, or `null`.

### Live API response shape (`/api/extract`)

When the backend returns data, `ScreenExtract` maps it to this shape (note: `confidence` and `source` per-field are **not** present in the live shape):

```js
[
  { label: 'Total Savings',           value: extractedData.total_savings           || '—', variant: 'green' },
  { label: 'License Spend',           value: extractedData.license_spend           || '—', variant: 'green' },
  { label: 'Compliance Risk Avoided', value: extractedData.compliance_risk_avoided || '—', variant: 'green' },
  { label: 'Support Cost Reduction',  value: extractedData.support_cost_reduction  || '—', variant: 'blue'  },
  { label: 'Net ROI',                 value: extractedData.net_roi                 || '—', variant: 'green' },
]
```

A single top-level `confidence` value is read as `extractedData?.confidence ?? 94` and displayed as overall extraction confidence. The per-field `confidence` and `source` keys are mock-only.

#### Backend response keys consumed

| Key | Used for |
|---|---|
| `total_savings` | Total Savings field value |
| `license_spend` | License Spend field value |
| `compliance_risk_avoided` | Compliance Risk Avoided field value |
| `support_cost_reduction` | Support Cost Reduction field value |
| `net_roi` | Net ROI field value |
| `confidence` | Overall extraction confidence percentage |
