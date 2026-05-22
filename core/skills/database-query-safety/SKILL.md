---
name: database-query-safety
description: Database query safety patterns — N+1 detection, query plan analysis, parameterized queries, SQL injection prevention, migration safety, and slow-query monitoring. Sources: prisma/prisma, drizzle-team/drizzle-orm, brianc/node-postgres, sequelize/sequelize, knex/knex.
origin: yamtam-engine — synthesized from prisma/prisma, drizzle-team/drizzle-orm, brianc/node-postgres, sequelize/sequelize, knex/knex
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.39
---

# /database-query-safety

## When to Use

- Writing ORM queries that touch joins or relations (N+1 risk)
- Any raw SQL query construction involving user input
- Before shipping a database migration
- "The dashboard is slow after we added this feature" (query plan audit)

## Do NOT use for

- In-memory data structures (no SQL involved)
- Read-only analytics DBs with no user input

---

## N+1 Detection and Fix (Prisma / Drizzle)

```typescript
// ❌ N+1: fires 1 query per post author
const posts = await db.post.findMany()
const withAuthors = await Promise.all(
  posts.map(p => db.user.findUnique({ where: { id: p.authorId } }))
)

// ✅ Eager load: 2 queries total (or 1 JOIN)
const posts = await db.post.findMany({
  include: { author: true },
})

// Drizzle: explicit join — 1 query
const posts = await db
  .select({ post: postsTable, author: usersTable })
  .from(postsTable)
  .leftJoin(usersTable, eq(postsTable.authorId, usersTable.id))
```

---

## Query Plan Analysis

```sql
-- PostgreSQL: always EXPLAIN ANALYZE before shipping a slow-fix
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM orders
WHERE customer_id = $1 AND status = 'pending'
ORDER BY created_at DESC
LIMIT 20;

-- Red flags in output:
-- "Seq Scan" on large table → missing index
-- "rows=10000 actual rows=1" → stale statistics (run ANALYZE)
-- "Hash Join" on hot path → consider materialized view
-- Actual time >> Estimated time → stale stats or bad plan
```

```typescript
// Prisma: enable query logging in dev to catch N+1 live
const db = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }],
})
db.$on('query', e => {
  if (e.duration > 100) console.warn(`Slow query (${e.duration}ms):`, e.query)
})
```

---

## SQL Injection Prevention (node-postgres / knex)

```typescript
// ❌ String interpolation — injectable
const rows = await client.query(
  `SELECT * FROM users WHERE email = '${email}'`
)

// ✅ Parameterized — always
const rows = await client.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
)

// ✅ knex query builder — parameterizes automatically
const user = await knex('users').where({ email }).first()

// ✅ Drizzle — type-safe, no raw string construction
const user = await db.select().from(users).where(eq(users.email, email))
```

---

## Migration Safety (expand-contract pattern)

```
Phase 1 — EXPAND: add new column nullable, no constraints
  ALTER TABLE users ADD COLUMN display_name TEXT;

Phase 2 — BACKFILL: populate in batches (never UPDATE all at once)
  UPDATE users SET display_name = name WHERE id BETWEEN $1 AND $2;

Phase 3 — CONSTRAIN: add NOT NULL after backfill complete
  ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;

Phase 4 — CONTRACT: drop old column (separate deploy)
  ALTER TABLE users DROP COLUMN name;

Rule: never DROP or NOT NULL in the same migration as ADD
Rule: always test rollback (DOWN migration) before pushing
```

---

## Slow Query Monitoring

```sql
-- pg_stat_statements: top 10 slowest queries in production
SELECT
  round(total_exec_time::numeric, 2) AS total_ms,
  calls,
  round(mean_exec_time::numeric, 2)  AS avg_ms,
  left(query, 80)                    AS query_snippet
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Index coverage check
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE tablename = 'orders' AND attname = 'customer_id';
-- correlation near 1.0 = index scan efficient; near 0 = heap scan likely
```

---

## Anti-Fake-Pass Checklist

```
❌ ORM relation loaded without include/join (N+1 — check query log count)
❌ Raw SQL with user input via string template literal
❌ Migration that adds NOT NULL without backfill first
❌ No EXPLAIN ANALYZE run before declaring a slow query "fixed"
❌ Batch UPDATE without WHERE clause row limit (table lock risk)
❌ knex/Prisma query in a loop — must be extracted to single bulk query
```
