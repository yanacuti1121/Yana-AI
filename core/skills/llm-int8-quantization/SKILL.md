---
name: llm-int8-quantization
description: LLM.int8() and bitsandbytes 4-bit quantization (NF4/FP4) for memory-efficient LLM loading. Mixed-precision decomposition, QLoRA fine-tuning, double quantization, and GPU OOM prevention patterns. Sources: TimDettmers/bitsandbytes (MIT).
origin: yana-ai — synthesized from TimDettmers/bitsandbytes (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.51
---

# /llm-int8-quantization

## When to Use

- Load a 13B model on a 16 GB GPU (int8) or a 70B model on 2×24 GB GPUs (4-bit)
- QLoRA fine-tuning: train adapters on quantized base model without full precision
- Prevent GPU OOM during inference of models that barely fit in VRAM
- NF4 quantization: best accuracy/size tradeoff for NLP models

## Do NOT use for

- CPU inference (use [[llama-cpp-quantization]] which is faster on CPU)
- Production high-throughput (use AWQ/GPTQ via [[tgi-streaming-inference]])

---

## Quantization math

```
LLM.int8() (Dettmers 2022):
  - Identify "emergent outlier" features (top 0.1% of activations)
  - Keep outliers in fp16, quantize the rest to int8
  - Matrix multiply: int8×int8 → int32, then cast back to fp16
  - Result: near-zero quality loss with 50% memory reduction

NF4 (NormalFloat4, Dettmers 2023):
  - 4-bit quantization with quantile normalization
  - "double quantization": quantize the quantization constants too
  - Saves additional 0.5 bits/param on top of 4-bit
  - Combined: 65B model fits in ~40 GB (was 130 GB in fp16)
```

---

## Load model in int8

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

model = AutoModelForCausalLM.from_pretrained(
  'meta-llama/Llama-3-13B',
  load_in_8bit  = True,           # LLM.int8()
  device_map    = 'auto',         # spread across available GPUs
  torch_dtype   = torch.float16,
)
tokenizer = AutoTokenizer.from_pretrained('meta-llama/Llama-3-13B')

inputs = tokenizer('Hello world', return_tensors='pt').to('cuda')
output = model.generate(**inputs, max_new_tokens=100)
print(tokenizer.decode(output[0]))
```

---

## Load model in 4-bit (NF4)

```python
from transformers import BitsAndBytesConfig

bnb_config = BitsAndBytesConfig(
  load_in_4bit               = True,
  bnb_4bit_quant_type        = 'nf4',       # or 'fp4'
  bnb_4bit_compute_dtype     = torch.bfloat16,
  bnb_4bit_use_double_quant  = True,        # save extra ~0.5 bits/param
)

model = AutoModelForCausalLM.from_pretrained(
  'meta-llama/Llama-3-70B',
  quantization_config = bnb_config,
  device_map          = 'auto',
)
```

---

## QLoRA: fine-tune quantized model

```python
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

# Prepare: add gradient checkpointing, cast layer norms to fp32
model = prepare_model_for_kbit_training(model)

# Attach LoRA adapters (only these train; base model stays frozen)
lora_config = LoraConfig(
  r              = 16,         # LoRA rank
  lora_alpha     = 32,
  target_modules = ['q_proj', 'v_proj'],
  lora_dropout   = 0.05,
  bias           = 'none',
  task_type      = 'CAUSAL_LM',
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# trainable params: 8,388,608 || all params: 3,500,000,000 → 0.24% trainable
```

---

## Anti-Fake-Pass Checklist

```
❌ load_in_8bit without bitsandbytes installed → cryptic import error
❌ device_map='auto' without accelerate installed → falls back to single GPU
❌ int8 inference on CPU → bitsandbytes int8 is GPU-only; use llama.cpp for CPU
❌ QLoRA without prepare_model_for_kbit_training → frozen base model gradients cause NaN
❌ bnb_4bit_compute_dtype=float32 on Ampere+ GPU → use bfloat16; float32 is 2× slower
❌ Saving full model after QLoRA → saves base+adapters as fp32; save only LoRA adapter
```
