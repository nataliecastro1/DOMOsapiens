"""
Executive Summary endpoint — uses Claude to read the actual ROAR document
and generate a professional executive summary with real insights.
"""
import base64
import json
import os
import re
from pathlib import Path
from typing import Optional

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import ANTHROPIC_API_KEY
from services.uploads import UPLOAD_DIR
from config import DOCUMENTS_DIR

router = APIRouter(prefix="/api")

SUMMARY_PROMPT = """You are an expert IT Asset Management consultant at Anglepoint, a leading SAM advisory firm.
You are reading a ROAR (Return on Anglepoint Relationship) document. Extract and synthesize the following:

Return ONLY valid JSON in this exact structure (no markdown, no explanation):
{
  "objective": "1-2 sentence engagement objective from the document describing the client relationship and SAM scope.",
  "accomplishments": [
    "Specific accomplishment with dollar amounts from the document",
    "Specific accomplishment 2",
    "Specific accomplishment 3"
  ],
  "recommendations": [
    "Actionable recommendation from the document",
    "Recommendation 2",
    "Recommendation 3"
  ],
  "highlights": [
    { "label": "Total Identified Risk", "value": "$X.XM" },
    { "label": "Cost Avoidance Accomplished", "value": "$X.XM" }
  ]
}

Base accomplishments and recommendations on what is actually in the document.
Use specific numbers, license counts, publisher names, and client details from the document.
Write as if presenting to a C-suite executive — concise, data-driven, professional."""


class SummaryRequest(BaseModel):
    client: str = ""
    publisher: str = ""
    year: Optional[int] = None
    identified_risk: Optional[float] = None
    id_cost_avoidance: Optional[float] = None
    acc_cost_avoidance: Optional[float] = None
    id_cost_optimization: Optional[float] = None
    acc_cost_optimization: Optional[float] = None
    realized_savings: Optional[float] = None
    contract_spend: Optional[float] = None
    confidence: Optional[int] = None
    sme: Optional[str] = None
    stored_name: Optional[str] = None   # uploaded file stored name
    file_path: Optional[str] = None     # document from /documents folder


def _fmt(n):
    if not n:
        return None
    if n >= 1_000_000:
        return f"${n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"${n / 1_000:.0f}K"
    return f"${n:,.0f}"


def _extract_pptx_text(path: str) -> str:
    from pptx import Presentation
    prs = Presentation(path)
    slides = []
    for slide in prs.slides:
        lines = [
            shape.text.strip()
            for shape in slide.shapes
            if hasattr(shape, "text") and shape.text.strip()
        ]
        if lines:
            slides.append("\n".join(lines))
    return "\n\n---\n\n".join(slides)


def _build_content(body: SummaryRequest, file_path: str) -> list:
    """Build Claude message content — use document block for PDF, text for PPTX."""
    ext = Path(file_path).suffix.lower()

    kpi_lines = [
        f"Client: {body.client or 'N/A'}",
        f"Publisher: {body.publisher or 'N/A'}",
        f"Year: {body.year or 'N/A'}",
        f"Identified Risk: {_fmt(body.identified_risk) or 'N/A'}",
        f"Identified Cost Avoidance: {_fmt(body.id_cost_avoidance) or 'N/A'}",
        f"Accomplished Cost Avoidance: {_fmt(body.acc_cost_avoidance) or 'N/A'}",
        f"Identified Cost Optimization: {_fmt(body.id_cost_optimization) or 'N/A'}",
        f"Accomplished Cost Optimization: {_fmt(body.acc_cost_optimization) or 'N/A'}",
        f"Realized Cost Savings: {_fmt(body.realized_savings) or 'N/A'}",
        f"Annual Contract Spend: {_fmt(body.contract_spend) or 'N/A'}",
        f"SME: {body.sme or 'N/A'}",
    ]
    kpi_block = "Extracted KPIs:\n" + "\n".join(kpi_lines)

    if ext == ".pdf":
        with open(file_path, "rb") as f:
            b64 = base64.standard_b64encode(f.read()).decode()
        return [
            {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}},
            {"type": "text", "text": f"{kpi_block}\n\nRead the document above and generate the executive summary JSON."},
        ]
    elif ext in (".pptx", ".ppt"):
        doc_text = _extract_pptx_text(file_path)
        return [{"type": "text", "text": f"{kpi_block}\n\nDocument content:\n\n{doc_text}\n\nGenerate the executive summary JSON."}]
    else:
        return [{"type": "text", "text": f"{kpi_block}\n\nGenerate the executive summary JSON from the KPIs above."}]


def _resolve_file(body: SummaryRequest) -> Optional[str]:
    if body.stored_name:
        p = os.path.join(UPLOAD_DIR, os.path.basename(body.stored_name))
        if os.path.exists(p):
            return p
    if body.file_path:
        p = os.path.realpath(body.file_path)
        if os.path.exists(p):
            return p
    return None


@router.post("/executive-summary")
async def generate_summary(body: SummaryRequest):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="Anthropic API key not configured.")

    file_path = _resolve_file(body)

    if file_path:
        content = _build_content(body, file_path)
    else:
        # Fallback: KPIs only (no file available)
        kpi_lines = [
            f"Client: {body.client or 'N/A'}",
            f"Publisher: {body.publisher or 'N/A'}",
            f"Year: {body.year or 'N/A'}",
            f"Identified Risk: {_fmt(body.identified_risk) or 'N/A'}",
            f"Identified Cost Avoidance: {_fmt(body.id_cost_avoidance) or 'N/A'}",
            f"Accomplished Cost Avoidance: {_fmt(body.acc_cost_avoidance) or 'N/A'}",
            f"Identified Cost Optimization: {_fmt(body.id_cost_optimization) or 'N/A'}",
            f"Accomplished Cost Optimization: {_fmt(body.acc_cost_optimization) or 'N/A'}",
            f"Realized Cost Savings: {_fmt(body.realized_savings) or 'N/A'}",
        ]
        content = [{"type": "text", "text": "Generate an executive summary for this ROI engagement:\n\n" + "\n".join(kpi_lines)}]

    ai_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    message = ai_client.messages.create(
        model="claude-opus-4-5",
        max_tokens=1500,
        system=SUMMARY_PROMPT,
        messages=[{"role": "user", "content": content}],
    )

    raw = message.content[0].text.strip()
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise HTTPException(status_code=500, detail="Claude did not return valid JSON.")

    return json.loads(match.group())
