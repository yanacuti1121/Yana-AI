---
name: vector-store-patterns
description: Vector database and embedding patterns for AI agent retrieval systems. pgvector similarity search, Chroma collections, Pinecone upsert/query, cosine vs dot-product vs Euclidean distance selection, chunking strategies, metadata filtering, and hybrid search. Sources: pgvector/pgvector, chroma-core/chroma, pinecone-io/pinecone-ts-client, tantaraio/voy, weaviate/weaviate-javascript-client.
origin: yana-ai — synthesized from pgvector/pgvector, chroma-core/chroma, pinecone-io/pinecone-ts-client, tantaraio/voy, weaviate/weaviate-javascript-client
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.44
---

# /vector-store-patterns

## When to Use

- RAG pipeline needs nearest-neighbor search on embeddings
- "Which vector DB should I use for my scale?" — decision tree below
- Hybrid search (semantic + keyword) for better recall
- Metadata filtering to scope vector search results

## Do NOT use for

- Full-text search without embeddings (use pg `tsvector` or Elasticsearch)
- Exact key-value lookup (use Redis / Postgres)

---

## Decision Tree: Which Vector DB

```
Is data already in Postgres?
  YES → pgvector (zero infra, JOIN support, ACID)
  NO  →
    Local / embedded / no server?
      YES → Chroma (in-process, Python or JS, ideal for dev/prototyping)
      NO  →
        Need managed cloud, >1M vectors, low-latency?
          YES → Pinecone (serverless, SLA, enterprise)
          Need graph + vectors + metadata in one store?
            YES → Weaviate (schema + BM25 + vector hybrid)
        WASM / browser / edge?
            YES → voy (Rust WASM, zero server)
```

---

## pgvector (Postgres extension)

```sql
-- Setup
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE embeddings (
  id       BIGSERIAL PRIMARY KEY,
  content  TEXT,
  meta     JSONB,
  vec      VECTOR(1536)   -- OpenAI ada-002 dimension
);
CREATE INDEX ON embeddings USING ivfflat (vec vector_cosine_ops) WITH (lists = 100);
-- lists = sqrt(rows) is a good starting rule
```

```typescript
import { Pool } from 'pg'

const db = new Pool({ connectionString: process.env.DATABASE_URL })

// Upsert embedding
async function storeEmbedding(id: number, content: string, vec: number[], meta: object) {
  await db.query(
    `INSERT INTO embeddings (id, content, meta, vec)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET vec = $4, meta = $3`,
    [id, content, JSON.stringify(meta), JSON.stringify(vec)]
  )
}

// Top-K cosine similarity search
async function similaritySearch(queryVec: number[], k = 5, filter?: { source: string }) {
  const filterClause = filter ? `WHERE meta->>'source' = '${filter.source}'` : ''
  const { rows } = await db.query(
    `SELECT id, content, meta,
            1 - (vec <=> $1::vector) AS score
     FROM embeddings
     ${filterClause}
     ORDER BY vec <=> $1::vector
     LIMIT $2`,
    [JSON.stringify(queryVec), k]
  )
  return rows
}

// Rule: use <=> (cosine) for text embeddings, <#> (inner product) for dot-product-normalized
// Rule: HNSW index for high QPS: CREATE INDEX ON embeddings USING hnsw (vec vector_cosine_ops)
// Rule: IVFFlat for large datasets where index build time matters more than query speed
```

---

## Chroma (embedded / local)

```typescript
import { ChromaClient } from 'chromadb'

const client = new ChromaClient()  // default: http://localhost:8000

// Create or get collection
const collection = await client.getOrCreateCollection({
  name: 'agent-memory',
  metadata: { 'hnsw:space': 'cosine' },  // cosine | l2 | ip
})

// Add documents with embeddings
await collection.add({
  ids:        ['doc-1', 'doc-2'],
  embeddings: [[0.1, 0.2, ...], [0.3, 0.4, ...]],  // pre-computed
  documents:  ['First chunk', 'Second chunk'],
  metadatas:  [{ source: 'file.md', page: 1 }, { source: 'file.md', page: 2 }],
})

// Query with metadata filter
const results = await collection.query({
  queryEmbeddings: [queryVec],
  nResults:        5,
  where:           { source: { $eq: 'file.md' } },   // metadata filter
  include:         ['documents', 'distances', 'metadatas'],
})

// Rule: Chroma IDs must be unique strings — use `${source}:${chunkIndex}` pattern
// Rule: always set hnsw:space at creation — cannot change after documents added
```

---

## Pinecone (managed serverless)

```typescript
import { Pinecone } from '@pinecone-database/pinecone'

const pc     = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! })
const index  = pc.index('agent-knowledge')

// Upsert batch (max 100 vectors per call, 2MB limit)
await index.upsert([
  {
    id:       'chunk-001',
    values:   embedding,          // number[]
    metadata: { source: 'docs/faq.md', section: 'auth', tokens: 312 },
  },
])

// Query with namespace isolation
const result = await index.namespace('user-123').query({
  vector:          queryEmbedding,
  topK:            8,
  filter:          { section: { $in: ['auth', 'billing'] } },
  includeMetadata: true,
})

const hits = result.matches.filter(m => (m.score ?? 0) > 0.78)

// Rule: use namespaces for multi-tenant isolation (user-{id}, org-{id})
// Rule: score threshold 0.75–0.82 for cosine — below = noise, above = too strict
// Rule: batch upsert in chunks of 100; parallel batches up to 5 for throughput
```

---

## Chunking Strategy

```typescript
// Fixed-size with overlap — most reliable for dense prose
function chunkWithOverlap(text: string, size = 512, overlap = 64): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    chunks.push(text.slice(start, start + size))
    start += size - overlap
  }
  return chunks
}

// Semantic boundary chunking — split on paragraph breaks first
function semanticChunk(text: string, maxTokens = 400): string[] {
  const paragraphs = text.split(/\n{2,}/)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    const approxTokens = (current + para).length / 4  // ~4 chars/token
    if (approxTokens > maxTokens && current) {
      chunks.push(current.trim())
      current = para
    } else {
      current += (current ? '\n\n' : '') + para
    }
  }
  if (current) chunks.push(current.trim())
  return chunks
}

// Rule: always include chunk index in metadata for reassembly
// Rule: overlap = 10–15% of chunk size prevents context split at boundary
// Rule: store token count in metadata to enforce LLM context limits at query time
```

---

## Hybrid Search (BM25 + vector)

```typescript
// Reciprocal Rank Fusion — combine keyword and semantic results
function reciprocalRankFusion(
  bm25Results:   { id: string; rank: number }[],
  vectorResults: { id: string; rank: number }[],
  k = 60
): { id: string; score: number }[] {
  const scores = new Map<string, number>()

  for (const r of bm25Results) {
    scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (k + r.rank))
  }
  for (const r of vectorResults) {
    scores.set(r.id, (scores.get(r.id) ?? 0) + 1 / (k + r.rank))
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
}

// Rule: RRF outperforms linear score combination for cross-encoder re-ranking
// Rule: k=60 is standard; lower k = more weight on top results
```

---

## Anti-Fake-Pass Checklist

```
❌ Cosine index on dot-product embeddings (must match training metric)
❌ No metadata filter → full collection scan on every query
❌ Chunking without overlap (context lost at boundaries)
❌ Pinecone upsert batches > 100 vectors (API limit, silently truncates)
❌ Chroma hnsw:space changed after collection created (requires recreation)
❌ Score threshold missing (returning noise below 0.75 to LLM)
❌ No namespace isolation in multi-tenant system (cross-user data leak)
❌ pgvector without index (sequential scan on > 50k rows = unacceptable latency)
```
