---
name: load-testing
description: >
  Design and run load tests — tool selection (k6/Locust), test type strategy
  (smoke/load/stress/spike/soak), ramp-up curves, p50/p95/p99 targets,
  and threshold policy. Use when asked to "write a load test", "k6 script",
  "performance test", "check how many concurrent users", "find breaking point",
  "set SLO thresholds", or "load test this API". Do NOT use for: frontend
  Core Web Vitals (see web-performance skill). Do NOT use for: unit/integration
  test suites. Do NOT use for: security fuzzing.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "k6 ≥ 0.46, Locust ≥ 2.x. Cloud: k6 Cloud, Grafana Cloud k6."
---

## When to Use

- Use when: validating an API before a traffic spike (launch, campaign)
- Use when: setting SLO error budgets — need p99 baseline first
- Use when: finding the concurrency ceiling of a new service
- Use when: regression-testing after a performance-sensitive refactor
- Do NOT use for: frontend rendering performance — use `web-performance` skill
- Do NOT use for: security boundary testing — use `red-team-check` skill

---

## Test Types

| Type | Goal | Duration | Target VUs |
|---|---|---|---|
| Smoke | Confirm test script works; baseline | 1–2 min | 1–5 |
| Load | Validate normal + peak expected traffic | 10–30 min | Expected peak |
| Stress | Find breaking point — push beyond peak | Until failure | Ramp past peak |
| Spike | Sudden burst — autoscale / queue behavior | 2–5 min spike | 10× normal |
| Soak | Memory leaks, connection pool exhaustion | 2–24 hrs | Sustained load |

Always run **smoke → load → stress** in that order. Never skip smoke.

---

## k6 Script Structure

```js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const checkoutDuration = new Trend('checkout_duration');

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // ramp up
    { duration: '5m', target: 50 },   // hold
    { duration: '2m', target: 100 },  // ramp to peak
    { duration: '5m', target: 100 },  // hold peak
    { duration: '2m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // ms
    errors: ['rate<0.01'],                            // <1% error
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get('https://api.example.com/products');

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'latency < 500ms': (r) => r.timings.duration < 500,
  });

  errorRate.add(!ok);
  checkoutDuration.add(res.timings.duration);

  sleep(1);  // think time — remove for max throughput tests
}
```

---

## Locust Script Structure

```python
from locust import HttpUser, task, between, constant_pacing
from locust import events

class APIUser(HttpUser):
    wait_time = between(1, 3)  # think time seconds

    @task(3)  # weight: called 3x more than other tasks
    def get_products(self):
        with self.client.get("/products", catch_response=True) as resp:
            if resp.status_code != 200:
                resp.failure(f"Got {resp.status_code}")

    @task(1)
    def get_product_detail(self):
        self.client.get("/products/1")

# Run: locust -f locustfile.py --headless -u 100 -r 10 --run-time 5m \
#             --host https://api.example.com \
#             --html report.html
```

---

## Ramp-Up Strategy

```
Ramp rate = target_vus / ramp_duration_seconds
Rule of thumb: ramp no faster than 10 VU/s for most services
               ramp no faster than 2 VU/s for DB-heavy services

Stages pattern:
  10% of target → hold 2 min (confirm baseline)
  50% of target → hold 3 min (validate mid-load)
  100% of target → hold 5 min (validate peak)
  0 → hold 2 min (confirm recovery)
```

Hold each stage long enough for autoscaling to react (typically 2–3 min).

---

## Threshold Policy

Define thresholds **before** running — never tune thresholds to match results.

| Metric | Aggressive SLO | Conservative SLO |
|---|---|---|
| p50 latency | < 100 ms | < 300 ms |
| p95 latency | < 300 ms | < 800 ms |
| p99 latency | < 500 ms | < 1500 ms |
| Error rate | < 0.1% | < 1% |
| Throughput | Define RPS target | — |

**Circuit breaker threshold:** stop test + alert if error rate exceeds 5% for > 30 s.

---

## Common Pitfalls

| Mistake | Fix |
|---|---|
| Testing against prod with no throttle | Use staging; add `--vus-per-instance` cap |
| No think time → unrealistic RPS | Add `sleep(1)` or `wait_time = between(1,3)` |
| Hard-coded auth token expires mid-test | Use setup() to mint tokens; rotate in teardown() |
| Ignoring server-side metrics | Correlate k6 output with CPU/memory/DB connection graphs |
| Thresholds set after seeing results | Agree on SLOs before running |
| Testing a single endpoint only | Cover critical user journeys (browse → cart → checkout) |

---

## Reading Results

```
✓ http_req_duration............: avg=234ms  p(95)=487ms  p(99)=892ms
✓ http_req_failed..............: 0.23%
✗ errors.......................: 1.2%  ← OVER THRESHOLD

Interpretation:
- p(95) 487ms: 95% of requests complete within 487ms
- p(99) 892ms: worst 1% up to ~900ms — check if this is acceptable for SLO
- error rate 1.2% > threshold 1%: test FAILS — investigate 4xx/5xx breakdown
```

Always export HTML report (`--out html`) and attach to the PR or incident ticket.

---

## Anti-Fake-Pass Rules

Before claiming load test is done or results are acceptable, you MUST show:
- [ ] Smoke test ran first — script confirmed working at 1–5 VUs
- [ ] Thresholds defined **before** test run — not tuned after
- [ ] Ramp-up used — no cold-start flood (no instant 100 VU jump)
- [ ] p95 AND p99 reported — not just average (averages hide tail latency)
- [ ] Server-side metrics checked — CPU, memory, DB connections during test
- [ ] Error breakdown shown — not just error rate % (which 4xx/5xx codes?)
- [ ] Test ran long enough to detect pool exhaustion (≥ 5 min at peak load)

Reference: `gates/anti-fake-pass-gate.md`
