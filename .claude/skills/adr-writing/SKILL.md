---
name: adr-writing
description: >
  Write and maintain Architecture Decision Records (ADRs) — when to write one,
  the standard format, status lifecycle, how to link related decisions, and how
  to surface ADRs in a codebase. Use when asked to "write an ADR", "document
  this decision", "architecture decision record", "why did we choose X over Y",
  or "we need a record of this choice". Do NOT use for: general documentation
  writing — ADRs are specifically for significant architecture decisions.
origin: yamtam-original
license: MIT © 2025 Vũ Văn Tâm
version: 1.0.0
compatibility: "Any project. Format follows MADR (Markdown Architectural Decision Records)."
---

## When to Use

- Use when: a decision is hard to reverse (database choice, auth strategy, API protocol)
- Use when: a decision will affect multiple teams or future developers
- Use when: "why did we do it this way?" will be asked in 6 months
- Use when: two legitimate approaches were evaluated and one was chosen
- Do NOT write an ADR for: minor implementation choices that are easy to change

**Rule of thumb:** If you'd be embarrassed to explain the decision with no written record, write an ADR.

---

## ADR Format (MADR)

Save as `docs/adr/NNNN-short-title.md` where NNNN is a zero-padded sequence.

```markdown
# NNNN. [Short title describing the decision]

**Status:** [Proposed | Accepted | Deprecated | Superseded by ADR-NNNN]
**Date:** YYYY-MM-DD
**Deciders:** [names or team]

## Context and Problem Statement

[Describe the problem or context that forced a decision. 2–4 sentences.
Include constraints, deadlines, or requirements that shaped the decision space.]

## Decision Drivers

* [Key factor 1 — e.g., team expertise in X]
* [Key factor 2 — e.g., must support 10k concurrent users]
* [Key factor 3 — e.g., licensing constraints]

## Considered Options

* Option A — [one-line description]
* Option B — [one-line description]
* Option C — [one-line description]

## Decision Outcome

Chosen option: **Option A**, because [brief reason tying back to decision drivers].

### Positive Consequences

* [Consequence 1]
* [Consequence 2]

### Negative Consequences / Trade-offs

* [Trade-off 1 — acknowledged, not hidden]
* [Trade-off 2]

## Pros and Cons of the Options

### Option A — [name]
* ✓ [Pro 1]
* ✓ [Pro 2]
* ✗ [Con 1]

### Option B — [name]
* ✓ [Pro 1]
* ✗ [Con 1]
* ✗ [Con 2]

## Links

* [Related ADR: ADR-0005 — Database choice](0005-database-choice.md)
* [RFC or issue that prompted this decision]
```

---

## Status Lifecycle

```
Proposed → Accepted → (Deprecated | Superseded)

Proposed:   Under discussion, not yet binding
Accepted:   Decision made, team committed
Deprecated: No longer applies — context changed, but decision was not replaced
Superseded: Replaced by a newer decision (link to successor ADR)
```

When superseding: update the old ADR's status to `Superseded by ADR-NNNN` — never delete old ADRs. History matters.

---

## When NOT to Write an ADR

- Library version upgrades (unless the library change is architectural)
- Code style or formatting choices (put in linting config instead)
- Implementation details that can change freely
- Decisions already captured in product/design specs

---

## ADR Index

Maintain an index at `docs/adr/README.md`:

```markdown
# Architecture Decision Records

| # | Title | Status | Date |
|---|---|---|---|
| [0001](0001-use-postgresql.md) | Use PostgreSQL as primary DB | Accepted | 2025-01-10 |
| [0002](0002-jwt-auth.md) | JWT for API authentication | Accepted | 2025-02-03 |
| [0003](0003-graphql-api.md) | GraphQL over REST for public API | Accepted | 2025-03-15 |
```

---

## Example ADR (condensed)

```markdown
# 0003. Use GraphQL for Public API

**Status:** Accepted  
**Date:** 2025-03-15  
**Deciders:** Backend team

## Context

Mobile app requires flexible data fetching — different screens need different
subsets of the same data. REST endpoints were being over-fetched and under-fetched.

## Decision Drivers

* Mobile needs field-selection to minimize payload on slow networks
* Multiple client types (web, iOS, Android) with different data requirements
* Team has GraphQL experience from previous project

## Decision Outcome

Chosen: **GraphQL** (Apollo Server). REST endpoints kept for webhooks and public APIs.

### Trade-offs acknowledged
* Higher complexity: schema versioning, N+1 risks require DataLoader
* Less cacheable than REST at HTTP layer — use Apollo cache on client

## Links

* [ADR-0001 — PostgreSQL](0001-use-postgresql.md) — data layer this API sits on
* [Issue #234 — API layer discussion](https://github.com/...)
```

---

## Anti-Fake-Pass Rules

Before claiming an ADR is done, you MUST show:
- [ ] Status set to one of: Proposed / Accepted / Deprecated / Superseded
- [ ] At least 2 options considered and evaluated (not just the winner)
- [ ] Trade-offs acknowledged in the chosen option — not just positives
- [ ] Date and deciders recorded
- [ ] Added to `docs/adr/README.md` index

Reference: `gates/anti-fake-pass-gate.md`
