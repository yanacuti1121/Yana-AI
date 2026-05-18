#!/usr/bin/env bash
# YAMTAM ENGINE — Session Trust Score
# Tracks trust level within the current session.
# Decrements on Truth Gate warnings; floor is 0.
# Score < 50 triggers "LOW TRUST" double-evidence requirement.
#
# Usage:
#   session-trust.sh get          — print current score (default 100)
#   session-trust.sh show         — alias for get
#   session-trust.sh decrement N  — subtract N, floor 0, write back, print new score
#   session-trust.sh reset        — set score to 100, print 100
#
# State file: .claude/state/session-trust.json (gitignored)

set -uo pipefail

STATE_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/state"
STATE_FILE="$STATE_DIR/session-trust.json"

get_score() {
  if [[ -f "$STATE_FILE" ]]; then
    local val
    val=$(grep -oE '"score"[[:space:]]*:[[:space:]]*[0-9]+' "$STATE_FILE" 2>/dev/null \
          | grep -oE '[0-9]+$' | tail -1)
    echo "${val:-100}"
  else
    echo 100
  fi
}

write_score() {
  mkdir -p "$STATE_DIR" 2>/dev/null || true
  printf '{"score":%d}\n' "$1" > "$STATE_FILE"
}

CMD="${1:-show}"
N="${2:-10}"

case "$CMD" in
  get|show)
    get_score
    ;;
  decrement)
    CURRENT=$(get_score)
    NEW=$(( CURRENT - N ))
    [[ $NEW -lt 0 ]] && NEW=0
    write_score "$NEW"
    echo "$NEW"
    ;;
  reset)
    write_score 100
    echo 100
    ;;
  *)
    echo "Usage: session-trust.sh [get|show|decrement N|reset]" >&2
    exit 1
    ;;
esac
