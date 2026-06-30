# DOMOsapiens — ROI Extraction Platform

> Internal documentation for Anglepoint's ROAR → ROI extraction, validation, and tracking app.
> This file is self-contained and can be read on its own (GitHub, a wiki, or any Markdown viewer).

---

## 1. What this app does

DOMOsapiens turns **ROAR documents** (*Return on Anglepoint Relationship* — the PowerPoint/PDF deliverables Anglepoint produces for clients) into **clean, structured ROI records** that can be reviewed by a subject-matter expert (SME), edited with a full audit trail, charted in dashboards, and pushed downstream into Domo / BI tools.

The core problem it solves: ROI numbers (identified risk, cost avoidance, cost optimization, realized savings, etc.) are buried inside design-heavy slide decks, one per client engagement. Pulling those numbers out by hand is slow and error-prone. This app reads the document with AI, proposes the values, lets a human confirm them, and stores them in one consistent place.

**The pipeline in one line:**

```
Request → Find/Upload file → SME validates → AI extracts → Compare/correct → Store → Done
```

Every store and every later edit is written to an **append-only audit log**, so each number keeps a complete history of who changed it, when, and why.

---

## 2. High-level architecture

The app is two pieces that run side by side on a developer/analyst machine:

| Piece | Tech | Default URL | Responsibility |
|-------|------|-------------|----------------|
| **Frontend** | React + Vite, Recharts for charts | `http://localhost:5173` | The whole UI: login, the extraction wizard, the tracker table, dashboards, settings. |
| **Backend** | Python, FastAPI, served by Uvicorn | `http://localhost:8000` | Reads documents, calls the Claude API, stores records to JSON, serves exports, guards the secure API. |

```
┌─────────────────────────────┐         HTTP / JSON          ┌──────────────────────────────────────┐
│         Frontend (React)    │  ───────────────────────────▶│            Backend (FastAPI)           │
│                             │                               │                                        │
│  • LoginView                │   POST /api/uploads           │  routes/   ── HTTP layer               │
│  • ExtractionView (wizard)  │   POST /api/roar/extract      │  services/ ── business logic           │
│  • TrackerView (table)      │   POST /api/extract           │  models/   ── data shapes + catalog    │
│  • DashboardsView (charts)  │   POST /api/executive-summary │                                        │
│  • ClientsView / Settings   │   GET  /api/records           │   ┌──────────────┐  ┌───────────────┐ │
│                             │   PATCH/api/records/{id}      │   │ Claude API   │  │ Local files   │ │
│  services/api.js  ◀─────────┼───────────────────────────────┼──▶│ (Anthropic)  │  │ data/*.json   │ │
└─────────────────────────────┘                               │   └──────────────┘  └───────────────┘ │
                                                               └──────────────────────────────────────┘
```

There is **no database**. State is plain files on disk under `backend/data/`:

- `roi_records.json` — every stored ROI record.
- `audit_log.json` — the append-only event history (creates + edits).
- `clients.json` — the client roster for the dropdown.
- `uploads/` — the raw uploaded source documents (stored under a UUID filename).

---

## 3. The extraction pipeline (the heart of the app)

The UI walks the user through a **7-step journey bar** in `ExtractionView.jsx`. Each step is a "screen"; the bar at the top shows progress and lets the user jump back.

| # | Step | Screen component | What happens |
|---|------|------------------|--------------|
| 0 | **Request** | `ScreenRequest` | Pick a client / year / publisher to search for an existing file, **or** drag-and-drop up to 4 documents to upload. Uploaded files go to `POST /api/uploads`. |
| 1 | **Files** | `ScreenFiles` | Browse the matching documents (from the local `documents/` folder search) and select which one(s) to process. |
| 2 | **SME Validate** | `ScreenValidate` | The SME confirms the right file/version was chosen and signs their name. A wrong-version *flag* is recorded but does **not** proceed — the SME must re-select. |
| 3 | **Extract** | `ScreenExtract` / `BatchExtract` | The document is sent to the backend for extraction (see §4). The proposed ROI fields come back with per-field confidence and provenance. |
| 4 | **Compare** | `ScreenCompare` | Side-by-side review of extracted values vs. any alternates. The SME can correct any value before it's saved. |
| 5 | **Store** | `ScreenStore` | The confirmed record is written to `roi_records.json` via `POST /api/records`. For batches, records can be stored individually or aggregated. |
| 6 | **Done** | `ScreenDone` | Confirmation, plus shortcuts to the Tracker or Dashboards. Optionally generate an executive summary. |

Key idea: **the AI proposes, the SME disposes.** Nothing is stored until a human has seen the numbers on the Compare/Store screens. When extraction fails or returns nothing, the UI shows a blank field template (`BLANK_FIELDS`) rather than inventing mock numbers.

---

## 4. How extraction actually works

There are **two extraction engines**, and they are complementary:

### 4a. Deterministic script extractor — `services/roar_extractor.py`
- Endpoint: `POST /api/roar/extract` (accepts a `.pptx`/`.pdf` upload).
- Uses `python-pptx` + `rapidfuzz` to parse a ROAR deck that follows the standard Anglepoint template.
- Reads the **cover slide** (client, publisher, month, year), **OPC metadata** (author, dates, revision), and the **Executive Summary** slides (identified risk, cost avoidance, cost optimization, remaining risk, currency).
- Handles IBM-style **full- vs sub-capacity** values: the full-capacity number is taken as primary, the sub-capacity number is kept as a lower-confidence *alternate*.
- Fast, free, and predictable — but only works when the deck matches the expected layout.

### 4b. Claude AI extractor — `services/claude_extraction.py`
- Endpoint: `POST /api/extract` (works on a file already in `documents/` or `uploads/`).
- Uses the **Anthropic Claude API** (`anthropic` SDK). Requires `ANTHROPIC_API_KEY` in `backend/.env`.
- For **PDFs**: the file is base64-encoded and sent as a `document` block so Claude reads it *visually* — robust to design-heavy layouts.
- For **PPTX**: text is extracted from every shape (including grouped shapes and tables) and sent as text.
- The system prompt (`services/prompt.py`, `EXTRACTION_PROMPT`) tells Claude exactly which JSON fields to return and how to normalize numbers (e.g. `"$8.9M"` → `8900000`, no `$`/commas). It also returns a 0–100 **confidence** score.
- Resilient to layout variation; this is the engine that handles non-standard decks.

The model used is set in code (`claude-opus-4-5`); both engines return the same canonical ROI field set so the rest of the app doesn't care which one ran.

### 4c. Executive summary — `routes/executive_summary.py`
A separate, richer Claude call (`POST /api/executive-summary`) that reads the full document plus the already-extracted KPIs and returns a structured C-suite summary: overview, key accomplishments, metrics, recommendations, risks, next steps, highlights, and chart data. `POST /api/executive-summary/augment` lets the user feed in extra free-text that Claude folds into the existing summary professionally. Summaries are attached to a record via `PATCH /api/records/executive-summary` and rendered by `ExecutiveSummaryReport.jsx` (which can export to PDF via `html2pdf.js`).

---

## 5. The data model

### The ROI record — `models/__init__.py` (`ROIRecord`)
One record = one ROAR document mapped to the **15 Domo columns** plus metadata. The monetary fields are:

`identified_risk`, `id_cost_avoidance`, `acc_cost_avoidance`, `id_cost_optimization`, `acc_cost_optimization`, `realized_savings`, `contract_spend`.

Plus context: `year`, `client`, `publisher`, `date_delivered`, `currency`, `pricing_available`, `notes`, `elevate_deliverable`, `confidence`, `source_file`, `sme`, `stored_name`, and a stable `record_id`.

Each metric can also carry **provenance** (`FieldMeta`): which slide the value came from, the per-field confidence, and any runner-up `alternates`.

### The field catalog — `models/field_catalog.py` (single source of truth)
Every field is described **exactly once** here, with four independent flags:

- `ui_visible` — does the Tracker render this column?
- `editable` — can an SME correct it inline?
- `exportable` — does it flow into the Domo/XLSX export?
- `provenance` — does it carry per-metric `FieldMeta`?

The frontend builds its Tracker columns and tooltips from `GET /api/fields`, and the XLSX export documents every column from the same list — so the UI and the export **can never drift** from the definitions.

---

## 6. Storage, editing, and the audit trail — `services/storage.py` + `services/audit.py`

- **Save** (`POST /api/records`) upserts by `stored_name` or `source_file` so re-extracting the same document doesn't create a duplicate. A new record gets a `record_id` (`r_<hex>`) and a `create` audit event; a re-save logs an `update` and never wipes an existing executive summary.
- **Edit** (`PATCH /api/records/{record_id}`) applies a partial change map. **Each changed field becomes one immutable audit event** recording old value → new value, who (`user`), when, and an optional `note`. `record_id` and `saved_at` are never editable.
- **Audit log** is append-only — nothing is ever overwritten, so every record keeps its full change history. Read it per-record (`GET /api/records/{id}/audit`) or globally (`GET /api/audit-log`).

### Exports
- `GET /api/records/export.csv` — the 15 clean Domo columns.
- `GET /api/records/export.xlsx` — a 4-sheet workbook, all joined on `record_id`:
  1. **All_ROI_Data** — clean ROI values (Domo-ready).
  2. **SME_Audit_Log** — the full event history.
  3. **Field_Provenance** — per-field source slide + confidence (long format).
  4. **Field_Definitions** — the field catalog (what every column means).

---

## 7. The four main views

| View | File | Purpose |
|------|------|---------|
| **ROI Extraction** | `ExtractionView.jsx` | The 7-step wizard described in §3. The app's primary workflow. |
| **ROI Tracker** | `TrackerView.jsx` | The master table of stored records. Columns are driven by the field catalog; editable fields can be corrected inline (each edit logged); supports search, column show/hide, "export view" to CSV, XLSX download, and per-record drill-down with provenance + audit history. |
| **Dashboards** | `DashboardsView.jsx` | Build cross-client / cross-publisher / cross-year comparisons. Choose a preset template (client–all-publishers, publisher–all-years, full client history) or custom filters. Saved dashboard configs persist in `localStorage`. |
| **Clients** | `ClientsView.jsx` | Manage the active client roster used by the dropdowns. |

Plus supporting screens: **Login** (`LoginView.jsx`), **Help & Docs** (`HelpView.jsx` — includes the developer API reference), and **Settings** (`SettingsView.jsx` — theme + password).

### Login & the client-folder gate
Login is a lightweight local gate (`LoginView.jsx`) — not enterprise SSO. After login, a one-time **ClientFolderGate** modal offers to point the app at your local **Client Delivery** folder. It reads only the **folder names** (via the browser's `showDirectoryPicker`, Chrome/Edge only) to populate the client dropdown — **no files are opened or uploaded**, so OneDrive online-only folders are safe. The user can always skip and use the built-in list.

---

## 8. Security & the integration API

For BI ingestion there's a protected endpoint, `GET /api/records/secure`, guarded by API keys (`routes/records.py` → `require_tracker_api_key`):

- An admin issues a **named key** with the CLI in `backend/manage_keys.py`:
  ```bash
  python manage_keys.py create "Domo-prod"   # prints the full key ONCE
  python manage_keys.py list                  # shows keys (no secrets)
  python manage_keys.py revoke <id>           # revoke anytime
  ```
- Keys are stored **hashed** (`services/api_keys.py`) and cannot be recovered after creation. The integrator sends it as the `X-Tracker-Api-Key` header (or `Authorization: Bearer <key>`).
- A single shared `TRACKER_API_KEY` env value is supported as a legacy fallback.
- A runnable example client lives at `backend/examples/tracker_api_client.py`.

> Note: the open `GET /api/records` (no key) exists for local use. CORS is locked to `localhost:5173–5176`. This app is built to run locally, not as a hardened public service.

### Alfred (legacy)
`routes/auth.py` and `routes/client_scopes.py` wire up a device-authorization flow against Anglepoint's **Alfred** service to fetch client scopes. This is kept for reference / optional integration; the everyday flow uses the local client roster and folder gate instead.

---

## 9. Running the app locally

### Backend
```bash
cd backend
python -m venv .venv && source .venv/Scripts/activate   # Windows Git Bash
pip install -r requirements.txt

# Configure secrets — copy the example and fill in your key:
#   ANTHROPIC_API_KEY=sk-ant-api03-...
cp .env.example .env

uvicorn main:app --reload --port 8000
```
Dependencies: `fastapi`, `uvicorn`, `anthropic`, `python-pptx`, `pypdf`, `rapidfuzz`, `openpyxl`, `python-multipart`, `httpx`, `python-dotenv`.

### Frontend
```bash
cd frontend
npm install
npm run dev        # Vite dev server on http://localhost:5173
```
Build for production with `npm run build` (output in `frontend/dist/`).

### Adding source documents
Drop any `.pdf` / `.pptx` into `backend/documents/` — no restart needed; the folder is rescanned on every search request. The recommended filename convention is `CLIENT_PUBLISHER_YEAR.pdf` (e.g. `UPS_IBM_ROAR_2025.pdf`) so the search filters match.

---

## 10. Backend API reference (quick)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Liveness check. |
| `POST` | `/api/uploads` | Upload a source document; returns stored metadata. |
| `GET` | `/api/uploads` / `/api/uploads/{stored_name}` | List / serve uploaded files. |
| `GET` | `/api/documents/search` | Search the local `documents/` folder by client/year/publisher. |
| `POST` | `/api/roar/extract` | Deterministic script extraction from an uploaded PPTX/PDF. |
| `POST` | `/api/extract` | Claude AI extraction from a file in `documents/` or `uploads/`. |
| `POST` | `/api/executive-summary` | Generate a structured executive summary. |
| `POST` | `/api/executive-summary/augment` | Fold extra free-text into an existing summary. |
| `GET` | `/api/fields` | The field catalog (drives Tracker columns + tooltips). |
| `POST` | `/api/records` | Save (upsert) an ROI record. |
| `GET` | `/api/records` | All records (open, local use). |
| `GET` | `/api/records/secure` | All records (**API-key protected**) — for BI ingestion. |
| `PATCH` | `/api/records/{record_id}` | Edit fields; each change logged to the audit trail. |
| `PATCH` | `/api/records/executive-summary` | Attach a generated summary to a record. |
| `GET` | `/api/records/{record_id}/audit` | Per-record audit history. |
| `GET` | `/api/audit-log` | Full append-only audit history. |
| `GET` | `/api/records/export.csv` / `export.xlsx` | Download exports. |
| `GET` | `/api/clients` · `POST /api/clients` | Read / add to the client roster. |
| `GET` | `/api/client-scopes` | Alfred client scopes (legacy). |
| `POST` | `/api/auth/start` · `GET /api/auth/status` · `POST /api/auth/logout` | Alfred device-auth flow (legacy). |

---

## 11. Project layout

```
DOMOsapiens/
├── backend/
│   ├── main.py                  # FastAPI app + router wiring + CORS
│   ├── config.py                # env / paths (ANTHROPIC_API_KEY, DOCUMENTS_DIR, …)
│   ├── manage_keys.py           # admin CLI for tracker API keys
│   ├── requirements.txt
│   ├── routes/                  # HTTP layer (one file per concern)
│   │   ├── extraction.py        #   POST /api/extract (Claude)
│   │   ├── roar.py              #   POST /api/roar/extract (script)
│   │   ├── executive_summary.py #   exec-summary generation/augment
│   │   ├── records.py           #   records CRUD, audit, exports, secure API
│   │   ├── uploads.py · documents.py · clients.py
│   │   ├── auth.py · client_scopes.py   # Alfred (legacy)
│   ├── services/                # business logic
│   │   ├── claude_extraction.py · roar_extractor.py · prompt.py
│   │   ├── storage.py · audit.py · api_keys.py · clients.py · uploads.py
│   │   ├── alfred.py · client_scope.py
│   ├── models/
│   │   ├── __init__.py          # ROIRecord, FieldMeta, RecordUpdate, auth models
│   │   └── field_catalog.py     # single source of truth for field metadata
│   └── data/                    # the "database": JSON files + uploads/
│
└── frontend/
    ├── src/
    │   ├── App.jsx              # shell: login gate → client gate → views
    │   ├── data.js             # static option lists + display scaffolding
    │   ├── services/
    │   │   ├── api.js          # all backend calls
    │   │   └── dashboardData.js# dashboard aggregation helpers
    │   ├── views/              # ExtractionView, TrackerView, DashboardsView, …
    │   └── components/         # Sidebar, TopBar, ExecutiveSummaryReport, gates…
    └── package.json            # React + Vite + Recharts
```

---

## 12. Glossary

- **ROAR** — *Return on Anglepoint Relationship*. The client-facing PowerPoint/PDF deliverable that this app extracts ROI numbers from.
- **SME** — *Subject-Matter Expert*. The analyst who validates the file and confirms/corrects the extracted numbers.
- **ELP** — *Effective License Position*. A separate deliverable; contains unit pricing / contract spend that a standard ROAR does not.
- **Provenance** — the record of *where* a number came from (which slide) and how confident the extractor was.
- **Domo** — the downstream BI platform the clean records feed into; the "15 Domo columns" are its ingestion contract.
- **Alfred** — Anglepoint's internal auth/client-scope service (legacy integration).
```
