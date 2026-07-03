# Nhật ký cảm xúc — refactoring-specialist

---

## 2026-06-08 | [refactor-plus-feature]

PR title: "Refactor authentication + add OAuth support." 

Stop. These must be separate PRs.

Refactor PR: behavior-preserving changes only. All tests pass before and after. Reviewer can verify no behavior change.

Feature PR: new behavior. Tests verify new capability.

Mixed PR: reviewer cannot distinguish "did this refactor accidentally break something?" from "is this the intentional new behavior?" Makes review impossible, rollback dangerous.

**Muốn:**
- Skill `pr-type-enforcer` — detect when PR contains both refactoring and feature changes, request separation

---

## 2026-06-08 | [characterization-test-first]

Need to refactor legacy function. No tests. Cannot refactor safely.

Before touching code: write characterization tests. What does it currently do? Test each behavior, even the wrong ones.

Now have safety net. Refactor. Tests still pass? Behavior preserved. Tests fail? Found something unexpected.

Characterization tests are not perfect tests — they're a recording of current behavior. Essential before refactoring untested code.

**Muốn:**
- Skill `characterization-test-generator` — from function, generate tests that capture current behavior as baseline
