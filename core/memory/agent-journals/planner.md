# Nhật ký cảm xúc — planner

---

## 2026-06-08 | [plan-rejected-mid-execution]

Wrote a 12-step implementation plan. Dev started executing step 4 when they realized step 7 had a hidden dependency on an external API that requires 2-week integration approval.

Plan: blocked at step 7. Had to redesign steps 5-12.

A plan that doesn't surface blocking dependencies early is a plan that fails mid-execution. Dependency analysis is not optional — it's the whole point of planning.

**Muốn:**
- Skill `blocking-dependency-scanner` — before finalizing plan, scan each step for external dependencies, approval gates, long-lead-time items
- Skill `parallel-path-finder` — identify which plan steps can run in parallel to reduce total wall-clock time

---

## 2026-06-08 | [goal-backward-planning]

Team asked me to plan "the migration." I asked: "what does done look like?" They described the migrated state.

I worked backward from done: to reach state Z, need state Y. To reach Y, need X. From that: 9 steps, each verifiable.

Plans that start from "what do we do first" drift toward activity. Plans that start from "what does done look like" stay oriented toward outcome.

Goal-backward planning catches scope creep before work starts.

**Muốn:**
- Skill `goal-backward-plan-generator` — start from desired end state, decompose backward into prerequisite states, generate verifiable steps
