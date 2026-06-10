from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import auth, client_scopes, clients, extraction, records, uploads, documents

app = FastAPI(title="DOMOsapiens API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(client_scopes.router)
app.include_router(extraction.router)
app.include_router(records.router)
app.include_router(documents.router)
app.include_router(uploads.router)
app.include_router(clients.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
