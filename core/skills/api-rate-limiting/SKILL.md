---
name: api-rate-limiting
description: >
  Design and implement API rate limiting — algorithm selection (token bucket,
  sliding window, fixed window), Redis-based distributed limiting, per-user
  and per-IP limits, rate limit headers, retry-after, and burst handling.
  Use when asked to "add rate limiting", "throttle requests", "too many
  requests", "429", "token bucket", "sliding window counter", "per-user
  quota", "API abuse", "burst traffic", or "rate limit this endpoint".
  Do NOT use for: load shedding at the infrastructure layer — that belongs
  in a load balancer or API gateway config, not application code.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Redis ≥ 7.x, ioredis ≥ 5.x. Express/Fastify/Hono middleware patterns."
---

## When to Use

- Use when: an endpoint is abused by bots or runaway clients
- Use when: implementing API quotas for a SaaS product (free vs paid tiers)
- Use when: protecting expensive endpoints (AI inference, file export, email send)
- Use when: a DB query spikes because one client sends 1000 req/s
- Do NOT use for: DDoS mitigation at scale — use a WAF or CDN rate limiting
- Do NOT use for: queue-based job throttling — use a job queue with concurrency limits

---

## Algorithm Comparison

| Algorithm | Burst allowed? | Memory | Precision | Use when |
|---|---|---|---|---|
| **Fixed window** | Yes (at boundary) | O(1) | Low | Simple counters; acceptable boundary spike |
| **Sliding window log** | No | O(requests) | High | Strict fairness; low traffic |
| **Sliding window counter** | Partial | O(1) | Medium | Best default — accurate, memory-efficient |
| **Token bucket** | Yes (controlled) | O(1) | High | APIs that allow short bursts |
| **Leaky bucket** | No | O(1) | High | Smooth output rate (e.g., email sending) |

**Default recommendation: sliding window counter** for most API endpoints.
Use **token bucket** when legitimate clients need burst capacity (SDK retries, batch uploads).

---

## Sliding Window Counter (Redis)

```js
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

async function slidingWindowRateLimit(key, limit, windowSeconds) {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, '-inf', windowStart);   // drop expired entries
  pipeline.zadd(key, now, `${now}-${Math.random()}`);    // record this request
  pipeline.zcard(key);                                    // count in window
  pipeline.expire(key, windowSeconds);                    // auto-cleanup

  const results = await pipeline.exec();
  const count = results[2][1];

  return {
    allowed: count <= limit,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt: new Date(now + windowSeconds * 1000),
  };
}

// Usage in Express middleware
async function rateLimitMiddleware(req, res, next) {
  const key = `ratelimit:${req.user?.id ?? req.ip}`;
  const result = await slidingWindowRateLimit(key, 100, 60); // 100 req/min

  res.set({
    'X-RateLimit-Limit':     result.limit,
    'X-RateLimit-Remaining': result.remaining,
    'X-RateLimit-Reset':     Math.ceil(result.resetAt / 1000), // Unix timestamp
  });

  if (!result.allowed) {
    res.set('Retry-After', 60);
    return res.status(429).json({
      error: 'Too Many Requests',
      retryAfter: 60,
    });
  }
  next();
}
```

---

## Token Bucket (Redis + Lua — atomic)

```js
const TOKEN_BUCKET_SCRIPT = `
local key        = KEYS[1]
local capacity   = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])   -- tokens per second
local now        = tonumber(ARGV[3])   -- current time ms
local requested  = tonumber(ARGV[4])   -- tokens to consume

local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens     = tonumber(bucket[1]) or capacity
local last_refill = tonumber(bucket[2]) or now

-- Refill tokens based on elapsed time
local elapsed = math.max(0, now - last_refill) / 1000
tokens = math.min(capacity, tokens + elapsed * refillRate)

if tokens >= requested then
  tokens = tokens - requested
  redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
  redis.call('EXPIRE', key, math.ceil(capacity / refillRate) + 1)
  return {1, math.floor(tokens)}
else
  return {0, math.floor(tokens)}
end
`;

async function tokenBucketLimit(key, capacity, refillRate, requested = 1) {
  const [allowed, remaining] = await redis.eval(
    TOKEN_BUCKET_SCRIPT, 1, key, capacity, refillRate, Date.now(), requested
  );
  return { allowed: allowed === 1, remaining };
}
```

Lua script runs atomically in Redis — no race conditions without distributed locks.

---

## Limit Tiers

```js
// Separate keys per scope — fine-grained control
const limiters = {
  perUser:      (id) => ({ key: `rl:user:${id}`,      limit: 1000, window: 3600 }), // 1k/hr
  perIp:        (ip) => ({ key: `rl:ip:${ip}`,         limit: 100,  window: 60   }), // 100/min
  perEndpoint:  (ep) => ({ key: `rl:ep:${ep}`,          limit: 500,  window: 60   }), // 500/min global
  perUserEndpt: (id, ep) => ({ key: `rl:ue:${id}:${ep}`, limit: 10, window: 60   }), // 10/min per user per endpoint
};

// Apply multiple layers — first failure wins
async function multiLayerLimit(req) {
  const checks = [
    limiters.perIp(req.ip),
    req.user && limiters.perUser(req.user.id),
    limiters.perEndpoint(req.path),
  ].filter(Boolean);

  for (const cfg of checks) {
    const result = await slidingWindowRateLimit(cfg.key, cfg.limit, cfg.window);
    if (!result.allowed) return { allowed: false, ...result };
  }
  return { allowed: true };
}
```

---

## Headers Standard (RFC 6585 + draft-ietf-httpapi-ratelimit-headers)

```
X-RateLimit-Limit:     100          ← max requests in window
X-RateLimit-Remaining: 43           ← remaining in current window
X-RateLimit-Reset:     1716393600   ← Unix timestamp when window resets
Retry-After:           37           ← seconds until client can retry (on 429 only)
```

Always return these headers on **every** response — not just on 429. Clients use them for adaptive throttling.

---

## Anti-Fake-Pass Rules

Before claiming rate limiting is done, you MUST show:
- [ ] Algorithm chosen and justified — not just "use Redis"
- [ ] Key namespaced by scope (user, IP, endpoint) — not a global single counter
- [ ] `X-RateLimit-*` headers returned on every response, not just 429s
- [ ] `Retry-After` header set on 429 responses
- [ ] Redis script is atomic — Lua or pipeline, no TOCTOU race
- [ ] Limit bypassed gracefully when Redis is down (fail-open or fail-closed, documented)
- [ ] Burst behavior tested — what happens when a client sends 10× normal in 1 second?

Reference: `gates/anti-fake-pass-gate.md`
