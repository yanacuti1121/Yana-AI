---
name: auto-feedback-loop
description: >
  Implement self-correcting agent loops — run tests, capture failures,
  feed error context back to the writing agent, and repeat until pass
  or max-attempts reached. Inspired by Microsoft AutoGen's multi-agent
  reflection pattern. Use when asked about "auto-feedback loop",
  "self-correcting agent", "AutoGen reflection", "agent retry on failure",
  "tdd feedback loop", "automatic fix loop", "agent keeps fixing until
  tests pass", "feedback-loop script", "run-until-green", or "agent
  self-correction". Do NOT use for: one-shot test runs — see tdd-workflow.
  Do NOT use for: multi-agent task assignment — see ai-team-workflow.
origin: adapted:MIT © Microsoft/AutoGen
license: MIT © 2026 Vũ Văn Tâm
version: 1.0.0
compatibility: "bash ≥ 5, Claude Code agent. Any test runner."
---

## When to Use

- Use when: an agent writes code that fails tests, needs to self-correct without human
- Use when: wiring `/tdd-cycle` to run continuously until all checks pass
- Use when: building a CI gate that lets the agent fix its own failures
- Do NOT use for: infinite retry loops — always set a max attempt limit
- Do NOT use for: human-in-the-loop correction — this is fully automated

---

## The AutoGen Reflection Pattern

```
Writer Agent  ──► produces output
                        │
                        ▼
              Critic/Test Agent runs checks
                        │
              ┌─────────┴─────────┐
              │ PASS              │ FAIL
              ▼                   ▼
           accept           extract error context
                                  │
                                  ▼
                       feed error back to Writer
                                  │
                                  ▼
                       Writer revises output
                                  │
                            loop (max N)
```

---

## feedback-loop.sh — The Core Script

```bash
#!/usr/bin/env bash
# core/scripts/feedback-loop.sh
# Usage: bash core/scripts/feedback-loop.sh <test-cmd> <max-attempts>
# Example: bash core/scripts/feedback-loop.sh "npm test" 5

set -uo pipefail

TEST_CMD="${1:-npm test}"
MAX_ATTEMPTS="${2:-5}"
SIGNAL_DIR=".claude/signals"
mkdir -p "$SIGNAL_DIR"

attempt=1
while [[ $attempt -le $MAX_ATTEMPTS ]]; do
  echo "=== Attempt $attempt / $MAX_ATTEMPTS ==="

  # Run tests, capture output
  set +e
  OUTPUT=$(eval "$TEST_CMD" 2>&1)
  EXIT_CODE=$?
  set -e

  if [[ $EXIT_CODE -eq 0 ]]; then
    echo "✅ PASS on attempt $attempt"
    rm -f "$SIGNAL_DIR/feedback.pending"
    echo '{"status":"pass","attempt":'"$attempt"'}' > "$SIGNAL_DIR/feedback.done"
    exit 0
  fi

  echo "❌ FAIL (exit $EXIT_CODE) — extracting error context"

  # Write structured feedback for the agent to read
  jq -n \
    --arg cmd "$TEST_CMD" \
    --arg output "$OUTPUT" \
    --argjson attempt "$attempt" \
    --argjson max "$MAX_ATTEMPTS" \
    '{
      status: "fail",
      attempt: $attempt,
      max_attempts: $max,
      test_command: $cmd,
      error_output: $output,
      instruction: "Read the error_output above. Fix the failing tests. Do not change test assertions — fix the implementation. Then signal ready."
    }' > "$SIGNAL_DIR/feedback.pending"

  echo "Feedback written to $SIGNAL_DIR/feedback.pending"
  echo "Waiting for agent to fix and signal..."

  # Wait for agent to signal it has applied a fix
  rm -f "$SIGNAL_DIR/fix.applied"
  until [[ -f "$SIGNAL_DIR/fix.applied" ]]; do sleep 2; done
  rm -f "$SIGNAL_DIR/fix.applied"

  attempt=$((attempt + 1))
done

echo "💥 MAX ATTEMPTS ($MAX_ATTEMPTS) REACHED — escalating"
echo '{"status":"exhausted","attempts":'"$MAX_ATTEMPTS"'}' > "$SIGNAL_DIR/feedback.done"
exit 1
```

---

## Agent-Side: Read Feedback + Fix + Signal

```bash
# Agent reads the pending feedback and acts on it
FEEDBACK=$(cat .claude/signals/feedback.pending)

# Extract error context
ERROR_OUTPUT=$(echo "$FEEDBACK" | jq -r '.error_output')
ATTEMPT=$(echo "$FEEDBACK" | jq -r '.attempt')

echo "=== Fix attempt $ATTEMPT ==="
echo "Errors to fix:"
echo "$ERROR_OUTPUT" | head -50

# Agent applies fix (this is where Claude reads + edits files)
# ... agent writes its fix to the codebase ...

# Signal that fix has been applied
echo '{"agent":"code-agent","fix_applied":true,"ts":"'$(date -Iseconds)'"}' \
  > .claude/signals/fix.applied
```

---

## Wiring into /tdd-cycle

```markdown
<!-- In a Claude Code session — invoke the loop -->
Use the feedback-loop script to run skill trigger tests until they all pass.
Max 3 attempts.

1. Run: bash core/scripts/feedback-loop.sh "bash core/tests/skills/test-skill-triggering.sh" 3
2. If FAIL: read .claude/signals/feedback.pending, fix the SKILL.md trigger phrases
3. Signal: echo '{}' > .claude/signals/fix.applied
4. Loop repeats until PASS or max attempts
```

---

## Inline (No Script) — Python Pattern

```python
# Programmatic feedback loop for agents using tool calls
MAX_ATTEMPTS = 5

for attempt in range(1, MAX_ATTEMPTS + 1):
    result = run_tests()

    if result.passed:
        print(f"✅ Passed on attempt {attempt}")
        break

    # Extract the most relevant error lines
    error_summary = extract_errors(result.output, max_lines=30)

    # Feed structured feedback to next iteration
    context = f"""
Attempt {attempt}/{MAX_ATTEMPTS} failed.

Test output:
{error_summary}

Fix the implementation to make these tests pass.
Do NOT modify test assertions.
"""
    apply_fix(context)   # agent reads this and edits files

else:
    raise RuntimeError(f"Tests still failing after {MAX_ATTEMPTS} attempts")
```

---

## Anti-Fake-Pass Rules

Before claiming auto-feedback loop is working, you MUST show:
- [ ] `MAX_ATTEMPTS` is finite — no unbounded loop
- [ ] Error output is captured and included in feedback — not just "tests failed"
- [ ] Fix signal is consumed (deleted) each cycle — no stale signal from prior run
- [ ] Loop exits with non-zero code when max attempts exceeded
- [ ] Agent's fix scope is constrained — tests are not modified, only implementation

Reference: `gates/anti-fake-pass-gate.md`
