"""
ROAR Test Runner
================
Purpose:
    Loop through PowerPoint files in the test_pptx directory, extract ROI data
    using roar_extractor, and write the results to a CSV file for easy review.

Usage:
    python roar_test.py
    
    Results are written to: backend/documents/test_pptx/roar_extraction_results.csv
"""

import csv
import json
from pathlib import Path

from roar_extractor import extract_roar


def flatten_roi_field(field_data: dict) -> dict:
    """
    Flatten a single ROI field value into a dict suitable for CSV columns.
    
    Args:
        field_data: A single field entry from roi_fields dict
        
    Returns:
        Flattened dict with keys like:
        - value
        - currency
        - confidence
        - source_slide
        - raw
        - alternates_count
    """
    alternates = field_data.get("alternates", [])
    
    return {
        "value": field_data.get("value"),
        "currency": field_data.get("currency"),
        "confidence": field_data.get("confidence"),
        "source_slide": field_data.get("source_slide"),
        "capacity": field_data.get("capacity"),
        "votes": field_data.get("votes"),
        "raw": field_data.get("raw", ""),
        "shape_name": field_data.get("shape_name", ""),
        "alternates_count": len(alternates),
        "alternates_json": json.dumps(alternates) if alternates else "",
    }


def process_roar_files(test_pptx_dir: Path) -> list[dict]:
    """
    Process all PPTX files in the test directory.
    
    Args:
        test_pptx_dir: Path to the test_pptx directory
        
    Returns:
        List of result rows, one per file + field combination
    """
    results = []
    
    # Find all .pptx files
    pptx_files = sorted(test_pptx_dir.glob("*.pptx"))
    
    if not pptx_files:
        print(f"No .pptx files found in {test_pptx_dir}")
        return results
    
    print(f"Found {len(pptx_files)} PPTX file(s) to process:\n")
    
    for pptx_file in pptx_files:
        print(f"  Processing: {pptx_file.name}...", end=" ", flush=True)
        
        try:
            extraction_result = extract_roar(str(pptx_file))
            
            # Basic file-level info
            file_info = {
                "filename": extraction_result.get("file"),
                "client": extraction_result.get("client"),
                "publisher": extraction_result.get("publisher"),
                "month": extraction_result.get("month"),
                "year": extraction_result.get("year"),
                "currency": extraction_result.get("currency"),
                "warnings": " | ".join(extraction_result.get("warnings", [])),
            }
            
            roi_fields = extraction_result.get("roi_fields", {})
            fields_not_found = extraction_result.get("fields_not_found", [])
            
            if not roi_fields:
                # File processed but no ROI fields found
                row = file_info.copy()
                row["field_name"] = "N/A"
                row["field_status"] = "not_found"
                row["value"] = None
                row["currency"] = None
                row["confidence"] = None
                row["source_slide"] = None
                results.append(row)
                print("✓ (no ROI fields found)")
            else:
                # Add a row for each ROI field found
                for field_name, field_data in roi_fields.items():
                    row = file_info.copy()
                    row["field_name"] = field_name
                    row["field_status"] = "found"
                    
                    # Flatten the field data
                    flattened = flatten_roi_field(field_data)
                    row.update(flattened)
                    
                    results.append(row)
                
                # Add rows for fields not found
                for field_name in fields_not_found:
                    row = file_info.copy()
                    row["field_name"] = field_name
                    row["field_status"] = "not_found"
                    row["value"] = None
                    row["currency"] = None
                    row["confidence"] = None
                    row["source_slide"] = None
                    results.append(row)
                
                print(f"✓ ({len(roi_fields)} fields extracted)")
        
        except Exception as e:
            print(f"✗ ERROR: {e}")
            row = {
                "filename": pptx_file.name,
                "field_name": "ERROR",
                "field_status": "error",
                "error_message": str(e),
            }
            results.append(row)
    
    return results


def write_csv_results(results: list[dict], output_file: Path) -> None:
    """
    Write extraction results to a CSV file.
    
    Args:
        results: List of result rows
        output_file: Path where CSV should be written
    """
    if not results:
        print("No results to write.")
        return
    
    # Define column order for readability
    fieldnames = [
        "filename",
        "field_name",
        "field_status",
        "value",
        "currency",
        "confidence",
        "source_slide",
        "capacity",
        "votes",
        "raw",
        "shape_name",
        "alternates_count",
        "alternates_json",
        "client",
        "publisher",
        "month",
        "year",
        "warnings",
        "error_message",
    ]
    
    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, restval="")
        writer.writeheader()
        writer.writerows(results)
    
    print(f"\n✓ Results written to: {output_file}")


def main():
    """Main entry point."""
    # Determine paths
    backend_dir = Path(__file__).parent.parent
    test_pptx_dir = backend_dir / "documents" / "test_pptx"
    output_csv = test_pptx_dir / "roar_extraction_results.csv"
    
    # Create test_pptx directory if it doesn't exist
    test_pptx_dir.mkdir(parents=True, exist_ok=True)
    
    # Process files
    results = process_roar_files(test_pptx_dir)
    
    # Write CSV
    if results:
        write_csv_results(results, output_csv)
        print(f"\nTotal rows written: {len(results)}")
    else:
        print("\nNo files processed.")


if __name__ == "__main__":
    main()
