---
name: triton-inference-server
description: NVIDIA Triton Inference Server for production GPU model serving. Model repository layout, dynamic batching, concurrent model execution, gRPC/HTTP clients, and ensemble pipelines. Sources: triton-inference-server/server (BSD-3-Clause).
origin: yana-ai — synthesized from triton-inference-server/server (BSD-3-Clause)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.51
---

# /triton-inference-server

## When to Use

- Multi-model GPU serving: run 10+ models on one server with resource isolation
- Dynamic batching: automatically group concurrent requests to maximize GPU utilization
- Ensemble pipelines: chain preprocessing → inference → postprocessing as a single request
- Production SLA: per-model instance groups with priority scheduling

## Do NOT use for

- Development/local inference (use [[llama-cpp-quantization]] or [[vllm-paged-attention]])
- Models not in TensorRT/ONNX/TensorFlow/PyTorch/Python backend format

---

## Model repository layout

```
model_repository/
├── sentiment/
│   ├── config.pbtxt
│   └── 1/
│       └── model.onnx           ← versioned model artifact
├── embedding/
│   ├── config.pbtxt
│   └── 1/
│       └── model.plan           ← TensorRT engine
└── text_pipeline/
    ├── config.pbtxt             ← ensemble config
    └── 1/
        └── (no artifact for ensemble)
```

---

## config.pbtxt (ONNX model)

```protobuf
name:     "sentiment"
backend:  "onnxruntime"
max_batch_size: 32

input [{
  name:     "input_ids"
  data_type: TYPE_INT64
  dims:     [-1]    # dynamic sequence length
}]
output [{
  name:     "logits"
  data_type: TYPE_FP32
  dims:     [2]
}]

dynamic_batching {
  preferred_batch_size: [8, 16, 32]
  max_queue_delay_microseconds: 5000   # wait up to 5ms to fill a batch
}

instance_group [{
  count: 2       # 2 concurrent GPU instances
  kind:  KIND_GPU
  gpus:  [0]
}]
```

---

## HTTP client (Node.js)

```javascript
async function tritonInfer(modelName: string, inputData: Float32Array): Promise<Float32Array> {
  const res = await fetch(`http://triton:8000/v2/models/${modelName}/infer`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputs: [{
        name:     'input_ids',
        shape:    [1, inputData.length],
        datatype: 'INT64',
        data:     Array.from(inputData),
      }],
      outputs: [{ name: 'logits' }],
    }),
  })

  if (!res.ok) throw new Error(`[triton] ${res.status}: ${await res.text()}`)
  const result = await res.json()
  return new Float32Array(result.outputs[0].data)
}
```

---

## Ensemble pipeline config

```protobuf
# text_pipeline/config.pbtxt — tokenize → infer → decode
name:     "text_pipeline"
platform: "ensemble"
max_batch_size: 32

input  [{ name: "raw_text",  data_type: TYPE_STRING, dims: [1] }]
output [{ name: "label",     data_type: TYPE_STRING, dims: [1] }]

ensemble_scheduling {
  step [
    { model_name: "tokenizer",  model_version: -1,
      input_map  { key: "raw_text" value: "raw_text" }
      output_map { key: "input_ids" value: "input_ids" } },
    { model_name: "sentiment",  model_version: -1,
      input_map  { key: "input_ids" value: "input_ids" }
      output_map { key: "logits" value: "logits" } },
    { model_name: "postprocess", model_version: -1,
      input_map  { key: "logits" value: "logits" }
      output_map { key: "label" value: "label" } },
  ]
}
```

---

## Anti-Fake-Pass Checklist

```
❌ max_batch_size: 0 → batching disabled; dynamic batching has no effect
❌ dims: [128] (static) → rejects variable-length inputs; use [-1] for dynamic
❌ instance_group KIND_GPU without CUDA → Triton falls back to CPU silently
❌ Ensemble step output_map key mismatch → pipeline fails with cryptic shape error
❌ No max_queue_delay_microseconds → batches wait forever for preferred_batch_size
❌ Triton HTTP (not gRPC) for large tensors → JSON encoding overhead; use gRPC for FP32 arrays
```
