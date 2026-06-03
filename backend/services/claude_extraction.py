"""
ROI extraction using the Alfred proxy (Anglepoint's Claude gateway).

TOKEN SETUP — CUANDO TE DEN UN TOKEN NUEVO:
  1. Abre el archivo:  DOMOsapiens/backend/.env   ← ESE ARCHIVO
  2. Reemplaza el valor de ALFRED_TOKEN con el token nuevo (lts_...)
  3. Guarda el archivo y reinicia el backend.
"""

import base64
import json
import re
from pathlib import Path

import httpx
from config import ALFRED_TOKEN, ALFRED_BASE_URL
from services.prompt import EXTRACTION_PROMPT


def _pdf_to_base64(file_path: str) -> str:
    with open(file_path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("utf-8")


async def extract_with_claude(file_path: str) -> dict:
    """
    Send a document file directly to Claude via Alfred proxy.
    Claude reads the PDF visually — no text extraction needed.
    """
    if not ALFRED_TOKEN:
        raise ValueError(
            "Alfred token is not set. "
            "Abre backend/.env y pon el token en ALFRED_TOKEN=lts_..."
        )

    ext = Path(file_path).suffix.lower()
    b64_data = _pdf_to_base64(file_path)

    # Build the message — send PDF directly as a document block
    if ext == ".pdf":
        content = [
            {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": b64_data,
                },
            },
            {
                "type": "text",
                "text": "Extract the ROI data from this ROAR document and return the JSON.",
            },
        ]
    else:
        content = [
            {
                "type": "text",
                "text": "Extract the ROI data from this ROAR document and return the JSON.",
            }
        ]

    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 1024,
        "system": EXTRACTION_PROMPT,
        "messages": [{"role": "user", "content": content}],
    }

    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            f"{ALFRED_BASE_URL}/v1/proxy/messages",
            headers={
                "Authorization": f"Bearer {ALFRED_TOKEN}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if response.status_code != 200:
        raise ValueError(
            f"Alfred returned {response.status_code}: {response.text[:300]}"
        )

    data = response.json()
    raw = data["content"][0]["text"].strip()

    json_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not json_match:
        raise ValueError(f"Claude did not return valid JSON. Raw: {raw[:300]}")

    return json.loads(json_match.group())
