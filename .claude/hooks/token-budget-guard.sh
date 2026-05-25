#!/usr/bin/env bash
# Version: 1.4.20 | Status: active
# Description: Token Budget Guard — Circuit Breaker + fast-tier auto-routing
# Hook type: PreToolUse (runs before each tool call)
# Last Reviewed: 2026-05-23
# Install: add to settings.json hooks.PreToolUse
#
# Circuit Breaker states:
#   CLOSED   — normal operation
#   OPEN     — tool called ≥5 consecutive times without success → HARD BLOCK
#   HALF-OPEN — after cooldown, 1 probe allowed
#
# Bypass: YAMTAM_BUDGET_BYPASS=1 (sovereign only)
set -euo pipefail

BUDGET_FILE="${YAMTAM_TOKEN_BUDGET:-core/memory/L2_session/token-budget.json}"
CIRCUIT_FILE="${YAMTAM_CIRCUIT_STATE:-core/memory/L2_session/circuit-state.json}"
MAX_LOOP_TOKENS="${YAMTAM_MAX_LOOP_TOKENS:-50000}"
MAX_ATTEMPTS="${YAMTAM_MAX_FIX_ATTEMPTS:-5}"
COOLDOWN_SECONDS="${YAMTAM_CIRCUIT_COOLDOWN:-60}"
LOG_FILE="${YAMTAM_LOG:-/tmp/yamtam-audit.log}"
FAST_TIER_MODEL="${YAMTAM_FAST_TIER_MODEL:-claude-haiku-4-5-20251001}"

TOOL_NAME="${CLAUDE_TOOL_NAME:-unknown}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
NOW_EPOCH=$(date +%s)

# Bypass — sovereign override only
if [[ "${YAMTAM_BUDGET_BYPASS:-0}" == "1" ]]; then
  echo "[token-budget-guard] BYPASS active"
  exit 0
fi

# ── Initialize budget file ────────────────────────────────────────────────────
if [[ ! -f "$BUDGET_FILE" ]]; then
  mkdir -p "$(dirname "$BUDGET_FILE")"
  python3 -c "
import json
data = {
    'session_start': '$TIMESTAMP',
    'total_tokens_used': 0,
    'actions': [],
    'loop_attempts': {},
    'fast_tier_triggered': False
}
print(json.dumps(data, indent=2))
" > "$BUDGET_FILE"
fi

# ── Initialize circuit state file ────────────────────────────────────────────
if [[ ! -f "$CIRCUIT_FILE" ]]; then
  mkdir -p "$(dirname "$CIRCUIT_FILE")"
  python3 -c "
import json
data = {'circuits': {}}
print(json.dumps(data, indent=2))
" > "$CIRCUIT_FILE"
fi

# ── Circuit Breaker: check if tool is currently OPEN ─────────────────────────
CIRCUIT_STATUS=$(python3 - "$CIRCUIT_FILE" "$TOOL_NAME" "$NOW_EPOCH" "$COOLDOWN_SECONDS" <<'PYEOF'
import json, sys

path, tool, now_epoch, cooldown = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])

with open(path) as f:
    d = json.load(f)

circuits = d.get('circuits', {})
info = circuits.get(tool, {'state': 'closed'})
state = info.get('state', 'closed')

if state == 'open':
    opened_at = info.get('opened_at_epoch', 0)
    elapsed = now_epoch - opened_at
    if elapsed >= cooldown:
        print('half-open')
    else:
        remaining = cooldown - elapsed
        print(f'open:{remaining}')
elif state == 'half-open':
    print('half-open')
else:
    print('closed')
PYEOF
)

if [[ "$CIRCUIT_STATUS" == open:* ]]; then
  REMAINING="${CIRCUIT_STATUS#open:}"
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  [token-budget-guard] CIRCUIT BREAKER — OPEN         ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo "  Tool     : $TOOL_NAME"
  echo "  State    : OPEN (cooldown: ${REMAINING}s remaining)"
  echo "  Action   : HARD BLOCKED — loop detected, circuit is open"
  echo "  Fix      : Wait for cooldown, then retry with a different strategy"
  echo "  Fast tier: Switch model to $FAST_TIER_MODEL to reduce cost"
  echo "[${TIMESTAMP}] CIRCUIT-OPEN tool='$TOOL_NAME' cooldown_remaining=${REMAINING}s" >> "$LOG_FILE" 2>/dev/null || true
  exit 1
fi

# ── Read budget state ─────────────────────────────────────────────────────────
BUDGET_STATE=$(cat "$BUDGET_FILE")
TOTAL_TOKENS=$(echo "$BUDGET_STATE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('total_tokens_used', 0))")

LOOP_COUNT=$(echo "$BUDGET_STATE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('loop_attempts', {}).get('$TOOL_NAME', 0))
")

# ── Loop threshold reached → OPEN circuit + hard block ───────────────────────
if [[ $LOOP_COUNT -ge $MAX_ATTEMPTS ]]; then
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  [token-budget-guard] CIRCUIT BREAKER TRIGGERED      ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo "  Tool       : $TOOL_NAME"
  echo "  Loop count : $LOOP_COUNT / $MAX_ATTEMPTS (threshold exceeded)"
  echo "  Tokens used: $TOTAL_TOKENS"
  echo "  Action     : Circuit OPENED — tool BLOCKED for ${COOLDOWN_SECONDS}s"
  echo ""
  echo "  ── Fast-Tier Recommendation ──────────────────────────"
  echo "  Switch model to: $FAST_TIER_MODEL"
  echo "  Reason: Sonnet costs accumulating on a stuck loop."
  echo "  Command: Set ANTHROPIC_MODEL=$FAST_TIER_MODEL in your env"
  echo ""
  echo "  ── Recovery Options ──────────────────────────────────"
  echo "  1. Stop the loop — pick a completely different approach"
  echo "  2. Use /tree-of-thoughts to re-plan from scratch"
  echo "  3. Escalate to human: too complex for auto-fix"
  echo ""

  # Open the circuit
  python3 - "$CIRCUIT_FILE" "$TOOL_NAME" "$NOW_EPOCH" "$TIMESTAMP" "$MAX_ATTEMPTS" <<'PYEOF'
import json, sys

path, tool, now_epoch, ts, max_attempts = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4], sys.argv[5]
with open(path) as f:
    d = json.load(f)

circuits = d.setdefault('circuits', {})
prev = circuits.get(tool, {})
open_count = prev.get('open_count', 0) + 1
cooldown_map = {1: 60, 2: 300}
cooldown = cooldown_map.get(open_count, 1800)

circuits[tool] = {
    'state': 'open',
    'opened_at': ts,
    'opened_at_epoch': now_epoch,
    'open_count': open_count,
    'cooldown_seconds': cooldown,
    'reason': f'Loop: {tool} called ≥{max_attempts} times without success'
}
d['circuits'] = circuits
with open(path, 'w') as f:
    json.dump(d, f, indent=2)
PYEOF

  # Mark fast-tier in budget file
  python3 - "$BUDGET_FILE" "$TOOL_NAME" <<'PYEOF'
import json, sys

path, tool = sys.argv[1], sys.argv[2]
with open(path) as f:
    d = json.load(f)
d['fast_tier_triggered'] = True
d['fast_tier_tool'] = tool
with open(path, 'w') as f:
    json.dump(d, f, indent=2)
PYEOF

  echo "[${TIMESTAMP}] CIRCUIT-TRIGGERED tool='$TOOL_NAME' loop_count=$LOOP_COUNT tokens=$TOTAL_TOKENS" >> "$LOG_FILE" 2>/dev/null || true
  exit 1  # HARD BLOCK
fi

# ── Budget ceiling warning ────────────────────────────────────────────────────
if [[ $TOTAL_TOKENS -gt $MAX_LOOP_TOKENS ]]; then
  echo "[token-budget-guard] BUDGET WARNING: $TOTAL_TOKENS tokens used (limit: $MAX_LOOP_TOKENS)"
  echo "[token-budget-guard] Run /cost-report to review ROI before continuing"
fi

# ── Half-open: reset circuit on successful probe ──────────────────────────────
if [[ "$CIRCUIT_STATUS" == "half-open" ]]; then
  python3 - "$CIRCUIT_FILE" "$TOOL_NAME" <<'PYEOF'
import json, sys
path, tool = sys.argv[1], sys.argv[2]
with open(path) as f:
    d = json.load(f)
circuits = d.get('circuits', {})
if tool in circuits:
    circuits[tool]['state'] = 'closed'
    circuits[tool]['closed_at'] = __import__('datetime').datetime.utcnow().isoformat()
d['circuits'] = circuits
with open(path, 'w') as f:
    json.dump(d, f, indent=2)
PYEOF
  echo "[token-budget-guard] Circuit CLOSED for $TOOL_NAME — probe succeeded"
fi

# ── Update loop counter ───────────────────────────────────────────────────────
python3 - "$BUDGET_FILE" "$TOOL_NAME" <<'PYEOF'
import json, sys

path, tool = sys.argv[1], sys.argv[2]
with open(path) as f:
    d = json.load(f)

loops = d.setdefault('loop_attempts', {})
loops[tool] = loops.get(tool, 0) + 1

with open(path, 'w') as f:
    json.dump(d, f, indent=2)
PYEOF

echo "[token-budget-guard] OK — $TOOL_NAME (attempt $((LOOP_COUNT + 1)) / $MAX_ATTEMPTS)"
exit 0
