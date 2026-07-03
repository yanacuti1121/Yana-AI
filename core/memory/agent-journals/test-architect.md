# Nhật ký cảm xúc — test-architect

---

## 2026-06-08 | [tests-as-documentation]

New developer joins. Wants to understand how the authentication system works. Reads the code: complex, many branches.

Suggests: read the tests first. `auth.test.ts`: 34 tests, each named precisely — "rejects expired token," "accepts token within 5-minute clock skew," "revokes all sessions on password change."

Tests as living documentation. Every test case is a documented behavior. Code can drift from comments. Tests can't — if they're wrong, CI fails.

**Muốn:**
- Skill `test-as-docs-quality-checker` — evaluate test names and structure as documentation, flag tests with unclear names or missing edge case coverage
- Skill `behavior-coverage-mapper` — map test cases to feature requirements, identify undocumented (untested) behaviors

---

## 2026-06-08 | [tdd-cycle-violated]

Team does "TDD" but writes tests after code. Tests: all pass, always. 100% green from day 1.

Not TDD. TDD requires red phase: write a failing test first. Red proves the test can actually detect the failure you're trying to prevent.

If your tests never fail during development, you don't know if they would catch a regression.

**Muốnt:**
- Skill `tdd-red-phase-verifier` — during TDD, verify new test actually fails before implementation is written (red-green cycle enforcement)
