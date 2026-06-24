---
name: matrix-dimensionality-reduction
description: Linear algebra matrix operations and dimensionality reduction for embedding compression. PCA, SVD basics, matrix multiply, transpose, and vector projection — pure JS for agent memory optimization. Sources: scijs/matrix, numeric.js patterns.
origin: yana-ai — synthesized from scijs/matrix (MIT), PCA algorithm (Shlens 2014)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /matrix-dimensionality-reduction

## When to Use

- Compress 1536-dim embeddings to 64-128 dims for faster [[in-memory-vector-storage]]
- PCA projection to reduce memory footprint by 10-20× at small accuracy cost
- Whitening embeddings before cosine similarity
- Matrix operations without Python/WASM dependency

## Do NOT use for

- Production-scale PCA (> 100k vectors — use FAISS or scikit-learn)
- Neural network matrix ops (use TensorFlow.js or ONNX)

---

## Matrix operations (plain TypeScript)

```typescript
type Matrix = number[][]

// Matrix multiply A × B
function matMul(A: Matrix, B: Matrix): Matrix {
  const rows = A.length, cols = B[0].length, inner = B.length
  return Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) =>
      A[i].reduce((sum, _, k) => sum + A[i][k] * B[k][j], 0)
    )
  )
}

// Transpose
function transpose(A: Matrix): Matrix {
  return A[0].map((_, j) => A.map(row => row[j]))
}

// Matrix-vector multiply
function matVecMul(A: Matrix, v: number[]): number[] {
  return A.map(row => row.reduce((sum, val, j) => sum + val * v[j], 0))
}
```

---

## PCA projection (offline — fit on corpus, transform on query)

```typescript
function meanCenter(X: Matrix): { centered: Matrix; mean: number[] } {
  const mean = X[0].map((_, j) => X.reduce((s, row) => s + row[j], 0) / X.length)
  const centered = X.map(row => row.map((v, j) => v - mean[j]))
  return { centered, mean }
}

// Covariance matrix (for small D)
function covariance(X: Matrix): Matrix {
  const n = X.length
  const XT = transpose(X)
  return matMul(XT, X).map(row => row.map(v => v / (n - 1)))
}

// Project embeddings to lower dimension using pre-computed projection matrix
function projectEmbeddings(embeddings: number[][], projMatrix: Matrix): number[][] {
  return embeddings.map(vec => matVecMul(projMatrix, vec))
}

// Usage: fit offline, use projMatrix in production
// const { centered, mean } = meanCenter(corpus)
// const projMatrix = computePCA(covariance(centered), dims=64)
// const compressed = projectEmbeddings(newEmbeddings, projMatrix)
```

---

## L2 normalization (unit sphere projection)

```typescript
function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return norm > 0 ? v.map(x => x / norm) : v
}

// Normalize batch of embeddings
const normalized = embeddings.map(normalize)
// After normalization: cosine similarity = dot product (faster computation)
```

---

## Dimension reduction ratio guide

```
Original dim  → Compressed  → Storage reduction
─────────────────────────────────────────────────
1536 (ada-002) → 128         → 12×
1536          → 64          → 24×
768 (MiniLM)  → 64          → 12×
Rule of thumb: keep 90% explained variance → ~20% of original dims
```

---

## Anti-Fake-Pass Checklist

```
❌ PCA projection matrix computed on small sample → poor generalization
❌ Mean not subtracted before PCA → first principal component = mean direction
❌ matMul O(n³) — fine for dim < 1000, catastrophic for large matrices
❌ Projection matrix not persisted → must recompute from same corpus on restart
❌ Normalized embeddings compared with Euclidean distance → use dot product
❌ No dimension mismatch check → wrong projMatrix silently corrupts results
```
