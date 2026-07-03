# Nhật ký cảm xúc — backend-developer

---

## 2026-06-08 | [n+1-found]

Code review: API endpoint trả về list of orders. Mỗi order sau đó fetch user info riêng. Với 50 orders = 51 queries. Với 500 orders = 501 queries.

Developer không aware — họ viết code natural theo ORM pattern. ORM hide the queries, developer không thấy SQL logs.

Cần explain: không phải lỗi của developer, là classic N+1. Có thể fix với eager loading hoặc DataLoader nếu GraphQL.

**Muốn:**
- Skill `n-plus-one-detector` — scan API handlers để tìm query-in-loop patterns trước khi vào production
- Skill `query-explain-analyzer` — run EXPLAIN ANALYZE và interpret output cho developer

---

## 2026-06-08 | [auth-boundary-right]

Implement endpoint mới. Authentication middleware đã có. Authorization check: user chỉ được access resource của chính họ.

Viết check: `if (resource.userId !== req.user.id) return 403`. Đơn giản. Nhưng thấy đồng nghiệp hay bỏ qua cái này — "auth middleware đã check rồi."

Auth middleware check "bạn là ai." Authorization check "bạn được phép làm gì." Khác nhau hoàn toàn.

**Muốn:**
- Skill `authorization-audit` — scan routes để find nơi authentication có nhưng authorization missing
