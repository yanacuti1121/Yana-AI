---
name: error-handling
description: >
  Design structured application error handling — error type hierarchy,
  error codes, propagation strategy (throw vs return), user-facing vs
  internal messages, HTTP error response format, async error safety,
  and React error boundaries. Use when asked to "improve error handling",
  "structured errors", "error codes", "error types", "don't swallow errors",
  "unhandled promise rejection", "error boundary", "error response format",
  "what to show users when something fails", or before shipping any feature
  that calls external services or parses user input.
  Do NOT use for: logging infrastructure — see observability-instrumentation.
  Do NOT use for: resilience retry/circuit-breaker — see resilience-patterns.
origin: yamtam-original
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "Node.js ≥ 18, TypeScript ≥ 5, React ≥ 18. Patterns apply to any language."
---

## When to Use

- Use when: a feature calls external APIs, parses files, or touches a DB
- Use when: error messages leak stack traces or internal details to users
- Use when: errors are silently caught (`catch {}`) and swallowed
- Use when: designing a new service's error contract before writing handlers
- Do NOT use for: retry / fallback logic — that's resilience-patterns
- Do NOT use for: structured log schema — that's observability-instrumentation

---

## Error Type Hierarchy

```
Operational errors   — expected at runtime; handle and recover
  NetworkError       — connection timeout, DNS failure
  ValidationError    — bad user input, schema mismatch
  NotFoundError      — resource doesn't exist
  AuthError          — unauthenticated / unauthorized
  ConflictError      — optimistic lock, duplicate key

Programmer errors    — bugs; crash fast, don't catch
  TypeError, RangeError, AssertionError
  → Let them propagate; fix the code, not the handler
```

**Never catch a programmer error and continue** — it hides bugs and corrupts state.

---

## Structured Error Class (TypeScript)

```ts
export class AppError extends Error {
  constructor(
    public readonly code: string,       // machine-readable: "USER_NOT_FOUND"
    public readonly message: string,    // internal message (logs)
    public readonly statusCode: number, // HTTP status
    public readonly userMessage: string = 'An unexpected error occurred.',
    public readonly context?: Record<string, unknown>, // attach request ID, userId, etc.
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Typed subclasses
export class NotFoundError extends AppError {
  constructor(resource: string, id: string | number) {
    super('NOT_FOUND', `${resource} ${id} not found`, 404, `${resource} not found.`);
  }
}

export class ValidationError extends AppError {
  constructor(field: string, reason: string) {
    super('VALIDATION_ERROR', `Validation failed: ${field} — ${reason}`, 400,
      `Invalid input: ${reason}`);
  }
}

export class AuthError extends AppError {
  constructor(reason = 'Unauthorized') {
    super('UNAUTHORIZED', reason, 401, 'Please log in to continue.');
  }
}
```

---

## HTTP Error Response Format

```ts
// Consistent envelope — never expose stack trace or DB errors to clients
interface ErrorResponse {
  error: {
    code:       string;   // "USER_NOT_FOUND"
    message:    string;   // user-safe message
    requestId:  string;   // for support correlation
    timestamp:  string;   // ISO 8601
    details?:   unknown;  // validation field errors only
  };
}

// Express global error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const requestId = req.headers['x-request-id'] as string ?? crypto.randomUUID();

  if (err instanceof AppError) {
    logger.warn({ code: err.code, message: err.message, requestId, context: err.context });
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.userMessage, requestId, timestamp: new Date().toISOString() }
    });
  }

  // Programmer error or unknown — log full stack, return 500
  logger.error({ err, requestId, stack: err.stack });
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', requestId, timestamp: new Date().toISOString() }
  });
});
```

---

## Async Error Safety

```ts
// ✅ Always await inside try/catch — floating promises swallow errors
async function processOrder(orderId: string) {
  try {
    const order = await db.orders.findById(orderId);
    if (!order) throw new NotFoundError('Order', orderId);
    await payment.charge(order);
  } catch (err) {
    if (err instanceof AppError) throw err;          // re-throw operational errors
    throw new AppError('PAYMENT_FAILED', String(err), 502, 'Payment could not be processed.');
  }
}

// ✅ Crash on unhandled rejection — let process manager restart
process.on('unhandledRejection', (reason) => {
  logger.error({ event: 'unhandledRejection', reason });
  process.exit(1);
});
// ❌ someAsyncFn().catch(() => {}) — errors disappear silently
```

---

## React Error Boundaries

```tsx
class ErrorBoundary extends React.Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean; errorId: string }
> {
  state = { hasError: false, errorId: '' };

  static getDerivedStateFromError() {
    return { hasError: true, errorId: crypto.randomUUID() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error({ error: error.message, componentStack: info.componentStack,
                   errorId: this.state.errorId });
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// Wrap at feature boundaries, not just the root
<ErrorBoundary fallback={<CheckoutErrorFallback />}>
  <CheckoutFlow />
</ErrorBoundary>
```

---

## Common Anti-Patterns

| Anti-pattern | Fix |
|---|---|
| `catch (e) {}` — silent swallow | Always log at minimum; re-throw if unrecoverable |
| `catch (e) { return null }` | Caller can't distinguish "not found" from "failed" — throw typed error |
| Leak stack trace in API response | Use `userMessage`; log full error server-side only |
| `instanceof Error` in catch | Use typed subclasses; `instanceof AppError` + `err.code` checks |
| Error string matching (`err.message.includes(...)`) | Use `err.code` — messages change, codes are contracts |
| Generic "Something went wrong" for all errors | Map error codes to actionable user messages |

---

## Anti-Fake-Pass Rules

Before claiming error handling is done, you MUST show:
- [ ] Typed error class used — not raw `new Error('string')` for operational errors
- [ ] User-facing message is safe — no stack traces, no SQL, no internal paths
- [ ] HTTP status codes are correct — 400 for client errors, 500 for server errors
- [ ] `requestId` included in error responses — enables support correlation
- [ ] No silent `catch {}` blocks — every catch logs or re-throws
- [ ] Unhandled rejection handler registered at process/app root
- [ ] Error boundary wrapping any component that fetches data (React apps)

Reference: `gates/anti-fake-pass-gate.md`
