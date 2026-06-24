---
name: deepspeed-zero-memory
description: DeepSpeed ZeRO memory optimization for large model training and inference. ZeRO-1/2/3 stages, CPU/NVMe offloading, ZeRO-Inference for multi-GPU serving, and memory footprint formulas. Sources: microsoft/DeepSpeed (Apache-2.0).
origin: yana-ai — synthesized from microsoft/DeepSpeed (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.51
---

# /deepspeed-zero-memory

## When to Use

- Train models that don't fit on a single GPU (ZeRO-3 shards weights across GPUs)
- CPU offloading: use system RAM as extended GPU VRAM for huge models
- ZeRO-Inference: serve large models across multiple GPUs without model parallelism complexity
- Reduce per-GPU memory 8–64× vs standard data parallelism

## Do NOT use for

- Single-GPU inference (use [[llm-int8-quantization]] or [[llama-cpp-quantization]])
- Models that fit comfortably in VRAM (ZeRO adds communication overhead)

---

## ZeRO stages (memory partitioning)

```
Data Parallel baseline:
  Each GPU holds: full model weights + gradients + optimizer states
  Memory/GPU = W + G + O  (e.g., 7B fp16: ~60 GB)

ZeRO-1: partition optimizer states across GPUs
  Memory/GPU = W + G + O/N   → ~40 GB (N=4 GPUs)

ZeRO-2: partition optimizer states + gradients
  Memory/GPU = W + G/N + O/N → ~30 GB

ZeRO-3: partition weights + gradients + optimizer states
  Memory/GPU = W/N + G/N + O/N → ~15 GB  ← maximum reduction

ZeRO-Infinity: offload W, G, O to CPU/NVMe
  GPU memory required: ~1–2 GB  (just active layer during forward)
```

---

## ds_config.json (ZeRO-3 + CPU offload)

```json
{
  "zero_optimization": {
    "stage": 3,
    "offload_optimizer": { "device": "cpu", "pin_memory": true },
    "offload_param":     { "device": "cpu", "pin_memory": true },
    "overlap_comm":      true,
    "contiguous_gradients": true,
    "reduce_scatter":    true,
    "allgather_partitions": true,
    "allgather_bucket_size": 5e8,
    "reduce_bucket_size":   5e8
  },
  "fp16": { "enabled": true },
  "train_micro_batch_size_per_gpu": 1,
  "gradient_accumulation_steps": 16
}
```

---

## ZeRO-Inference (serve large model across GPUs)

```python
import deepspeed
from transformers import AutoModelForCausalLM, AutoTokenizer

# Initialize model in deepspeed inference mode
model = AutoModelForCausalLM.from_pretrained('meta-llama/Llama-3-70B', torch_dtype=torch.float16)

ds_engine = deepspeed.init_inference(
  model,
  mp_size       = 4,          # tensor parallel across 4 GPUs
  dtype         = torch.float16,
  replace_with_kernel_inject = True,   # fused kernels for speed
  max_out_tokens = 1024,
)

model = ds_engine.module

tokenizer = AutoTokenizer.from_pretrained('meta-llama/Llama-3-70B')
inputs    = tokenizer('Explain ZeRO:', return_tensors='pt').to('cuda:0')
outputs   = model.generate(**inputs, max_new_tokens=200)
print(tokenizer.decode(outputs[0]))
```

---

## Launch command

```bash
# Multi-GPU training with ZeRO-3
deepspeed --num_gpus 4 train.py \
  --deepspeed ds_config.json \
  --model_name_or_path meta-llama/Llama-3-70B

# Single-node multi-GPU inference
deepspeed --num_gpus 4 serve.py
```

---

## Anti-Fake-Pass Checklist

```
❌ ZeRO-3 with small model (< 1B) → communication overhead > memory savings; use DDP
❌ offload_param to CPU without pin_memory: true → 2× slower CPU→GPU transfer
❌ overlap_comm: false → communication and compute serialized; 30% throughput loss
❌ replace_with_kernel_inject without matching model architecture → wrong output
❌ ZeRO-3 with gradient checkpointing → redundant; ZeRO-3 already reduces memory
❌ reduce_bucket_size too large → GPU memory spike during gradient reduction
```
