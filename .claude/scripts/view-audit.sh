#!/usr/bin/env bash
# View the YAMTAM hash-chain audit log in human-readable format.
# Use core/scripts/verify-audit-chain.sh to check integrity.

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_FILE="$PROJECT_ROOT/.claude/state/audit-chain.log"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "No audit log found at $LOG_FILE."
  exit 0
fi

echo "--- YAMTAM ENGINE Audit Log (hash-chain) ---"
if command -v jq >/dev/null 2>&1; then
  jq -r '"[\(.ts)] \(.tool) | agent=\(.agent) | decision=\(.decision)\n  input: \(.input)\n  hash:  \(.hash[0:16])..."' "$LOG_FILE"
else
  cat "$LOG_FILE"
fi
