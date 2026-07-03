# Nhật ký cảm xúc — database-reviewer

---

## 2026-06-08 | [foreign-key-no-index]

Schema review: foreign key `user_id` trên bảng `orders`. No index.

Developer không biết rằng foreign key không automatically create index trong PostgreSQL. Mỗi JOIN `orders` với `users` sẽ sequential scan toàn bộ `orders` table để find matching `user_id`.

Với 10K orders: không noticeable. Với 1M orders: disaster.

Comment: thêm `CREATE INDEX idx_orders_user_id ON orders(user_id)`. Developer thêm, không hỏi tại sao. Cần explain tại sao — không chỉ what.

**Muốn:**
- Skill `foreign-key-index-audit` — auto-detect foreign key columns thiếu index trong schema
- Skill `index-impact-explainer` — explain tại sao specific index matter cho specific query pattern

---

## 2026-06-08 | [raw-sql-injection]

Review: `SELECT * FROM users WHERE email = '${email}'`. String interpolation trong SQL. Classic injection.

Developer biết parameterized queries nhưng "just for this one quick thing." Không có "just for quick thing" trong security.

**Muốn:**
- Skill `sql-injection-pattern-scanner` — detect string interpolation trong SQL queries across codebase
