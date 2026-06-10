"""
ROI extraction using the Anthropic Claude API directly.

TOKEN SETUP:
  Open backend/.env and make sure this line is there:
  ANTHROPIC_API_KEY=sk-ant-api03-...
"""

import base64
import json
import re
from pathlib import Path

from config import ANTHROPIC_API_KEY
from services.prompt import EXTRACTION_PROMPT


def _pdf_to_base64(file_path: str) -> str:
    with open(file_path, "rb") as f:
        return base64.standard_b64encode(f.read()).decode("utf-8")


async def extract_with_claude(file_path: str) -> dict:
    """
    Send a document file directly to Claude and return extracted ROI fields.
    Claude reads the PDF visually — works with design-heavy PowerPoints and PDFs.
    """
    if not ANTHROPIC_API_KEY:
        raise ValueError(
            "Anthropic API key is not set. "
            "Open backend/.env and add: ANTHROPIC_API_KEY=sk-ant-..."
        )

    import anthropic

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    ext = Path(file_path).suffix.lower()
    b64_data = _pdf_to_base64(file_path)

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

    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=1024,
        system=EXTRACTION_PROMPT,
        messages=[{"role": "user", "content": content}],
    )

    raw = message.content[0].text.strip()

    json_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not json_match:
        raise ValueError(f"Claude did not return valid JSON. Raw: {raw[:300]}")

    return json.loads(json_match.group())
