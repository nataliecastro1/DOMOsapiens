import os

from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY", "")

ROI_MODEL = os.getenv("ROI_MODEL", "claude-sonnet-4-20250514")
ROI_MAX_TOKENS = int(os.getenv("ROI_MAX_TOKENS", "2048"))

# Folder where local ROAR/ELP documents are stored.
# Drop new documents here — they will appear automatically in search results.
# Path: DOMOsapiens/backend/documents/
DOCUMENTS_DIR = os.path.join(os.path.dirname(__file__), "documents")

# Delivery-hub calls are made from the browser on Alfred's shared origin
# (/app/roi-prototype/ -> /app/delivery-hub/), authenticated by the user's own
# SSO session — see frontend/src/services/hub.js. No token lives here.
