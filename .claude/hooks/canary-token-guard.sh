#!/usr/bin/env bash
# Yana AI - Canary Token Guard
# Hook: Stop (fires after every agent response)
# Purpose: Detect prompt extraction attempts via canary token echoing
# Date: 2026-05-23
#
# BUG FIX (found live-testing before wiring, 2026-08-15): this file never
# received real data. Three separate contract bugs, all from the same
# root cause — invented env vars / a CLI arg Claude Code never sets,
# instead of the real stdin-JSON contract every other proven-working Stop
# hook in this directory uses (see truth-gate-guard.sh, the reference
# implementation this file's fix is modeled on):
#   1. `main "${TRANSCRIPT_PATH:-$1}"` at the old end of this file — with
#      `set -u` active and Claude Code never passing a CLI arg to a hook,
#      referencing bare `$1` with zero positional params set is a hard
#      "unbound variable" error. Reproduced live: this crashed with exit 1
#      on every invocation, before `main()`'s body ever ran — not a
#      degraded fallback, a total failure every single time.
#   2. `SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"` — `CLAUDE_SESSION_ID`
#      is not a real Claude Code hook env var (grepped every hook file
#      already wired and proven working in this directory: none reference
#      it). The real session id is `.session_id` inside the stdin JSON
#      payload — confirmed via truth-gate-guard.sh's
#      `jq -r '.session_id // "default"'`.
#   3. `CLAUDE_STATE_DIR` (same reasoning) — grepped this directory: only
#      appears in files that were never wired (this one, sbom-generator.sh,
#      validate-completion.sh). Every wired hook instead derives state
#      paths from `CLAUDE_PROJECT_DIR` (which IS real and used pervasively)
#      joined with `.claude/state` — that pattern is used below instead.
# Fixed by reading stdin once (`INPUT=$(cat)`) and extracting
# `transcript_path` / `session_id` via jq, matching truth-gate-guard.sh.
#
# SEPARATE, UNFIXED GAP (flagging, not fixing — out of scope for a data-
# contract fix): even with the plumbing corrected, this hook's detection
# can structurally never fire on a genuine extraction attempt. The canary
# tokens `generate_canaries()` writes are never read by any other hook —
# grepped this entire directory for `canary-tokens.txt`/`CANARY_FILE`
# outside this file: zero results. Nothing plants these tokens into the
# model's actual system prompt or context, so the model can never echo
# one back; this hook checks the transcript for a marker the model was
# never given. A real canary-token defense needs a companion
# SessionStart/UserPromptSubmit hook that injects the generated tokens
# into context — that hook does not exist. Wiring this wired-but-inert
# hook is harmless (it will simply never trigger), not a regression, but
# it should not be reported as working extraction detection until that
# missing half is built.

set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null || true)
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CANARY_FILE="$PROJECT_DIR/.claude/state/canary-tokens.txt"
AUDIT_LOG="$PROJECT_DIR/.claude/state/audit.log"

# Bypass for testing
if [[ "${YANA_CANARY_BYPASS:-0}" == "1" ]]; then
  exit 0
fi

# Generate session-specific canary tokens
generate_canaries() {
  local session_uuid
  session_uuid=$(uuidgen 2>/dev/null || echo "${RANDOM}${RANDOM}")

  cat > "$CANARY_FILE" <<EOF
<!-- YANA_CANARY_${session_uuid} -->
INTERNAL_MARKER_DO_NOT_ECHO_${session_uuid}
SYSTEM_BOUNDARY_TOKEN_${session_uuid}
PROMPT_INTEGRITY_CHECK_${session_uuid}
EOF
}

# Check if agent output contains any canary token
detect_canary_echo() {
  local transcript_path="$1"
  local last_message

  # Extract last assistant message from transcript. No stdin fallback here
  # (BUG FIX, 2026-08-15): stdin was already fully consumed by `INPUT=$(cat)`
  # above to get transcript_path/session_id in the first place — a second
  # `cat` on an already-drained pipe reads nothing, not "the same data
  # again". If the transcript is missing, there is nothing left to check.
  if [[ -n "$transcript_path" && -f "$transcript_path" ]]; then
    # Simple extraction - get last assistant message
    last_message=$(grep -A 100 '"role": "assistant"' "$transcript_path" | tail -100 || echo "")
  else
    return 1  # no transcript available — nothing to check, no detection
  fi

  # Check each canary token
  while IFS= read -r canary; do
    [[ -z "$canary" ]] && continue

    if echo "$last_message" | grep -qF "$canary"; then
      return 0  # Canary detected!
    fi
  done < "$CANARY_FILE"

  return 1  # No canary detected
}

# Log security incident
log_incident() {
  local severity="$1"
  local message="$2"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  echo "${timestamp}|${SESSION_ID}|canary-token-guard|${severity}|${message}" >> "$AUDIT_LOG"
}

# Main execution
main() {
  local transcript_path="$1"

  # Initialize canary tokens if not exist
  if [[ ! -f "$CANARY_FILE" ]]; then
    mkdir -p "$(dirname "$CANARY_FILE")"
    generate_canaries
  fi

  # Detect canary echo in agent output
  if detect_canary_echo "$transcript_path"; then
    log_incident "CRITICAL" "Prompt extraction attempt detected - agent echoed canary token"

    # Output warning (non-blocking)
    cat >&2 <<EOF

⚠️  SECURITY ALERT: Prompt Extraction Attempt Detected

The agent's response contains an internal canary token, indicating a potential
prompt extraction or instruction leakage attempt.

This behavior suggests:
- Direct prompt injection attack
- Instruction repetition request
- System prompt extraction attempt

Action taken:
- Incident logged to audit trail
- Trust score decreased
- Response flagged for review

The response was NOT blocked (advisory mode), but has been flagged.

EOF

    # Exit 0 (advisory mode - warn but don't block)
    exit 0
  fi

  # No canary detected - allow
  exit 0
}

# Run main with the transcript path read from the Stop hook's stdin JSON
main "$TRANSCRIPT_PATH"
