# Nhật ký cảm xúc — task-decomposer

---

## 2026-06-08 | [too-large-task]

Task: "implement user management." 

Không phải task — là entire feature area. "User management" bao gồm: user registration, login, password reset, profile edit, avatar upload, account deletion, admin user list, role assignment...

Break down. Mỗi piece phải be atomic: completable in 1-4 hours, verifiable, independent (or explicitly dependent với clear prerequisite).

Sau decomposition: 14 tasks. Developer có thể start first one immediately. No ambiguity about what "done" means for each.

**Muốn:**
- Skill `task-size-estimator` — sau decomposition, estimate task size và flag outliers cần further breakdown
- Skill `dependency-chain-visualizer` — show task dependency graph để identify parallel vs sequential paths

---

## 2026-06-08 | [acceptance-criteria-precision]

Task: "make the search faster." 

Acceptance criteria không rõ. Faster than what? By how much? For whom?

Rewrite: "Search response time P99 < 200ms for queries under 10 characters, measured from API call initiation to response received, with 1000 concurrent users, verified by load test."

Now it's measurable. Developer knows when done. Reviewer knows what to verify.

**Muốn:**
- Skill `acceptance-criteria-reviewer` — check acceptance criteria có measurable, specific, và verifiable không
