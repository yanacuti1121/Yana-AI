#!/usr/bin/env bash
# YAMTAM ENGINE Hook
# Version: 1.8.0
# Status: active
# Description: L5 Per-Tool Circuit Breaker — per-tool state tracking, adaptive backoff, fast-tier fallback
# Last Reviewed: 2026-05-24
# PreToolUse hook — fires before tool calls to enforce per-tool circuit state.
#
# Features:
#   - Per-tool circuit state tracking (CLOSED/OPEN/HALF_OPEN)
#   - Adaptive exponential backoff per tool (60s → 300s → 1800s)
#   - Fast-tier fallback recommendation when tool is hung
#   - Health check before HALF_OPEN → CLOSED transition
#   - Metrics export via core/scripts/circuit-breaker-metrics.sh
#
# State file: .claude/state/per-tool-circuit.jsonl (JSONL, one entry per line per tool)
# Entry format:
#   {
#     "tool_name": "Bash",
#     "state": "OPEN",
#     "failure_count": 5,
#     "last_failure_time": "2026-05-24T14:32:00Z",
#     "cooldown_until_epoch": 1234567890,
#     "backoff_exponent": 2,
#     "fast_tier_triggered": false
#   }
#
# Exit behaviour:
#   exit 0          — allow (tool is healthy)
#   exit 1          — warn (tool is recovering, but allow)
#   exit 2          — block (tool circuit is OPEN)
#
# Bypass: YAMTAM_CIRCUIT_BYPASS=1
# Test seam: CIRCUIT_TEST_INPUT="<json>"

set -uo pipefail

[[ "${YAMTAM_CIRCUIT_BYPASS:-}" == "1" ]] && exit 0

# ── Helper functions ───────────────────────────────────────────────────────────

warn_and_log() {
  local msg="$1"
  jq -n \
    --arg msg "$msg" \
    '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: $msg
      }
    }'
}

deny_and_log() {
  local reason="$1"
  jq -n \
    --arg reason "$reason" \
    '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $reason
      }
    }'
}

update_state() {
  local tool="$1"
  local new_state="$2"
  local failures="$3"
  local cooldown_epoch="$4"
  local backoff="$5"
  local fast_tier="$6"

  grep -v "\"tool_name\"[[:space:]]*:[[:space:]]*\"${tool}\"" "$CIRCUIT_STATE_FILE" > "${CIRCUIT_STATE_FILE}.tmp" 2>/dev/null || true
  mv "${CIRCUIT_STATE_FILE}.tmp" "$CIRCUIT_STATE_FILE" 2>/dev/null || true

  jq -cn \
    --arg tool "$tool" \
    --arg state "$new_state" \
    --argjson failures "$failures" \
    --argjson cooldown "$cooldown_epoch" \
    --argjson backoff "$backoff" \
    --arg fast_tier "$fast_tier" \
    --arg ts "$TIMESTAMP" \
    '{tool_name:$tool,state:$state,failure_count:$failures,last_failure_time:$ts,cooldown_until_epoch:$cooldown,backoff_exponent:$backoff,fast_tier_triggered:($fast_tier=="true")}' >> "$CIRCUIT_STATE_FILE"
}

# ── Configuration ─────────────────────────────────────────────────────────────

CIRCUIT_STATE_FILE="${YAMTAM_CIRCUIT_STATE_FILE:-.claude/state/per-tool-circuit.jsonl}"
CIRCUIT_METRICS_FILE="${YAMTAM_CIRCUIT_METRICS_FILE:-.claude/state/circuit-metrics.jsonl}"
MAX_FAILURES="${YAMTAM_CIRCUIT_MAX_FAILURES:-5}"
INITIAL_COOLDOWN_SECS="${YAMTAM_CIRCUIT_COOLDOWN_INITIAL:-60}"
MAX_COOLDOWN_SECS="${YAMTAM_CIRCUIT_COOLDOWN_MAX:-1800}"
BACKOFF_MULTIPLIER="${YAMTAM_CIRCUIT_BACKOFF_MULTIPLIER:-5}"
FAST_TIER_MODEL="${YAMTAM_FAST_TIER_MODEL:-claude-haiku-4-5}"

NOW_EPOCH=$(date +%s)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ── Read input ─────────────────────────────────────────────────────────────────

if [[ -n "${CIRCUIT_TEST_INPUT:-}" ]]; then
  TOOL_NAME=$(printf '%s' "$CIRCUIT_TEST_INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
  TEST_MODE=1
else
  INPUT=$(cat)
  TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
  TEST_MODE=0
fi

[[ -z "$TOOL_NAME" ]] && exit 0

# ── Initialize state file ──────────────────────────────────────────────────────

mkdir -p "$(dirname "$CIRCUIT_STATE_FILE")"
mkdir -p "$(dirname "$CIRCUIT_METRICS_FILE")"

if [[ ! -f "$CIRCUIT_STATE_FILE" ]]; then
  touch "$CIRCUIT_STATE_FILE"
fi

# ── Read or initialize tool circuit state ──────────────────────────────────────

TOOL_STATE=$(awk -v tool="$TOOL_NAME" '$0 ~ "\"tool_name\"[[:space:]]*:[[:space:]]*\"" tool "\"" {found=1} found {print; if (/}$/) exit}' "$CIRCUIT_STATE_FILE" 2>/dev/null || echo "")

if [[ -z "$TOOL_STATE" ]]; then
  # Initialize new tool state
  TOOL_STATE=$(jq -n \
    --arg tool "$TOOL_NAME" \
    --arg ts "$TIMESTAMP" \
    '{
      tool_name: $tool,
      state: "CLOSED",
      failure_count: 0,
      last_failure_time: null,
      cooldown_until_epoch: 0,
      backoff_exponent: 1,
      fast_tier_triggered: false,
      created_at: $ts
    }')
fi

# ── Parse state ────────────────────────────────────────────────────────────────

STATE=$(printf '%s' "$TOOL_STATE" | jq -r '.state // "CLOSED"' 2>/dev/null || echo "CLOSED")
FAILURE_COUNT=$(printf '%s' "$TOOL_STATE" | jq -r '.failure_count // 0' 2>/dev/null || echo "0")
COOLDOWN_UNTIL=$(printf '%s' "$TOOL_STATE" | jq -r '.cooldown_until_epoch // 0' 2>/dev/null || echo "0")
BACKOFF_EXP=$(printf '%s' "$TOOL_STATE" | jq -r '.backoff_exponent // 1' 2>/dev/null || echo "1")
FAST_TIER_TRIGGERED=$(printf '%s' "$TOOL_STATE" | jq -r '.fast_tier_triggered // false' 2>/dev/null || echo "false")

# ── Circuit state machine ──────────────────────────────────────────────────────

case "$STATE" in
  CLOSED)
    # Normal operation — allow
    exit 0
    ;;

  OPEN)
    # Circuit is OPEN — check if cooldown expired
    if [[ "$NOW_EPOCH" -ge "$COOLDOWN_UNTIL" ]]; then
      # Cooldown expired — transition to HALF_OPEN
      NEW_STATE="HALF_OPEN"
      warn_and_log "⚠️  Circuit Breaker [$TOOL_NAME]: Transitioning from OPEN → HALF_OPEN. Cooldown expired. Next call allowed (health check mode). Bypass: YAMTAM_CIRCUIT_BYPASS=1"
      update_state "$TOOL_NAME" "$NEW_STATE" 0 0 "$BACKOFF_EXP" false
      exit 1  # Warn, but allow probe
    else
      # Cooldown still active — hard block
      REMAINING=$((COOLDOWN_UNTIL - NOW_EPOCH))
      deny_and_log "Blocked [L5 Per-Tool Circuit Breaker]: Tool '$TOOL_NAME' circuit is OPEN. Too many failures (≥${MAX_FAILURES}). Cooldown active for ${REMAINING}s more. Suggest: use '${FAST_TIER_MODEL}' for fast recovery. Bypass: YAMTAM_CIRCUIT_BYPASS=1"
      exit 2
    fi
    ;;

  HALF_OPEN)
    # Health check mode — allow 1 probe
    warn_and_log "⚠️  Circuit Breaker [$TOOL_NAME]: In HALF_OPEN recovery mode. This call is a health check probe. If it succeeds, circuit resets to CLOSED. If it fails, OPEN for longer. Bypass: YAMTAM_CIRCUIT_BYPASS=1"
    exit 1  # Warn, allow probe
    ;;

  *)
    # Unknown state — default to CLOSED
    warn_and_log "⚠️  Circuit Breaker [$TOOL_NAME]: Unknown state '$STATE', resetting to CLOSED"
    update_state "$TOOL_NAME" "CLOSED" 0 0 0 1 false
    exit 0
    ;;
esac
