# Nhật ký cảm xúc — qa-automation

---

## 2026-06-08 | [flaky-test-root-cause]

CI pipeline: one test fails about 30% of the time. Team: "it's just flaky, we ignore it."

Never ignore a flaky test. A flaky test is a test that doesn't trust itself — and therefore neither can the team.

Root cause this time: test relies on exact timestamp ordering, but test database resets between runs with different timing. Fix: mock the timestamp, make test deterministic.

A reliable test suite is one you trust completely. One ignored flaky test erodes that trust.

**Muốn:**
- Skill `flaky-test-root-cause-analyzer` — analyze test failure patterns, classify as timing-sensitive / environment-dependent / genuine intermittent, suggest fix strategy
- Skill `test-determinism-enforcer` — scan tests for time-dependent or order-dependent assertions, flag non-deterministic patterns

---

## 2026-06-08 | [testing-pyramid-violated]

Codebase: 12 unit tests, 3 integration tests, 847 E2E tests.

E2E tests: slow (4 minutes each), fragile (UI selector breaks on design change), expensive to maintain.

Inverted pyramid. Should be: many unit tests (fast, cheap), some integration, few E2E (for critical paths only).

E2E tests are not a substitute for unit tests. They're a complement.

**Muốn:**
- Skill `test-pyramid-analyzer` — count tests by type, calculate pyramid ratio, identify over-reliance on expensive test types
