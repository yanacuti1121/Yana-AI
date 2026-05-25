---
name: resilience-patterns
description: >
  Design resilient distributed services — circuit breaker, retry with backoff,
  timeout, bulkhead isolation, rate limiting, and fallback strategies. Use when
  asked about "circuit breaker", "retry logic", "timeouts", "cascading failures",
  "service keeps going down", "bulkhead", "rate limit", or "what happens when
  a dependency is slow/down". Do NOT use for: SLO target design — use `slo-design`.
origin: yamtam-original
license: MIT © 2025 Vũ Văn Tâm
version: 1.0.0
compatibility: "Any backend service. Language-agnostic patterns — pseudocode examples."
---

## When to Use

- Use when: a slow downstream service causes your service to hang
- Use when: retry storms are making outages worse
- Use when: one noisy tenant is taking down shared resources
- Use when: designing a new service that calls external APIs
- Do NOT use for: database query optimization — use `database-patterns`

---

## The Four Core Patterns

### 1. Timeout
Every outbound call must have a deadline. Without it, one slow dependency hangs all threads.

```
Connection timeout: 1–3s  (time to establish connection)
Read timeout:       5–30s (time to wait for response — match the operation's SLO)
Total timeout:      always less than your own SLO to leave time for retry
```

Rules:
- Set timeout at call site, not just client config — context-specific timeouts
- Timeout ≠ error; have a fallback for timeout case
- Cascade: if your caller has a 10s SLO, your downstream timeout must be < 8s

### 2. Retry with Exponential Backoff + Jitter
```
attempt 1: immediate
attempt 2: wait 1s   + jitter(0–500ms)
attempt 3: wait 2s   + jitter(0–500ms)
attempt 4: wait 4s   + jitter(0–500ms)
max attempts: 3–5 (beyond that, the service is probably down — stop)
```

**Only retry idempotent operations.** Never retry: payment charge, send email, create order (unless idempotency key is used).

Jitter is mandatory — without it, all retrying clients synchronize and create a retry storm.

```python
wait = min(base * (2 ** attempt), max_wait) + random.uniform(0, jitter_cap)
```

### 3. Circuit Breaker

```
CLOSED (normal)  →  failure rate > threshold  →  OPEN (reject calls)
OPEN             →  after timeout (30–60s)     →  HALF-OPEN (probe one call)
HALF-OPEN        →  probe succeeds             →  CLOSED
HALF-OPEN        →  probe fails                →  OPEN
```

Configuration:
```
failure_threshold:    50% of calls in 10s window → OPEN
success_threshold:    3 consecutive successes in HALF-OPEN → CLOSED
open_duration:        30s before probing
minimum_calls:        10 calls before evaluating failure rate
```

In OPEN state: return cached response, fallback, or explicit error — never queue indefinitely.

### 4. Bulkhead
Isolate resources so one slow consumer can't exhaust shared capacity.

```
Without bulkhead:
  [All callers] → [shared 100-thread pool] → [downstream]
  If downstream slows: all 100 threads fill up → service dies

With bulkhead:
  [Payment calls] → [10-thread pool for payments]
  [Search calls]  → [20-thread pool for search]
  [Reports calls] → [5-thread pool for reports]
  Payments slow → only payment pool fills; search still works
```

---

## Fallback Strategies

When resilience pattern triggers, always have a fallback:

| Fallback type | When to use |
|---|---|
| Cached response | Stale data is acceptable (product catalog, config) |
| Default value | Missing data degrades gracefully (show 0 instead of crashing) |
| Degraded feature | Core flow works, optional feature hidden |
| Queue for retry | Write operations that can be deferred |
| Explicit error | Better than silent corruption — tell the user |

---

## Rate Limiting

Protect your service from callers, not just from dependencies.

### Algorithms
| Algorithm | Behavior | Use |
|---|---|---|
| Token bucket | Allows burst up to bucket size | APIs with burst tolerance |
| Fixed window | Simple; resets every minute | Internal rate limits |
| Sliding window | No boundary spikes | Public APIs |

### Headers to return (standard)
```
X-RateLimit-Limit:     100
X-RateLimit-Remaining: 42
X-RateLimit-Reset:     1716300000   (Unix epoch when limit resets)
Retry-After:           60           (seconds to wait — on 429 response)
```

---

## Pattern Selection Guide

| Problem | Pattern |
|---|---|
| Slow dependency hangs threads | Timeout + Bulkhead |
| Transient network errors | Retry with backoff + jitter |
| Dependency is down for minutes | Circuit Breaker |
| One tenant saturates shared pool | Bulkhead per tenant |
| Client sending too many requests | Rate Limiting |
| All of the above | Layer all patterns — they compose |

---

## Anti-Fake-Pass Rules

Before claiming a service is resilient, you MUST show:
- [ ] Every outbound call has an explicit timeout (not default infinite)
- [ ] Retries: exponential backoff + jitter, only on idempotent operations
- [ ] Circuit breaker configured with failure threshold and open duration
- [ ] Fallback defined for each resilience trigger — not just "return 500"
- [ ] Bulkheads: separate thread/connection pools for critical vs non-critical dependencies

Reference: `gates/anti-fake-pass-gate.md`
