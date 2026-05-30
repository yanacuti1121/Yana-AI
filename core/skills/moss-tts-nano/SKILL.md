# moss-tts-nano

**Source:** OpenMOSS/MOSS-TTS-Nano (Apache 2.0)
**Model:** 0.1B params · 48kHz stereo · CPU-friendly · multilingual

## When to use

- Add TTS / voice output to any agent or CLI tool
- Voice clone from a reference audio sample
- Realtime streaming speech generation without GPU
- Long-text narration with automatic chunking

## Do NOT use for

- High-fidelity studio audio (use a larger model)
- Languages outside Chinese / English / supported list

---

## Setup

```bash
# ONNX version — no PyTorch needed at inference time (recommended)
pip install onnxruntime numpy soundfile
git clone https://github.com/OpenMOSS/MOSS-TTS-Nano
cd MOSS-TTS-Nano
# Download ONNX weights from HuggingFace
huggingface-cli download OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX --local-dir ./onnx_weights
huggingface-cli download OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano-ONNX --local-dir ./onnx_tokenizer

# PyTorch version — full features + finetuning
conda create -n moss-tts python=3.10
conda activate moss-tts
pip install -r requirements.txt
huggingface-cli download OpenMOSS-Team/MOSS-TTS-Nano --local-dir ./checkpoints
```

---

## Basic inference

```python
# ONNX CPU (fastest, no GPU needed)
from onnx_tts_runtime import OnnxTTSRuntime

tts = OnnxTTSRuntime(
    tts_model_dir="./onnx_weights",
    tokenizer_dir="./onnx_tokenizer",
)

# Simple generation
tts.generate(
    text="Hello, this is MOSS TTS Nano.",
    output_path="output.wav",
)

# Voice clone from reference audio
tts.generate(
    text="Hello, this is MOSS TTS Nano.",
    reference_audio="path/to/speaker.wav",
    output_path="cloned_output.wav",
)
```

```bash
# CLI — generate
moss-tts-nano generate \
  --text "Xin chào, đây là MOSS TTS Nano." \
  --reference-audio speaker.wav \
  --output output.wav

# CLI — serve FastAPI
moss-tts-nano serve --host 0.0.0.0 --port 8000
```

---

## Streaming inference

```python
from moss_tts_nano_runtime import MossTTSNanoRuntime

runtime = MossTTSNanoRuntime(checkpoint_dir="./checkpoints")

# Stream audio chunks as they're generated
for chunk in runtime.stream(
    text="Long text here...",
    reference_audio="speaker.wav",
):
    play_audio_chunk(chunk)  # feed to speaker / buffer
```

---

## FastAPI server

```python
# Start server
python app_onnx.py  # ONNX version (recommended for prod)
python app.py       # PyTorch version

# POST /tts
import httpx, base64, soundfile as sf, io

resp = httpx.post("http://localhost:8000/tts", json={
    "text": "Hello from YAMTAM.",
    "reference_audio": None,   # omit for default voice
})
audio_bytes = base64.b64decode(resp.json()["audio_base64"])
sf.write("out.wav", *sf.read(io.BytesIO(audio_bytes)))
```

---

## Finetuning

```bash
cd finetuning/

# Prepare dataset: each line = {"text": "...", "audio": "path/to/file.wav"}
python prepare_data.py --input your_data/ --output dataset/

# Finetune (single GPU or CPU)
python train.py \
  --base-checkpoint ../checkpoints \
  --dataset dataset/ \
  --output-dir finetuned/ \
  --epochs 10 \
  --batch-size 4

# Inference with finetuned checkpoint
python ../infer.py --checkpoint finetuned/ --text "..." --output out.wav
```

---

## YAMTAM agent integration pattern

```python
import httpx

def yamtam_speak(text: str, voice: str | None = None) -> bytes:
    """Call local MOSS-TTS-Nano server, return WAV bytes."""
    payload = {"text": text}
    if voice:
        payload["reference_audio"] = voice
    r = httpx.post("http://localhost:8000/tts", json=payload, timeout=30)
    r.raise_for_status()
    import base64
    return base64.b64decode(r.json()["audio_base64"])
```

---

## Model variants

| Model | Size | Notes |
|-------|------|-------|
| MOSS-TTS-Nano | 0.1B | PyTorch, full features |
| MOSS-TTS-Nano-ONNX | 0.1B | No PyTorch, 2× faster on CPU |
| MOSS-TTS (full) | larger | Higher quality, more languages |

HuggingFace: `OpenMOSS-Team/MOSS-TTS-Nano`
ModelScope: `openmoss/MOSS-TTS-Nano`

---

## Supported languages

Chinese (Mandarin) · English · (expanding via finetuning)

## License

Apache 2.0 — free for commercial use.

## References

- Repo: https://github.com/OpenMOSS/MOSS-TTS-Nano
- Paper: https://arxiv.org/abs/2603.18090
- Demo: https://openmoss.github.io/MOSS-TTS-Nano-Demo/
- HF Space: https://huggingface.co/spaces/OpenMOSS-Team/MOSS-TTS-Nano
