#!/usr/bin/env bash
# YAMTAM ENGINE Hook
# Version: 1.3.26
# Status: active
# Description: Log context gate decisions for audit
# Last Reviewed: 2026-05-19
# PostToolUse hook — logs Read tool calls to the session read-log.
#
# Every time Claude reads a file, this hook appends the resolved path
# to .claude/session-read-log.txt. The context-gate.sh PreToolUse hook
# checks this log before allowing Write/Edit operations.
#
# Fails open on any error — logging is advisory, never blocking.

set -uo pipefail

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')

[[ "$TOOL_NAME" != "Read" ]] && exit 0

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // ""')
[[ -z "$FILE_PATH" ]] && exit 0

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
READ_LOG="$PROJECT_ROOT/.claude/session-read-log.txt"

# Resolve to absolute path
if [[ "$FILE_PATH" != /* ]]; then
  FILE_PATH="$PROJECT_ROOT/$FILE_PATH"
fi

# Append to log (create if needed), deduplicate
touch "$READ_LOG"
if ! grep -qF "$FILE_PATH" "$READ_LOG" 2>/dev/null; then
  echo "$FILE_PATH" >> "$READ_LOG"
fi

exit 0
