#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Hook Timeout Guard — kill any hook running longer than YANA_HOOK_TIMEOUT seconds
# Hook type: PreToolUse (wraps execution of other hooks via subshell)
# Last Reviewed: 2026-05-23
# Bypass: YANA_TIMEOUT_BYPASS=1
# Requires: bash 4+

set -uo pipefail

[[ "${YANA_TIMEOUT_BYPASS:-0}" == "1" ]] && exit 0

TIMEOUT="${YANA_HOOK_TIMEOUT:-30}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
LOG="$STATE_DIR/hook-timeouts.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p "$STATE_DIR"

# Read stdin (tool event payload)
TMP_INPUT=$(mktemp)
cat > "$TMP_INPUT"
trap 'rm -f "$TMP_INPUT"' EXIT

TOOL_NAME=$(python3 -c "import json,sys; d=json.load(open('$TMP_INPUT')); print(d.get('tool_name','unknown'))" 2>/dev/null || echo "unknown")

# If YANA_GUARDED_HOOK is set, we're running as the inner hook — enforce timeout on self
if [[ -n "${YANA_GUARDED_HOOK:-}" ]]; then
  HOOK_SCRIPT="$YANA_GUARDED_HOOK"
  if [[ ! -r "$HOOK_SCRIPT" ]]; then
    exit 0
  fi

  # BUG FIX (2026-07-04): macOS ships neither `timeout` nor `gtimeout` by
  # default (GNU coreutils isn't installed unless the user ran `brew
  # install coreutils`). Without this fallback, the line below failed
  # with "timeout: command not found" (exit 127) BEFORE $HOOK_SCRIPT was
  # ever invoked — bash treats `timeout N bash script` as one command,
  # and if `timeout` isn't found, none of it runs. Net effect: every
  # guarded hook wrapped by this script (all 15 in .claude/settings.json
  # — guard-destructive.sh, audit-log.sh, token-budget-guard.sh,
  # per-tool-circuit-breaker.sh, etc.) silently never executed on any
  # machine lacking coreutils, with no error surfaced to the session.
  # Confirmed directly: .claude/state/audit-chain.log had zero entries
  # despite a full multi-hour session of tool calls that should each
  # have logged one. Degraded mode (no timeout binary found) still runs
  # the wrapped hook — just without the hard timeout kill — and logs the
  # degradation so it stays discoverable instead of silently recurring.
  TIMEOUT_BIN="$(command -v timeout || command -v gtimeout || true)"

  if [[ -n "$TIMEOUT_BIN" ]]; then
    "$TIMEOUT_BIN" "$TIMEOUT" bash "$HOOK_SCRIPT" "$@" < "$TMP_INPUT"
    EXIT_CODE=$?
  else
    echo "{\"ts\":\"$TIMESTAMP\",\"hook\":\"$HOOK_SCRIPT\",\"tool\":\"$TOOL_NAME\",\"action\":\"degraded-no-timeout-binary\"}" >> "$LOG" 2>/dev/null || true
    bash "$HOOK_SCRIPT" "$@" < "$TMP_INPUT"
    EXIT_CODE=$?
  fi

  if [[ $EXIT_CODE -eq 124 ]]; then
    echo "{\"ts\":\"$TIMESTAMP\",\"hook\":\"$HOOK_SCRIPT\",\"tool\":\"$TOOL_NAME\",\"timeout\":$TIMEOUT,\"action\":\"killed\"}" >> "$LOG" 2>/dev/null || true
    python3 -c "
import json, sys
print(json.dumps({
  'decision': 'deny',
  'reason': '[hook-timeout-guard] Hook exceeded ${TIMEOUT}s timeout and was killed: $HOOK_SCRIPT',
  'tool': '$TOOL_NAME'
}))
sys.exit(2)
"
  fi
  exit $EXIT_CODE
fi

# Default: pass through (this hook is advisory when not wrapping another hook)
exit 0
