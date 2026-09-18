#!/usr/bin/env python3
"""
Extract slide content from a PowerPoint file.
Reads path from first arg, outputs JSON to stdout.

Output: { "success": true, "slides": [ { "index": 0, "title": "...", "text": "..." }, ... ] }
"""

import json
import sys
from pathlib import Path

try:
    from pptx import Presentation
    from pptx.enum.shapes import PP_PLACEHOLDER
except ImportError as e:
    print(json.dumps({"success": False, "error": f"python-pptx not installed: {e}"}), file=sys.stderr)
    sys.exit(1)


TITLE_TYPES = {
    getattr(PP_PLACEHOLDER, "TITLE", None),
    getattr(PP_PLACEHOLDER, "CENTER_TITLE", None),
    getattr(PP_PLACEHOLDER, "VERTICAL_TITLE", None),
}
TITLE_TYPES.discard(None)


def shape_paragraphs(shape):
    if not getattr(shape, "has_text_frame", False):
        return []
    out = []
    for para in shape.text_frame.paragraphs:
        text = "".join((run.text or "") for run in para.runs).strip()
        if not text:
            text = (getattr(para, "text", None) or "").strip()
        if text:
            out.append(text)
    return out


def is_title_shape(shape):
    try:
        if not shape.is_placeholder:
            return False
        return shape.placeholder_format.type in TITLE_TYPES
    except Exception:
        return False


def extract_slides(pptx_path: str) -> list:
    """Extract title + body text from all slides."""
    prs = Presentation(pptx_path)
    slides = []
    for i, slide in enumerate(prs.slides):
        title_parts = []
        body = []
        for shape in slide.shapes:
            paras = shape_paragraphs(shape)
            if not paras:
                continue
            if is_title_shape(shape) and not title_parts:
                title_parts.extend(paras)
            else:
                body.extend(paras)
        title = title_parts[0] if title_parts else ""
        if not title and body and len(body[0]) <= 72:
            title = body.pop(0)
        slides.append({
            "index": i,
            "title": title,
            "text": "\n".join(body).strip(),
        })
    return slides


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Missing PPTX path argument"}), file=sys.stderr)
        sys.exit(1)

    pptx_path = sys.argv[1]
    if not Path(pptx_path).exists():
        print(json.dumps({"success": False, "error": f"File not found: {pptx_path}"}), file=sys.stderr)
        sys.exit(1)

    try:
        slides = extract_slides(pptx_path)
        print(json.dumps({"success": True, "slides": slides}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
