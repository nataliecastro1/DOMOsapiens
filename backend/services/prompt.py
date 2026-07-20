"""
Claude extraction prompt — targets the ROAR document structure.
Task #11: Write extraction prompt for ROAR structure.
"""

EXTRACTION_PROMPT = """You are an expert at extracting ROI data from Anglepoint ROAR (Return on Anglepoint Relationship) documents.

Extract the following fields and return ONLY a valid JSON object. Metadata fields are flat values. Each ROI numeric field is an object with value, confidence, and source.

Required JSON structure:
{
  "year":               <integer — the year of the ROAR report>,
  "client":             <string — client/company name>,
  "publisher":          <string — software publisher e.g. Oracle, Microsoft, SAP, IBM>,
  "date_delivered":     <string — date delivered, format YYYY-MM-DD or null>,
  "currency":           <string — currency code e.g. USD, EUR. Default USD if not found>,
  "pricing_available":  <boolean — true if pricing data is available>,
  "notes":              <string — any important notes or caveats, or null>,
  "elevate_deliverable":<string — Elevate deliverable type if mentioned, or null>,
  "overall_confidence": <integer 0-100 — your overall confidence in this extraction>,

  "identified_risk":        {"value": <number or null>, "confidence": <0-100 or null>, "source": <verbatim quote + slide/page reference, or null>},
  "id_cost_avoidance":      {"value": <number or null>, "confidence": <0-100 or null>, "source": <verbatim quote + slide/page reference, or null>},
  "acc_cost_avoidance":     {"value": <number or null>, "confidence": <0-100 or null>, "source": <verbatim quote + slide/page reference, or null>},
  "id_cost_optimization":   {"value": <number or null>, "confidence": <0-100 or null>, "source": <verbatim quote + slide/page reference, or null>},
  "acc_cost_optimization":  {"value": <number or null>, "confidence": <0-100 or null>, "source": <verbatim quote + slide/page reference, or null>},
  "realized_savings":       {"value": <number or null>, "confidence": <0-100 or null>, "source": <verbatim quote + slide/page reference, or null>},
  "contract_spend":         {"value": <number or null>, "confidence": <0-100 or null>, "source": <verbatim quote + slide/page reference, or null>}
}

Rules for ROI numeric fields:
- "value": convert "$8.9M" → 8900000, "$1.08M" → 1080000. No $ or commas. null if not found.
- "confidence": your confidence in this specific field (0-100). null if value is null.
- "source": the verbatim text you found this in, with slide/page reference e.g. "Slide 4: IDENTIFIED RISK: $222K". null if value is null.
- If a value appears in multiple places with different amounts, use the most prominent one.
- Remaining Risk = Identified Risk - Accomplished Cost Avoidance (use this to cross-check).
- Return ONLY the JSON object, no explanation text.
"""


def build_extraction_message(document_text: str) -> list[dict]:
    """Build the messages array to send to Claude."""
    return [
        {
            "role": "user",
            "content": f"Extract the ROI data from this ROAR document:\n\n{document_text}",
        }
    ]
