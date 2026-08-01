"""VieNeu-TTS sidecar — local Vietnamese/English text-to-speech HTTP server.

Wraps the `vieneu` Python SDK (CPU/ONNX, torch-free) behind a minimal FastAPI
server so yana-web (Node.js) can call it over HTTP, the same pattern already
used for Ollama (127.0.0.1:11434). Runs as its own local process — start it
with `bash tools/yana-web/tts-sidecar/run.sh`.

Endpoints:
  GET  /health        -> {"ok": true, "voices": <count>}
  GET  /voices         -> {"voices": [{"label": ..., "id": ...}, ...]}
  POST /tts            -> {"text": str, "voice": str, "style": str}
                          returns audio/wav bytes directly

Not started automatically by anything yet — this is a local dev sidecar,
analogous to running `ollama serve` yourself.
"""

from __future__ import annotations

import os
import tempfile

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

PORT = int(os.environ.get("VIENEU_SIDECAR_PORT", "7861"))

app = FastAPI(title="VieNeu-TTS sidecar")

_tts = None  # lazy-loaded on first request, not at import time


def get_tts():
    global _tts
    if _tts is None:
        from vieneu import Vieneu

        _tts = Vieneu()
    return _tts


class TtsRequest(BaseModel):
    text: str
    voice: str = "Phạm Tuyên"
    style: str = "tu_nhien"


@app.get("/health")
def health():
    tts = get_tts()
    return {"ok": True, "voices": len(tts.list_preset_voices())}


@app.get("/voices")
def voices():
    tts = get_tts()
    return {
        "voices": [{"label": label, "id": voice_id} for label, voice_id in tts.list_preset_voices()]
    }


@app.post("/tts")
def synthesize(req: TtsRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "Missing text")
    if len(text) > 2000:
        raise HTTPException(400, "Text too long (max 2000 chars)")

    tts = get_tts()
    try:
        audio = tts.infer(text, voice=req.voice, style=req.style)
    except Exception as exc:  # noqa: BLE001 — surface the real SDK error to the caller
        raise HTTPException(500, f"TTS synthesis failed: {exc}") from exc

    # tts.save() writes via soundfile, which needs a real path — not a
    # file-like buffer — so round-trip through a temp file.
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        tts.save(audio, tmp_path)
        with open(tmp_path, "rb") as f:
            wav_bytes = f.read()
    finally:
        os.unlink(tmp_path)

    return Response(content=wav_bytes, media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=PORT)
