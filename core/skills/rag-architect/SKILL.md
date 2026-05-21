---
name: rag-architect
description: >
  Design and audit Retrieval-Augmented Generation (RAG) pipelines — chunking
  strategy, embedding choice, hybrid search, retrieval evaluation, and failure
  diagnosis. Use when asked to "build a RAG system", "fix retrieval quality",
  "improve RAG accuracy", "chunk documents", "add semantic search", or when
  an LLM keeps hallucinating despite having access to docs.
  Do NOT use for: fine-tuning decisions — that is a separate trade-off.
origin: yamtam-original
license: MIT © 2025 Vũ Văn Tâm
version: 1.0.0
compatibility: "Any LLM stack. Patterns apply to LangChain, LlamaIndex, custom pipelines."
---

<!-- Original skill — content derived from public RAG research (Gao et al. 2023,
     Lewis et al. 2020), production engineering blog posts, and YAMTAM author's
     synthesis. No external skill file copied. -->

## When to Use

- Use when: building document Q&A, knowledge base search, or context injection
- Use when: LLM answers are hallucinated despite docs being "in the system"
- Use when: retrieval returns irrelevant chunks
- Use when: auditing an existing RAG pipeline before production
- Do NOT use for: prompt template design — use `prompt-engineering` skill
- Do NOT use for: LLM UI (streaming, states) — use `llm-ui-patterns` skill

---

## RAG Failure Modes

73% of RAG failures trace to retrieval; 80% of retrieval failures trace to chunking.

| Failure | Symptom | Root cause |
|---|---|---|
| Context miss | LLM says "I don't know" but doc exists | Chunk too large — answer buried |
| Context flood | Correct answer lost in noise | Retrieving too many chunks |
| Semantic split | Answer split across chunk boundary | Fixed-size chunking ignores structure |
| Stale retrieval | Outdated answer served | No timestamp filter in query |
| Cross-doc confusion | Answer blends facts from multiple docs | Missing source-isolation metadata |

---

## Chunking Strategy

### Default: 512 tokens + 10–20% overlap
```
chunk_size    = 512 tokens  (≈ 1-2 paragraphs)
chunk_overlap = 10–20%      (51–102 tokens)
```
- Overlap prevents answers split at chunk boundaries
- 512 is the empirical sweet spot: large enough for context, small enough for precision

### Choose by content type

| Content type | Strategy | Size |
|---|---|---|
| Narrative prose | Fixed-size + overlap | 512 tokens, 15% overlap |
| Technical docs | Sentence-level | 2–5 sentences per chunk |
| Code | Function-level | One function per chunk |
| FAQ / Q&A pairs | Semantic unit | One Q+A pair per chunk |
| Legal / contracts | Section-level | One clause per chunk |
| Tables / structured data | Row or block | One logical row/block |

### Metadata-aware chunking (+15–25% retrieval accuracy)
Every chunk must carry:
```json
{
  "source": "handbook.pdf",
  "section": "Chapter 3 — Onboarding",
  "page": 14,
  "created_at": "2025-03-01",
  "doc_type": "policy",
  "chunk_index": 7,
  "total_chunks": 42
}
```
Use metadata for pre-filtering before vector search — eliminates irrelevant domains.

---

## Retrieval Architecture

### Hybrid search (dense + sparse) — recommended default

```
Query
  │
  ├── Dense search (embedding similarity)   → top-K candidates
  ├── Sparse search (BM25 / keyword)        → top-K candidates
  │
  └── Reciprocal Rank Fusion (RRF)          → merged, re-ranked result set
```

Dense search: captures semantic meaning ("employee time off" matches "vacation policy")
Sparse search: captures exact terminology ("RFC 2119", "GDPR Art. 17") — dense alone misses these

RRF fusion formula: `score = Σ 1 / (rank_i + k)`, k=60 is standard default.

### Re-ranking (optional second pass)
After RRF, run a cross-encoder re-ranker on top-20 → return top-5.
Cost: 1 extra inference call. Gain: removes false positives missed by embedding similarity.

### Top-K selection

| Use case | top-K |
|---|---|
| Precise Q&A | 3–5 |
| Summarization | 8–15 |
| Research assistant | 15–25 |

Higher K = more context = higher cost + risk of context flood.

---

## Retrieval Evaluation — From Day One

Never skip eval. Measure at pipeline build time, not after ship.

### Metrics to track

| Metric | What it measures | Target |
|---|---|---|
| Hit Rate | Answer chunk in top-K | > 0.85 |
| MRR (Mean Reciprocal Rank) | How high the answer chunk ranks | > 0.70 |
| Context Relevance | Retrieved chunks relevant to query | > 0.80 |
| Answer Faithfulness | LLM answer grounded in chunks | > 0.90 |
| Answer Relevance | Answer addresses the question | > 0.85 |

Tools: Ragas (open source), LlamaIndex Eval, ARES.

### Minimum eval dataset
- 50 questions minimum before any production claim
- Include: factual, multi-hop, negative (answer not in docs), edge-case

---

## Pipeline Checklist

```
□ Chunking strategy chosen for content type (not default everywhere)
□ Chunk metadata includes: source, section, timestamp, doc_type
□ Hybrid search (dense + sparse) implemented — or documented why not
□ top-K tuned per use case (not fixed at 10 for everything)
□ Retrieval eval dataset built (≥ 50 questions)
□ Hit Rate ≥ 0.85 measured before ship claim
□ Answer Faithfulness ≥ 0.90 measured
□ Stale document handling: timestamp filter or re-indexing schedule defined
```

---

## Anti-Fake-Pass Rules

Before claiming "RAG is working", you MUST show:
- [ ] Hit Rate and MRR measured on an eval dataset (not spot-checked)
- [ ] Chunking strategy justified for the actual content type
- [ ] Metadata schema defined (source, section, timestamp at minimum)
- [ ] Hybrid search in place OR documented why dense-only suffices
- [ ] top-K value justified, not left at arbitrary default

Reference: `gates/anti-fake-pass-gate.md`
