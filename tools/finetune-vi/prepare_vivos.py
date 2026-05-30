#!/usr/bin/env python3
"""
Prepare VIVOS Vietnamese dataset for MOSS-TTS-Nano finetuning.

Dataset: VIVOS (15h, CC BY-SA 4.0)
HuggingFace: https://huggingface.co/datasets/vivos

Output: train.jsonl + test.jsonl compatible with MOSS-TTS-Nano finetuning format
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path


def prepare(output_dir: str, max_samples: int | None) -> None:
    try:
        from datasets import load_dataset
    except ImportError:
        raise SystemExit("Run: pip install datasets soundfile")

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    audio_dir = out / "audio"
    audio_dir.mkdir(exist_ok=True)

    print("Downloading VIVOS dataset from HuggingFace...")
    ds = load_dataset("vivos", trust_remote_code=True)

    for split in ("train", "test"):
        records = []
        subset = ds[split]
        if max_samples:
            subset = subset.select(range(min(max_samples, len(subset))))

        print(f"Processing {split}: {len(subset)} samples...")
        for i, row in enumerate(subset):
            # Save audio file
            audio_path = audio_dir / f"{split}_{i:05d}.wav"
            audio_data = row["audio"]

            import soundfile as sf
            sf.write(
                str(audio_path),
                audio_data["array"],
                audio_data["sampling_rate"],
            )

            records.append({
                "audio": str(audio_path.resolve()),
                "text": row["sentence"],
                "language": "vi",
            })

            if (i + 1) % 500 == 0:
                print(f"  {i + 1}/{len(subset)}")

        jsonl_path = out / f"{split}_raw.jsonl"
        with open(jsonl_path, "w", encoding="utf-8") as f:
            for r in records:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")

        print(f"Saved {len(records)} records → {jsonl_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepare VIVOS for MOSS-TTS-Nano")
    parser.add_argument("--output-dir", default="./data/vivos", help="Output directory")
    parser.add_argument("--max-samples", type=int, default=None, help="Limit samples (for quick test)")
    args = parser.parse_args()
    prepare(args.output_dir, args.max_samples)
