"""Local VieNeu-TTS v3 Turbo adapter for yana-web and yana-wheelbot.

VieNeu v3 produces 48 kHz float audio. The robot protocol expects 24 kHz,
mono, signed 16-bit PCM before Opus encoding, so this sidecar owns the sample
rate conversion and exposes both a browser-compatible WAV endpoint and a
low-latency raw PCM stream for the robot bridge.
"""

from __future__ import annotations

import io
import os
import threading
import wave
from collections.abc import Iterator

import numpy as np
import soxr
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

PORT = int(os.environ.get("VIENEU_SIDECAR_PORT", "7861"))
MODEL_MODE = os.environ.get("VIENEU_MODE", "v3turbo")
MODEL_BACKEND = os.environ.get("VIENEU_BACKEND", "onnx")
MODEL_PRECISION = os.environ.get("VIENEU_PRECISION", "int8")
MODEL_THREADS = int(os.environ.get("VIENEU_THREADS", "0"))
DEFAULT_VOICE = os.environ.get("VIENEU_VOICE", "Phạm Tuyên")
OUTPUT_SAMPLE_RATE = 24_000
MODEL_SAMPLE_RATE_FALLBACK = 48_000
MAX_TEXT_LENGTH = 2_000

app = FastAPI(title="Yana VieNeu-TTS sidecar", version="3")

_tts = None
_model_lock = threading.Lock()
_inference_lock = threading.Lock()


def get_tts():
    """Load the ONNX model once, without making the health check expensive."""
    global _tts
    if _tts is None:
        with _model_lock:
            if _tts is None:
                from vieneu import Vieneu

                _tts = Vieneu(
                    mode=MODEL_MODE,
                    backend=MODEL_BACKEND,
                    precision=MODEL_PRECISION,
                    threads=MODEL_THREADS,
                )
    return _tts


class TtsRequest(BaseModel):
    text: str
    voice: str = DEFAULT_VOICE
    # Backward compatibility only: VieNeu v3 accepts but ignores style.
    style: str | None = None


def _validated_text(req: TtsRequest) -> str:
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "Missing text")
    if len(text) > MAX_TEXT_LENGTH:
        raise HTTPException(400, f"Text too long (max {MAX_TEXT_LENGTH} chars)")
    return text


def _mono_float32(audio: np.ndarray) -> np.ndarray:
    samples = np.asarray(audio, dtype=np.float32)
    if samples.ndim > 1:
        samples = samples.mean(axis=-1)
    return np.ascontiguousarray(samples.reshape(-1), dtype=np.float32)


def _pcm16_bytes(samples: np.ndarray) -> bytes:
    clipped = np.clip(samples, -1.0, 1.0)
    return np.rint(clipped * 32767.0).astype("<i2", copy=False).tobytes()


def iter_pcm24k(tts, text: str, voice: str) -> Iterator[bytes]:
    """Yield 24 kHz mono PCM16 while VieNeu generates 48 kHz float frames."""
    input_rate = int(getattr(tts, "sample_rate", MODEL_SAMPLE_RATE_FALLBACK))
    resampler = soxr.ResampleStream(
        input_rate,
        OUTPUT_SAMPLE_RATE,
        1,
        dtype="float32",
        quality="HQ",
    )

    with _inference_lock:
        try:
            for audio in tts.infer_stream(text, voice=voice):
                samples = _mono_float32(audio)
                if not samples.size:
                    continue
                converted = resampler.resample_chunk(samples, last=False)
                if converted.size:
                    yield _pcm16_bytes(converted)
            tail = resampler.resample_chunk(np.empty(0, dtype=np.float32), last=True)
            if tail.size:
                yield _pcm16_bytes(tail)
        except Exception as exc:  # noqa: BLE001 - retain the SDK's actionable error
            raise RuntimeError(f"TTS synthesis failed: {exc}") from exc


def pcm_to_wav(pcm: bytes, sample_rate: int = OUTPUT_SAMPLE_RATE) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return output.getvalue()


@app.get("/health")
def health():
    return {
        "ok": True,
        "loaded": _tts is not None,
        "mode": MODEL_MODE,
        "backend": MODEL_BACKEND,
        "precision": MODEL_PRECISION,
        "sample_rate": OUTPUT_SAMPLE_RATE,
    }


@app.get("/voices")
def voices():
    tts = get_tts()
    return {
        "default": DEFAULT_VOICE,
        "voices": [
            {"label": label, "id": voice_id} for label, voice_id in tts.list_preset_voices()
        ],
    }


@app.post("/tts/stream")
def synthesize_stream(req: TtsRequest):
    text = _validated_text(req)
    tts = get_tts()
    return StreamingResponse(
        iter_pcm24k(tts, text, req.voice),
        media_type="application/octet-stream",
        headers={
            "X-Audio-Sample-Rate": str(OUTPUT_SAMPLE_RATE),
            "X-Audio-Channels": "1",
            "X-Audio-Sample-Format": "s16le",
        },
    )


@app.post("/tts")
def synthesize(req: TtsRequest):
    """Backward-compatible WAV response used by desktop/mobile browsers."""
    text = _validated_text(req)
    tts = get_tts()
    try:
        pcm = b"".join(iter_pcm24k(tts, text, req.voice))
    except RuntimeError as exc:
        raise HTTPException(500, str(exc)) from exc
    return Response(content=pcm_to_wav(pcm), media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=PORT)
