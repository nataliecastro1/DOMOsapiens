import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from routes import (
    auth,
    bulk_import,
    clients,
    documents,
    executive_summary,
    export,
    extraction,
    records,
    uploads,
    roar,
)

app = FastAPI(title="ROI Tracker API")


@app.on_event("startup")
def _init_storage():
    """Connect Postgres (file metadata) and announce the file store backend.
    Both degrade gracefully — a warning is logged if Postgres is down."""
    from services import db
    from services.filestore import store

    db.init_db()
    print(f"[storage] file store backend: {store.name}")

ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3600,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(bulk_import.router)
app.include_router(export.router)
app.include_router(extraction.router)
app.include_router(records.router)
app.include_router(documents.router)
app.include_router(uploads.router)
app.include_router(clients.router)
app.include_router(roar.router)
app.include_router(executive_summary.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Alfred's optional deploy healthcheck probes GET /health for a 2xx before
# routing traffic to a new version.
@app.get("/health")
def platform_health():
    return {"status": "ok"}


STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        # Never let the SPA shell answer for an unmatched API route — that would
        # turn a deployed 404 into a 200 page of HTML and hide real bugs (the
        # fallback only exists when a built frontend is present, so this
        # otherwise differs between local dev and Alfred).
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        file = STATIC_DIR / path
        if file.is_file():
            return FileResponse(file)
        return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    # Local dev entrypoint: backend on 3599 (frontend dev server runs on 3600).
    # On Alfred the Dockerfile CMD runs uvicorn with $PORT instead.
    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=int(os.getenv("PORT", "3599")),
        reload=True,
        reload_dirs=[str(Path(__file__).parent)],
    )
