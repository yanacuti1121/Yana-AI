---
name: vector-distance-metrics
description: Vector similarity and distance algorithms for agent memory ranking. Cosine similarity, Euclidean distance, Manhattan distance, Jaccard, Hamming, and when to use each metric for different embedding types. Sources: mljs/distance.
origin: yamtam-engine — synthesized from mljs/distance (MIT), Pinecone distance metric docs
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.48
---

# /vector-distance-metrics

## When to Use

- Choosing the right similarity metric for a given embedding model
- Computing pairwise distances between agent memory entries
- Re-ranking search results after initial approximate nearest neighbor
- Sparse vector similarity (Jaccard for binary/set features)

## Do NOT use for

- High-dimensional (> 1536D) brute-force batch search (use HNSW index)
- Metrics not supported by your vector DB (must match index configuration)

---

## Metric selection guide

```
Embedding type                 → Best metric
─────────────────────────────────────────────
Text (OpenAI ada, Anthropic)   → Cosine (direction, not magnitude)
Image (CLIP, ViT)              → Cosine or Dot product (normalized)
Recommendation (dot-product)   → Inner product / Dot product
Binary/boolean features        → Jaccard or Hamming
Euclidean space (coordinates)  → L2 Euclidean
Bag-of-words sparse vectors    → Cosine or BM25
```

---

## Implementations

```typescript
type Vec = number[]

// Cosine similarity [−1, 1] (1 = identical direction)
export function cosine(a: Vec, b: Vec): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na  += a[i] ** 2
    nb  += b[i] ** 2
  }
  return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

// L2 Euclidean distance (0 = identical, larger = more different)
export function euclidean(a: Vec, b: Vec): number {
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0))
}

// Manhattan / L1 distance
export function manhattan(a: Vec, b: Vec): number {
  return a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0)
}

// Jaccard similarity for binary vectors [0, 1]
export function jaccard(a: number[], b: number[]): number {
  let inter = 0, union = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) { union++; if (a[i] && b[i]) inter++ }
  }
  return union ? inter / union : 0
}

// Hamming distance (count of differing bits/positions)
export function hamming(a: number[], b: number[]): number {
  return a.reduce((sum, v, i) => sum + (v !== b[i] ? 1 : 0), 0)
}
```

---

## mljs/distance usage

```javascript
import { euclidean, cosine, manhattan } from 'ml-distance'

const a = [1, 2, 3, 4]
const b = [4, 3, 2, 1]

euclidean(a, b)   // 4.472
cosine(a, b)      // 0.4    (note: mljs returns distance not similarity)
manhattan(a, b)   // 6
```

---

## Convert distance to similarity

```javascript
// Euclidean distance → similarity (0-1 range)
const euclidSimilarity = (d: number) => 1 / (1 + d)

// Cosine distance → cosine similarity
const cosineSimFromDist = (d: number) => 1 - d
```

---

## Anti-Fake-Pass Checklist

```
❌ Cosine on non-normalized dot-product embeddings → misleading results
❌ Euclidean on high-dimensional embeddings → curse of dimensionality (all same distance)
❌ mljs cosine returns distance (1-sim), not similarity — subtract from 1
❌ Zero vector → cosine = 0/0 = NaN → guard with magnitude check
❌ Mixing metrics between index and query → results meaningless
❌ Jaccard on continuous vectors → divide by zero when both are 0
```
