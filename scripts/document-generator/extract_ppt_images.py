#!/usr/bin/env python3
"""
Extract one image per slide from a PowerPoint file.
Uses LibreOffice (headless) to convert PPTX to PDF, then pdf2image to PDF pages to PNG.
Outputs JSON to stdout: { "success": true, "slides": [ { "index": 0, "image_base64": "..." }, ... ] }
"""

import base64
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

EXTract_TIMEOUT = 60  # seconds


def find_libreoffice() -> str | None:
    """Find LibreOffice executable (soffice or libreoffice)."""
    for cmd in ('soffice', 'libreoffice', 'LibreOffice'):
        if shutil.which(cmd):
            return cmd
    # Common install locations
    if sys.platform == 'darwin':
        paths = [
            '/Applications/LibreOffice.app/Contents/MacOS/soffice',
            '/Applications/LibreOffice.app/Contents/MacOS/soffice.com',
        ]
    elif sys.platform == 'win32':
        base = os.environ.get('ProgramFiles', 'C:\\Program Files')
        paths = [
            os.path.join(base, 'LibreOffice', 'program', 'soffice.exe'),
            os.path.join(base, 'LibreOffice', 'program', 'soffice.com'),
        ]
    else:
        paths = []
    for p in paths:
        if os.path.isfile(p):
            return p
    return None


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Missing PPTX path argument"}))
        sys.exit(1)

    pptx_path = os.path.abspath(sys.argv[1])
    if not Path(pptx_path).exists():
        print(json.dumps({"success": False, "error": f"File not found: {pptx_path}"}))
        sys.exit(1)

    lo_exe = find_libreoffice()
    if not lo_exe:
        print(json.dumps({
            "success": False,
            "error": "LibreOffice no encontrado. Instale LibreOffice para ver presentaciones como imágenes: https://www.libreoffice.org"
        }))
        sys.exit(1)

    try:
        from pdf2image import convert_from_path
    except ImportError as e:
        print(json.dumps({
            "success": False,
            "error": f"pdf2image no instalado. Ejecute: pip install pdf2image. También necesita poppler (brew install poppler en macOS). {e}"
        }))
        sys.exit(1)

    tmpdir = tempfile.mkdtemp(prefix='dome_ppt_extract_')
    try:
        # 1. Convert PPTX to PDF with LibreOffice
        cmd = [
            lo_exe,
            '--headless',
            '--convert-to', 'pdf',
            '--outdir', tmpdir,
            pptx_path,
        ]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=EXTract_TIMEOUT,
            cwd=tmpdir,
        )
        if proc.returncode != 0:
            err = proc.stderr or proc.stdout or f"LibreOffice exit code {proc.returncode}"
            print(json.dumps({
                "success": False,
                "error": f"Error al convertir PPTX a PDF: {err}"
            }))
            sys.exit(1)

        # Find the generated PDF (same base name as pptx)
        pptx_name = Path(pptx_path).stem
        pdf_path = os.path.join(tmpdir, pptx_name + '.pdf')
        if not os.path.isfile(pdf_path):
            # LibreOffice might use different naming
            pdfs = list(Path(tmpdir).glob('*.pdf'))
            if not pdfs:
                print(json.dumps({"success": False, "error": "LibreOffice no generó archivo PDF"}))
                sys.exit(1)
            pdf_path = str(pdfs[0])

        # 2. Convert PDF pages to PNG with pdf2image
        try:
            images = convert_from_path(pdf_path, dpi=150)
        except Exception as e:
            err_msg = str(e).lower()
            if 'poppler' in err_msg or 'pdftoppm' in err_msg:
                hint = "Instale poppler: brew install poppler (macOS) o apt install poppler-utils (Linux)"
            else:
                hint = str(e)
            print(json.dumps({
                "success": False,
                "error": f"Error al convertir PDF a imágenes: {hint}"
            }))
            sys.exit(1)

        # 3. Encode each image as base64
        slides = []
        for i, img in enumerate(images):
            # PNG bytes
            buf = io.BytesIO()
            img.save(buf, format='PNG')
            b64 = base64.b64encode(buf.getvalue()).decode('ascii')
            slides.append({"index": i, "image_base64": b64})

        print(json.dumps({"success": True, "slides": slides}))
    except subprocess.TimeoutExpired:
        print(json.dumps({
            "success": False,
            "error": "La extracción de imágenes ha tardado demasiado. Intente de nuevo."
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == "__main__":
    main()
