---
name: ai-regression-testing
description: >
  Write regression tests targeting AI-introduced bugs and blind spots.
  Use when "a bug was found and fixed — prevent re-introduction",
  "AI agent modified API routes or backend logic", "running /bug-check",
  "we keep seeing the same type of bug come back", "AI keeps making the same mistake".
  Do NOT use for general test coverage — this skill targets specific known failure modes only.
origin: adapted:affaan-m/ECC
license: MIT © ECC contributors
version: 1.0.0
compatibility: "Vitest, Jest, pytest. Examples in TypeScript/Node, adapts to any stack."
---

<!-- Adapted from ECC ai-regression-testing (MIT © affaan-m). Changes: added YAMTAM fields, added common AI blind spots list, added Anti-Fake-Pass. -->

## When to Use

- Use when: an AI agent introduced a bug that was then manually fixed
- Use when: the same type of bug appears repeatedly across sessions
- Use when: code was refactored by an agent and existing behavior might have changed
- Do NOT use: for covering new features before they're built (that's TDD, not regression)

## Core Principle

**Don't aim for 100% coverage. Aim for 100% coverage of known failure modes.**

AI models have predictable blind spots. Write tests that specifically catch what AI gets wrong repeatedly.

## Common AI Blind Spots to Cover First

```
1. Error state leakage — happy path tested, error path returns wrong data
2. Missing rollback — DB write succeeds, second step fails, no rollback
3. SELECT clause omissions — query returns partial data silently
4. Sandbox/production path divergence — works in test, breaks with real env vars
5. Auth check on create but not update/delete — classic AI shortcut
6. Off-by-one in pagination — AI copies the pattern, gets limits wrong
7. Unhandled null from optional fields — AI trusts the type, skips null guard
```

## Regression Test Workflow

```
Bug found in /api/user/profile
        ↓
Write a test that FAILS with the bug present
        ↓
Verify the test actually fails (run it now)
        ↓
Apply the fix
        ↓
Verify test now passes
        ↓
Commit test + fix together
```

The test-fails-first step is non-negotiable. A test that passes before the fix doesn't prove anything.

## Setup: Sandbox Mode

Force tests to run without real infrastructure:
```typescript
// vitest.config.ts — force sandbox mode for all tests
export default defineConfig({
  test: {
    env: { NODE_ENV: 'test', SANDBOX_MODE: '1' },
    setupFiles: ['./tests/setup.ts'],
  },
})

// tests/setup.ts
process.env.DATABASE_URL = undefined  // no real DB
process.env.SANDBOX_MODE = '1'
```

## Example: Regression Test Pattern

```typescript
// Bug: /api/user/profile returned 200 with empty object when user not found
describe('GET /api/user/profile regression', () => {
  it('returns 404 when user does not exist', async () => {
    const res = await request(app)
      .get('/api/user/profile')
      .set('Authorization', 'Bearer valid-but-unknown-user-token')
    expect(res.status).toBe(404)        // was 200 before fix
    expect(res.body.id).toBeUndefined() // was {} before fix
  })
})
```

## Anti-Fake-Pass

```
❌ Writing the test after the fix (test may never have caught the bug)
❌ Test that passes before AND after the fix (proves nothing)
❌ Sandboxed test that never hits the actual auth/DB path the bug was in
❌ "We trust the AI won't make that mistake again" — it will
✅ Run test with bug present → confirm FAIL → apply fix → confirm PASS
✅ Tag regression tests: describe('[regression] bug description', ...)
```
