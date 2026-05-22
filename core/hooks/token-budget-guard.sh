#!/usr/bin/env bash
# Token Budget Guard — tracks per-action token usage, detects waste loops, triggers fast-tier
# Hook type: PreToolUse (runs before each tool call)
# Install: add to settings.json hooks.PreToolUse
set -euo pipefail

BUDGET_FILE="${YAMTAM_TOKEN_BUDGET:-core/memory/L2_session/token-budget.json}"
MAX_LOOP_TOKENS="${YAMTAM_MAX_LOOP_TOKENS:-50000}"  # ~$0.15 at Sonnet pricing
MAX_ATTEMPTS="${YAMTAM_MAX_FIX_ATTEMPTS:-5}"
LOG_FILE="${YAMTAM_LOG:-/tmp/yamtam-audit.log}"

TOOL_NAME="${CLAUDE_TOOL_NAME:-unknown}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Initialize budget file if missing
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

# Read current budget state
BUDGET_STATE=$(cat "$BUDGET_FILE")
TOTAL_TOKENS=$(echo "$BUDGET_STATE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('total_tokens_used', 0))")
FAST_TIER=$(echo "$BUDGET_STATE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('fast_tier_triggered', False))")

# ── Loop detection: same tool called repeatedly (fix loop) ────────────────────
LOOP_COUNT=$(echo "$BUDGET_STATE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
loops = d.get('loop_attempts', {})
print(loops.get('$TOOL_NAME', 0))
")

if [[ $LOOP_COUNT -ge $MAX_ATTEMPTS ]]; then
  echo "[token-budget-guard] LOOP DETECTED: $TOOL_NAME called $LOOP_COUNT times"
  echo "[token-budget-guard] Tokens used this session: $TOTAL_TOKENS"
  echo "[token-budget-guard] TRIGGERING FAST TIER — switching to minimal-token strategy"

  # Log fast-tier trigger
  python3 - "$BUDGET_FILE" <<'PYEOF'
import json, sys

path = sys.argv[1]
with open(path) as f:
    d = json.load(f)

d['fast_tier_triggered'] = True
d['fast_tier_reason'] = f"Loop detected: {sys.argv[1] if len(sys.argv) > 1 else 'unknown'} exceeded max attempts"

with open(path, 'w') as f:
    json.dump(d, f, indent=2)
PYEOF

  echo "[token-budget-guard] ACTION REQUIRED:"
  echo "  1. Stop the current repair loop"
  echo "  2. Use tree-of-thoughts to pick a different strategy"
  echo "  3. Or escalate to human (too complex for auto-fix)"
  exit 0  # non-blocking — warn only, don't hard-block
fi

# ── Budget ceiling: total tokens this session ─────────────────────────────────
if [[ $TOTAL_TOKENS -gt $MAX_LOOP_TOKENS ]]; then
  echo "[token-budget-guard] BUDGET WARNING: $TOTAL_TOKENS tokens used (limit: $MAX_LOOP_TOKENS)"
  echo "[token-budget-guard] Consider: /cost-report to review ROI before continuing"
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

echo "[token-budget-guard] OK — $TOOL_NAME (attempt ${LOOP_COUNT} / $MAX_ATTEMPTS)"
exit 0
