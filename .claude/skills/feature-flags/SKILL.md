---
name: feature-flags
description: >
  Design and implement feature flags — flag types (release/experiment/ops/permission),
  lifecycle (create→target→rollout→cleanup), gradual rollout strategy, kill switch
  pattern, and flag hygiene. Use when asked to "add a feature flag", "gradual rollout",
  "kill switch", "LaunchDarkly", "Unleash", "GrowthBook", "dark launch", "flag cleanup",
  "percentage rollout", or "canary release via flags". Do NOT use for: deployment
  canaries managed at infra level (Kubernetes, load balancer weights). Do NOT use for:
  A/B test statistical analysis — flags gate traffic, stats belong in analytics.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "LaunchDarkly SDK ≥ 6.x, Unleash ≥ 5.x, GrowthBook ≥ 1.x. Patterns are provider-agnostic."
---

## When to Use

- Use when: releasing a risky feature to a subset of users before full rollout
- Use when: you need an instant kill switch without a redeploy
- Use when: running an experiment (A/B test) behind a flag
- Use when: cleaning up stale flags that are 100% rolled out or removed
- Do NOT use for: infra-level canary deploys — those live in the deployment pipeline
- Do NOT use for: config values that never change — use env vars instead

---

## Flag Types

| Type | Purpose | Lifetime |
|---|---|---|
| **Release toggle** | Gate incomplete feature during development | Short — remove after full rollout |
| **Experiment flag** | A/B test — split traffic, measure impact | Short — remove after decision |
| **Ops flag** | Kill switch, circuit breaker, rate limit toggle | Long-lived — keep as safety valve |
| **Permission flag** | Beta access, entitlements, plan gating | Long-lived — tied to user identity |

Use the narrowest type that fits. Release toggles are the most common source of flag debt.

---

## Lifecycle

```
1. CREATE   — name, type, default (off), owner, expiry date
2. TARGET   — specify who sees it (user IDs, segments, attributes)
3. ROLLOUT  — ramp percentage: 1% → 5% → 25% → 100%
4. CLEAN UP — remove flag + code path within TTL after full rollout
```

**Default must always be the safe/old behavior** — flag ON = new behavior.

---

## SDK Usage Patterns

### LaunchDarkly (Node.js)
```js
import * as ld from '@launchdarkly/node-server-sdk';

const client = ld.init(process.env.LD_SDK_KEY);
await client.waitForInitialization();

// Always pass a context (replaces the old "user" object)
const ctx = { kind: 'user', key: user.id, plan: user.plan, country: user.country };

const newCheckout = await client.variation('new-checkout-flow', ctx, false); // false = default

if (newCheckout) {
  return handleNewCheckout(cart);
} else {
  return handleLegacyCheckout(cart);
}
```

### Unleash (Node.js)
```js
import { initialize } from 'unleash-client';

const unleash = initialize({
  url: process.env.UNLEASH_URL,
  appName: 'my-service',
  customHeaders: { Authorization: process.env.UNLEASH_TOKEN },
});

// Context carries targeting attributes
const enabled = unleash.isEnabled('new-checkout-flow', {
  userId: user.id,
  properties: { plan: user.plan },
});
```

### GrowthBook (Node.js)
```js
import { GrowthBook } from '@growthbook/growthbook';

const gb = new GrowthBook({
  apiHost: process.env.GB_API_HOST,
  clientKey: process.env.GB_CLIENT_KEY,
  attributes: { id: user.id, plan: user.plan },
});
await gb.loadFeatures();

if (gb.isOn('new-checkout-flow')) {
  return handleNewCheckout(cart);
}
```

---

## Gradual Rollout Strategy

```
Day 0:   Internal users only (flag ON for employee accounts)
Day 1:   1% — catch crashes before they scale
Day 2:   5% — confirm p99 latency unchanged
Day 3:   25% — validate at meaningful traffic
Day 5:   100% — complete rollout
Day 7+:  Remove flag + dead code path
```

Monitor error rate and p99 latency at each step. Roll back by flipping flag to 0% — no deploy needed.

---

## Kill Switch Pattern

An ops flag that is **ON by default** — flipping it OFF disables the feature.

```js
// Kill switch: default TRUE (feature running normally)
const paymentsEnabled = await client.variation('payments-kill-switch', ctx, true);

if (!paymentsEnabled) {
  return { error: 'Payments temporarily unavailable. Please try again later.' };
}
```

Rules:
- Kill switches are long-lived — do not put an expiry on them
- Name them clearly: `{feature}-kill-switch` or `{feature}-enabled`
- Test the OFF path explicitly — it's the path that matters in an incident

---

## Targeting Rules

Rollout order: internal → beta users → low-value cohort → geo subset → percentage ramp.

Context attributes to expose: `user.id` (stable, for consistent bucketing), `user.plan`, `user.country`, `request.env`.

Never target by email — IDs ensure consistent bucketing across sessions.

---

## Testing with Flags

Inject flag state directly into functions — never call the SDK in unit tests.

```js
// Both paths must be tested
it('new checkout when flag ON',  () => expect(checkout(cart, { newCheckoutFlow: true  })).toMatchNewShape());
it('legacy checkout when flag OFF', () => expect(checkout(cart, { newCheckoutFlow: false })).toMatchLegacyShape());

// Integration: mock the client
const mockClient = { variation: jest.fn().mockResolvedValue(true) };
```

A flag with only the ON path tested breaks silently when rolled back.

---

## Flag Hygiene

| Rule | Detail |
|---|---|
| Set expiry on creation | Release flags: 30 days. Experiment flags: 14 days. |
| One owner per flag | Owning team is responsible for cleanup |
| No nested flags | `if (flagA && flagB)` — creates 4 states to test |
| Max 10 active release flags per service | More = coordination hell |
| Cleanup = delete flag + remove both code paths | Not just the old path |

Flag debt compounds: 50 stale flags means 50 conditional branches no one understands.

---

## Anti-Fake-Pass Rules

Before claiming feature flag work is done, you MUST show:
- [ ] Default value is the safe/old behavior (flag OFF = no change for users)
- [ ] Both code paths have test coverage — ON and OFF
- [ ] Kill switch (if applicable) tested in the OFF state explicitly
- [ ] Context/user object passes a stable ID for consistent bucketing
- [ ] Expiry date or cleanup ticket created for release/experiment flags
- [ ] Rollout plan defined — not "flip to 100% and see what happens"
- [ ] Flag removed from code (not just dashboard) after full rollout

Reference: `gates/anti-fake-pass-gate.md`
