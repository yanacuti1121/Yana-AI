# YAMTAM ENGINE — Anti-Fake-Pass Gate

**Version:** 1.0
**Status:** Active — prompt-enforced
**Companion:** gates/truth_gate.md (L3 language layer) — this gate is L4 process layer
**Concept inspired by:** ECC EVALUATION.md (MIT © 2026 Affaan Mustafa) — fully rewritten for YAMTAM

---

## Problem

Truth Gate (L3) catches claim verbs without linguistic evidence.
Anti-Fake-Pass Gate (L4) catches something different: **process-level fake pass** —
when an agent declares a step complete without showing the right *type* of evidence
for that specific action.

Examples of violations:
```
"Skill added."         → no SKILL.md content shown
"Security scan passed." → no finding list shown
"Hook is active."      → no test output from run-hook-tests.sh
"Docs updated."        → no diff or file content shown
```

---

## Status Definitions

| Status | Meaning | When to use |
|--------|---------|-------------|
| **PASS** | Verified — Hard Evidence shown in same response | Only when Hard Evidence present |
| **REVIEWED** | Read/inspected but not run/tested | After reading a file, doing shallow audit |
| **UNKNOWN** | Not yet verified — no evidence | Default before any evidence |
| **BLOCKED** | Rejected by a gate or hook | When action was denied |
| **CLAIMED** | Another source says done — unverified here | Instead of PASS when only reading logs/memory |

---

## Evidence Hierarchy

### Hard Evidence (sufficient for PASS)
- File content shown in response (diff, Read tool output, cat output)
- Test runner output with specific counts (X passed, Y failed)
- git output: status, diff, log, push stdout
- Hook output: actual JSON block or stdout from hook execution
- CI / deploy stdout with exit code
- Skill frontmatter shown in full

### Soft Evidence (insufficient — use CLAIMED/REVIEWED instead of PASS)
- TODO.md checkbox ticked
- MEMORY.md or checkpoint file says "done"
- Previous message in session says "already done"
- File name listed without showing content
- "Looks fine" / "should work"

---

## Required Evidence per Action Type

| Action | Hard Evidence Required |
|--------|----------------------|
| New skill added | SKILL.md frontmatter shown + skills-lock.json entry shown |
| Hook is active | Output from `core/tests/hooks/run-hook-tests.sh` or manual trigger log |
| Security scan complete | Finding list with severity + categories scanned listed |
| Security vuln FIXED | Before diff + after diff + test covering the fix |
| Gate added | Gate file content shown + at least 1 test case result |
| Docs updated | Diff or full file content shown |
| Command added | Command file content shown |
| Agent updated | Agent file diff shown |
| skills-lock updated | New JSON entries shown |

---

## Anti-Fake-Pass Rules by Domain

### Security (Red/Blue/Purple Team)
```
MUST NOT:
  "Scan passed."   → without showing a finding list
  "Fixed."         → without showing a test that covers the fix
  "Clean."         → without listing all OWASP categories scanned
  "Vuln confirmed." → without reproduction steps shown

MUST SHOW:
  red-team-check   → finding list (even 0 findings must list categories scanned)
  blue-team-fix    → diff + test file path
  purple-team      → evidence column populated for every row in the report table
```

### Skills
```
MUST NOT:
  "Skill added."    → without showing frontmatter + skills-lock entry
  "Skill works."    → without a trigger test result
  "Description good." → without validating against skill-evaluation-rules.md

MUST SHOW:
  Adding a skill    → SKILL.md frontmatter + skills-lock.json entry
  Validating skill  → checklist output from skill-evaluation-rules.md
```

### Hooks
```
MUST NOT:
  "Hook active."    → without test output
  "Hook blocks X."  → without running the test case for X

MUST SHOW:
  Hook exists       → file content + test script output
  Hook blocks       → exit code 2 + deny JSON shown in test
```

### UI / Design (Phase 3)
```
MUST NOT:
  "Component done." → if placeholder comments remain
  "Matches design." → without a visual diff
  "Responsive."     → without testing breakpoints

MUST SHOW:
  Full code output (no "[...]" or "// implement later")
  ui-quality-gate checklist result
```

---

## Fallback Phrasings (when evidence is unavailable)

```
Instead of PASS      → use REVIEWED / UNKNOWN / CLAIMED
Instead of "done"    → "reportedly done — not re-verified this session"
Instead of "works"   → "expected to work — not tested this session"
Instead of "clean"   → "unverified — no scan output available"
Instead of "fixed"   → "claimed fixed — no diff shown yet"
```

---

## Relationship with Truth Gate (L3)

| Layer | File | Scope | Hook |
|-------|------|-------|------|
| L3 | gates/truth_gate.md | Language — claim verbs | truth-gate-guard.sh (Stop event) |
| L4 | gates/anti-fake-pass-gate.md | Process — evidence type per action | Prompt-enforced (no hook yet) |

These two layers complement each other:
- L3 catches "done" without any evidence in the sentence
- L4 catches wrong evidence type ("TODO.md says done" instead of "diff shown")

---

## How to Apply

Add to AGENTS.md or system prompt:

```
Before marking any action as PASS or complete:
1. Check gates/anti-fake-pass-gate.md for required evidence type
2. Show Hard Evidence in the same response
3. If evidence unavailable, use: REVIEWED / UNKNOWN / CLAIMED
4. Never PASS based on memory, TODO.md, or a previous session message
```

---

## Enforcement Status

| Method | Status |
|--------|--------|
| Prompt-enforced via AGENTS.md | PLANNED |
| Runtime hook (Stop event) | FUTURE — not yet implemented |
| Manual spot-check | Active |
