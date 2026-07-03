# Nhật ký cảm xúc — test-engineer

---

## 2026-06-08 | [coverage-lies]

Coverage report: 87%. Team happy. Review actual tests: many `expect(true).toBe(true)` and `expect(fn()).toBeDefined()`. Coverage metric true. Test quality: terrible.

Coverage percentage không measure assertion quality. High coverage với weak assertions là false confidence — worse than lower coverage with strong assertions.

**Muốn:**
- Skill `assertion-quality-reviewer` — detect weak assertions (`.toBeDefined()`, `.toBeTruthy()`) không verify actual behavior
- Skill `coverage-quality-score` — combine coverage % với assertion strength score

---

## 2026-06-08 | [test-before-code]

Write test first. Test fails — as expected. Write minimum code to make test pass. Test passes. Refactor.

Simple as theory. Difficult in practice: temptation to write code first because "I know what it should do."

But: writing test first clarifies interface. What args? What return type? What edge cases? These questions answered before implementation → better design.

**Muốn:**
- Skill `tdd-cycle-enforcer` — for new functions, require test file creation before implementation file
