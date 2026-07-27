#!/usr/bin/env bash
# agent-budget-gate.sh — PreToolUse: block spawn agent mới khi budget ≤ 10%
# Enforce single-agent fallback. Đọc sentinel.json để lấy % còn lại.

set -euo pipefail

TOOL_NAME="${TOOL_NAME:-}"
STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/state"
SENTINEL="$STATE_DIR/sentinel.json"

# Chỉ gate khi spawn agent/task mới
case "$TOOL_NAME" in
  Agent|Task) ;;
  *) exit 0 ;;
esac

# Không có sentinel → chưa đủ data, cho qua
[[ ! -f "$SENTINEL" ]] && exit 0

# ── Tính budget ───────────────────────────────────────────────────────────────
TOOL_CALLS=$(python3 -c "import json; d=json.load(open('$SENTINEL')); print(d.get('tool_calls',0))" 2>/dev/null || echo 0)
TOKENS_REMAINING="${CLAUDE_CONTEXT_TOKENS_REMAINING:-0}"
TOKENS_USED="${CLAUDE_CONTEXT_TOKENS_USED:-0}"
SESSION_MAX="${CLAUDE_CONTEXT_WINDOW:-200000}"

if [[ "$TOKENS_REMAINING" != "0" || "$TOKENS_USED" != "0" ]]; then
  TOTAL=$((TOKENS_USED + TOKENS_REMAINING))
  [[ $TOTAL -eq 0 ]] && exit 0
  PCT_LEFT=$(( TOKENS_REMAINING * 100 / TOTAL ))
else
  # Fallback: estimate từ tool call counter
  TOKENS_USED_EST=$((TOOL_CALLS * 2000))
  [[ $TOKENS_USED_EST -ge $SESSION_MAX ]] && PCT_LEFT=0 || PCT_LEFT=$(( (SESSION_MAX - TOKENS_USED_EST) * 100 / SESSION_MAX ))
fi

[[ $PCT_LEFT -lt 0 ]] && PCT_LEFT=0

# ── Enforce threshold ─────────────────────────────────────────────────────────
if [[ $PCT_LEFT -le 10 ]]; then
  echo ""
  echo "┌─ BUDGET GATE — BLOCKED ────────────────────────────────"
  printf "│ Token budget còn %d%% — dưới ngưỡng 10%%\n" "$PCT_LEFT"
  echo "│ Single-agent fallback bắt buộc. Không thể spawn agent mới."
  echo "│"
  echo "│ Để tiếp tục multi-agent: bắt đầu session mới"
  echo "│ Để wrap up session này: /wrap-up hoặc /session-wrap"
  echo "└────────────────────────────────────────────────────────"
  exit 2
fi

# ── Cảnh báo vùng nguy hiểm (10–20%) nhưng vẫn cho qua ──────────────────────
if [[ $PCT_LEFT -le 20 ]]; then
  printf "[budget-gate] ⚠ Còn %d%% — agent này có thể là agent cuối trong session\n" "$PCT_LEFT"
fi

exit 0
