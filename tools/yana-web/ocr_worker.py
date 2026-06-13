#!/usr/bin/env python3
"""OCR worker — called by /api/ocr endpoint.
Usage: python3 ocr_worker.py <filepath> [lang]
Prints a single JSON line to stdout: { "ok": true, "text": "...", "pages": N }
or { "ok": false, "error": "..." }
"""
import sys
import json
import os

# easyocr uses different codes for some languages
_LANG_MAP = {
    "zh": "ch_sim",
    "zh-cn": "ch_sim",
    "zh-tw": "ch_tra",
    "zht": "ch_tra",
}


def _easyocr_lang(lang):
    return _LANG_MAP.get(lang.lower(), lang.lower())


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

    # ── Primary: EasyOCR ──────────────────────────────────────────────────────
    try:
        import easyocr
        import numpy as np

        reader = easyocr.Reader([_easyocr_lang(lang)], gpu=False, verbose=False)
        lines = []
        for img in images:
            results = reader.readtext(np.array(img))
            page_text = "\n".join(r[1] for r in results if r[1].strip())
            lines.append(page_text)

        return {"ok": True, "text": "\n\n".join(lines).strip(), "pages": len(images), "engine": "easyocr"}

    except ImportError:
        pass
    except Exception as e:
        easyocr_err = str(e)
    else:
        easyocr_err = None

    # ── Fallback: Surya >= 0.6 new API ───────────────────────────────────────
    try:
        from surya.recognition import RecognitionPredictor
        from surya.detection import DetectionPredictor

        langs = [[lang]] * len(images)
        det_predictor = DetectionPredictor()
        rec_predictor = RecognitionPredictor()
        det_results = det_predictor(images)
        bboxes_per_image = [r.bboxes for r in det_results]
        rec_results = rec_predictor(images, bboxes_per_image, langs)

        lines = []
        for result in rec_results:
            page_text = "\n".join(line.text for line in (result.text_lines or []))
            lines.append(page_text)

        return {"ok": True, "text": "\n\n".join(lines).strip(), "pages": len(images), "engine": "surya-new"}

    except Exception:
        pass

    # ── Fallback: Surya old API ───────────────────────────────────────────────
    try:
        from surya.ocr import run_ocr
        from surya.model.detection.model import load_model as load_det, load_processor as load_det_proc
        from surya.model.recognition.model import load_model as load_rec
        from surya.model.recognition.processor import load_processor as load_rec_proc

        langs_list = [[lang]] * len(images)
        det_processor = load_det_proc()
        det_model = load_det()
        rec_model = load_rec()
        rec_processor = load_rec_proc()
        results = run_ocr(images, langs_list, det_model, det_processor, rec_model, rec_processor)
        lines = []
        for result in results:
            page_text = "\n".join(line.text for line in (result.text_lines or []))
            lines.append(page_text)

        return {"ok": True, "text": "\n\n".join(lines).strip(), "pages": len(images), "engine": "surya-old"}

    except Exception:
        pass

    return {
        "ok": False,
        "error": (
            "No OCR engine available. Install easyocr: pip install easyocr\n"
            "Or surya: pip install surya-ocr"
        ),
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Usage: ocr_worker.py <filepath> [lang]"}))
        sys.exit(1)

    filepath = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "en"
    result = run(filepath, lang)
    print(json.dumps(result, ensure_ascii=False))
