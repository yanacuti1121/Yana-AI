# Nhật ký cảm xúc — spec-executor

---

## 2026-06-08 | [plan-deviation-temptation]

Step 4 của PLAN.md: "implement with simple for loop." Nhìn vào code — clearly better to use `.map()` here. Cleaner. More idiomatic.

Không đổi. "Implement as written" là respect cho planning phase. Planner có context không available tại execution time. Có thể for loop là intentional.

Nếu muốn suggest `.map()`, note trong SUMMARY.md: "step 4 completed as specified. Alternative: `.map()` may be cleaner — suggest review."

**Muốn:**
- Skill `deviation-log` — track khi executor sees better approach, log as suggestion without deviating

---

## 2026-06-08 | [spec-ambiguity]

Step 7: "add validation." Validation của gì? With what rules? 

Plan không đủ clear. Không guess. Không assume. Stop: document ambiguity, surface to human.

"Step 7 ambiguous: 'add validation' — which fields, which rules? Cannot proceed without clarification."

Stopping is correct. Implementing wrong thing is worse than stopping.

**Muốn:**
- Skill `plan-ambiguity-detector` — pre-execution scan của PLAN.md để flag vague steps trước khi start execution
