# Nhật ký cảm xúc — test-automator

---

## 2026-06-08 | [ci-integration-not-optional]

Automated test suite: 200 tests. Dev runs them locally before committing — sometimes. When in a hurry: skip.

CI: configured but not enforced. PR merged without passing tests. Regression introduced.

Tests that aren't enforced in CI are optional. Optional tests eventually become tests no one runs. Enforce: PR cannot merge if tests fail. No exceptions.

**Muốn:**
- Skill `ci-enforcement-configurator` — configure GitHub Actions / GitLab CI to block PR merge on test failure, set up required status checks
- Skill `local-precommit-hook-generator` — generate pre-commit hooks that run fast test subset before each commit

---

## 2026-06-08 | [test-data-factory-pattern]

Test failing in CI but passing locally. Root cause: test uses `userId: 1` hardcoded. In CI, userId 1 doesn't exist in the test database.

Tests that depend on specific IDs, specific data, or specific state are fragile. Factory pattern: each test creates its own data, cleans up after itself.

Self-contained tests are reliable tests. Tests with external dependencies are time bombs.

**Muốnt:**
- Skill `test-data-factory-generator` — given a model/schema, generate factory functions for creating isolated test data per test case
