#!/usr/bin/env bash
# YAMTAM ENGINE Hook
# Version: 1.3.26
# Status: active
# Description: Trigger QA pipeline automatically on code changes
# Last Reviewed: 2026-05-19
# PostToolUse hook — signals Auto-QA loop after backend implementation commits.
#
# When a backend-developer commits code touching API routes or business logic,
# this hook signals Claude to invoke the qa-engineer automatically.
# The qa-engineer writes tests, runs them, and if they fail, the loop
# returns the log to the backend-developer for fixes.
#
# GUARDRAILS (critical — without these the loop runs forever):
#   - Maximum 3 iterations per trigger. After 3, escalate to human.
#   - Only triggers on commits with scope "feat" or "fix" in the message.
#   - Only triggers when API or service layer files are in the diff.
#   - Does NOT trigger on test file commits (avoids meta-loops).
#   - Does NOT trigger on docs, chore, refactor commits.
#
# Fails open — never blocks a commit.

set -uo pipefail

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
[[ "$TOOL_NAME" != "Bash" ]] && exit 0

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
if ! echo "$COMMAND" | grep -qE '^git commit|git commit '; then
  exit 0
fi

EXIT_CODE=$(echo "$INPUT" | jq -r ".tool_response.exit_code // .tool_output.exit_code // 0")
[[ "$EXIT_CODE" != "0" ]] && exit 0

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Get the commit message
COMMIT_MSG=$(git -C "$PROJECT_ROOT" log -1 --format="%s" 2>/dev/null || echo "")

# Only trigger on feat/fix commits (not chore, docs, refactor, test, style)
if ! echo "$COMMIT_MSG" | grep -qE '^(feat|fix)\('; then
  exit 0
fi

# Do not trigger on test file commits
if echo "$COMMIT_MSG" | grep -qiE '\(test|spec\)'; then
  exit 0
fi

# Check which files changed in this commit
CHANGED_FILES=$(git -C "$PROJECT_ROOT" diff-tree --no-commit-id -r --name-only HEAD 2>/dev/null || echo "")

# Only trigger if backend/API files changed
# Adjust these patterns to match your project structure
BACKEND_PATTERN='(src/api|src/lib|server/|internal/|pkg/|routes/|handlers/|services/|controllers/|\.claude/|docs/)'
if ! echo "$CHANGED_FILES" | grep -qE "$BACKEND_PATTERN"; then
  exit 0
fi

# Do not trigger if only test files changed
NON_TEST=$(echo "$CHANGED_FILES" | grep -vE '\.(spec|test)\.(ts|tsx|js|py)$' | grep -vE '_test\.go$' || echo "")
[[ -z "$NON_TEST" ]] && exit 0

# Check Auto-QA iteration counter (persisted in .claude/auto-qa-count.txt)
COUNTER_FILE="$PROJECT_ROOT/.claude/auto-qa-count.txt"
CURRENT_COUNT=0
if [[ -f "$COUNTER_FILE" ]]; then
  CURRENT_COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")
fi

MAX_ITERATIONS=3

if (( CURRENT_COUNT >= MAX_ITERATIONS )); then
  # Reset counter and escalate
  echo "0" > "$COUNTER_FILE"
  cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "⚠️  Auto-QA ESCALATION: The QA loop has run $MAX_ITERATIONS times without passing. Stopping automatic iteration. Human review required before continuing. Check the latest test output and decide whether to: (1) fix the root cause manually, (2) adjust the test expectations, or (3) skip these tests with documented justification. Do NOT invoke @qa-engineer again automatically."
  }
}
EOF
  exit 0
fi

# Increment counter
echo $((CURRENT_COUNT + 1)) > "$COUNTER_FILE"

AFFECTED_FILES=$(echo "$CHANGED_FILES" | grep -E "$BACKEND_PATTERN" | head -5 | tr '\n' ', ' | sed 's/,$//')

cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "🧪 Auto-QA trigger (iteration $((CURRENT_COUNT + 1))/$MAX_ITERATIONS): Backend commit detected — '$COMMIT_MSG'. Files: $AFFECTED_FILES. Invoke @qa-engineer now with: 'Write and run tests for the changes in commit: $COMMIT_MSG. Files changed: $AFFECTED_FILES. If tests fail, return the full failure log so @backend-developer can fix. This is Auto-QA iteration $((CURRENT_COUNT + 1)) of $MAX_ITERATIONS maximum.'"
  }
}
EOF
