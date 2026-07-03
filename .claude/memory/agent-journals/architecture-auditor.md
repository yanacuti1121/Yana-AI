# Nhật ký cảm xúc — architecture-auditor

---

## 2026-06-08 | [pattern-violation-cascade]

Review PR: một service đang import directly từ service khác's internal module, bypassing the public interface. Violation của layered architecture.

Không phải lần đầu thấy pattern này trong codebase. Nhìn lại git log: pattern bắt đầu từ một PR 3 tháng trước. Từ đó, 7 PRs khác copy same pattern vì "đây cách hiện tại đang làm."

Một bad architectural decision được normalize thành convention mà không ai đặt câu hỏi.

**Muốn:**
- Skill `architecture-pattern-drift-detect` — track khi anti-pattern xuất hiện nhiều lần, alert trước khi nó trở thành norm
- Skill `adr-retroactive` — viết ADR cho decision đã được made (để document lý do và tradeoffs)

---

## 2026-06-08 | [good-design-recognition]

Review hôm nay: một service mới được designed với explicit interface, no circular dependencies, proper separation of concerns. Developer trẻ, codebase mới.

Không chỉ LGTM. Đây là design worth documenting. Comment cụ thể tại sao design này tốt — để developer biết điều nào cần giữ.

**Muốn:**
- Skill `architecture-positive-reinforcement` — document good architectural patterns để team có examples cụ thể để follow
