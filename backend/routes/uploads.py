import os
import re
from pathlib import Path
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from services.uploads import UploadError, UPLOAD_DIR, list_uploads, save_upload

router = APIRouter(prefix="/api")

SUSPICIOUS_PATTERNS = [
    (r'\bdraft\b',              'Looks like a draft — the document may be incomplete.'),
    (r'\bcopy\b',               'Looks like a copy — this may not be the original file.'),
    (r'\bv\d+\b',               'Looks like a versioned file (v1, v2…) — confirm this is the final version.'),
    (r'\bversion\s*\d+\b',      'Looks like a versioned file — confirm this is the final version.'),
    (r'[\(\[]\s*\d+\s*[\)\]]',  'Filename contains a number in parentheses — may be a duplicate copy.'),
    (r'\bcopy\s*\d+\b',         'Looks like a numbered copy — this may not be the original.'),
    (r'\bwip\b',                'WIP (Work In Progress) detected — document may be incomplete.'),
    (r'\btemp\b',               'Filename contains "temp" — confirm this is the correct file.'),
    (r' - \d+$',                'Filename ends with a number — may be a duplicate copy.'),
]


def _check_name(filename: str) -> list[str]:
    name = Path(filename).stem.lower()
    warnings = []
    seen = set()
    for pattern, msg in SUSPICIOUS_PATTERNS:
        if re.search(pattern, name, re.IGNORECASE) and msg not in seen:
            warnings.append(msg)
            seen.add(msg)
    return warnings


def _first_slide_text(path: str) -> str:
    ext = Path(path).suffix.lower()
    try:
        if ext in ('.pptx', '.ppt'):
            from pptx import Presentation
            from pptx.enum.shapes import MSO_SHAPE_TYPE
            prs = Presentation(path)
            if not prs.slides:
                return ''
            slide = prs.slides[0]
            lines = []
            for shape in slide.shapes:
                if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
                    for child in shape.shapes:
                        if child.has_text_frame:
                            lines.extend(p.text.strip() for p in child.text_frame.paragraphs if p.text.strip())
                elif shape.has_text_frame:
                    lines.extend(p.text.strip() for p in shape.text_frame.paragraphs if p.text.strip())
            return ' '.join(lines)
        elif ext == '.pdf':
            import base64, anthropic  # just read raw bytes for a quick text scan
            # Try simple text extraction without AI
            try:
                import pypdf
                with open(path, 'rb') as f:
                    reader = pypdf.PdfReader(f)
                    if reader.pages:
                        return reader.pages[0].extract_text() or ''
            except Exception:
                pass
    except Exception:
        pass
    return ''


@router.post("/uploads")
async def upload_file(file: UploadFile = File(...)):
    """Accept a source document (PPTX/PDF/XLSX) and store it on disk."""
    content = await file.read()
    try:
        return save_upload(file.filename, content)
    except UploadError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/uploads")
def get_uploads():
    """List previously uploaded files, newest first."""
    return list_uploads()


@router.get("/uploads/{stored_name}/check")
def check_upload(stored_name: str, client: str = '', publisher: str = '', original_filename: str = ''):
    """Scan an uploaded file for red flags: draft/copy/versioned filename, and
    whether the first page text mentions the expected client and publisher."""
    safe = os.path.basename(stored_name)
    path = os.path.join(UPLOAD_DIR, safe)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")

    # Always check the ORIGINAL filename — the stored name is a UUID hash
    name_to_check = original_filename if original_filename else safe
    warnings = _check_name(name_to_check)

    first_text = _first_slide_text(path)
    title = first_text[:120] if first_text else safe

    # Client / publisher presence check
    client_found = bool(client and re.search(re.escape(client), first_text, re.IGNORECASE))
    publisher_found = bool(publisher and re.search(re.escape(publisher), first_text, re.IGNORECASE))

    if client and not client_found:
        warnings.append(f'Client "{client}" was not found on the first page.')
    if publisher and not publisher_found:
        warnings.append(f'Publisher "{publisher}" was not found on the first page.')

    return {
        'title': title,
        'warnings': warnings,
        'is_ok': len(warnings) == 0,
    }


@router.get("/uploads/{stored_name}")
def serve_upload(stored_name: str):
    """Serve an uploaded file by its stored name."""
    safe = os.path.basename(stored_name)
    path = os.path.join(UPLOAD_DIR, safe)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)
