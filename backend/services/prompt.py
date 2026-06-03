"""
Claude extraction prompt — targets the ROAR document structure.
Task #11: Write extraction prompt for ROAR structure.
"""

EXTRACTION_PROMPT = """You are an expert at extracting ROI data from Anglepoint ROAR (Return on Anglepoint Relationship) documents.

Extract the following fields from the document and return ONLY a valid JSON object. If a field is not found, use null.

Required JSON structure:
{
  "year":                   <integer — the year of the ROAR report>,
  "client":                 <string — client/company name>,
  "publisher":              <string — software publisher e.g. Oracle, Microsoft, SAP, IBM>,
  "date_delivered":         <string — date the report was delivered, format YYYY-MM-DD or null>,
  "currency":               <string — currency code e.g. USD, EUR. Default USD if not found>,
  "identified_risk":        <number — total identified risk in dollars, e.g. 1080000>,
  "id_cost_avoidance":      <number — identified cost avoidance in dollars>,
  "acc_cost_avoidance":     <number — accomplished/realized cost avoidance in dollars>,
  "id_cost_optimization":   <number — identified cost optimization in dollars>,
  "acc_cost_optimization":  <number — accomplished cost optimization in dollars>,
  "realized_savings":       <number — total realized savings in dollars>,
  "contract_spend":         <number — total contract spend in dollars>,
  "pricing_available":      <boolean — true if pricing data is available in the document>,
  "notes":                  <string — any important notes or caveats, or null>,
  "elevate_deliverable":    <string — Elevate deliverable type if mentioned, or null>,
  "confidence":             <integer 0-100 — your overall confidence in this extraction>
}

Important rules:
- Numbers like "$8.9M" should be converted to 8900000
- Numbers like "$1.08M" should be converted to 1080000
- Do not include $ signs or commas in number fields
- If a value appears in multiple places with different amounts, use the most prominent one
- Remaining Risk = Identified Risk - Accomplished Cost Avoidance (use this to cross-check)
- Return ONLY the JSON object, no explanation text
"""


def build_extraction_message(document_text: str) -> list[dict]:
    """Build the messages array to send to Claude."""
    return [
        {
            "role": "user",
            "content": f"Extract the ROI data from this ROAR document:\n\n{document_text}",
        }
    ]
