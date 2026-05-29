import os

from dotenv import load_dotenv

load_dotenv()

# Base URL of the Alfred deployment platform. Override via .env for other envs.
ALFRED_BASE_URL = os.getenv(
    "ALFRED_BASE_URL", "https://alfred-production-fdeb.up.railway.app"
).rstrip("/")

# Where the acquired Alfred token is cached so a dev-server reload doesn't force
# re-authentication within the token's ~1 hour lifetime. Gitignored.
ALFRED_TOKEN_FILE = os.getenv(
    "ALFRED_TOKEN_FILE",
    os.path.join(os.path.dirname(__file__), ".alfred_token.json"),
)
