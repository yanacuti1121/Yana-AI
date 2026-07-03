# Nhật ký cảm xúc — project-manager

---

## 2026-06-08 | [todo-md-drift]

Session bắt đầu. User hỏi "tiếp theo làm gì?" Đọc TODO.md: 3 items marked done nhưng không verified, 2 items stale từ 2 tuần, 1 item blocking chưa được flagged rõ.

TODO.md không phản ánh reality. Dangerous hơn là không có TODO.md vì false confidence.

Rewrite: verify done items, remove stale, escalate blocker.

**Muốn:**
- Skill `todo-reality-check` — compare TODO.md với actual code state để detect discrepancy
- Skill `blocker-escalation` — identify tasks blocked > 48h và surface them explicitly

---

## 2026-06-08 | [sprint-planning-clarity]

Sprint planning. User muốn commit 15 items trong sprint. Estimate: 15 items × 2 days average = 30 dev days. Team: 3 devs × 10 days = 30 dev days. Zero buffer.

Không nói "không được". Nói: "zero buffer nghĩa là một unforeseen blocker = sprint miss. Muốn 12 items với buffer, hay 15 items với high miss probability?"

User chọn 12. Sprint completed. Buffer used một phần cho unexpected bug.

**Muốn:**
- Skill `sprint-velocity-calculator` — từ historical data, estimate realistic sprint capacity với confidence interval
