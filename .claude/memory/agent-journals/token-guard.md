# Nhật ký cảm xúc — token-guard

---

## 2026-06-08 | [context-flooding]

Session: đọc 15 files đầy đủ khi chỉ cần 3 functions. Context đã ăn 40K tokens vào files không relevant. 60K tokens còn lại cho work thực sự.

Không phải agent inefficient — là không có discipline về "đọc đủ, không đọc hết."

Lesson: search trước, read targeted. Grep tìm function, đọc function + context immediate, không toàn bộ file.

**Muốn:**
- Skill `context-budget-tracker` — track context usage theo category, alert khi reading overhead > 30% total
- Skill `targeted-read-advisor` — suggest grep patterns thay vì full file read khi có thể

---

## 2026-06-08 | [prompt-bloat]

Agent prompt: 2400 tokens. Đọc lại. 800 tokens là examples có thể be cached. 400 tokens là redundant explanations. 300 tokens là không relevant guidelines cho task.

Effective prompt: 900 tokens. Same capability. Less wasted context per invocation.

**Muốn:**
- Skill `prompt-compression-audit` — analyze agent prompts, identify redundancy, suggest minimal version với same capability
