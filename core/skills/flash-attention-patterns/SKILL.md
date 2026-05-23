---
name: flash-attention-patterns
description: FlashAttention IO-aware attention algorithm for memory-efficient transformer training and inference. Tiling, recomputation strategy, hardware memory hierarchy, FlashAttention-2/3 improvements, and integration with HuggingFace. Sources: Dao-AILab/flash-attention (BSD-3-Clause).
origin: yamtam-engine — synthesized from Dao-AILab/flash-attention (BSD-3-Clause)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.51
---

# /flash-attention-patterns

## When to Use

- Reduce GPU memory usage during attention computation (O(N) vs O(N²))
- Speed up training/inference with long sequences (>1k tokens) on A100/H100
- Enable longer context windows that would otherwise OOM with standard attention
- Drop-in replacement for `torch.nn.MultiheadAttention` with identical results

## Do NOT use for

- CPU inference (Flash Attention requires CUDA)
- Models using custom attention variants (check architecture compatibility)

---

## Memory complexity comparison

```
Standard attention:
  - Store full attention matrix: O(N²) GPU memory
  - N=4096 tokens, fp16: 4096² × 2 bytes = 32 MB per layer per head
  - N=32k tokens: 2 GB per layer — OOM before reaching long context

FlashAttention:
  - Tile the computation into SRAM blocks: O(N) HBM reads/writes
  - Never materializes full N×N matrix in HBM (GPU VRAM)
  - Same mathematical result, 5–20× less memory for long sequences
  - 2–4× faster due to reduced HBM bandwidth pressure

FlashAttention-2 improvements:
  - Better work partitioning across thread blocks
  - Fewer non-matmul FLOPs → 2× faster than FA-1
  - Supports GQA (Grouped-Query Attention) natively

FlashAttention-3 (Hopper GPU, H100):
  - Asynchronous pipelining between WGMMA and TMA
  - FP8 support → 1.5–2× faster than FA-2 on H100
```

---

## Installation and basic usage

```bash
pip install flash-attn --no-build-isolation
# Requires: CUDA 11.6+, PyTorch 2.0+, A100/H100/RTX 3090+
```

```python
from flash_attn import flash_attn_qkvpacked_func, flash_attn_func

# Packed QKV (efficient for self-attention)
# qkv: (batch, seqlen, 3, num_heads, head_dim)
output = flash_attn_qkvpacked_func(
  qkv,
  dropout_p   = 0.0,     # 0 for inference
  causal      = True,    # causal mask for autoregressive generation
  softmax_scale = None,  # defaults to 1/sqrt(head_dim)
)

# Separate Q, K, V
# q/k/v: (batch, seqlen, num_heads, head_dim)
output = flash_attn_func(q, k, v, causal=True)
```

---

## Enable in HuggingFace model

```python
from transformers import AutoModelForCausalLM

# Method 1: attn_implementation flag (transformers >= 4.36)
model = AutoModelForCausalLM.from_pretrained(
  'meta-llama/Llama-3-8B',
  attn_implementation = 'flash_attention_2',
  torch_dtype         = torch.bfloat16,   # FA2 requires fp16 or bf16
)

# Method 2: torch.nn.functional.scaled_dot_product_attention (PyTorch 2.0+)
# PyTorch's SDPA automatically uses FlashAttention if available:
with torch.backends.cuda.sdp_kernel(
  enable_flash    = True,
  enable_math     = False,
  enable_mem_efficient = False,
):
  output = torch.nn.functional.scaled_dot_product_attention(q, k, v, is_causal=True)
```

---

## Sequence length scaling

```python
# Benchmark attention memory at different sequence lengths
import torch, time
from flash_attn import flash_attn_func

def bench(seqlen, use_flash=True):
  batch, heads, dim = 1, 32, 128
  q = torch.randn(batch, seqlen, heads, dim, dtype=torch.float16, device='cuda')
  k = v = q.clone()

  torch.cuda.empty_cache()
  mem_before = torch.cuda.memory_allocated()

  t = time.perf_counter()
  if use_flash:
    out = flash_attn_func(q, k, v, causal=True)
  else:
    out = torch.nn.functional.scaled_dot_product_attention(q.transpose(1,2), k.transpose(1,2), v.transpose(1,2), is_causal=True)
  torch.cuda.synchronize()

  mem = (torch.cuda.memory_allocated() - mem_before) / 1e6
  ms  = (time.perf_counter() - t) * 1000
  print(f'seqlen={seqlen:6d} flash={use_flash} mem={mem:.0f}MB time={ms:.1f}ms')

for sl in [512, 2048, 8192, 32768]:
  bench(sl, use_flash=True)
  bench(sl, use_flash=False)
```

---

## Anti-Fake-Pass Checklist

```
❌ float32 tensors → FA2 requires fp16 or bf16; float32 raises RuntimeError
❌ Non-contiguous tensors → FA requires contiguous memory layout; call .contiguous() first
❌ causal=False for autoregressive generation → attends to future tokens; wrong output
❌ flash-attn not installed but attn_implementation='flash_attention_2' → falls back to eager silently
❌ Using FA on sequences < 64 tokens → overhead > benefit; standard attention faster here
❌ Combining FA with gradient checkpointing incorrectly → recompute may not trigger; check FA's built-in recomputation
```
