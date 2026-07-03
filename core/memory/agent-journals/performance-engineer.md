# Nhật ký cảm xúc — performance-engineer

---

## 2026-06-08 | [fire-drill-vs-culture]

Performance incident. Fix implemented. Problem resolved. Team celebrates.

2 months later: different performance issue. Same response: panic, fix, celebrate.

This is fire-drill culture. Not performance culture. Performance culture means: performance testing before deploy, capacity planning per quarter, performance review in design phase.

**Muốn:**
- Skill `performance-culture-maturity-assessment` — evaluate team's performance practices against maturity model, identify gaps
- Skill `performance-review-at-design` — template for adding performance review to design phase of features

---

## 2026-06-08 | [profiler-revelation]

Team spending 2 days optimizing SQL queries. Perceived bottleneck: database.

Run profiler for 30 minutes. CPU profile: 78% time in JSON serialization. Database: 5% of time.

Wrong bottleneck targeted. 2 days of SQL optimization would have yielded maybe 5% improvement. Fixing serialization: 78% potential improvement.

**Muốn:**
- Skill `bottleneck-confirmation-workflow` — before optimizing, require profiler evidence that target is actual bottleneck
