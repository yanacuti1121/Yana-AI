# core/hooks — Safety & Runtime Guard Layer

Hooks are the lowest-level enforcement layer. They fire before/during/after tool use and intercept destructive, risky, or out-of-scope actions.

## Rules for working in this directory

- Do not modify a hook without first understanding its trigger event and expected stdin payload.
- Every new hook must have at least one test in `core/tests/hooks/`.
- Hooks must never silently allow a risky action — either block (exit 2 with deny decision) or warn (additionalContext) explicitly.
- Hooks must fail loudly or warn loudly. A hook that does nothing without explanation is worse than no hook.
- Do not hardcode machine-specific paths, secrets, or personal tokens in any hook.
- Hook output must be valid JSON if it returns a decision (use `jq -n` to generate). Plain text output is only acceptable for non-blocking advisory hooks (e.g. truth-gate-guard.sh stdout).

## Hook anatomy

```
stdin  → JSON event payload (tool_name, tool_input, etc.)
stdout → hookSpecificOutput JSON  (for blocking hooks)
        or plain text advisory    (for non-blocking hooks)
exit 0 → pass through (no decision)
exit 2 → enforce decision (approve or deny)
```

## Bypass convention

Every hook that can block must respect a `YANA_*_BYPASS=1` env var. Document it in the hook header.

## Before adding a new hook

1. Check that no existing hook already covers the case.
2. Confirm the Claude Code hook event that fires at the right time.
3. Write the test first — at minimum: one block case, one allow case, one bypass case.
4. Add the hook to `core/scripts/drift-check.sh` count if adding changes the total.
