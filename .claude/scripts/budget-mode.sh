#!/usr/bin/env bash
# Budget Mode toggle — YAMTAM ENGINE v1.2 patch
# Manages .claude/state/BUDGET_MODE deterministically without depending on Claude.
#
# Usage:
#   .claude/scripts/budget-mode.sh on
#   .claude/scripts/budget-mode.sh off
#   .claude/scripts/budget-mode.sh status

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
STATE_FILE="$STATE_DIR/BUDGET_MODE"

ACTION="${1:-status}"

case "$ACTION" in
  on)
    mkdir -p "$STATE_DIR"
    printf 'on' > "$STATE_FILE"
    echo "Budget mode: ON"
    echo "  - cost-guard.sh now applies stricter rules"
    echo "  - state file: $STATE_FILE"
    ;;
  off)
    rm -f "$STATE_FILE"
    echo "Budget mode: OFF"
    ;;
  status)
    if [[ -f "$STATE_FILE" ]]; then
      value="$(tr -d '[:space:]' < "$STATE_FILE" 2>/dev/null || echo unknown)"
      if [[ "$value" == "on" ]]; then
        echo "Budget mode: ON"
      else
        echo "Budget mode: file present but value not 'on' (value: $value) — treated as OFF"
      fi
    else
      echo "Budget mode: OFF"
    fi
    ;;
  *)
    echo "Usage: $0 {on|off|status}" >&2
    exit 2
    ;;
esac

exit 0
