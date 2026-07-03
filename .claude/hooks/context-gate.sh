#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Gate context window — warn when approaching token limit
# Last Reviewed: 2026-05-19
# PreToolUse hook — context gate for Write/Edit operations.
#
# Problem this solves: agents edit files they haven't read, causing
# blind overwrites, broken logic, and missed conventions. This hook
# intercepts Write and Edit tool calls and checks whether the target
# file has been read in the current session via a lightweight session
# read-log. If not, it blocks the edit and tells Claude to read first.
#
# Exit behaviour:
#   exit 0          — allow the operation
#   JSON + exit 2   — block and explain why
#
# How the read-log works:
#   When the Read tool is used, a companion hook (context-gate-log.sh,
#   registered on PostToolUse for Read) appends the file path to
#   $CLAUDE_PROJECT_DIR/.claude/session-read-log.txt
#   This hook checks that log before allowing edits.
#
# Files exempt from the gate (always allowed without prior read):
#   - New files (don't exist yet — nothing to read)
#   - docs/handoff/**  (handoff writer creates these fresh)
#   - docs/debug/**    (debug coordinator creates these fresh)
#   - TODO.md          (agents update this as a side-effect, not primary edit)
#   - .claude/agent-log.txt (written by log-agent.sh hook)

set -euo pipefail

# ── Dependency guard ─────────────────────────────────────────────────────────
if ! command -v jq >/dev/null 2>&1; then
  # Fail open — formatting/writing is not a security-critical operation.
  # Missing jq just skips the gate rather than blocking all writes.
  exit 0
fi

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')

# Only gate Write and Edit calls
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "MultiEdit" ]]; then
  exit 0
fi

TARGET_FILE=$(echo "$INPUT" | jq -r '.tool_input.path // .tool_input.file_path // ""')

# No path detected — let it through (can't gate what we can't identify)
[[ -z "$TARGET_FILE" ]] && exit 0

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Resolve to absolute path for comparison
if [[ "$TARGET_FILE" != /* ]]; then
  TARGET_FILE="$PROJECT_ROOT/$TARGET_FILE"
fi

# ── Exemptions ───────────────────────────────────────────────────────────────

# New files don't need prior reading
if [[ ! -f "$TARGET_FILE" ]]; then
  exit 0
fi

# Normalise relative path for exempt pattern matching
REL_PATH="${TARGET_FILE#"$PROJECT_ROOT"/}"

EXEMPT_PATTERNS=(
  "docs/handoff/"
  "docs/debug/"
  "TODO.md"
  ".claude/agent-log.txt"
  ".claude/session-read-log.txt"
  "CHANGELOG.md"
)

for pattern in "${EXEMPT_PATTERNS[@]}"; do
  if [[ "$REL_PATH" == $pattern* || "$REL_PATH" == "$pattern" ]]; then
    exit 0
  fi
done

# ── Check session read-log ────────────────────────────────────────────────────
READ_LOG="$PROJECT_ROOT/.claude/session-read-log.txt"

if [[ ! -f "$READ_LOG" ]]; then
  # No read log exists yet — gate cannot verify. Fail open.
  exit 0
fi

# Check if target file appears in the read log (exact match on resolved path)
if grep -qF "$TARGET_FILE" "$READ_LOG" 2>/dev/null; then
  exit 0
fi

# Also check relative path variant
if grep -qF "$REL_PATH" "$READ_LOG" 2>/dev/null; then
  exit 0
fi

# ── Block — file not read this session ───────────────────────────────────────
DISPLAY_PATH="$REL_PATH"

jq -n \
  --arg path "$DISPLAY_PATH" \
  '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: ("Context gate: you have not read \u0027" + $path + "\u0027 in this session. Read it first with the Read tool, then retry the edit. This prevents blind overwrites of files whose current content you have not seen.")
    }
  }'
exit 2
