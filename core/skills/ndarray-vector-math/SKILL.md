---
name: ndarray-vector-math
description: High-performance N-dimensional array operations for vector math in agent memory systems. Cosine similarity, dot product, Euclidean distance, batch matrix ops, and typed array backends. Sources: hughsk/ndarray, scijs ecosystem.
origin: yamtam-engine — synthesized from hughsk/ndarray (MIT), scijs/ndarray-ops
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /ndarray-vector-math

## When to Use

- Computing cosine similarity between embedding vectors in agent L1 memory
- Batch nearest-neighbor search without an external vector DB
- Matrix operations for PCA/dimensionality reduction on small embedding sets
- Fast typed-array math without Python/WASM dependency

## Do NOT use for

- > 100k vectors (use [[in-memory-vector-storage]] or pgvector instead)
- GPU-accelerated matrix math (use ONNX runtime or TensorFlow.js)

---

## Cosine similarity

```javascript
import ndarray from 'ndarray'
import ops     from 'ndarray-ops'

type Vec = Float32Array

function cosine(a: Vec, b: Vec): number {
  if (a.length !== b.length) throw new Error('dimension mismatch')
  const n = a.length
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < n; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// Usage
const queryVec  = new Float32Array([0.1, 0.3, 0.8, ...])
const memVec    = new Float32Array([0.2, 0.2, 0.9, ...])
const similarity = cosine(queryVec, memVec)
// 1.0 = identical, 0.0 = orthogonal, -1.0 = opposite
```

---

## ndarray batch operations

```javascript
import ndarray from 'ndarray'
import ops     from 'ndarray-ops'

// Matrix of N embedding vectors, each of dim D
const N = 1000, D = 1536
const matrix = ndarray(new Float32Array(N * D), [N, D])

// Fill with embeddings
for (let i = 0; i < N; i++) {
  for (let d = 0; d < D; d++) {
    matrix.set(i, d, embeddings[i][d])
  }
}

// L2 normalize all rows in-place
for (let i = 0; i < N; i++) {
  const row  = matrix.pick(i, null)
  let norm   = 0
  for (let d = 0; d < D; d++) norm += row.get(d) ** 2
  norm = Math.sqrt(norm)
  if (norm > 0) ops.divseq(row, norm)
}
```

---

## Top-K nearest neighbors (brute force)

```javascript
function topK(
  query:     Float32Array,
  corpus:    Float32Array[],
  k         = 5,
  threshold = 0.75
): { index: number; score: number }[] {
  return corpus
    .map((vec, index) => ({ index, score: cosine(query, vec) }))
    .filter(r => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
```

---

## Anti-Fake-Pass Checklist

```
❌ Float64Array instead of Float32Array → 2× memory, no precision benefit for embeddings
❌ cosine computed on non-normalized vectors → results not in [-1, 1] range
❌ norm === 0 not checked → NaN propagates through all downstream comparisons
❌ N > 100k with brute force → O(N*D) scan too slow (use HNSW index)
❌ ndarray-ops not imported → ops.divseq silently undefined
❌ Dimension mismatch not caught → silent wrong results (no runtime error)
```
