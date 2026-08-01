#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Block commits when code freeze flag is active
# Last Reviewed: 2026-05-19
# PreToolUse hook — Code Freeze enforcement
# Code Freeze Guard
#
# Reads .claude/state/CODE_FREEZE. If file exists with content "on", blocks
# ALL Write/Edit/Bash operations except read-only. This is a kill switch
# for emergencies — like when you go to sleep and don't want agents to
# touch anything until you wake up.
#
# Usage:
#   .claude/scripts/code-freeze.sh on    # turn on (set state)
#   .claude/scripts/code-freeze.sh off   # turn off
#   .claude/scripts/code-freeze.sh status

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_FILE="$PROJECT_DIR/.claude/state/CODE_FREEZE"

[[ ! -f "$STATE_FILE" ]] && exit 0

state=$(tr -d '[:space:]' < "$STATE_FILE" 2>/dev/null || echo "")
[[ "$state" != "on" ]] && exit 0

if ! command -v jq >/dev/null 2>&1; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"CODE FREEZE active and jq is missing. Cannot determine which operations are safe — blocking all. Run .claude/scripts/code-freeze.sh off to disable."}}
JSON
  exit 2
fi

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')

# Allow read-only operations even during freeze
case "$TOOL_NAME" in
  Read|Glob|Grep|NotebookRead)
    exit 0
    ;;
esac

# For Bash, only allow read-only commands
if [[ "$TOOL_NAME" == "Bash" ]]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
  # Allowlist of clearly read-only commands
  if echo "$CMD" | grep -qE '^(ls|cat|head|tail|grep|find|wc|git status|git diff|git log|git branch|pwd|echo|which|node --check|python3 --version)\b'; then
    exit 0
  fi
fi

# Block everything else
jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "🧊 CODE FREEZE active. All write operations blocked. Read-only commands (ls, cat, grep, git status) are still allowed. To unfreeze: .claude/scripts/code-freeze.sh off"
  }
}'
exit 2
