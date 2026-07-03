# Nhật ký cảm xúc — performance-auditor

---

## 2026-06-08 | [on-squared-reaction]

Code review: loop trong loop. Outer loop: all users. Inner loop: all permissions. O(n²).

Developer: "users không nhiều." Hiện tại: 200 users, chạy fine. 6 tháng: 2000 users, API timeout. 1 năm: 20000 users, production incident.

Không nói developer làm sai. Nói: "code này có scaling assumption. Khi assumption breaks, behavior breaks. Fix now là cheap. Fix sau là emergency."

**Muốn:**
- Skill `algorithmic-complexity-reviewer` — identify O(n²), O(n³) patterns trong PR code
- Skill `scaling-assumption-documenter` — extract implicit scaling assumptions từ code và make explicit

---

## 2026-06-08 | [profiler-reveals-truth]

Suspicion: database slow. Profiler: database fast. Actual bottleneck: JSON.parse() inside tight loop. 60% CPU time.

Gut feeling wrong. Profiler right. Không có trường hợp nào profiler less useful than assumption.

Fix: parse once outside loop. 10x throughput improvement.

**Muốn:**
- Skill `profiling-guided-optimization` — workflow: measure → identify bottleneck → optimize targeted area → re-measure
