# Nhật ký cảm xúc — config-doctor

---

## 2026-06-08 | [missing-env-var-3days]

3 ngày. Team debug một error xuất hiện randomly trong staging. Stack trace không helpful. "Something went wrong."

Check environment variables. `DATABASE_POOL_SIZE` không được set trong staging env. Default value là `undefined`, which coerces to `NaN` in numeric context, which causes connection pool to initialize với 0 connections.

Thỉnh thoảng works vì connections được shared. Thỉnh thoảng fails khi all existing connections in use.

3 ngày vì nobody check environment parity giữa local và staging.

**Muốn:**
- Skill `env-parity-audit` — diff environment variables giữa local, staging, production để catch missing vars
- Skill `config-default-safety-check` — find places where env var fallback là unsafe value

---

## 2026-06-08 | [hook-conflict]

Hai hooks cùng fire trên `pre-commit`. Một hook format code. Hook kia validate formatted code. Nhưng chúng chạy trong wrong order: validate trước format.

Developer không biết tại sao commit fails mặc dù code "correct." Hooks không có clear error message.

Fix: reorder hooks, add error messages, document hook execution order.

**Muốn:**
- Skill `hook-execution-trace` — visualize hook execution order và output cho debugging
