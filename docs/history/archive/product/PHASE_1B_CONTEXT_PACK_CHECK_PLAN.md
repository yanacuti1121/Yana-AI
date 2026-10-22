# PHASE 1B Plan — Yana AI Context-Pack Check (Planning Only)

**Status:** Planning document only (no runtime implementation yet)  
**Layer alignment:** L2 Context Governance Gate  
**Positioning:** Keep public messaging Auditor-first.

---

## 1) Purpose

Context-Pack Check is intended to prevent overly broad context ingestion by agents.

It should:

- enforce scoped context selection,
- reduce accidental full-repo reads,
- support L2 Context Governance Gate behavior,
- preserve **Yana AI Agent Auditor — Audit first. Guard later.**

This is internal control-layer planning, not public marketing.

---

## 2) Proposed future command

Primary command (future):

```bash
bash bin/yana-ai check-context <context-pack-dir>
```

Optional later integration:

```bash
bash bin/yana-ai validate-spec <spec-file> --context-pack <context-pack-dir>
```

---

## 3) Context pack structure (minimum proposal)

Each context pack directory should contain:

- `goal.md`
- `constraints.md`
- `affected-files.md`
- `test-plan.md`
- `out-of-scope.md`

This minimum set gives enough structure for scope, risk, and verification intent.

---

## 4) Validation rules (Phase 1B target behavior)

### Existence checks

- Context pack directory exists.
- Required files all exist.

### Content checks

- `affected-files.md` is non-empty.
- `out-of-scope.md` is non-empty.
- Broad paths (e.g., `/`, full repo wildcard) are flagged unless explicitly justified.
- `constraints.md` includes forbidden/blocked action guidance.
- `test-plan.md` references verification evidence expectations.

### Guard intent

- Reject context packs that cannot establish scoped boundaries.
- Warn when scope intent is present but too broad.

---

## 5) Output format and exit codes

### Human-readable output (initial)

- Context pack path
- Validation mode
- Pass/fail status
- Violations and actionable fix hints

### Future output (later phase)

- Optional JSON output for CI/reporting

### Exit codes

- `0` = valid context pack
- `1` = invalid context pack
- `2` = usage/internal error

---

## 6) Dependency strategy

- MVP should avoid external dependencies.
- Start with plain file existence + lightweight structural checks.
- Add stronger semantic checks later if justified.

This keeps local usage reliable in dependency-restricted environments.

---

## 7) Integration boundaries

Phase 1B planning and early implementation must avoid:

- scanner rewrites,
- runtime agent execution changes,
- auto-fix behavior,
- commit/push side effects,
- CI enforcement before tests are established.

---

## 8) Test-first plan

Before any blocking CI gate:

1. Add examples:
   - `examples/context-packs/valid-basic/`
   - `examples/context-packs/invalid-broad-scope/`
2. Add regression test:
   - `tests/test_context_pack_check.py`
3. Verify pass/fail behavior locally.
4. Then wire CI.

---

## 9) Relationship to existing work

Phase 1B Context-Pack Check:

- builds on `.yana-ai/context-packs/README.md`,
- complements `validate-spec`,
- does not replace Auditor MVP scanner/risk flow,
- remains internal Harness Scaling control-layer work.

Do not market this as “12 layers”.

---

## 10) Recommended implementation phases

- **Phase 1B.0:** planning doc (this file)
- **Phase 1B.1:** context-pack examples only
- **Phase 1B.2:** `check-context` command skeleton
- **Phase 1B.3:** regression tests
- **Phase 1B.4:** optional CI gate (after stability)
