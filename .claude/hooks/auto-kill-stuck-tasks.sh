#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Kill tasks stuck > timeout threshold
# Last Reviewed: 2026-05-19
# PostToolUse hook — Yana AI v1.2 Stuck Task Monitor
#
# Safe by default: warns about likely-stuck test/browser processes. It only kills
# when YANA_AUTO_KILL=1 is set. This avoids killing legitimate user processes.

set -uo pipefail

THRESHOLD_SECONDS="${YANA_STUCK_THRESHOLD_SECONDS:-3600}"
STATE_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/state"
mkdir -p "$STATE_DIR" 2>/dev/null || true
LOG_FILE="$STATE_DIR/stuck-tasks.log"

# GNU ps etimes is elapsed time in seconds. If unavailable, fail open.
ps -eo pid=,etimes=,args= 2>/dev/null | while read -r pid etimes cmd; do
  [[ -z "${pid:-}" || -z "${etimes:-}" || -z "${cmd:-}" ]] && continue
  [[ "$etimes" =~ ^[0-9]+$ ]] || continue
  if (( etimes > THRESHOLD_SECONDS )) && [[ "$cmd" =~ (playwright|chrome-headless|chromium|npm[[:space:]]+run[[:space:]]+test:e2e|pnpm.*test:e2e) ]]; then
    printf '%s | WARN likely stuck process pid=%s age=%ss cmd=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$pid" "$etimes" "$cmd" >> "$LOG_FILE"
    if [[ "${YANA_AUTO_KILL:-0}" == "1" ]]; then
      kill "$pid" 2>/dev/null || true
      printf '{"decision":"warn","reason":"Stuck Task Monitor: killed allowlisted process pid=%s after %ss. Log: .claude/state/stuck-tasks.log"}\n' "$pid" "$etimes"
    else
      printf '{"decision":"warn","reason":"Stuck Task Monitor: likely stuck process detected, not killed. Set YANA_AUTO_KILL=1 to allow kill. Log: .claude/state/stuck-tasks.log"}\n'
    fi
    exit 0
  fi
done

exit 0
