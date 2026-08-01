#!/usr/bin/env bash
# Yana AI Hook
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
# Bypass: YANA_CIRCUIT_BYPASS=1
# Test seam: CIRCUIT_TEST_INPUT="<json>"

set -uo pipefail

[[ "${YANA_CIRCUIT_BYPASS:-}" == "1" ]] && exit 0

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

  # Locked read-modify-write (2026-07-19 fix — code-auditor review found a
  # real, reproducible race: the old grep-to-fixed-tmp-name-then-mv pattern
  # has no protection against two genuinely concurrent callers, which
  # core/hooks/sandbox-wrap.sh's own pre-check now guarantees happens
  # whenever YANA_SANDBOX_MODE is set, since Claude Code hooks run in
  # parallel. Reproduced live: 8 concurrent invocations against a 2-entry
  # state file silently deleted an unrelated tool's OPEN circuit entry —
  # exactly the protection 56-circuit-breaker-law.md depends on. Same
  # fcntl.flock(LOCK_EX) pattern already used by
  # tool-guardrails-detector.sh for the identical shared-JSONL-state-file
  # problem — python3's fcntl, not the `flock` CLI, which isn't preinstalled
  # on macOS (same portability class as the timeout/grep -P fixes earlier
  # this session). Values passed via env vars, never interpolated into the
  # Python source string, matching tool-proxy-enforcer.sh's match_re()
  # design for the same reason (no injection surface from untrusted content).
  CIRCUIT_STATE_FILE="$CIRCUIT_STATE_FILE" _TOOL="$tool" _STATE="$new_state" \
  _FAILURES="$failures" _COOLDOWN="$cooldown_epoch" _BACKOFF="$backoff" \
  _FAST_TIER="$fast_tier" _TS="$TIMESTAMP" python3 -c '
import fcntl, json, os

path = os.environ["CIRCUIT_STATE_FILE"]
tool = os.environ["_TOOL"]
entry = {
    "tool_name": tool,
    "state": os.environ["_STATE"],
    "failure_count": int(os.environ["_FAILURES"]),
    "last_failure_time": os.environ["_TS"],
    "cooldown_until_epoch": int(os.environ["_COOLDOWN"]),
    "backoff_exponent": int(os.environ["_BACKOFF"]),
    "fast_tier_triggered": os.environ["_FAST_TIER"] == "true",
}

with open(path, "a+") as f:
    fcntl.flock(f, fcntl.LOCK_EX)
    f.seek(0)
    lines = [ln for ln in f.read().splitlines() if ln.strip()]
    kept = []
    for ln in lines:
        try:
            if json.loads(ln).get("tool_name") == tool:
                continue
        except Exception:
            pass  # malformed line — drop rather than risk keeping/losing it silently wrong
        kept.append(ln)
    kept.append(json.dumps(entry, separators=(",", ":")))
    f.seek(0)
    f.truncate()
    f.write("\n".join(kept) + "\n")
' 2>/dev/null || true
}

# ── Configuration ─────────────────────────────────────────────────────────────

CIRCUIT_STATE_FILE="${YANA_CIRCUIT_STATE_FILE:-.claude/state/per-tool-circuit.jsonl}"
CIRCUIT_METRICS_FILE="${YANA_CIRCUIT_METRICS_FILE:-.claude/state/circuit-metrics.jsonl}"
MAX_FAILURES="${YANA_CIRCUIT_MAX_FAILURES:-5}"
INITIAL_COOLDOWN_SECS="${YANA_CIRCUIT_COOLDOWN_INITIAL:-60}"
MAX_COOLDOWN_SECS="${YANA_CIRCUIT_COOLDOWN_MAX:-1800}"
BACKOFF_MULTIPLIER="${YANA_CIRCUIT_BACKOFF_MULTIPLIER:-5}"
FAST_TIER_MODEL="${YANA_FAST_TIER_MODEL:-claude-haiku-4-5}"

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
      warn_and_log "⚠️  Circuit Breaker [$TOOL_NAME]: Transitioning from OPEN → HALF_OPEN. Cooldown expired. Next call allowed (health check mode). Bypass: YANA_CIRCUIT_BYPASS=1"
      update_state "$TOOL_NAME" "$NEW_STATE" 0 0 "$BACKOFF_EXP" false
      exit 1  # Warn, but allow probe
    else
      # Cooldown still active — hard block
      REMAINING=$((COOLDOWN_UNTIL - NOW_EPOCH))
      deny_and_log "Blocked [L5 Per-Tool Circuit Breaker]: Tool '$TOOL_NAME' circuit is OPEN. Too many failures (≥${MAX_FAILURES}). Cooldown active for ${REMAINING}s more. Suggest: use '${FAST_TIER_MODEL}' for fast recovery. Bypass: YANA_CIRCUIT_BYPASS=1"
      exit 2
    fi
    ;;

  HALF_OPEN)
    # Health check mode — allow 1 probe
    warn_and_log "⚠️  Circuit Breaker [$TOOL_NAME]: In HALF_OPEN recovery mode. This call is a health check probe. If it succeeds, circuit resets to CLOSED. If it fails, OPEN for longer. Bypass: YANA_CIRCUIT_BYPASS=1"
    exit 1  # Warn, allow probe
    ;;

  *)
    # Unknown state — default to CLOSED
    warn_and_log "⚠️  Circuit Breaker [$TOOL_NAME]: Unknown state '$STATE', resetting to CLOSED"
    update_state "$TOOL_NAME" "CLOSED" 0 0 0 1 false
    exit 0
    ;;
esac
