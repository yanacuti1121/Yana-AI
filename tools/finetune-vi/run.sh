#!/usr/bin/env bash
# Finetune MOSS-TTS-Nano on Vietnamese (VIVOS dataset)
# Usage: bash tools/finetune-vi/run.sh
# Requires: ~3GB disk, GPU recommended (CPU ~3-5h)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOSS_DIR="$(cd "$SCRIPT_DIR/../moss-tts-nano" && pwd)"
DATA_DIR="$SCRIPT_DIR/data/vivos"
PREPARED_DIR="$SCRIPT_DIR/data/prepared"
OUTPUT_DIR="$SCRIPT_DIR/output/moss-tts-vi"
MODELS_DIR="$MOSS_DIR/models"

log() { echo "[finetune-vi] $*"; }

# ── Step 0: check dependencies ────────────────────────────────────────────────
log "Checking dependencies..."
python3 -c "import torch, datasets, soundfile, accelerate" 2>/dev/null || {
    log "Installing dependencies..."
    pip install -r "$MOSS_DIR/requirements.txt"
    pip install datasets soundfile
}

# ── Step 1: download model weights ────────────────────────────────────────────
if [[ ! -d "$MODELS_DIR/MOSS-TTS-Nano" ]]; then
    log "Downloading MOSS-TTS-Nano weights..."
    huggingface-cli download OpenMOSS-Team/MOSS-TTS-Nano \
        --local-dir "$MODELS_DIR/MOSS-TTS-Nano"
fi

if [[ ! -d "$MODELS_DIR/MOSS-Audio-Tokenizer-Nano" ]]; then
    log "Downloading MOSS-Audio-Tokenizer-Nano weights..."
    huggingface-cli download OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano \
        --local-dir "$MODELS_DIR/MOSS-Audio-Tokenizer-Nano"
fi

# ── Step 2: prepare VIVOS dataset ─────────────────────────────────────────────
if [[ ! -f "$DATA_DIR/train_raw.jsonl" ]]; then
    log "Preparing VIVOS dataset (~15h Vietnamese speech)..."
    python3 "$SCRIPT_DIR/prepare_vivos.py" --output-dir "$DATA_DIR"
fi

# ── Step 3: encode audio → audio_codes ────────────────────────────────────────
mkdir -p "$PREPARED_DIR"

if [[ ! -f "$PREPARED_DIR/train_with_codes.jsonl" ]]; then
    log "Encoding training audio (this takes a while)..."
    python3 "$MOSS_DIR/finetuning/prepare_data.py" \
        --codec-path "$MODELS_DIR/MOSS-Audio-Tokenizer-Nano" \
        --input-jsonl "$DATA_DIR/train_raw.jsonl" \
        --output-jsonl "$PREPARED_DIR/train_with_codes.jsonl" \
        --batch-size 4 \
        --skip-reference-audio-codes
fi

# ── Step 4: finetune ──────────────────────────────────────────────────────────
log "Starting finetune → $OUTPUT_DIR"

# Detect GPU count
GPU_COUNT=$(python3 -c "import torch; print(torch.cuda.device_count())" 2>/dev/null || echo 0)
log "GPU count: $GPU_COUNT"

if [[ "$GPU_COUNT" -ge 1 ]]; then
    MIXED="bf16"
else
    log "No GPU detected — using CPU (slow, ~3-5h)"
    MIXED="no"
fi

accelerate launch \
    "$MOSS_DIR/finetuning/sft.py" \
    --model-path "$MODELS_DIR/MOSS-TTS-Nano" \
    --codec-path "$MODELS_DIR/MOSS-Audio-Tokenizer-Nano" \
    --train-jsonl "$PREPARED_DIR/train_with_codes.jsonl" \
    --output-dir "$OUTPUT_DIR" \
    --per-device-batch-size 1 \
    --gradient-accumulation-steps 8 \
    --learning-rate 1e-5 \
    --warmup-ratio 0.03 \
    --num-epochs 3 \
    --mixed-precision "$MIXED" \
    --max-length 1024 \
    --channelwise-loss-weight 1,32

# ── Step 5: verify ────────────────────────────────────────────────────────────
log "Verifying finetuned model..."
python3 "$MOSS_DIR/finetuning/verify.py" \
    --checkpoint "$OUTPUT_DIR/checkpoint-last" \
    --mode voice_clone \
    --text "Xin chào, đây là MOSS TTS Nano phiên bản tiếng Việt." \
    --prompt-audio-path "$DATA_DIR/audio/train_00000.wav" \
    --output-audio-path "$OUTPUT_DIR/verify_vi.wav"

log "Done! Output: $OUTPUT_DIR/verify_vi.wav"
log "Use finetuned model: --checkpoint $OUTPUT_DIR/checkpoint-last"
