---
name: caching-patterns
description: >
  Design and implement caching — strategy selection (cache-aside, read-through,
  write-through, write-behind), cache invalidation, TTL tuning, Redis patterns,
  cache stampede prevention, and distributed cache consistency. Use when asked
  to "add caching", "Redis cache", "cache invalidation", "reduce database load",
  "cache-aside", "CDN caching", "stale-while-revalidate", "cache stampede",
  "cache warming", or "response is too slow and hits the DB every time".
  Do NOT use for: HTTP browser caching headers alone — use web-performance.
  Do NOT use for: feature flag caching — use feature-flags skill.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Redis ≥ 7.x, ioredis ≥ 5.x. Patterns apply to Memcached and in-process caches."
---

## When to Use

- Use when: a hot read path queries the DB on every request
- Use when: designing caching strategy for a new feature before writing code
- Use when: cache invalidation is causing stale data bugs
- Use when: cache stampede / thundering herd is spiking DB under load
- Do NOT use for: write-heavy data with no read pattern — caching adds overhead
- Do NOT use for: data that must always be fresh (financial balances, inventory counts)

---

## Strategy Selection

| Strategy | How it works | Use when |
|---|---|---|
| **Cache-aside** | App checks cache → miss → load from DB → write to cache | Most common; app controls caching logic |
| **Read-through** | Cache fetches from DB automatically on miss | Simpler app code; cache library handles it |
| **Write-through** | Write to cache + DB synchronously | Strong consistency; slightly slower writes |
| **Write-behind** | Write to cache; async flush to DB | High write throughput; risk of data loss |

Default: **cache-aside**. Use write-through only when read-after-write consistency is required.

---

## Cache-Aside Pattern (Redis + ioredis)

```js
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

async function getUser(userId) {
  const key = `user:${userId}`;

  // 1. Check cache
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  // 2. Cache miss — load from DB
  const user = await db.users.findById(userId);
  if (!user) return null;

  // 3. Write to cache with TTL
  await redis.set(key, JSON.stringify(user), 'EX', 300); // 5 min
  return user;
}

// Invalidate on mutation
async function updateUser(userId, data) {
  await db.users.update(userId, data);
  await redis.del(`user:${userId}`); // always delete, never update
}
```

**Always delete on write, never overwrite** — avoids race conditions between write and cache update.

---

## TTL Strategy

| Data type | TTL | Rationale |
|---|---|---|
| User profile | 5–15 min | Changes infrequently; staleness acceptable |
| Session data | Equal to session timeout | Must expire with session |
| Product catalog | 1–24 hrs | Changes rarely; high read volume |
| Search results | 30–60 s | Freshness expected; high CPU to compute |
| Aggregated stats | 1–5 min | Expensive query; slight lag acceptable |
| Auth tokens / OTP | Exact expiry time | Security-sensitive; no rounding up |

Never use TTL = 0 (no expiry) on application data — cache grows unbounded.

---

## Cache Invalidation

```js
// Pattern 1: Key-based invalidation — delete specific key
await redis.del(`user:${userId}`);

// Pattern 2: Tag-based invalidation — group related keys
// Store tags as a Set, then delete all members
await redis.sadd(`tag:user:${userId}`, `user:${userId}`, `user:${userId}:posts`);
// On user update:
const keys = await redis.smembers(`tag:user:${userId}`);
if (keys.length) await redis.del(...keys, `tag:user:${userId}`);

// Pattern 3: Versioned keys — increment version, old keys expire naturally
const version = await redis.incr(`user:${userId}:version`);
const key = `user:${userId}:v${version}`;
await redis.set(key, JSON.stringify(user), 'EX', 300);
// Reads must look up current version first — adds 1 round trip
```

Choose key-based for simple cases, tag-based for complex object graphs, versioned keys when you can tolerate the extra round trip.

---

## Cache Stampede Prevention

Stampede = cache expires, 1000 requests simultaneously hit the DB.

```js
// Fix 1: Probabilistic early expiration (XFetch)
async function getWithEarlyExpiry(key, computeFn, ttl) {
  const raw = await redis.get(key);
  if (raw) {
    const { value, expiresAt } = JSON.parse(raw);
    const remaining = expiresAt - Date.now();
    // Recompute early with probability proportional to cost/remaining
    if (remaining > 0 && Math.random() * ttl * 1000 > remaining) {
      recomputeAndStore(key, computeFn, ttl); // async, don't await
    }
    return value;
  }
  return recomputeAndStore(key, computeFn, ttl);
}

// Fix 2: Mutex lock — only one request computes, others wait
const lock = await redis.set(`lock:${key}`, '1', 'NX', 'EX', 10);
if (!lock) {
  await sleep(50);
  return redis.get(key); // retry after lock holder populates cache
}
```

For most cases: **mutex lock** is simpler and correct. XFetch is better for very expensive computations.

---

## Common Pitfalls

| Mistake | Fix |
|---|---|
| Caching mutable objects by reference | Always serialize/deserialize (JSON or msgpack) |
| Cache key collisions | Namespace keys: `{service}:{entity}:{id}` |
| Storing too much in one key | Split large objects; cache hot fields only |
| No cache miss monitoring | Track miss rate — > 30% miss suggests wrong TTL or key design |
| Caching errors / nulls | Never cache error responses; cache null with short TTL only if intentional |
| Redis connection not pooled | Use connection pool; single connection blocks on slow commands |

---

## Anti-Fake-Pass Rules

Before claiming caching work is done, you MUST show:
- [ ] Strategy chosen and justified — not "just add Redis" without a reason
- [ ] TTL set explicitly — no keys with no expiry on application data
- [ ] Invalidation path implemented — what deletes/updates the cache on write?
- [ ] Cache miss path tested — app works correctly when cache is cold/empty
- [ ] Stampede protection for high-traffic keys — lock or early expiry
- [ ] Cache miss rate metric logged — observable in production
- [ ] Keys namespaced — no collisions between services or entity types

Reference: `gates/anti-fake-pass-gate.md`
