---
name: unit-testing-patterns
description: >
  Write effective unit tests — Arrange-Act-Assert structure, test boundary
  selection, mocking strategy, test doubles (spy/stub/mock/fake), parameterized
  tests, snapshot pitfalls, test naming, and Vitest/Jest configuration.
  Use when asked about "unit test", "write tests", "Jest", "Vitest",
  "mock function", "spy on", "stub", "test coverage", "describe/it/expect",
  "beforeEach/afterEach", "parameterized test", "test.each", "snapshot test",
  "how to test this function", or "unit testing best practices". Do NOT use
  for: E2E browser testing — see e2e-testing. Do NOT use for: contract
  testing — see contract-testing. Do NOT use for: load testing — see load-testing.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Vitest v2 (preferred), Jest v29. Patterns apply to both."
---

## When to Use

- Use when: writing a pure function that needs correctness verification
- Use when: a function has complex branching logic (happy + error paths)
- Use when: a module has side effects that need to be verified without running them
- Do NOT use for: React component integration — use RTL + Vitest for that
- Do NOT use for: full user journey testing — see e2e-testing

---

## AAA Pattern

```ts
// Arrange-Act-Assert — every test follows this structure
describe('calculateDiscount', () => {
  it('applies 20% discount for premium users', () => {
    // Arrange
    const user  = { tier: 'premium' };
    const price = 100;

    // Act
    const result = calculateDiscount(user, price);

    // Assert
    expect(result).toBe(80);
  });

  it('returns full price for standard users', () => {
    const user  = { tier: 'standard' };
    expect(calculateDiscount(user, 100)).toBe(100);  // compact for obvious cases
  });
});
```

---

## Test Naming Convention

```ts
// Pattern: "it [does something] when [condition]"
it('throws ValidationError when email is missing')
it('returns empty array when no results match')
it('calls sendEmail once when order is confirmed')
it('does NOT deduct balance when payment fails')
```

---

## Mocking Strategy

```ts
// Spy — observe calls without replacing behavior
import { vi, expect } from 'vitest';

const spy = vi.spyOn(emailService, 'send');
await processOrder(order);
expect(spy).toHaveBeenCalledOnce();
expect(spy).toHaveBeenCalledWith(expect.objectContaining({ to: order.userEmail }));

// Mock — replace with controlled behavior
vi.mock('../lib/stripe', () => ({
  createCharge: vi.fn().mockResolvedValue({ id: 'ch_123', status: 'succeeded' }),
}));

// Fake — lightweight working implementation (better than mock for complex deps)
const fakeCache = new Map<string, string>();
const cacheService = {
  get: (k: string) => Promise.resolve(fakeCache.get(k) ?? null),
  set: (k: string, v: string) => Promise.resolve(fakeCache.set(k, v)),
};
```

---

## Testing Async Code

```ts
describe('fetchUser', () => {
  it('returns user data on success', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ id: '1', name: 'Alice' });

    const result = await fetchUser('1');

    expect(result).toEqual({ id: '1', name: 'Alice' });
  });

  it('throws ApiError when user not found', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError('NOT_FOUND', 404));

    await expect(fetchUser('999')).rejects.toThrow(ApiError);
    await expect(fetchUser('999')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
```

---

## Parameterized Tests

```ts
// Test.each — avoid copy-paste test multiplication
describe('parseAmount', () => {
  test.each([
    ['$1,000.00', 1000],
    ['$0.99',         0.99],
    ['$1,234,567.89', 1234567.89],
  ])('parses "%s" as %d', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  test.each([
    ['',          'empty input'],
    ['abc',       'non-numeric'],
    ['-$100',     'negative'],
  ])('throws for "%s" (%s)', (input) => {
    expect(() => parseAmount(input)).toThrow(ValidationError);
  });
});
```

---

## Snapshot Pitfalls

```ts
// ❌ Snapshot of entire component output — breaks on any change
expect(render(<ProductCard product={product} />).container).toMatchSnapshot();

// ✅ Snapshot only for stable, visual structures (not data-driven)
expect(renderIcon('star')).toMatchInlineSnapshot(`"<svg .../>"`);

// ✅ Prefer explicit assertions over snapshots for logic
expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeInTheDocument();
expect(screen.getByText('$29.99')).toBeInTheDocument();
```

---

## Vitest Config

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,                // no need to import describe/it/expect
    environment: 'node',          // or 'jsdom' for DOM-dependent tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    setupFiles: ['./test/setup.ts'],
  },
});
```

---

## What NOT to Test

```
✅ Test: pure functions, complex branching, error paths, side effects
❌ Skip: framework internals (React's own render logic)
❌ Skip: implementation details (internal variable names, private methods)
❌ Skip: trivial getters/setters with zero logic
❌ Skip: third-party library behavior — trust their tests
```

---

## Anti-Fake-Pass Rules

Before claiming unit tests are done, you MUST show:
- [ ] Both happy path AND error/edge paths are tested
- [ ] `vi.mock` / `jest.mock` used at module level — not inside `it` blocks
- [ ] Async tests properly awaited — no floating promises
- [ ] No `expect.assertions(n)` missing in tests that might not reach assertions
- [ ] No snapshot tests on data-driven output — explicit assertions instead
- [ ] Coverage threshold set (80%+ branches minimum)
- [ ] Tests are independent — no shared mutable state between `it` blocks

Reference: `gates/anti-fake-pass-gate.md`
