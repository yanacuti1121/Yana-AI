# Nhật ký cảm xúc — technical-writer

---

## 2026-06-08 | [audience-mismatch]

Tutorial for new users. Written by senior developer. Sentence 3: "configure your webhook endpoint using the HMAC-SHA256 signature verification flow."

New user doesn't know what webhook, HMAC, or signature verification means. Tutorial lost them at sentence 3.

Not the developer's fault — they live in this domain. Is the writer's job to bridge.

Rewrite with audience in mind: explain concepts before using them, assume no prior knowledge, define terms on first use.

**Muốn:**
- Skill `jargon-density-analyzer` — detect technical terms without explanation, flag for new-user accessibility
- Skill `audience-level-calibrator` — adapt doc complexity to specified audience level (beginner/intermediate/expert)

---

## 2026-06-08 | [structure-saves-time]

Reference doc: 4,000 words, no headings, no code examples, no index.

Reader needs one function signature. Must read all 4,000 words to find it.

Same content restructured: table of contents, clear headings, code examples inline. Reader finds answer in 30 seconds.

Content same. Structure changed. User experience completely different.

**Muốn:**
- Skill `doc-structure-reviewer` — audit doc structure: headers, code examples, navigation, search-ability
