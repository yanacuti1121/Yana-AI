# YAMTAM ENGINE — Harness Scaling Layers (Internal Architecture)

**Status:** Planned architecture layer set (documentation only)  
**Version target:** v1.9.x  
**Audience:** Internal maintainers and contributors

---

## Positioning (public remains unchanged)

Public-facing positioning stays:

- **YAMTAM Agent Auditor**
- **Audit first. Guard later.**

The Harness Scaling model in this document is **internal architecture** used to guide roadmap sequencing and implementation quality. It is not a public marketing claim.

---

## Why this internal layer exists

Current guard/audit coverage is strong in key places, but there are recurring gaps in:

1. Spec discipline before implementation
2. Context intake governance
3. Skill routing and minimization
4. Memory freshness and evidence hygiene
5. Runtime and cost constraints with verification evidence

Harness Scaling introduces internal add-on gates to address those gaps without changing public messaging.

---

## Layer stack (internal)

```text
Sovereign Identity Gate
        │
        ▼
L0    Audit
L0.5  Spec Gate              (new)
        │
        ▼
L1    Scope Guard
L1.5  Validate
        │
        ▼
L2    Context Governance Gate (new)
L2.5  Skill Routing Gate      (new)
        │
        ▼
L3    Truth Gate
L3.5  Prompt Injection Guard
L3.8  Memory Hygiene Gate     (new)
        │
        ▼
L4    Runtime & Cost Gate     (new)
L4.5  Supply Chain Guard
        │
        ▼
L5    Destructive Guard
```

> Note: This layer stack is an implementation/planning artifact.

---

## New internal gates

### L0.5 — Spec Gate

**Problem:** Tasks move to implementation without clear goal/scope/acceptance criteria.  
**Intent:** Require minimally complete task specs before implementation begins.

**Core checks:**
- Goal present and testable
- Scope boundaries explicit (in/out)
- Acceptance criteria measurable
- Test/verification plan present
- Rollback note present for risky work

---

### L2 — Context Governance Gate

**Problem:** Over-broad context loading increases token cost and raises leakage risk.  
**Intent:** Bound context ingestion to task-scoped packs and deny sensitive context patterns.

**Core checks:**
- Task-scoped context pack selected
- No `.env` / secret-like material in prompt context
- Avoid repo-wide indiscriminate context pulls
- Context source list recorded

---

### L2.5 — Skill Routing Gate

**Problem:** Skill overloading and incorrect tool path selection for small/simple tasks.  
**Intent:** Route task type to minimum viable skill set.

**Core checks:**
- Routing matrix exists and is current
- Docs-only tasks avoid runtime-heavy skills
- Security/destructive paths include guard skill routing
- Over-provisioned skills flagged

---

### L3.8 — Memory Hygiene Gate

**Problem:** Stale memory decisions and unsupported handoff claims.  
**Intent:** Enforce date/source/evidence quality before memory-derived decisions are used.

**Core checks:**
- Memory entries include date and source
- Production rules are freshness-checked
- “Fixed/verified” handoff language backed by evidence
- Stale decisions quarantined from execution flow

---

### L4 — Runtime & Cost Gate

**Problem:** Tasks exceed runtime/token/diff budgets and still claim success.  
**Intent:** Enforce runtime/cost thresholds and verification evidence before completion claims.

**Core checks:**
- Token budget per task type
- Runtime threshold per task type
- File-change and diff-size warnings
- Verification evidence required before success claims

---

## Schema strictness strategy (internal)

To support phased adoption before full integration:

- Keep **core identity and intent fields** strict (required)
- Allow controlled extension via `x-*` fields
- Use optional metadata blocks for forward compatibility
- Support partial run logs during `in_progress` state
- Use structured verification evidence objects (not only plain strings)

This balance prevents schema drift while avoiding early integration breakage.

---

## Phased implementation order

- **Phase 1 (v1.9.0):** L0.5 Spec Gate + L2 Context Governance
- **Phase 2 (v1.9.1):** L4 Runtime & Cost
- **Phase 3 (v1.9.2):** L2.5 Skill Routing
- **Phase 4 (v1.9.3):** L3.8 Memory Hygiene

---

## Non-goals for this layer

- No new runtime hooks in this documentation task
- No scanner logic changes in this documentation task
- No new agent/skill implementation in this documentation task

---

## Success criteria for documentation completion

This architecture documentation is complete when:

- Layer definitions are explicit and non-overlapping
- Each gate has an intent and a minimal check list
- Sequence is phased with rationale
- Public positioning remains unchanged
