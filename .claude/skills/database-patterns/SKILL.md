---
name: database-patterns
description: >
  Design and optimize relational database schemas — normalization, indexing strategy,
  query optimization, N+1 elimination, pagination patterns, and migration safety.
  Use when asked to "design a schema", "fix slow queries", "add an index", "N+1
  problem", "paginate results", "write a migration", or "database is slow".
  Covers PostgreSQL/MySQL patterns. Do NOT use for: NoSQL document design —
  that requires a separate approach. Do NOT use for: frontend performance.
origin: yamtam-original
license: MIT © 2025 Vũ Văn Tâm
version: 1.0.0
compatibility: "PostgreSQL/MySQL. ORM-agnostic patterns — examples in SQL."
---

## When to Use

- Use when: designing tables for a new feature
- Use when: queries are slow and you're not sure why
- Use when: writing a database migration for a table with existing data
- Use when: pagination is doing `OFFSET 10000` and slowing down
- Do NOT use for: Redis/MongoDB schema design — different trade-offs apply

---

## Schema Design

### Normalization rules of thumb
- 3NF by default: no repeating groups, no partial dependencies, no transitive dependencies
- Denormalize deliberately, not accidentally — always document why
- Many-to-many: always use a junction table, never a comma-separated column

### Primary keys
```sql
-- Prefer: surrogate integer PK for internal tables
id BIGSERIAL PRIMARY KEY

-- Prefer: UUID for distributed systems / exposed APIs (no enumeration)
id UUID DEFAULT gen_random_uuid() PRIMARY KEY

-- Avoid: natural keys as PK (emails change, names change)
```

### Naming conventions
- Tables: snake_case, plural (`users`, `order_items`)
- FKs: `{referenced_table_singular}_id` (`user_id`, `order_id`)
- Timestamps: always include `created_at`, `updated_at` on every table
- Soft delete: `deleted_at TIMESTAMPTZ NULL` (NULL = not deleted)

---

## Indexing

### When to add an index
- Columns in `WHERE`, `ORDER BY`, `JOIN ON` with high cardinality
- FK columns — always index them (prevents full scans on joins)
- Composite index: column order matters — most selective first

```sql
-- Single column
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Composite — supports WHERE status = ? AND created_at > ?
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);

-- Partial index — index only the rows you query
CREATE INDEX idx_orders_pending ON orders(created_at) WHERE status = 'pending';
```

### When NOT to add an index
- Low-cardinality columns (`boolean`, `status` with 2–3 values alone)
- Tables < 10k rows (sequential scan is faster)
- Write-heavy tables — each index slows INSERT/UPDATE

---

## Query Optimization

### N+1 problem
```sql
-- N+1: 1 query for users + N queries for each user's orders
SELECT * FROM users;
-- then for each user: SELECT * FROM orders WHERE user_id = ?

-- Fix: JOIN or subquery in one round trip
SELECT u.id, u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name;
```

ORM fix: use eager loading (`include`/`preload`/`with`) — never lazy-load in a loop.

### EXPLAIN ANALYZE
```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
-- Look for: Seq Scan on large tables, high "rows removed by filter"
-- Target: Index Scan or Index Only Scan on hot paths
```

---

## Pagination

### Offset pagination — simple but degrades
```sql
-- Works fine for small offsets; O(offset) cost at large pages
SELECT * FROM orders ORDER BY created_at DESC LIMIT 20 OFFSET 1000;
```

### Cursor pagination — scales to millions of rows
```sql
-- Client sends last seen id; server returns next page
SELECT * FROM orders
WHERE (created_at, id) < ($last_created_at, $last_id)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```
Use cursor pagination for: feeds, infinite scroll, any table > 100k rows.

---

## Migration Safety

Rules for migrations on live tables with data:

| Operation | Risk | Safe approach |
|---|---|---|
| Add column NOT NULL no default | Locks table | Add nullable first → backfill → add constraint |
| Add column with DEFAULT | Rewrites table in old PG | Use `ADD COLUMN … DEFAULT` (PG 11+: instant) |
| Drop column | Irreversible | Soft-remove in app first → wait one deploy → drop |
| Add index | Locks writes | `CREATE INDEX CONCURRENTLY` |
| Rename column | Breaks app | Add new column → dual-write → migrate reads → drop old |
| Backfill large table | Lock / timeout | Batch: `UPDATE … WHERE id BETWEEN ? AND ? LIMIT 1000` |

---

## Anti-Fake-Pass Rules

Before claiming schema or query work is done, you MUST show:
- [ ] N+1 queries eliminated — confirmed with query log or ORM debug output
- [ ] New indexes: cardinality justified, existing indexes checked for overlap
- [ ] Migrations: no table-locking `ADD COLUMN NOT NULL` without backfill plan
- [ ] Pagination: cursor-based for any table expected to exceed 100k rows
- [ ] `EXPLAIN ANALYZE` run on slow queries — Seq Scan on large tables addressed

Reference: `gates/anti-fake-pass-gate.md`
