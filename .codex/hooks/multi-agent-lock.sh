#!/usr/bin/env bash
# multi-agent-lock.sh — PreToolUse hook: ngăn conflict khi multi-run đang chạy
# Chạy trước mỗi Write/Edit/MultiEdit tool call

# BUG FIX (found live-testing before wiring, 2026-08-15): `TOOL_NAME`/
# `FILE_PATH` were read as bare env vars, which Claude Code never sets —
# same class of bug as the other 5 hooks fixed in this batch. Fixed to
# read stdin JSON via jq, matching every proven-working hook in this
# directory. `LOCK_FILE`'s use of `CLAUDE_PROJECT_DIR` was already
# correct (that one IS a real Claude Code env var) — left unchanged.
set -euo pipefail

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null || true)

LOCK_FILE="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/state/multi-run-lock.json"

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
#
# BUG FIX (found live-testing before wiring, 2026-08-15): the old
# `echo "$LOCK" | python3 - "$FILE_PATH" <<'PYEOF' ... PYEOF` construct
# cannot work — `python3 -` reads its SCRIPT from stdin, and the heredoc
# is what actually supplies stdin (a heredoc redirect on a command wins
# over a pipe feeding the same fd), so the piped `$LOCK` JSON had nowhere
# to go. The script's own `json.load(sys.stdin)` then read an already-
# heredoc-consumed, empty stdin and crashed with JSONDecodeError on every
# call — reproduced live. Conflict detection never once ran. Fixed by
# moving the script to `python3 -c '...'` (code as an argument, not via
# stdin) and feeding `$LOCK` through a here-string (`<<<`) instead, so
# stdin is free for `json.load(sys.stdin)` to actually read the lock data.
if [[ -n "$FILE_PATH" ]]; then
  CONFLICT=$(python3 -c '
import sys, json
file_path = sys.argv[1]
data = json.load(sys.stdin)
agents = data.get("agents", [])
my_agent = data.get("current_agent", "")
for a in agents:
    if a.get("id") == my_agent or a.get("status") != "running":
        continue
    for scope in a.get("scope", []):
        if file_path.startswith(scope) or scope.startswith(file_path):
            print("CONFLICT: " + str(a.get("task")) + " đang dùng " + scope)
            sys.exit(0)
' "$FILE_PATH" <<< "$LOCK") || true

  if [[ -n "$CONFLICT" ]]; then
    # BUG FIX (found live-testing before wiring, 2026-08-15): this used
    # bare `exit 1` with no `hookSpecificOutput` JSON — every other
    # wired PreToolUse hook in this directory signals a block via exit 2
    # + `permissionDecision: deny` JSON (see db-protect.sh, deploy-gate.sh
    # etc.); a bare exit 1 with plain-text stdout doesn't match that
    # contract and is indistinguishable from an unintended script error
    # rather than an intentional block decision. Fixed to match the
    # established convention.
    command -v jq >/dev/null 2>&1 && jq -n \
      --arg reason "🔒 multi-run-lock BLOCKED — $CONFLICT. File: $FILE_PATH đang trong scope của agent khác. Chờ agent đó xong hoặc chạy: rm $LOCK_FILE để reset." \
      '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
    exit 2
  fi
fi

exit 0
