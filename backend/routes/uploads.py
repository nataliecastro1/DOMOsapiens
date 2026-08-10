import io
import os
import re
import zipfile
from pathlib import Path
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response

from services.identity import current_user
from services.uploads import UploadError, delete_upload, list_uploads, local_path, save_upload

router = APIRouter(prefix="/api")


def _resolve(stored_name: str) -> str:
    """Turn a stored_name into a local path (fetching from the file store if
    the render cache is cold), or 404."""
    path = local_path(stored_name)
    if not path:
        raise HTTPException(status_code=404, detail="File not found")
    return path

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
async def upload_file(request: Request, file: UploadFile = File(...)):
    """Accept a source document (PPTX/PDF/XLSX) and store it durably.

    The uploader is taken from Alfred's SSO headers, so `uploaded_by` records
    who actually sent the file rather than whatever the client claimed."""
    content = await file.read()
    try:
        return save_upload(file.filename, content, uploaded_by=current_user(request))
    except UploadError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/uploads")
def get_uploads():
    """List previously uploaded files, newest first."""
    return list_uploads()


# Common legal/corporate suffixes that carry no identifying signal
_NOISE_WORDS = {
    'llc', 'inc', 'corp', 'ltd', 'co', 'the', 'and', 'of', 'for',
    'a', 'an', 'company', 'group', 'holdings', 'financial', 'services',
    'international', 'solutions', 'technologies', 'technology',
}

def _name_matches(typed: str, text: str) -> bool:
    """Return True if the document text contains the typed name or a meaningful
    portion of it.  Handles cases like typing 'OneMain Financial Holdings, LLC'
    when the document says 'OneMain' — the core identifying word still matches."""
    if not typed:
        return True

    # 1. Fast path: exact substring match
    if re.search(re.escape(typed), text, re.IGNORECASE):
        return True

    # 2. Word-level match: pull out significant words (≥3 chars, not noise)
    words = re.findall(r"[A-Za-z0-9'\-]{3,}", typed)
    sig = [w for w in words if w.lower() not in _NOISE_WORDS]
    if not sig:
        return False

    # At least half the significant words must appear as whole words in the text
    found = sum(
        1 for w in sig
        if re.search(r'\b' + re.escape(w) + r'\b', text, re.IGNORECASE)
    )
    return found >= max(1, round(len(sig) * 0.5))


@router.get("/uploads/{stored_name}/check")
def check_upload(stored_name: str, client_scope_name: str = '', publisher: str = '', original_filename: str = ''):
    """Scan an uploaded file for red flags: draft/copy/versioned filename, and
    whether the first page text mentions the expected client scope name and publisher."""
    safe = os.path.basename(stored_name)
    path = _resolve(safe)

    name_to_check = original_filename if original_filename else safe
    warnings = _check_name(name_to_check)

    first_text = _first_slide_text(path)
    title = first_text[:120] if first_text else safe

    if client_scope_name and not _name_matches(client_scope_name, first_text):
        warnings.append(f'No match found for "{client_scope_name}" — this document may belong to a different client.')
    if publisher and not _name_matches(publisher, first_text):
        warnings.append(f'No match found for "{publisher}" — this document may be for a different publisher.')

    return {
        'title': title,
        'warnings': warnings,
        'is_ok': len(warnings) == 0,
    }


@router.get("/uploads/{stored_name}/slide-meta")
def slide_meta(stored_name: str):
    """Extract year (and raw text snippet) from the first slide/page of an uploaded file."""
    path = _resolve(stored_name)

    text = _first_slide_text(path)
    # Prefer years in the 2000s/2010s/2020s range; take the first one found
    years = re.findall(r'\b(20\d{2})\b', text)
    year = years[0] if years else None
    return {'year': year, 'text_snippet': text[:300]}


@router.get("/uploads/{stored_name}/thumbnail")
def serve_thumbnail(stored_name: str):
    """Return the cover thumbnail for a document.
    PPTX: extracts the embedded docProps/thumbnail.jpeg (instant, zero conversion).
    PDF: renders page 1 at 2× via fitz."""
    path = _resolve(stored_name)
    ext = Path(path).suffix.lower()

    if ext in ('.pptx', '.ppt'):
        with zipfile.ZipFile(path) as z:
            for candidate in ('docProps/thumbnail.jpeg', 'docProps/thumbnail.jpg', 'docProps/thumbnail.png'):
                if candidate in z.namelist():
                    mime = 'image/png' if candidate.endswith('.png') else 'image/jpeg'
                    return Response(z.read(candidate), media_type=mime)
        raise HTTPException(status_code=404, detail="No embedded thumbnail")

    if ext == '.pdf':
        try:
            import fitz
            doc = fitz.open(path)
            page = doc[0]
            pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
            data = pix.tobytes('png')
            doc.close()
            return Response(data, media_type='image/png')
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    raise HTTPException(status_code=415, detail="Preview not supported for this file type")


def _get_pdf_path(file_path: str) -> str:
    """Return path to a renderable PDF for any supported file. Converts PPTX on demand."""
    ext = Path(file_path).suffix.lower()
    if ext == '.pdf':
        return file_path
    if ext in ('.pptx', '.ppt'):
        return _pptx_to_pdf(file_path)
    raise ValueError(f"Unsupported file type: {ext}")


def _render_slide_png(file_path: str, page_index: int, scale: float = 2.0) -> bytes:
    """Render a single page/slide as PNG bytes using PyMuPDF."""
    import fitz
    pdf_path = _get_pdf_path(file_path)
    doc = fitz.open(pdf_path)
    try:
        if page_index < 0 or page_index >= doc.page_count:
            raise IndexError(f"Page {page_index} out of range (0–{doc.page_count - 1})")
        page = doc[page_index]
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
        return pix.tobytes('png')
    finally:
        doc.close()


def _get_slide_count(file_path: str) -> int:
    """Return total number of slides/pages in a file."""
    import fitz
    pdf_path = _get_pdf_path(file_path)
    doc = fitz.open(pdf_path)
    count = doc.page_count
    doc.close()
    return count


def _pptx_to_pdf(pptx_path: str) -> str:
    """Convert a PPTX to PDF via LibreOffice and cache it alongside the source file.
    Returns the path to the resulting PDF. Raises on failure."""
    pdf_path = pptx_path + '.preview.pdf'
    if os.path.exists(pdf_path):
        return pdf_path

    import subprocess, shutil, tempfile

    # LibreOffice writes <basename>.pdf into the output dir; use a temp dir then move
    with tempfile.TemporaryDirectory() as tmp:
        result = subprocess.run(
            ['soffice', '--headless', '--convert-to', 'pdf', '--outdir', tmp, pptx_path],
            capture_output=True, text=True, timeout=120,
        )
        stem = Path(pptx_path).stem
        generated = os.path.join(tmp, stem + '.pdf')
        if not os.path.exists(generated):
            raise RuntimeError(f"LibreOffice conversion failed: {result.stderr.strip()}")
        shutil.move(generated, pdf_path)

    return pdf_path


@router.get("/uploads/{stored_name}/slides")
def get_slide_count(stored_name: str):
    """Return the total number of slides/pages for a document."""
    path = _resolve(stored_name)
    try:
        count = _get_slide_count(path)
        return {"count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/uploads/{stored_name}/slides/{index}.png")
def get_slide_image(stored_name: str, index: int):
    """Render and return a single slide as a PNG image."""
    path = _resolve(stored_name)
    try:
        png_bytes = _render_slide_png(path, index, scale=2.0)
        return Response(png_bytes, media_type='image/png')
    except IndexError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/uploads/{stored_name}/preview.pdf")
def serve_preview_pdf(stored_name: str):
    """Serve a PDF for in-browser rendering via PDF.js. Converts PPTX to PDF on demand."""
    path = _resolve(stored_name)
    ext = Path(path).suffix.lower()
    if ext == '.pdf':
        return FileResponse(path, media_type='application/pdf')
    if ext in ('.pptx', '.ppt'):
        try:
            pdf_path = _pptx_to_pdf(path)
            return FileResponse(pdf_path, media_type='application/pdf')
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Could not convert to PDF: {e}")
    raise HTTPException(status_code=415, detail="Preview not supported for this file type")


@router.get("/uploads/{stored_name}")
def serve_upload(stored_name: str):
    """Serve an uploaded file by its stored name."""
    return FileResponse(_resolve(stored_name))


@router.delete("/uploads/{stored_name}")
def remove_upload(stored_name: str):
    """Delete an uploaded file once extraction is complete. Best-effort — never errors."""
    delete_upload(stored_name)
    return {"status": "deleted"}
