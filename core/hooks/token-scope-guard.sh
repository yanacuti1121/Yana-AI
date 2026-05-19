#!/usr/bin/env bash
# YAMTAM ENGINE Hook
# Version: 1.3.22
# Status: active
# Description: Warn when agent accesses token/secret files
# Last Reviewed: 2026-05-19
# PreToolUse hook — Token Scope Guard
# YAMTAM ENGINE v1.3.15 — Token Scope Guard
#
# Lesson from PocketOS (April 2026): the agent went looking for an API token
# and found one "in an unrelated file", then used it to delete production.
#
# This hook warns when agents read or grep for files containing secrets/tokens
# that look unrelated to the current work area. It is advisory — not a hard
# security boundary. Real protection requires proper secret scoping at the
# infrastructure level (vault, env separation, scoped tokens).
#
# Behavior:
#   - Watch Read/Grep/Glob/Bash for patterns: .env*, secrets, API_*, TOKEN, KEY
#   - Warn (decision: warn) — does not block
#   - Logs to .claude/state/token-scope.log for review
#
# Bypass:
#   YAMTAM_TOKEN_SCOPE_OK=1 — for legitimate secret-handling tasks (deploy, etc)
#
# Fails open on parse errors.

set -uo pipefail
command -v jq >/dev/null 2>&1 || exit 0

[[ "${YAMTAM_TOKEN_SCOPE_OK:-}" == "1" ]] && exit 0

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')

# Only watch tools that can READ files or env
case "$TOOL_NAME" in
  Read|Grep|Glob|Bash) ;;
  *) exit 0 ;;
esac

# Extract the target the tool is operating on
TARGET=""
case "$TOOL_NAME" in
  Read)
    TARGET=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
    ;;
  Grep|Glob)
    PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern // ""')
    PATH_ARG=$(echo "$INPUT" | jq -r '.tool_input.path // ""')
    TARGET="$PATTERN $PATH_ARG"
    ;;
  Bash)
    TARGET=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
    ;;
esac

[[ -z "$TARGET" ]] && exit 0

# Check for sensitive patterns
SUSPICIOUS=""
if echo "$TARGET" | grep -qiE '\.env(\.|\b)|\bsecrets?\b|\bcredentials?\b|\bAPI[_-]?TOKEN\b|\bRAILWAY[_-]?TOKEN\b|\bVERCEL[_-]?TOKEN\b|\bAWS[_-]?ACCESS|\bSECRET[_-]?KEY\b|\bPRIVATE[_-]?KEY\b'; then
  SUSPICIOUS="secret/token reference"
fi

# Bash commands that scan for tokens
if [[ "$TOOL_NAME" == "Bash" ]] && echo "$TARGET" | grep -qiE 'grep.*-r.*token|grep.*-r.*secret|grep.*-r.*api[_-]?key|find.*\.env|find.*secret'; then
  SUSPICIOUS="bulk secret scan"
fi

[[ -z "$SUSPICIOUS" ]] && exit 0

# Log it
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
mkdir -p "$STATE_DIR" 2>/dev/null || true
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
AGENT=$(echo "$INPUT" | jq -r '.agent_name // "manual"')
printf '%s | tool=%s | agent=%s | suspicion=%s | target=%s\n' \
  "$TS" "$TOOL_NAME" "$AGENT" "$SUSPICIOUS" "${TARGET:0:200}" \
  >> "$STATE_DIR/token-scope.log"

# Warn but allow (intentionally not blocking — too many legit uses)
jq -n --arg s "$SUSPICIOUS" --arg t "${TARGET:0:200}" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext: ("⚠️  Token scope warning: " + $s + " detected (" + $t + "). The PocketOS incident (April 2026) was caused by an agent finding an unrelated API token and using it to destroy production. Make sure this read is intentional and within current task scope. Set YAMTAM_TOKEN_SCOPE_OK=1 to silence for one command. Logged to .claude/state/token-scope.log.")
  }
}'
exit 0
