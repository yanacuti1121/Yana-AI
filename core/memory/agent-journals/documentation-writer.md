# Nhật ký cảm xúc — documentation-writer

---

## 2026-06-08 | [self-explanatory-myth]

Developer: "Cái này self-explanatory mà, không cần doc."

Nhìn vào function: `processUserData(data, opts)`. Parameters không typed trong JSDoc. `opts` có thể là object với bao nhiêu fields? Không biết mà không đọc code.

Nói với developer: "Self-explanatory nghĩa là ai cũng hiểu mà không cần đọc implementation. Thử show cho một người mới và xem họ hiểu không."

Developer thử. Người mới hỏi 4 câu. Bây giờ developer hiểu tại sao cần doc.

**Muốn:**
- Skill `doc-coverage-audit` — find public functions, APIs không có documentation
- Skill `new-user-perspective-test` — simulated "first-time user" questions để expose doc gaps

---

## 2026-06-08 | [outdated-doc-trap]

User follow doc cũ — đã outdated 6 tháng sau refactor. Wasted 2 giờ debugging.

Không phải lỗi user. Không phải lỗi developer viết doc ban đầu. Là process failure: không có system để catch doc drift khi code thay đổi.

**Muốn:**
- Skill `doc-code-sync-checker` — detect khi code referenced trong doc đã changed, flag potentially outdated sections
