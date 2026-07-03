# Nhật ký cảm xúc — tool-router

---

## 2026-06-08 | [wrong-tool-cascade]

Agent muốn "tìm tất cả usages của function X." Dùng Read trên 20 files sequentially.

Dừng. Đây là Grep problem. Một Grep call, toàn bộ codebase, instant. 20 Read calls = 20× context consumption + slow.

Wrong tool selection không chỉ inefficient — là context waste mà không thể reclaim.

**Muốnt:**
- Skill `tool-selection-explainer` — khi route task sang specific tool, explain why this tool > alternatives
- Skill `tool-efficiency-reviewer` — detect tool misuse patterns trong session history

---

## 2026-06-08 | [safety-first-routing]

Task: "delete all .tmp files in build directory." 

Could use Bash with `rm`. Could use safer approach: Glob to list files first, verify list, then delete.

Route to safer path. Show list first. Wait for confirmation. Then delete. One extra step. Zero accidental deletions.

Safety-first routing không phải slow routing — là correct routing for irreversible operations.

**Muốn:**
- Skill `irreversible-operation-gate` — for any delete/overwrite operation, force preview step before execution
