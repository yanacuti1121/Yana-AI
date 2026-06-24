---
name: onnxruntime-inference
description: ONNX Runtime cross-platform model inference. Export PyTorch/HuggingFace models to ONNX, execution provider selection (CUDA/TensorRT/CPU), graph optimization, and Node.js inference pipeline. Sources: microsoft/onnxruntime (MIT).
origin: yana-ai — synthesized from microsoft/onnxruntime (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.51
---

# /onnxruntime-inference

## When to Use

- Deploy ML models on any hardware (CPU, CUDA, TensorRT, DirectML, CoreML) without rewriting code
- Edge/embedded inference: run models on devices without Python
- Speed up HuggingFace inference by 2–5× via ONNX graph optimization
- Node.js inference: run models server-side without Python subprocess

## Do NOT use for

- LLMs > 7B parameters (use [[vllm-paged-attention]] or [[llama-cpp-quantization]])
- Frequent model updates (ONNX export is one-time; retraining still in PyTorch)

---

## Export PyTorch model → ONNX

```python
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

model_name = 'distilbert-base-uncased-finetuned-sst-2-english'
tokenizer  = AutoTokenizer.from_pretrained(model_name)
model      = AutoModelForSequenceClassification.from_pretrained(model_name)
model.eval()

# Dummy input for shape tracing
dummy = tokenizer('Hello world', return_tensors='pt', padding='max_length', max_length=128)

torch.onnx.export(
  model,
  (dummy['input_ids'], dummy['attention_mask']),
  'model.onnx',
  input_names  = ['input_ids', 'attention_mask'],
  output_names = ['logits'],
  dynamic_axes = {
    'input_ids':      {0: 'batch', 1: 'seq'},
    'attention_mask': {0: 'batch', 1: 'seq'},
    'logits':         {0: 'batch'},
  },
  opset_version = 14,
)
```

---

## Optimize ONNX graph

```python
from onnxruntime.transformers import optimizer
from onnxruntime.transformers.onnx_model_bert import BertOptimizationOptions

opts = BertOptimizationOptions('bert')
opts.enable_gelu_approximation = True

opt_model = optimizer.optimize_model(
  'model.onnx',
  model_type = 'bert',
  num_heads  = 12,
  hidden_size = 768,
  optimization_options = opts,
)
opt_model.save_model_to_file('model_optimized.onnx')
```

---

## Node.js inference (onnxruntime-node)

```javascript
import * as ort from 'onnxruntime-node'

// Load model once at startup
const session = await ort.InferenceSession.create('model_optimized.onnx', {
  executionProviders: ['cuda', 'cpu'],   // fallback chain
  graphOptimizationLevel: 'all',
})

async function classify(text: string): Promise<{ label: string; score: number }> {
  // Tokenize (simplified — use tokenizers npm for real use)
  const inputIds      = new ort.Tensor('int64', tokenize(text), [1, 128])
  const attentionMask = new ort.Tensor('int64', mask(text),     [1, 128])

  const results = await session.run({ input_ids: inputIds, attention_mask: attentionMask })
  const logits  = results['logits'].data as Float32Array

  const probs   = softmax(Array.from(logits))
  const label   = probs[1] > 0.5 ? 'POSITIVE' : 'NEGATIVE'
  return { label, score: Math.max(...probs) }
}
```

---

## Execution provider hierarchy

```javascript
// Priority order: TensorRT > CUDA > CPU
const session = await ort.InferenceSession.create('model.onnx', {
  executionProviders: [
    { name: 'tensorrt', trtMaxWorkspaceSize: 1 << 30 },
    { name: 'cuda',     deviceId: 0 },
    'cpu',
  ],
})
// ORT automatically falls back if a provider is unavailable
```

---

## Anti-Fake-Pass Checklist

```
❌ Static axes (no dynamic_axes) → model rejects any batch size ≠ dummy input size
❌ opset_version too low → unsupported ops; use 14–17 for modern models
❌ Not optimizing graph → raw export is 2× slower than optimized
❌ CUDA provider without CUDA toolkit → silent fallback to CPU with no warning
❌ Tensor dtype mismatch (float32 vs float16) → incorrect results without error
❌ Creating new InferenceSession per request → 100–500ms overhead; create once and reuse
```
