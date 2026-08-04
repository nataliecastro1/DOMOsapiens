"""
Tests for extraction output parsing and field normalization.
No API calls — validates the JSON-from-Claude parsing path and the
field contract between extraction and the hub's save endpoint.
"""

import json
import re
import pytest


SAMPLE_CLAUDE_RESPONSE = """{
  "year": 2025,
  "client": "Acme Corp",
  "publisher": "IBM",
  "date_delivered": "2025-03-15",
  "currency": "USD",
  "pricing_available": true,
  "notes": null,
  "elevate_deliverable": null,
  "overall_confidence": 82,
  "identified_risk":        {"value": 8900000, "confidence": 95, "source": "Slide 4: IDENTIFIED RISK: $8.9M"},
  "id_cost_avoidance":      {"value": 1080000, "confidence": 88, "source": "Slide 5: Cost Avoidance Identified $1.08M"},
  "acc_cost_avoidance":     {"value": 750000,  "confidence": 90, "source": "Slide 5: Accomplished $750K"},
  "id_cost_optimization":   {"value": null,    "confidence": null, "source": null},
  "acc_cost_optimization":  {"value": null,    "confidence": null, "source": null},
  "realized_savings":       {"value": 320000,  "confidence": 75, "source": "Slide 7: Realized Savings $320K"},
  "contract_spend":         {"value": 4500000, "confidence": 92, "source": "Slide 3: Annual Contract Spend $4.5M"}
}"""

SAMPLE_CLAUDE_RESPONSE_WRAPPED = f"""Here is the extracted data:

```json
{SAMPLE_CLAUDE_RESPONSE}
```

I extracted the values from the ROAR document slides."""


ABBREVIATED_TO_FULL = {
    "id_cost_avoidance": "identified_cost_avoidance",
    "acc_cost_avoidance": "accomplished_cost_avoidance",
    "id_cost_optimization": "identified_cost_optimization",
    "acc_cost_optimization": "accomplished_cost_optimization",
    "realized_savings": "realized_cost_savings",
    "contract_spend": "annual_publisher_contract_spend",
}

ROI_FIELDS = [
    "identified_risk",
    "id_cost_avoidance",
    "acc_cost_avoidance",
    "id_cost_optimization",
    "acc_cost_optimization",
    "realized_savings",
    "contract_spend",
]


def parse_claude_json(raw: str) -> dict:
    """Same logic as claude_extraction.py — extract first JSON object."""
    raw = raw.strip()
    json_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not json_match:
        raise ValueError(f"No JSON found in response: {raw[:300]}")
    return json.loads(json_match.group())


class TestJsonParsing:
    def test_clean_json(self):
        result = parse_claude_json(SAMPLE_CLAUDE_RESPONSE)
        assert result["client"] == "Acme Corp"
        assert result["year"] == 2025

    def test_wrapped_json(self):
        result = parse_claude_json(SAMPLE_CLAUDE_RESPONSE_WRAPPED)
        assert result["client"] == "Acme Corp"
        assert result["identified_risk"]["value"] == 8900000

    def test_no_json_raises(self):
        with pytest.raises(ValueError, match="No JSON found"):
            parse_claude_json("I could not extract any data from this document.")


class TestFieldContract:
    """Verify the extraction output fields match what the hub expects."""

    def test_all_roi_fields_present(self):
        result = parse_claude_json(SAMPLE_CLAUDE_RESPONSE)
        for field in ROI_FIELDS:
            assert field in result, f"Missing ROI field: {field}"

    def test_roi_fields_have_value_confidence_source(self):
        result = parse_claude_json(SAMPLE_CLAUDE_RESPONSE)
        for field in ROI_FIELDS:
            entry = result[field]
            assert "value" in entry, f"{field} missing 'value'"
            assert "confidence" in entry, f"{field} missing 'confidence'"
            assert "source" in entry, f"{field} missing 'source'"

    def test_metadata_fields_present(self):
        result = parse_claude_json(SAMPLE_CLAUDE_RESPONSE)
        for key in ["year", "client", "publisher", "currency", "overall_confidence"]:
            assert key in result, f"Missing metadata field: {key}"

    def test_abbreviation_mapping_covers_all_abbreviated_fields(self):
        result = parse_claude_json(SAMPLE_CLAUDE_RESPONSE)
        for abbrev, full in ABBREVIATED_TO_FULL.items():
            assert abbrev in result, f"Abbreviated field {abbrev} not in Claude output"


class TestFieldNormalization:
    """Test converting abbreviated field names to hub DB column names."""

    def normalize(self, data: dict) -> dict:
        out = {}
        for key, val in data.items():
            if key in ABBREVIATED_TO_FULL:
                out[ABBREVIATED_TO_FULL[key]] = val
            else:
                out[key] = val
        return out

    def test_abbreviated_to_full(self):
        result = parse_claude_json(SAMPLE_CLAUDE_RESPONSE)
        normalized = self.normalize(result)
        assert "identified_cost_avoidance" in normalized
        assert "accomplished_cost_avoidance" in normalized
        assert "realized_cost_savings" in normalized
        assert "annual_publisher_contract_spend" in normalized
        assert "id_cost_avoidance" not in normalized

    def test_identified_risk_unchanged(self):
        result = parse_claude_json(SAMPLE_CLAUDE_RESPONSE)
        normalized = self.normalize(result)
        assert "identified_risk" in normalized

    def test_values_preserved(self):
        result = parse_claude_json(SAMPLE_CLAUDE_RESPONSE)
        normalized = self.normalize(result)
        assert normalized["identified_cost_avoidance"]["value"] == 1080000
        assert normalized["annual_publisher_contract_spend"]["value"] == 4500000
