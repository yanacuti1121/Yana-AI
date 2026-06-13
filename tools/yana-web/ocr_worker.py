#!/usr/bin/env python3
"""Surya OCR worker — called by /api/ocr endpoint.
Usage: python3 ocr_worker.py <filepath> [lang]
Prints a single JSON line to stdout: { "ok": true, "text": "...", "pages": N }
or { "ok": false, "error": "..." }
"""
import sys
import json
import os

def run(filepath, lang="en"):
    if not os.path.isfile(filepath):
        return {"ok": False, "error": f"File not found: {filepath}"}

    ext = os.path.splitext(filepath)[1].lower()
    allowed = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif", ".pdf"}
    if ext not in allowed:
        return {"ok": False, "error": f"Unsupported file type: {ext}"}

    # ── Load images ───────────────────────────────────────────────────────────
    try:
        from PIL import Image
    except ImportError:
        return {"ok": False, "error": "Pillow not installed. Run: pip install Pillow"}

    images = []
    if ext == ".pdf":
        # Try pdf2image first (best quality), then pypdf text extraction
        try:
            import pdf2image
            images = pdf2image.convert_from_path(filepath)
        except ImportError:
            pass

        if not images:
            try:
                from pypdf import PdfReader
                reader = PdfReader(filepath)
                text = "\n\n".join(
                    (page.extract_text() or "").strip()
                    for page in reader.pages
                )
                return {"ok": True, "text": text, "pages": len(reader.pages), "method": "text_extraction"}
            except ImportError:
                return {
                    "ok": False,
                    "error": (
                        "PDF support needs pdf2image or pypdf.\n"
                        "Run: pip install pdf2image pypdf\n"
                        "For pdf2image you also need poppler: apt install poppler-utils"
                    ),
                }
    else:
        try:
            images = [Image.open(filepath).convert("RGB")]
        except Exception as e:
            return {"ok": False, "error": f"Cannot open image: {e}"}

    if not images:
        return {"ok": False, "error": "No pages extracted from file"}

    langs = [[lang]] * len(images)

    # ── Run Surya OCR ─────────────────────────────────────────────────────────
    try:
        # Surya >= 0.6 API
        from surya.recognition import RecognitionPredictor
        from surya.detection import DetectionPredictor

        det_predictor = DetectionPredictor()
        rec_predictor = RecognitionPredictor()

        # Detection pass
        det_results = det_predictor(images)
        bboxes_per_image = [r.bboxes for r in det_results]

        # Recognition pass
        rec_results = rec_predictor(images, bboxes_per_image, langs)

        lines = []
        for result in rec_results:
            page_text = "\n".join(
                line.text for line in (result.text_lines or [])
            )
            lines.append(page_text)

        return {"ok": True, "text": "\n\n".join(lines).strip(), "pages": len(images)}

    except ImportError:
        pass

    # ── Fallback: older Surya API ─────────────────────────────────────────────
    try:
        from surya.ocr import run_ocr
        from surya.model.detection.model import load_model as load_det, load_processor as load_det_proc
        from surya.model.recognition.model import load_model as load_rec
        from surya.model.recognition.processor import load_processor as load_rec_proc

        det_processor = load_det_proc()
        det_model = load_det()
        rec_model = load_rec()
        rec_processor = load_rec_proc()

        results = run_ocr(images, langs, det_model, det_processor, rec_model, rec_processor)
        lines = []
        for result in results:
            page_text = "\n".join(line.text for line in (result.text_lines or []))
            lines.append(page_text)

        return {"ok": True, "text": "\n\n".join(lines).strip(), "pages": len(images)}

    except ImportError:
        return {
            "ok": False,
            "error": (
                "surya-ocr not installed.\n"
                "Run: pip install surya-ocr\n"
                "Note: first run downloads ~1GB of model weights."
            ),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Usage: ocr_worker.py <filepath> [lang]"}))
        sys.exit(1)

    filepath = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "en"
    result = run(filepath, lang)
    print(json.dumps(result, ensure_ascii=False))
