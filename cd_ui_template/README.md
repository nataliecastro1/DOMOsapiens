# ROI Extraction App

Anglepoint-branded React application for extracting, validating, and storing client ROI data.

## Quick Start

```bash
cd roi-extraction-app
npm install
npm run dev
```

Then open http://localhost:5173 in your browser.

## Build for production

```bash
npm run build
npm run preview
```

## Project Structure

```
roi-extraction-app/
├── index.html
├── vite.config.js
├── package.json
└── src/
    ├── main.jsx          # React entry point
    ├── App.jsx           # Root component — view routing, global state
    ├── index.css         # All styles (Anglepoint color tokens + components)
    ├── data.js           # Mock data — replace with real API calls
    ├── components/
    │   ├── TopBar.jsx    # App header with logo and user
    │   ├── Sidebar.jsx   # Left navigation
    │   └── Badge.jsx     # Reusable colored badge
    └── views/
        ├── ExtractionView.jsx   # 6-step extraction flow
        ├── DashboardsView.jsx   # Dashboard builder + saved dashboards
        ├── TrackerView.jsx      # ROI data, SME audit log, source file tabs
        ├── ClientsView.jsx      # Client list
        └── HelpView.jsx         # Quick reference
```

## Connecting Real Data

All mock data lives in `src/data.js`. To connect a real backend:

1. **File discovery** — replace `SAMPLE_FILES` with a SharePoint/OneDrive API call filtered by client + publisher + year.
2. **ROI extraction** — replace `EXTRACTED_FIELDS` and `EXTRACTION_STEPS` with calls to your Python extraction script (`roar_extractor.py`).
3. **Storing results** — the Store screen currently shows a preview only. Wire the "Save All & Done" button to an API endpoint that appends a row to `Client_ROI_Tracker.xlsx` (sheets: `All_ROI_Data`, `SME_Audit_Log`, `Source_File_Log`).
4. **Tracker tables** — replace `ROI_ROWS`, `AUDIT_ROWS`, `SOURCE_FILE_ROWS`, `ROW_DETAILS` with live reads from the Excel workbook or a database.

## Tech Stack

- [React 18](https://react.dev/)
- [Vite 4](https://vitejs.dev/)
- [Tabler Icons](https://tabler.io/icons) (webfont, loaded via CDN in index.html)
- Plain CSS with custom properties (no CSS framework)

## Anglepoint Brand Tokens

All colors are defined as CSS custom properties in `src/index.css`:

| Token          | Hex       | Usage                        |
|----------------|-----------|------------------------------|
| `--navy`       | `#001941` | Primary text, backgrounds    |
| `--gold`       | `#ffad00` | Accent, CTAs, step indicator |
| `--blue`       | `#005f86` | Secondary accent, links      |
| `--blue-light` | `#0089af` | Supporting                   |
| `--dark-blue`  | `#003861` | Supporting                   |
