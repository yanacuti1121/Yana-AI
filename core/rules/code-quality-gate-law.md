**Rule:** code-quality-gate-law
**Status:** ACTIVE
**Gate:** L2.5 — every Write/Edit tool call on code files
**Tier:** TIER 2 — CORRECTNESS

---

# Code Quality Gate Law

## The Problem

AI agents optimize for "make it work on first run." The result is code that:
- Has no error handling (bare `except: pass`)
- Uses magic numbers and hardcoded strings
- Replaces structured logging with `print()`
- Ignores edge cases (null, empty, timeout, retry)
- Creates hidden global state dependencies
- Has no type safety (`any`, untyped params)

These bugs do NOT appear on day 1. They appear during maintenance, on-call, or when
requirements change — when the original context is gone and no one understands the code.

## The Law

**Every code file written or modified by an agent MUST pass the quality gate before being committed.**

The gate is enforced by `core/hooks/code-quality-gate.sh` (PostToolUse hook).

## Score Thresholds

| Score | Status | Action |
|-------|--------|--------|
| 80–100 | PASS | Continue |
| 70–79 | WARN | Note violations, continue, fix before commit |
| 50–69 | WARN | Must fix violations before committing |
| 0–49 | BLOCK | Code cannot be committed — fix required |

## Mandatory Patterns (non-negotiable)

### Error Handling
```
REQUIRED: Every try/except catches specific exception types
REQUIRED: Every caught exception is logged with context (not silently swallowed)
REQUIRED: External API errors mapped to typed error types (not raw exceptions)
BANNED:   bare `except:` or `except Exception: pass`
BANNED:   `return None` after catching an exception without logging why
```

### Logging
```
REQUIRED: Use structured logger (logging.getLogger, winston, pino, zap)
REQUIRED: Log entries include: action, entity IDs, error context
BANNED:   print() / console.log() in production code paths
BANNED:   logger.error("failed") without identifying context
```

### Magic Values
```
REQUIRED: All numeric literals > 9 must be named constants with a comment explaining why
REQUIRED: All string literals used in comparisons must be named constants
BANNED:   time.sleep(300), setTimeout(60000) without named constant + comment
BANNED:   Hardcoded IP addresses, localhost URLs, file paths in production code
```

### Type Safety
```
REQUIRED: All function parameters and return values have type annotations (Python/TS)
REQUIRED: All TypeScript code uses strict mode
BANNED:   any type in TypeScript without a justification comment
BANNED:   Python function defs with untyped parameters in production code
```

### External Calls
```
REQUIRED: All HTTP/gRPC/DB calls have explicit timeout values
REQUIRED: All retriable errors use exponential backoff
BANNED:   requests.get(url) without timeout=
BANNED:   Polling loops with fixed time.sleep() without backoff
```

### State and Side Effects
```
REQUIRED: Write operations (DB insert, file write, API POST) are idempotent or guarded
REQUIRED: All resource handles (files, DB sessions, connections) use context managers
BANNED:   Mutable default arguments in Python function definitions
BANNED:   Global mutable state shared between modules
```

## Enforcement via Hook

`core/hooks/code-quality-gate.sh` fires as a PostToolUse hook on Write/Edit.

It scans for violations using regex patterns and assigns penalty points:

| Pattern | Penalty |
|---------|---------|
| Bare except | -20 |
| Silent except (pass) | -20 |
| Hardcoded secret/token | -30 |
| eval() call | -25 |
| any type in TS | -15 |
| No logging on error | -15 |
| Mutable default arg | -10 |
| console.log / print() | -8 to -10 |
| Magic sleep/timeout | -5 |
| TODO/FIXME left in | -5 |

## Agent Self-Check Before Writing

Before writing any function, agent MUST answer:

1. What happens when this fails? (error path designed?)
2. What happens with empty/null/zero input?
3. Does every exception get logged with enough context to debug at 3am?
4. Will someone understand this in 6 months without my current context?
5. Can I test this without real external systems?

If any answer is "I haven't thought about it" → design the answer first, then write code.

## References

- `core/hooks/code-quality-gate.sh` — PostToolUse scanner
- `core/skills/ai-code-maintainability/SKILL.md` — 15 anti-patterns with fixes
- `core/rules/agent-code-constraints.md` — metric limits (lines, nesting, params)
- `core/rules/golden-principles.md` — evidence-based completion, surgical changes
