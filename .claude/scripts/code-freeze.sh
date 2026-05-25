#!/usr/bin/env bash
# Code Freeze toggle — YAMTAM ENGINE v1.3.26
# Emergency kill-switch for AI write operations.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
STATE_FILE="$STATE_DIR/CODE_FREEZE"
ACTION="${1:-status}"

case "$ACTION" in
  on)
    mkdir -p "$STATE_DIR"
    printf 'on' > "$STATE_FILE"
    echo "🧊 CODE FREEZE: ON"
    echo ""
    echo "What this blocks:"
    echo "  - Write, Edit, NotebookEdit"
    echo "  - Bash commands (except read-only)"
    echo "  - Any operation that modifies files"
    echo ""
    echo "What still works:"
    echo "  - Read, Glob, Grep"
    echo "  - Read-only Bash: ls, cat, grep, git status, git diff"
    echo ""
    echo "To unfreeze: $0 off"
    ;;
  off)
    rm -f "$STATE_FILE"
    echo "✅ CODE FREEZE: OFF — normal operations resumed"
    ;;
  status)
    if [[ -f "$STATE_FILE" ]]; then
      state=$(tr -d '[:space:]' < "$STATE_FILE" 2>/dev/null || echo unknown)
      if [[ "$state" == "on" ]]; then
        echo "🧊 CODE FREEZE: ON"
      else
        echo "Code Freeze: file exists but invalid value — treated as OFF"
      fi
    else
      echo "Code Freeze: OFF"
    fi
    ;;
  *)
    echo "Usage: $0 {on|off|status}" >&2
    exit 2
    ;;
esac
exit 0
