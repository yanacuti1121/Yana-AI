#!/usr/bin/env bash
# context-compress-trigger.sh — PostToolUse hook
# Watches context-monitor state. When WARNING or CRITICAL fires,
# spawns auto-compress.sh in background and tells Claude to read
# the latest compressed summary.
#
# Hook type: PostToolUse
# Fails open — any error exits 0 (never blocks tool calls).

INPUT=$(cat)
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# ── Read session ID ───────────────────────────────────────────────────────────
SESSION_ID=$(echo "$INPUT" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('session_id','default'))" \
  2>/dev/null || echo "default")

# Reject path-traversal in session ID
echo "$SESSION_ID" | grep -qE '[/\\]|\.\.' 2>/dev/null && exit 0

STATE_FILE="/tmp/claude-ctx-${SESSION_ID}.json"
[[ ! -f "$STATE_FILE" ]] && exit 0

# ── Check severity from context-monitor state ─────────────────────────────────
SEVERITY=$(python3 -c \
  "import json; d=json.load(open('$STATE_FILE')); print(d.get('lastSeverity','OK'))" \
  2>/dev/null || echo "OK")

[[ "$SEVERITY" == "OK" ]] && exit 0

# ── Trigger compression (background — non-blocking) ───────────────────────────
COMPRESS_SCRIPT="$PROJECT_ROOT/core/scripts/auto-compress.sh"
[[ ! -x "$COMPRESS_SCRIPT" ]] && exit 0

bash "$COMPRESS_SCRIPT" >/dev/null 2>&1 &

# ── Tell Claude where to look ─────────────────────────────────────────────────
SESSION_DIR="core/memory/L2_session"

cat <<EOF
[context-compress] Context window at ${SEVERITY} level.
Session state is being compressed via Ollama (background).
On your next action, read the latest file in ${SESSION_DIR}/auto-compress-*.md
to restore key context before it is lost.
EOF

exit 0
