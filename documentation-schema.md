# ROI Prototype — Data Model

Two storage systems, both durable across Alfred redeploys.

| Environment | Postgres | File store (uploaded documents) |
|---|---|---|
| **Local** | `DATABASE_URL` → local Postgres `roi_tracker` | `backend/data/s3/` (folder mimicking S3 keys) |
| **Alfred** | injected automatically (managed DB `alfred_roi_prototype`) | injected automatically (managed bucket, prefix `app-data/roi-prototype/`) |

Nothing to configure on Alfred — the platform injects `DATABASE_URL` and the
`BUCKET_*` variables at every deploy. If `DATABASE_URL` is absent the app falls
back to JSON files under `backend/data/`, which is fine locally but **ephemeral
on Alfred**.

## Postgres

### `files` — one row per uploaded document

Metadata for every upload. The bytes live in the file store; this table is the
`file ID ↔ original filename ↔ storage key` mapping.

| Column | Type | Notes |
|---|---|---|
| `id` | text, PK | MD5 of the file contents — identical uploads dedupe to one row |
| `filename` | text, not null | Original client-supplied filename |
| `stored_name` | text, unique | `<id><ext>`, the name used in URLs |
| `storage_key` | text, not null | Key within the store, e.g. `uploads/<id>.pptx` |
| `storage_backend` | text, not null | `local` or `s3` — which store holds it |
| `content_type` | text | Extension without the dot (`pptx`, `pdf`, `xlsx`) |
| `size_bytes` | bigint | |
| `uploaded_at` | timestamptz, default `now()` | |
| `uploaded_by` | text | SSO display name, from Alfred's headers — never the request body |
| `uploaded_by_email` | text | SSO email. On a dedup hit the first uploader is kept |

### `json_documents` — the app's document collections

The ROI records, audit trail, client roster, and API keys are variable-shape
documents, so each is stored as one JSONB row rather than forced into columns.
This keeps the `list[dict]` shape the app was written against (see
`backend/services/jsonstore.py`) while making it durable.

| Column | Type | Notes |
|---|---|---|
| `collection` | text, PK part | Which logical list this belongs to (below) |
| `doc_id` | text, PK part | The document's own id — `record_id`, `event_id`, client `name`, key `id` |
| `seq` | bigserial | Preserves list order; audit history stays chronological |
| `data` | jsonb, not null | The document itself |
| `updated_at` | timestamptz, default `now()` | |

Indexes: PK `(collection, doc_id)`, plus `(collection, seq)` for ordered reads.

**Collections**

| `collection` | `doc_id` | Contents | Legacy file |
|---|---|---|---|
| `roi_records` | `record_id` (`r_<hex12>`) | The reviewed ROI records — the app's core data | `roi_records.json` |
| `audit_events` | `event_id` | Append-only history: create/edit/approve, with old/new values and who | `audit_log.json` |
| `clients` | `name` | Client dropdown roster | `clients.json` |
| `api_keys` | `id` | SHA-256 hashes of issued BI/Domo keys — never the raw key | `api_keys.json` |

On first connect, an existing legacy JSON file is imported once and then
ignored (629 records and 4,554 audit events migrated on the local database).

**Key fields inside `roi_records.data`** — the authoritative list is
`backend/models/field_catalog.py`, which also drives the UI columns and the
export sheets:

`record_id`, `year`, `client`, `publisher`, `date_delivered`, `currency`,
`identified_risk`, `id_cost_avoidance`, `acc_cost_avoidance`,
`id_cost_optimization`, `acc_cost_optimization`, `realized_savings`,
`contract_spend`, `pricing_available`, `notes`, `elevate_deliverable`,
`confidence`, `source_file`, `stored_name`, `sme`, `field_meta` (per-field
provenance: source slide + confidence), `executive_summary`, `saved_at`.

**Delivery-hub provenance inside `roi_records.data`** — populated when the wizard
is opened from the hub's Status View ROI button, which deep-links with the
deliverable's identifiers:

| Field | Meaning |
|---|---|
| `hub_scope_id` | `client_scopes.id` — the key `/v1/roi/save` expects |
| `hub_deliverable_id` | `sow_deliverables.id` the ROI belongs to |
| `hub_deliverable_name` | Deliverable name at handoff time, for display |
| `hub_pathfinder_id` | Client scope pathfinder id (the business-facing reference) |
| `workstream` | What the hub calls the *team* |
| `hub_roi_metric_id` | `roi_metrics.id` the hub returned, set after a successful push |
| `hub_saved_at` | When it was pushed to the hub |

`sme` is set server-side from the SSO identity on save and edit, so the audit
trail reflects who actually made the change.

## File store

Uploaded documents (`.pptx`, `.ppt`, `.pdf`, `.xlsx`, 50 MB limit) under key
`uploads/<md5><ext>`. `backend/data/uploads/` is a **disposable render cache** —
thumbnails, slide rendering, and PPTX→PDF conversion need a real filesystem
path, so files are re-materialised from the store on demand. That cache being
empty after a redeploy is expected and self-healing.

`backend/documents/` (reference ROAR decks) is deliberately excluded from the
deploy tarball — it holds real client material, so document search starts empty
on Alfred.

## Relationship to the delivery hub

This app owns its own data. When a record is reviewed, the user sends it to the
hub's `POST /v1/roi/save`, which writes the hub's own `roi_metrics` table with
RBAC, an audit row, and an SSE event. That call is made **from the browser** on
Alfred's shared origin, so the user's SSO session authorises it — no tokens, no
service account, and no database sharing between the two projects.
