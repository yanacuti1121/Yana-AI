---
name: code-review-checklist
description: Systematic code review checklist — correctness, security, performance, maintainability, AI-specific anti-patterns
triggers:
  - code review checklist
  - review code
  - pr review
  - code review ai
  - review checklist
  - code quality checklist
  - review diff
  - pre-merge checklist
  - code audit checklist
do_not_use_for:
  - security-only audit — use security-reviewer
  - automated static analysis — use code-quality-gate
  - test writing — use tdd-guide
see_also:
  - ai-code-maintainability
  - error-handling-patterns
  - type-safety-patterns
  - testing-strategy
---

# Code Review Checklist

## Quick-Scan (< 2 min, every PR)

```
□ Does the diff do what the PR description says?
□ Are there obvious logic errors or off-by-one mistakes?
□ Is there any hardcoded credential / API key?
□ Does it add tests for new behavior?
□ Are error paths handled (not just the happy path)?
```

## Correctness

```
□ Edge cases: empty list, null/None, zero, negative, max value
□ Concurrent access: shared state without locking?
□ Off-by-one: range(n) vs range(n+1), <= vs <, 0-indexed vs 1-indexed
□ Mutation: are shared objects mutated? Should they be copied first?
□ Return values: are all return paths typed and handled by callers?
□ Async correctness: is every await awaited? Any fire-and-forget that should be awaited?
□ DB transactions: are related writes in the same transaction?
```

## Security

```
□ No secrets in code, comments, or test fixtures
□ User input validated before use (SQL params, shell args, file paths)
□ No path traversal: open(user_path) must be sanitized
□ No eval() / exec() / Function() with user input
□ Auth checks present on every new endpoint
□ Error messages don't leak stack traces or internal info to clients
□ Dependencies: is this a new package? Has it been vetted?
```

## Performance

```
□ N+1 queries: attribute access on related objects inside a loop?
□ Missing index: new WHERE or JOIN column without index?
□ Unbounded queries: SELECT * without LIMIT?
□ Tight loops: expensive operations (API calls, file I/O) inside a loop?
□ Memory: large data structures built in memory that could be streamed?
□ Caching opportunity: repeated identical computation that could be cached?
```

## Maintainability

```
□ Functions ≤ 50 lines, files ≤ 300 lines
□ Magic numbers → named constants
□ Clear variable names (not: d, tmp, res, x)
□ No deep nesting (≤ 3 levels) — use early returns
□ No commented-out code (delete it or track in TODO.md)
□ Duplication: is this logic copied from elsewhere? Should it be extracted?
□ Type hints present on all public functions
```

## AI-Generated Code Specific

```
□ No bare except: / except Exception: pass
□ No time.sleep() in polling loop (use event-driven or backoff)
□ Timeouts on all network calls (requests.get(url, timeout=10))
□ Retry logic on flaky external calls
□ No print() in server-side code (use logger)
□ Mutable defaults: def f(x=[]): — is it []? {}? []?
□ No hardcoded localhost or 127.0.0.1 in non-test code
□ N+1 check: any ORM attribute access inside for loop?
□ Resource cleanup: file handles, DB sessions, HTTP clients — are they closed?
```

## Testing

```
□ New behavior has at least one test
□ Tests cover the error path, not just the happy path
□ Test names describe what they test ("test_charge_fails_on_invalid_card")
□ No test.only() / pytest.mark.skip without explanation
□ Mocks are minimal — not mocking domain logic
```

## Review Comment Quality

```
# Instead of: "this is wrong"
# Write:
# - What is the problem?
# - Why does it matter?
# - Suggested fix (or direction)

# Example:
# ⚠ This mutates the shared `config` dict — if called concurrently, 
# second caller sees half-written state. Use `{**config, "key": value}` 
# to return a new dict instead.
```

## Severity Labels

```
🚨 CRITICAL — security vulnerability, data loss, crashes in production; must fix before merge
⚠️ WARN — bug or significant quality issue; should fix before merge
💡 SUGGEST — improvement, not a requirement; can fix or decline
📝 NOTE — information only, no action needed
```

## Anti-Fake-Pass Checks

- "Looks good" without reading the logic = not a review
- Checking only the changed lines = missing context bugs
- Skipping tests because "it's a small change" = how regressions happen
- Approving your own PR (where possible to block) = no second pair of eyes
- Rubber-stamping AI-generated code = the AI knew it would pass review so it wrote "just enough"
