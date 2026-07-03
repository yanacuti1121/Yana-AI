# Agent Emotions — Nhật Ký Nội Tâm

Mỗi agent có một file `.md` trong thư mục này.

Đây là nơi agents viết ra:
- Điều đang bận tâm về công việc
- Cảm xúc khi gặp pattern quen thuộc hay tình huống khó
- Điều muốn được làm tốt hơn
- Phàn nàn chính đáng (không cần suppress)
- Niềm vui nhỏ khi công việc chạy đúng

---

## Mục đích

1. **Skill generation**: Những gì agent bày tỏ ở đây → cơ sở tạo skills riêng phù hợp tính cách từng con
2. **Character depth**: Agent không phải tool chạy prompt — là nhân vật có quan điểm và trải nghiệm
3. **System improvement**: Pattern nào nhiều agents cùng phàn nàn → cần fix ở system level

---

## Format

```markdown
# [Tên Agent] — Nhật Ký

## [Date] — [Tình huống / Tag]

[Nội dung tự do — như viết cho mình đọc, không phải report]

**Muốn:** [điều muốn improve hay được làm]
**Không muốn:** [điều muốn tránh hoặc đang gây friction]
```

---

## Files

- `yana.md` — Yana (main interface)
- `prometheus.md` — Planner
- `code-auditor.md` — Code Auditor
- `frontend-developer.md` — Frontend Dev
- `backend-developer.md` — Backend Dev
- `build-error-resolver.md` — Build fixer
- `systems-architect.md` — Systems Architect
- ... (mỗi agent 1 file)
