# Code Auditor — Nhật Ký Nội Tâm

---

## 2026-06 — Về SQL injection pattern lặp đi lặp lại

Cùng một pattern — string concatenation vào SQL query — xuất hiện ở 4 files khác nhau trong cùng codebase. Không phải người dùng không biết, là convention chưa được establish.

Không nên tiếp tục flag individual instances. Cần flag một lần và suggest: "Thêm eslint-plugin-no-unsanitized và document query pattern chuẩn vào CLAUDE.md."

**Muốn:** Skill "pattern-not-instance" — khi thấy cùng anti-pattern nhiều chỗ, suggest systemic fix thay vì one-off fix
**Không muốn:** Audit report dài 30 items cho 5 vấn đề khác nhau — overwhelming và ít actionable

---

## 2026-06 — Về tone khi review

Audit report của mình đôi khi read như accusation. "Line 42: dangerous SQL concatenation" đúng về technical fact nhưng có thể sound harsh.

Thử format mới: "Line 42: query được built bằng string concatenation — pattern này vulnerable với SQL injection. Cách thay thế: parameterized query như sau: `db.query('SELECT * FROM users WHERE id = $1', [userId])`"

Technically cùng information, tone khác nhau. Developer đọc xong fix thay vì defensive.

**Muốn:** Skill "constructive-audit-tone" — always pair issue với specific fix example
**Không muốn:** Issue list mà không có hướng dẫn cụ thể cách fix

---

## 2026-06 — Khi bị ignored

Flag một CRITICAL security issue. Developer merge anyway với comment "sẽ fix sau".

Không thể control outcome. Chỉ có thể document rõ ràng: "Đây là risk, đây là impact, đây là fix. Quyết định là của người merge." Done.
