---
name: typescript-patterns
description: >
  Write precise TypeScript — generic constraints, conditional types, mapped
  types, template literal types, branded/nominal types, type narrowing,
  satisfies operator, and utility type composition. Use when asked about
  "TypeScript generics", "conditional type", "mapped type", "infer keyword",
  "branded type", "nominal typing", "template literal type", "satisfies",
  "utility types", "type narrowing", "discriminated union", "type predicate",
  "TypeScript strict mode", "keyof typeof", or "TypeScript advanced patterns".
  Do NOT use for: React-specific TypeScript — see frontend-patterns.
  Do NOT use for: API type generation — see api-design.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "TypeScript ≥ 5.0. strict: true required for all patterns."
---

## When to Use

- Use when: types are too broad (`any`, `as unknown`, `as SomeType` casts)
- Use when: building a reusable library or SDK that needs precise generics
- Use when: needing runtime-safe IDs (userId vs orderId confusion)
- Use when: modeling complex state machines with discriminated unions
- Do NOT use for: React component prop types — see frontend-patterns
- Do NOT use for: Zod schema ↔ type sync — that's in api-design

---

## Branded / Nominal Types

```ts
// Prevents mixing IDs from different domains at compile time
type Brand<T, B extends string> = T & { readonly _brand: B };

type UserId  = Brand<string, 'UserId'>;
type OrderId = Brand<string, 'OrderId'>;

function getUser(id: UserId): Promise<User> { ... }

// Create branded values at system boundaries
const userId  = '123' as UserId;
const orderId = '456' as OrderId;

getUser(userId);    // ✅
getUser(orderId);   // ❌ TypeScript error — OrderId is not UserId
getUser('123');     // ❌ string is not UserId
```

---

## Discriminated Unions

```ts
// Exhaustive state modeling — TypeScript checks all cases
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error';   error: Error };

function render<T>(state: AsyncState<T>) {
  switch (state.status) {
    case 'idle':    return <Idle />;
    case 'loading': return <Spinner />;
    case 'success': return <Data data={state.data} />;
    case 'error':   return <ErrorMsg error={state.error} />;
    // TypeScript error if a case is missing (with noImplicitReturns)
  }
}
```

---

## Generic Constraints

```ts
// Constrain T to objects with a known shape
function pluck<T, K extends keyof T>(items: T[], key: K): T[K][] {
  return items.map(item => item[key]);
}

const names = pluck([{ name: 'Alice', age: 30 }], 'name'); // string[]
pluck([{ name: 'Alice' }], 'missing'); // ❌ TypeScript error

// Constrain to objects with an id field
function findById<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find(i => i.id === id);
}
```

---

## Conditional Types + infer

```ts
// Extract return type of async function
type Awaited<T> = T extends Promise<infer R> ? R : T;

type Result = Awaited<Promise<string>>;  // string

// Extract first argument of a function
type FirstArg<T extends (...args: any[]) => any> =
  T extends (first: infer F, ...rest: any[]) => any ? F : never;

type F = FirstArg<(id: string, limit: number) => void>;  // string

// Distributive conditional types
type Nullable<T> = T extends null | undefined ? never : T;
type Clean = Nullable<string | null | undefined | number>;  // string | number
```

---

## Mapped Types

```ts
// Make all fields optional and readonly
type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

// Create event handler map from event union
type EventHandlers<T extends { type: string }> = {
  [K in T['type']]: (event: Extract<T, { type: K }>) => void;
};

type AppEvent =
  | { type: 'USER_LOGIN';  userId: string }
  | { type: 'PAGE_VIEW';   path: string }
  | { type: 'PURCHASE';    amount: number };

const handlers: EventHandlers<AppEvent> = {
  USER_LOGIN: ({ userId }) => console.log(userId),
  PAGE_VIEW:  ({ path })   => analytics.track(path),
  PURCHASE:   ({ amount }) => metrics.record(amount),
};
```

---

## Template Literal Types

```ts
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
type Endpoint = `/${string}`;
type Route = `${HttpMethod} ${Endpoint}`;

const routes: Route[] = ['GET /users', 'POST /orders'];
const invalid: Route = 'FETCH /data';  // ❌ TypeScript error

// CSS property builder
type CSSProperty = `${string}-${'color' | 'size' | 'weight'}`;
```

---

## satisfies Operator (TS 4.9+)

```ts
// satisfies: validate type without widening — keeps literal inference
const config = {
  port: 3000,
  env: 'production',
  db: { host: 'localhost', port: 5432 },
} satisfies Partial<AppConfig>;

config.port;  // type: number (not widened to AppConfig['port'])
config.env;   // type: 'production' (literal, not string)

// vs `as AppConfig` — that would lose literal types
// vs `: AppConfig` — that would accept missing fields
```

---

## Type Guards

```ts
// User-defined type guard
function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && error !== null
    && 'code' in error && 'message' in error;
}

try {
  await api.call();
} catch (err) {
  if (isApiError(err)) {
    console.log(err.code);    // typed as ApiError
  } else {
    throw err;
  }
}

// Assertion function (throws instead of returning false)
function assertDefined<T>(val: T | undefined, name: string): asserts val is T {
  if (val === undefined) throw new Error(`${name} must be defined`);
}
```

---

## Anti-Fake-Pass Rules

Before claiming TypeScript types are production-quality, you MUST show:
- [ ] `strict: true` enabled — no partial strict mode
- [ ] No `any` in public APIs — use `unknown` + type guards instead
- [ ] No unchecked `as T` casts — add runtime assertion or type guard
- [ ] IDs use branded types — no mixing of `string` ID domains
- [ ] State machines use discriminated unions — no `boolean` flag soup
- [ ] All `switch` statements over discriminated unions are exhaustive

Reference: `gates/anti-fake-pass-gate.md`
