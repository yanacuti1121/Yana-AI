---
name: terminal--deep-live-cam
description: >-
  >-
origin: "github.com/TerminalSkills/skills (skill: deep-live-cam)"
license: AGPL-3.0
version: "1.0.0"
compatibility: "yamtam-engine >= 0.14.0"
---

# Deep-Live-Cam — Real-Time Face Swap

## Overview

Real-time face swap and video deepfake using a single source image. Supports webcam, video files, and streaming with GPU acceleration. The pipeline detects faces, extracts embeddings, swaps faces using the inswapper model, and post-processes with GFPGAN/CodeFormer for quality.

**Source:** [hacksider/Deep-Live-Cam](https://github.com/hacksider/Deep-Live-Cam)

## Instructions

### 1. Install and configure

```bash
git clone https://github.com/hacksider/Deep-Live-Cam.git
cd Deep-Live-Cam
pip install -r requirements.txt
```

Download models into the `models/` directory:

```bash
mkdir -p models
wget -O models/inswapper_128_fp16.onnx "https://huggingface.co/hacksider/deep-live-cam/resolve/main/inswapper_128_fp16.onnx"
```

For GPU acceleration:

```bash
pip install onnxruntime-gpu    # NVIDIA CUDA
pip install onnxruntime-rocm   # AMD ROCm
pip install onnxruntime-coreml # Apple Silicon
```

### 2. Run face swap

**GUI mode (webcam, real-time):**

```bash
python run.py
```

**CLI mode — process a video file:**

```bash
python run.py \
  --source path/to/source_face.jpg \
  --target path/to/target_video.mp4 \
  --output path/to/output.mp4 \
  --execution-provider cuda
```

**CLI mode — process a single image:**

```bash
python run.py \
  --source path/to/source_face.jpg \
  --target path/to/target_image.jpg \
  --output path/to/output.jpg
```

### 3. Key features

- **Mouth Mask** — Retains original mouth for accurate lip movement: `--mouth-mask`
- **Face Mapping** — Different source faces on multiple people: `--face-mapping`
- **Quality Enhancement** — GFPGAN or CodeFormer: `--enhancer gfpgan`

## Examples

### Example 1: Swap a face in a conference recording

```bash
python run.py \
  --source speaker_headshot.jpg \
  --target conference_talk.mp4 \
  --output anonymized_talk.mp4 \
  --execution-provider cuda \
  --enhancer gfpgan
```

This replaces the speaker's face in a 45-minute conference recording with the source face, using GPU acceleration and GFPGAN enhancement for broadcast-quality output.

### Example 2: Programmatic face swap with Python

```python
import cv2
import insightface
from insightface.app import FaceAnalysis

app = FaceAnalysis(name="buffalo_l", providers=["CUDAExecutionProvider"])
app.prepare(ctx_id=0, det_size=(640, 640))

swapper = insightface.model_zoo.get_model(
    "models/inswapper_128_fp16.onnx",
    providers=["CUDAExecutionProvider"]
)

source_img = cv2.imread("actor_headshot.jpg")
target_img = cv2.imread("movie_scene_frame.jpg")

source_faces = app.get(source_img)
target_faces = app.get(target_img)

if source_faces and target_faces:
    result = swapper.get(target_img, target_faces[0], source_faces[0], paste_back=True)
    cv2.imwrite("swapped_scene.jpg", result)
```

### Example 3: Real-time webcam with mouth mask

```bash
python run.py --mouth-mask --execution-provider cuda
```

Launches the GUI with webcam input. Select a source face image, enable mouth mask for natural lip sync, and start the live face swap at 25-30 FPS on an RTX 3060.

## Guidelines

- **Always obtain consent** from the person whose face you're using
- **Label all outputs** as AI-generated/deepfake when sharing publicly
- **Legal compliance** — Many jurisdictions have laws against non-consensual deepfakes
- **Lighting matters** — Works best with even, front-facing lighting; degrades at extreme head rotations (>60°)
- **GPU recommended** — CPU mode works but is very slow; NVIDIA RTX 3060+ with 6GB+ VRAM recommended
- **Verify results** — Heavy occlusion (masks, large sunglasses) can cause artifacts
- **Use batch mode for quality** — Real-time trades resolution for speed; use offline processing for high-res output

## References

- [Deep-Live-Cam GitHub](https://github.com/hacksider/Deep-Live-Cam)
- [InsightFace Documentation](https://insightface.ai/)
- [GFPGAN (Face Enhancement)](https://github.com/TencentARC/GFPGAN)
