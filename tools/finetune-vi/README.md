# MOSS-TTS-Nano — Vietnamese Finetuning

Thêm tiếng Việt vào MOSS-TTS-Nano bằng dataset VIVOS (15h, CC BY-SA 4.0).

## Yêu cầu

| Thứ | Tối thiểu | Khuyến nghị |
|-----|-----------|------------|
| Disk | 3 GB | 5 GB |
| RAM | 8 GB | 16 GB |
| GPU | không bắt buộc | VRAM ≥ 8GB (nhanh hơn 10×) |
| Thời gian | ~3-5h (CPU) | ~30-60 phút (GPU) |

## Chạy một lệnh

```bash
bash tools/finetune-vi/run.sh
```

Script tự động:
1. Download model weights từ HuggingFace
2. Download + chuẩn bị VIVOS dataset (11,660 samples / 15h)
3. Encode audio → audio_codes
4. Finetune 3 epochs
5. Verify output với câu tiếng Việt

## Chạy thủ công (từng bước)

```bash
# 1. Cài dependencies
pip install -r tools/moss-tts-nano/requirements.txt
pip install datasets soundfile

# 2. Chuẩn bị VIVOS dataset
python3 tools/finetune-vi/prepare_vivos.py \
    --output-dir tools/finetune-vi/data/vivos

# Chỉ lấy 500 samples để test nhanh
python3 tools/finetune-vi/prepare_vivos.py \
    --output-dir tools/finetune-vi/data/vivos \
    --max-samples 500

# 3. Encode audio
python3 tools/moss-tts-nano/finetuning/prepare_data.py \
    --codec-path tools/moss-tts-nano/models/MOSS-Audio-Tokenizer-Nano \
    --input-jsonl tools/finetune-vi/data/vivos/train_raw.jsonl \
    --output-jsonl tools/finetune-vi/data/prepared/train_with_codes.jsonl \
    --batch-size 4 \
    --skip-reference-audio-codes

# 4. Finetune
accelerate launch tools/moss-tts-nano/finetuning/sft.py \
    --model-path tools/moss-tts-nano/models/MOSS-TTS-Nano \
    --codec-path tools/moss-tts-nano/models/MOSS-Audio-Tokenizer-Nano \
    --train-jsonl tools/finetune-vi/data/prepared/train_with_codes.jsonl \
    --output-dir tools/finetune-vi/output/moss-tts-vi \
    --per-device-batch-size 1 \
    --gradient-accumulation-steps 8 \
    --learning-rate 1e-5 \
    --num-epochs 3 \
    --mixed-precision bf16 \
    --max-length 1024 \
    --channelwise-loss-weight 1,32
```

## Dùng model sau khi finetune

```python
from onnx_tts_runtime import OnnxTTSRuntime  # hoặc dùng PyTorch runtime

# Chạy inference với checkpoint tiếng Việt
import subprocess
subprocess.run([
    "python3", "tools/moss-tts-nano/finetuning/verify.py",
    "--checkpoint", "tools/finetune-vi/output/moss-tts-vi/checkpoint-last",
    "--mode", "voice_clone",
    "--text", "Xin chào, tôi là trợ lý YAMTAM.",
    "--prompt-audio-path", "your_voice.wav",
    "--output-audio-path", "output_vi.wav",
])
```

## Dataset VIVOS

- **Nguồn:** VLSP / HCMUS
- **Size:** 15h, 11,660 câu train + 760 câu test
- **License:** CC BY-SA 4.0
- **HuggingFace:** https://huggingface.co/datasets/vivos
- **Chất lượng:** Studio, đọc sách — phù hợp cho TTS

## Kết quả kỳ vọng

Sau 3 epochs với VIVOS:
- Model nói được tiếng Việt cơ bản
- Phát âm tốt với văn bản đọc
- Voice clone từ reference audio tiếng Việt

Để tốt hơn: thêm data đa dạng (hội thoại, tin tức, v.v.) và tăng epochs.
