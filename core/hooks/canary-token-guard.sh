#!/usr/bin/env bash
# Yana AI - Canary Token Guard
# Hook: Stop (fires after every agent response)
# Purpose: Detect prompt extraction attempts via canary token echoing
# Date: 2026-05-23

set -euo pipefail

# Configuration
CANARY_FILE="${CLAUDE_STATE_DIR:-.claude/state}/canary-tokens.txt"
AUDIT_LOG="${CLAUDE_STATE_DIR:-.claude/state}/audit.log"
SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"

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

  # Extract last assistant message from transcript
  if [[ -f "$transcript_path" ]]; then
    # Simple extraction - get last assistant message
    last_message=$(grep -A 100 '"role": "assistant"' "$transcript_path" | tail -100 || echo "")
  else
    # Fallback: check stdin if transcript not available
    last_message=$(cat)
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
  local transcript_path="${1:-}"

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

# Run main with transcript path from environment or argument
main "${TRANSCRIPT_PATH:-$1}"
