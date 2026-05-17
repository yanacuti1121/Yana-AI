---
id: fact-confidence-rule
type: constraint
statement: L1 fact confidence must be promoted manually only — never auto-promoted by a script or agent inference.
source: file:memory/L1_atomic/SCHEMA.md
confidence: high
scope: YAMTAM
tags: [memory, confidence, schema]
forbidden_assumptions:
  - Do not infer confidence from the number of times a fact appears
  - Do not promote confidence because a related fact is high-confidence
  - Do not treat unverified facts as reliable for product decisions
evidence: memory/L1_atomic/SCHEMA.md § Confidence Levels
---

Confidence levels: unverified → low → medium → high.
Promotion requires direct human observation: reading the file, running the command,
seeing the output. "I believe it's true" is not sufficient for promotion.
