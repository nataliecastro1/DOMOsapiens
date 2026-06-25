import os

from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# ALFRED TOKEN
# CUANDO TE DEN UN TOKEN NUEVO, VE A: DOMOsapiens/backend/.env
# Y REEMPLAZA EL VALOR DE ALFRED_TOKEN CON EL NUEVO !!!
# ─────────────────────────────────────────────────────────────────────────────
ALFRED_TOKEN = os.getenv("ALFRED_TOKEN", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY", "")
TRACKER_API_KEY = os.getenv("TRACKER_API_KEY", "")

# Folder where local ROAR/ELP documents are stored.
# Drop new documents here — they will appear automatically in search results.
# Path: DOMOsapiens/backend/documents/
DOCUMENTS_DIR = os.path.join(os.path.dirname(__file__), "documents")

# ─── Alfred (legacy proxy — kept for reference) ───────────────────────────────
ALFRED_BASE_URL = os.getenv(
    "ALFRED_BASE_URL", "https://alfred-production-fdeb.up.railway.app"
).rstrip("/")

ALFRED_TOKEN_FILE = os.getenv(
    "ALFRED_TOKEN_FILE",
    os.path.join(os.path.dirname(__file__), ".alfred_token.json"),
)
