---
name: database-migrations
description: >
  Manage database schema migrations safely — Prisma Migrate, Flyway,
  zero-downtime migration strategies, expand-contract pattern, rollback
  procedures, migration testing, and production deploy sequence. Use when
  asked about "database migration", "Prisma migrate", "Flyway", "schema
  change", "add column", "rename column", "backfill data", "zero-downtime
  migration", "expand-contract", "migration rollback", "migrate in production",
  "NOT NULL column", "dropping a column safely", or "migration testing".
  Do NOT use for: query optimization — see database-patterns.
  Do NOT use for: seed data for dev — separate from migration concern.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Prisma ≥ 5.x, Flyway ≥ 10. PostgreSQL focus, MySQL patterns noted."
---

## When to Use

- Use when: adding/renaming/dropping columns in a live production database
- Use when: migration needs to run without taking the app offline
- Use when: a new `NOT NULL` column is needed on a table with existing rows
- Use when: auditing migration history and checking for drift
- Do NOT use for: ORM query patterns — see database-patterns
- Do NOT use for: seeding dev database — use separate seed scripts

---

## The Expand-Contract Pattern (Zero-Downtime)

```
Phase 1 — Expand (backward-compatible migration)
  → Add new column as nullable
  → Deploy app code that writes to BOTH old and new columns
  → Backfill existing rows

Phase 2 — Migrate (after all pods running new code)
  → Add NOT NULL constraint + set DEFAULT
  → Drop writes to old column

Phase 3 — Contract (after all pods no longer read old column)
  → Drop old column
```

---

## Prisma — Safe NOT NULL Column

```prisma
// ❌ Naive — breaks if table has existing rows (migration fails)
model User {
  id        String   @id
  createdAt DateTime @default(now())
  // Adding directly:
  timezone  String   // NOT NULL with no default = migration error on non-empty table
}

// ✅ Step 1: add nullable first
model User {
  timezone  String?   // nullable — migration runs safely on any table size
}
```

```bash
# Step 1: nullable column
npx prisma migrate dev --name add_user_timezone

# Step 2: backfill existing rows (SQL)
UPDATE users SET timezone = 'UTC' WHERE timezone IS NULL;

# Step 3: make NOT NULL (in a new migration)
# Modify schema: timezone String (remove ?)
npx prisma migrate dev --name make_timezone_not_null
```

---

## Prisma Migration Commands

```bash
# Dev workflow
npx prisma migrate dev               # apply pending + generate client
npx prisma migrate dev --name <name> # with explicit migration name
npx prisma migrate reset             # drop + recreate dev DB (dev only)

# CI / production
npx prisma migrate deploy            # apply pending migrations (no interactive prompts)
npx prisma migrate status            # show applied / pending migrations
npx prisma db push                   # sync schema without migration file (prototyping only)

# Production deploy sequence:
# 1. Run `prisma migrate deploy` BEFORE starting new app pods
# 2. Use rolling update after migration completes
```

---

## Flyway (Java/Spring/Multi-language)

```sql
-- V1__create_users.sql
CREATE TABLE users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- V2__add_user_timezone.sql  (expand)
ALTER TABLE users ADD COLUMN timezone VARCHAR(50);

-- V3__backfill_timezone.sql
UPDATE users SET timezone = 'UTC' WHERE timezone IS NULL;

-- V4__make_timezone_not_null.sql  (contract)
ALTER TABLE users ALTER COLUMN timezone SET NOT NULL,
                  ALTER COLUMN timezone SET DEFAULT 'UTC';
```

```bash
# Apply migrations
flyway -url=jdbc:postgresql://localhost/mydb -user=app -password=$DB_PASS migrate

# Validate migration checksums haven't changed
flyway validate

# Show status
flyway info
```

---

## Renaming a Column Safely

```sql
-- ❌ Immediate rename breaks code reading old name
ALTER TABLE orders RENAME COLUMN user_id TO customer_id;

-- ✅ Expand phase: add new column
ALTER TABLE orders ADD COLUMN customer_id UUID;
UPDATE orders SET customer_id = user_id;  -- backfill

-- Deploy app code writing to BOTH columns
-- Then: Contract phase (after full deploy):
ALTER TABLE orders ALTER COLUMN customer_id SET NOT NULL;
-- When all app code uses only customer_id:
ALTER TABLE orders DROP COLUMN user_id;
```

---

## Dropping a Column Safely

```sql
-- ❌ Dropping immediately — old app pods still reading that column
ALTER TABLE users DROP COLUMN legacy_flag;

-- ✅ Contract pattern:
-- 1. Deploy app code that no longer references the column
-- 2. Wait for full rollout (no pods reading the column)
-- 3. Then: mark ignored in ORM (Prisma: @ignore)
-- 4. Deploy migration that drops the column
```

```prisma
// Prisma: tell Prisma to ignore a column before dropping
model User {
  legacyFlag Boolean? @ignore   // Prisma ignores, column still exists in DB
}
// After full deploy + bake time → run DROP COLUMN migration
```

---

## Migration Testing

```bash
# Test migrations against a copy of prod data (sanitized)
pg_dump $PROD_DB --no-owner --no-acl > prod_snapshot.sql
psql $TEST_DB < prod_snapshot.sql
npx prisma migrate deploy  # run against production-like data

# Check: migration completes, app starts, smoke test passes
```

---

## Anti-Fake-Pass Rules

Before claiming a migration is safe to run in production, you MUST show:
- [ ] `NOT NULL` columns added in two phases: nullable first, then constraint
- [ ] Backfill migration is separate from schema change migration
- [ ] Production deploy sequence: `migrate deploy` → wait → rolling pod restart
- [ ] Rollback plan documented (reverse migration or data restore point)
- [ ] Migration tested against a copy of production data (not just empty dev DB)
- [ ] `prisma migrate status` / `flyway validate` shows no drift before deploy
- [ ] Column renames/drops use expand-contract — no single-step renames

Reference: `gates/anti-fake-pass-gate.md`
