import os
import httpx
from dotenv import load_dotenv

load_dotenv()

ALFRED_TOKEN    = os.getenv("ALFRED_TOKEN")
ALFRED_PROXY_URL = os.getenv("ALFRED_PROXY_URL", "https://alfred-production-fdeb.up.railway.app/v1/proxy/messages")

SYSTEM_PROMPT = """You are an expert at extracting ROI data from client reports.
When given text from a document, extract the following fields if present:
- Total savings
- License spend
- Compliance risk avoided
- Support cost reduction
- Net ROI

Return a JSON object with these exact keys:
{
  "total_savings": "...",
  "license_spend": "...",
  "compliance_risk_avoided": "...",
  "support_cost_reduction": "...",
  "net_roi": "...",
  "confidence": 0-100
}

If a field is not found, use null. Confidence is your overall confidence (0-100) in the extraction.
"""

async def extract_roi_from_text(document_text: str) -> dict:
    """Send document text to Claude via Alfred proxy and extract ROI fields."""
    headers = {
        "Authorization": f"Bearer {ALFRED_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 1024,
        "system": SYSTEM_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": f"Extract the ROI data from this document:\n\n{document_text}",
            }
        ],
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(ALFRED_PROXY_URL, json=payload, headers=headers)
        response.raise_for_status()

    data = response.json()
    # Claude returns the text in content[0].text
    import json
    raw_text = data["content"][0]["text"]

    # Parse the JSON Claude returns
    # Strip markdown code fences if present
    raw_text = raw_text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("```")[1]
        if raw_text.startswith("json"):
            raw_text = raw_text[4:]
    raw_text = raw_text.strip()

    return json.loads(raw_text)
