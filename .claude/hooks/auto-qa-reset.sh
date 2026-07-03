#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Reset QA state after test run
# Last Reviewed: 2026-05-19
# PostToolUse hook — resets the Auto-QA iteration counter when tests pass.
#
# When a Bash command that looks like a test runner exits with code 0,
# resets the counter so the next backend commit starts fresh.
# Prevents the counter from carrying over between unrelated features.

set -uo pipefail

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
[[ "$TOOL_NAME" != "Bash" ]] && exit 0

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
EXIT_CODE=$(echo "$INPUT" | jq -r '.tool_response.exit_code // -1')

# Only reset on passing test runs
if ! echo "$COMMAND" | grep -qE '(vitest|jest|pytest|go test|playwright|npm test|pnpm test|make test)'; then
  exit 0
fi

[[ "$EXIT_CODE" != "0" ]] && exit 0

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
COUNTER_FILE="$PROJECT_ROOT/.claude/auto-qa-count.txt"

echo "0" > "$COUNTER_FILE" 2>/dev/null || true
exit 0
