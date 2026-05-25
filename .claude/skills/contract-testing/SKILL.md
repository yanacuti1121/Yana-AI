---
name: contract-testing
description: >
  Design and implement consumer-driven contract tests — Pact consumer
  interactions, provider verification, Pact Broker publishing, and
  CI/CD integration. Use when asked to "contract testing", "Pact",
  "consumer-driven contracts", "provider verification", "Pact Broker",
  "can I deploy", "breaking API changes", "how to test microservice
  boundaries without E2E tests", or "verify this API change won't break
  consumers". Do NOT use for: full E2E testing of a user journey — use
  e2e-testing skill. Do NOT use for: API schema validation alone —
  contracts go further by verifying consumer-specific interactions.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Pact JS ≥ 12.x (@pact-foundation/pact), Pact Python ≥ 2.x. PactFlow or self-hosted Pact Broker."
---

## When to Use

- Use when: two services are developed by separate teams and need API change safety
- Use when: E2E tests are too slow/flaky to catch integration regressions
- Use when: a provider wants to know which consumers use which endpoints before changing them
- Use when: deploying independently — need to verify compatibility without full suite
- Do NOT use for: UI-to-API integration — use Playwright E2E for that layer
- Do NOT use for: single-service testing — contract tests require at least two services

---

## The Mental Model

```
Consumer (e.g. frontend / BFF)     Provider (e.g. user-service API)
    │                                       │
    │  1. Write interaction expectations    │
    │  2. Generate pact file (.json)        │
    │  3. Publish to Pact Broker ──────────►│
    │                                       │  4. Provider pulls pact
    │                                       │  5. Replays interactions against real code
    │                                       │  6. Publishes verification result
    │◄─────────────────────────────────────│
    │  7. "can-i-deploy" gate checks both sides before deploy
```

Consumer defines what it **needs**. Provider verifies it can **deliver** that. Neither owns the contract — the Pact Broker mediates.

---

## Consumer Test (Pact JS)

```ts
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { like, eachLike } from '@pact-foundation/pact/src/v3/matchers';
import axios from 'axios';

const provider = new PactV3({
  consumer: 'checkout-frontend',
  provider: 'user-service',
  dir: './pacts',             // pact file written here
  port: 1234,
});

describe('user-service contract', () => {
  it('returns user profile by ID', async () => {
    await provider
      .given('user 42 exists')
      .uponReceiving('a request for user profile')
      .withRequest({ method: 'GET', path: '/users/42' })
      .willRespondWith({
        status: 200,
        body: {
          id:    like(42),          // type match — not exact value
          name:  like('Alice'),
          email: like('a@example.com'),
          // Do NOT assert fields you don't use — keeps contract minimal
        },
      })
      .executeTest(async (mockServer) => {
        const res = await axios.get(`${mockServer.url}/users/42`);
        expect(res.data.id).toBeDefined();
        expect(res.data.name).toBeDefined();
      });
  });
});
```

**Only assert fields the consumer actually uses.** Overly broad contracts break on every provider change.

---

## Provider Verification (Pact JS)

```ts
import { Verifier } from '@pact-foundation/pact';

describe('user-service provider verification', () => {
  it('verifies all consumer pacts', async () => {
    await new Verifier({
      provider: 'user-service',
      providerBaseUrl: 'http://localhost:3000',   // real running service
      pactBrokerUrl:   process.env.PACT_BROKER_URL,
      pactBrokerToken: process.env.PACT_BROKER_TOKEN,
      publishVerificationResult: true,            // report back to broker
      providerVersion:           process.env.GIT_SHA,
      providerVersionBranch:     process.env.GIT_BRANCH,

      // State handlers — set up DB state matching consumer's "given" clauses
      stateHandlers: {
        'user 42 exists': async () => {
          await db.users.upsert({ id: 42, name: 'Alice', email: 'a@example.com' });
        },
        'user 42 does not exist': async () => {
          await db.users.delete({ id: 42 });
        },
      },
    }).verifyProvider();
  });
});
```

State handlers must mirror every `given()` clause in consumer tests. Missing handlers = test skipped silently.

---

## Pact Broker — Publish & can-i-deploy

```bash
# Consumer: publish pact after tests pass
npx pact-broker publish ./pacts \
  --broker-base-url  $PACT_BROKER_URL \
  --broker-token     $PACT_BROKER_TOKEN \
  --consumer-app-version $GIT_SHA \
  --branch           $GIT_BRANCH

# Before deploy: gate checks all pacts are verified
npx pact-broker can-i-deploy \
  --pacticipant checkout-frontend \
  --version     $GIT_SHA \
  --to-environment production
# Exits 0 = safe to deploy. Exits 1 = incompatible pact — block deploy.
```

---

## CI/CD Integration

```yaml
# Consumer pipeline
- name: Run consumer tests (generates pact)
  run: npx jest --testPathPattern=pact
- name: Publish pact to broker
  run: npx pact-broker publish ./pacts --consumer-app-version ${{ github.sha }} --branch ${{ github.ref_name }}
- name: can-i-deploy check
  run: npx pact-broker can-i-deploy --pacticipant checkout-frontend --version ${{ github.sha }} --to-environment production

# Provider pipeline (runs on every PR + on pact change webhook)
- name: Start service
  run: npm start &
- name: Verify pacts from broker
  run: npx jest --testPathPattern=pact.provider
  env:
    PACT_BROKER_URL:   ${{ secrets.PACT_BROKER_URL }}
    PACT_BROKER_TOKEN: ${{ secrets.PACT_BROKER_TOKEN }}
    GIT_SHA:           ${{ github.sha }}
    GIT_BRANCH:        ${{ github.ref_name }}
```

Configure a **webhook** in Pact Broker: re-trigger provider verification whenever a consumer publishes a new pact.

---

## Common Pitfalls

| Mistake | Fix |
|---|---|
| Asserting every field in the response | Only match fields the consumer uses — `like()` for type, not exact values |
| No state handlers for provider | Every `given()` must have a matching `stateHandlers` entry |
| Publishing pact only on main branch | Publish on every branch — enables feature-branch compatibility checks |
| Skipping `can-i-deploy` gate | Without it, contract tests don't prevent breaking deploys |
| Provider tests hit real external services | Use test doubles for downstream deps in provider verification |

---

## Anti-Fake-Pass Rules

Before claiming contract testing is done, you MUST show:
- [ ] Consumer pact uses `like()` matchers — not exact values that break on data changes
- [ ] Only fields the consumer actually uses are asserted in the pact
- [ ] Every `given()` clause has a matching `stateHandlers` entry on the provider
- [ ] Pact published to broker with version + branch (not just written to disk)
- [ ] `can-i-deploy` gate runs before every production deploy — not advisory only
- [ ] Provider pipeline re-runs on pact change (webhook configured in broker)
- [ ] Provider verification publishes result back to broker (`publishVerificationResult: true`)

Reference: `gates/anti-fake-pass-gate.md`
