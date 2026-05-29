from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import auth, client_scopes

app = FastAPI(title="DOMOsapiens API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(client_scopes.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
