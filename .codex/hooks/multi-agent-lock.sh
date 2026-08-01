#!/usr/bin/env bash
# multi-agent-lock.sh — PreToolUse hook: ngăn conflict khi multi-run đang chạy
# Chạy trước mỗi Write/Edit/MultiEdit tool call

set -euo pipefail

LOCK_FILE="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/state/multi-run-lock.json"
TOOL_NAME="${TOOL_NAME:-}"
FILE_PATH="${FILE_PATH:-}"

# Chỉ check khi là write operation
case "$TOOL_NAME" in
  Write|Edit|MultiEdit|Bash) ;;
  *) exit 0 ;;
esac

# Không có lock file → single agent mode, cho qua
[[ ! -f "$LOCK_FILE" ]] && exit 0

# Đọc lock state
LOCK=$(cat "$LOCK_FILE" 2>/dev/null || echo '{}')

# Check session còn active không (timeout 2h)
SESSION_TIME=$(echo "$LOCK" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session','0'))" 2>/dev/null || echo "0")
NOW=$(date +%s)
if [[ $((NOW - SESSION_TIME)) -gt 7200 ]]; then
  rm -f "$LOCK_FILE"
  exit 0
fi

# Check file path có nằm trong scope của agent khác không
if [[ -n "$FILE_PATH" ]]; then
  CONFLICT=$(echo "$LOCK" | python3 - "$FILE_PATH" <<'PYEOF'
import sys, json
file_path = sys.argv[1]
data = json.load(sys.stdin)
agents = data.get('agents', [])
my_agent = data.get('current_agent', '')
for a in agents:
    if a.get('id') == my_agent or a.get('status') != 'running':
        continue
    for scope in a.get('scope', []):
        if file_path.startswith(scope) or scope.startswith(file_path):
            print(f"CONFLICT: {a['task']} đang dùng {scope}")
            sys.exit(0)
PYEOF
  ) || true

  if [[ -n "$CONFLICT" ]]; then
    echo "[multi-run-lock] BLOCKED — $CONFLICT"
    echo "File: $FILE_PATH đang trong scope của agent khác."
    echo "Chờ agent đó xong hoặc chạy: rm $LOCK_FILE để reset."
    exit 1
  fi
fi

exit 0
