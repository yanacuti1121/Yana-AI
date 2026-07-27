#!/usr/bin/env bash
# auto-decompose.sh — UserPromptSubmit: phát hiện task có thể parallel và hint decomposition
# Non-blocking. Chỉ in hint khi phát hiện 2+ subtasks độc lập.

set -euo pipefail

PROMPT="${CLAUDE_USER_PROMPT:-}"
STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/state"
SENTINEL="$STATE_DIR/sentinel.json"

# Skip prompt quá ngắn
WORD_COUNT=$(echo "$PROMPT" | wc -w 2>/dev/null || echo 0)
[[ $WORD_COUNT -lt 4 ]] && exit 0

# ── Đọc budget hiện tại ───────────────────────────────────────────────────────
PCT_LEFT=100
if [[ -f "$SENTINEL" ]]; then
  TOOL_CALLS=$(python3 -c "import json; d=json.load(open('$SENTINEL')); print(d.get('tool_calls',0))" 2>/dev/null || echo 0)
  SESSION_MAX="${CLAUDE_CONTEXT_WINDOW:-200000}"
  TOKENS_USED=$((TOOL_CALLS * 2000))
  TOTAL=$((TOKENS_USED + SESSION_MAX))
  [[ $TOTAL -gt 0 ]] && PCT_LEFT=$(( (SESSION_MAX - TOKENS_USED) * 100 / SESSION_MAX ))
  [[ $PCT_LEFT -lt 0 ]] && PCT_LEFT=0
fi

# Nếu budget ≤ 10% → không suggest multi-agent nữa
if [[ $PCT_LEFT -le 10 ]]; then
  echo "[auto-decompose] Budget còn ${PCT_LEFT}% — single-agent mode. Wrap up sớm."
  exit 0
fi

# ── Phát hiện multi-task signals ──────────────────────────────────────────────
VERB_COUNT=$(echo "$PROMPT" | grep -oiE '\b(fix|add|update|create|remove|delete|refactor|test|write|build|check|review|optimize|deploy|sync|generate|implement|lam|them|sua|xoa|tao|kiem|viet)\b' 2>/dev/null | sort -u | wc -l || true)
VERB_COUNT=$(( ${VERB_COUNT:-0} + 0 ))
CONNECTOR=$(echo "$PROMPT" | grep -cE '(va |and | \+ |dong thoi|cung luc|song song)' 2>/dev/null || true)
CONNECTOR=$(( ${CONNECTOR:-0} + 0 ))
FILE_MENTIONS=$(echo "$PROMPT" | grep -oE '[a-zA-Z0-9_/-]+\.(sh|ts|js|py|md|json|yaml|yml)' 2>/dev/null | sort -u | wc -l || true)
FILE_MENTIONS=$(( ${FILE_MENTIONS:-0} + 0 ))

# Score: tổng điểm → quyết định có hint không
SCORE=$(( VERB_COUNT * 2 + CONNECTOR * 3 + FILE_MENTIONS ))

[[ $SCORE -lt 5 ]] && exit 0

# ── Estimate số agents tối ưu ─────────────────────────────────────────────────
if [[ $SCORE -ge 12 ]]; then
  N_AGENTS="3–5"
elif [[ $SCORE -ge 8 ]]; then
  N_AGENTS="2–3"
else
  N_AGENTS="2"
fi

echo ""
echo "┌─ MULTI-AGENT ──────────────────────────────────────────"
printf "│ Phát hiện task phức tạp (score=%d) — budget %d%% còn\n" "$SCORE" "$PCT_LEFT"
printf "│ Đề xuất: %s agents chạy song song\n" "$N_AGENTS"
echo "│ Claude sẽ tự decompose. Dùng /multi-run để kiểm soát thủ công."
echo "└────────────────────────────────────────────────────────"
