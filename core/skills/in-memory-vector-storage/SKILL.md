---
name: in-memory-vector-storage
description: In-memory vector index with JSON persistence for small-scale agent RAG. Upsert/query/delete embeddings, cosine similarity search, JSON snapshot save/load, and memory-budget enforcement. Sources: wseagar/vector-storage.
origin: yana-ai — synthesized from wseagar/vector-storage (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.48
---

# /in-memory-vector-storage

## When to Use

- Agent L1 memory needs sub-5k vector search without external DB
- Local RAG over yamtam skills/rules with JSON persistence
- Prototype semantic search before migrating to pgvector or Pinecone
- Offline/air-gapped environments with no DB infrastructure

## Do NOT use for

- > 10k vectors (brute-force scan too slow — use [[vector-store-patterns]])
- Multi-agent concurrent writes (no locking — single-writer only)

---

## Core store implementation

```typescript
import { writeFileSync, readFileSync, existsSync } from 'fs'

interface VectorEntry {
  id:       string
  vector:   number[]
  metadata: Record<string, unknown>
}

class InMemoryVectorStore {
  private entries: Map<string, VectorEntry> = new Map()
  private dim:     number | null = null

  upsert(id: string, vector: number[], metadata: Record<string, unknown> = {}): void {
    if (!this.dim) this.dim = vector.length
    if (vector.length !== this.dim) throw new Error(`dim mismatch: expected ${this.dim}`)
    this.entries.set(id, { id, vector, metadata })
  }

  query(queryVec: number[], topK = 5, threshold = 0.7): (VectorEntry & { score: number })[] {
    return [...this.entries.values()]
      .map(e => ({ ...e, score: this.cosine(queryVec, e.vector) }))
      .filter(e => e.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  delete(id: string): boolean { return this.entries.delete(id) }

  size(): number { return this.entries.size }

  save(path: string): void {
    const data = { dim: this.dim, entries: [...this.entries.values()] }
    writeFileSync(path, JSON.stringify(data))
  }

  load(path: string): void {
    if (!existsSync(path)) return
    const data   = JSON.parse(readFileSync(path, 'utf8'))
    this.dim     = data.dim
    this.entries = new Map(data.entries.map((e: VectorEntry) => [e.id, e]))
  }

  private cosine(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2
    }
    return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
  }
}

export const vectorStore = new InMemoryVectorStore()
```

---

## Index yamtam skills for semantic search

```typescript
import { vectorStore } from './vector-store.js'
import { readFileSync, readdirSync } from 'fs'

// Hypothetical: embed skill descriptions (replace with real embeddings)
async function indexSkills(skillsDir: string, embedFn: (text: string) => Promise<number[]>) {
  for (const skill of readdirSync(skillsDir)) {
    const path = `${skillsDir}/${skill}/SKILL.md`
    const desc = readFileSync(path, 'utf8').split('\n')
      .find(l => l.startsWith('description:'))?.replace('description: ', '') ?? skill

    const vec = await embedFn(desc)
    vectorStore.upsert(skill, vec, { path, skill })
  }
  vectorStore.save('/workspaces/yana-ai/core/memory/skills-index.json')
}
```

---

## Memory budget check

```javascript
const MAX_VECTORS    = 5000
const APPROX_BYTES   = (dim: number) => dim * 4 + 200  // float32 + metadata overhead

function checkMemoryBudget(store: InMemoryVectorStore, dim: number): void {
  const count = store.size()
  if (count > MAX_VECTORS) {
    throw new Error(`[vector-store] budget exceeded: ${count} > ${MAX_VECTORS}`)
  }
  const approxMb = (count * APPROX_BYTES(dim)) / (1024 * 1024)
  if (approxMb > 200) console.warn(`[vector-store] ~${approxMb.toFixed(1)}MB in RAM`)
}
```

---

## Anti-Fake-Pass Checklist

```
❌ No dimension validation on upsert → silent wrong cosine scores
❌ JSON.stringify on >10k vectors → blocks event loop for seconds
❌ No threshold filter → returns noise below 0.7 similarity
❌ Concurrent writes from multiple agents → race condition corrupts Map
❌ save() not called after upsert → index lost on process restart
❌ Float64 JSON → 3× larger file than Float32Array binary
```
