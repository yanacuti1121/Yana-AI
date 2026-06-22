#!/usr/bin/env bash
# Yana AI — Audit Chain Verifier
# Reads audit-chain.log and recomputes SHA-256 hashes in sequence.
# Exit 0: chain intact. Exit 1: first broken entry printed + bail.
#
# Usage:
#   bash core/scripts/verify-audit-chain.sh              # uses default log
#   bash core/scripts/verify-audit-chain.sh /path/to/log # explicit path

set -uo pipefail

command -v jq >/dev/null 2>&1 || { echo "ERROR: jq required"; exit 2; }

# macOS ships neither sha256sum nor an alias for it; `shasum -a 256` is the
# native equivalent and emits the same "<hash>  -" output format.
if command -v sha256sum >/dev/null 2>&1; then
  SHA256=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  SHA256=(shasum -a 256)
else
  echo "ERROR: sha256sum or shasum required"; exit 2
fi

STATE_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/state"
LOG_FILE="${1:-$STATE_DIR/audit-chain.log}"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "INFO: No audit chain log found at $LOG_FILE"
  exit 0
fi

GENESIS_HASH=$(printf 'YANA_GENESIS' | "${SHA256[@]}" | awk '{print $1}')
EXPECTED_PREV="$GENESIS_HASH"
LINE_NUM=0

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  LINE_NUM=$((LINE_NUM + 1))

  TS=$(printf '%s' "$line" | jq -r '.ts // ""' 2>/dev/null || true)
  HOOK=$(printf '%s' "$line" | jq -r '.hook // ""' 2>/dev/null || true)
  TOOL=$(printf '%s' "$line" | jq -r '.tool // ""' 2>/dev/null || true)
  AGENT=$(printf '%s' "$line" | jq -r '.agent // ""' 2>/dev/null || true)
  INPUT=$(printf '%s' "$line" | jq -r '.input // ""' 2>/dev/null || true)
  DECISION=$(printf '%s' "$line" | jq -r '.decision // ""' 2>/dev/null || true)
  STORED_PREV=$(printf '%s' "$line" | jq -r '.prev_hash // ""' 2>/dev/null || true)
  STORED_HASH=$(printf '%s' "$line" | jq -r '.hash // ""' 2>/dev/null || true)

  if [[ "$STORED_PREV" != "$EXPECTED_PREV" ]]; then
    echo "CHAIN BROKEN at entry $LINE_NUM — prev_hash mismatch"
    echo "  expected prev : $EXPECTED_PREV"
    echo "  stored   prev : $STORED_PREV"
    echo "  entry         : $TS | $TOOL | $AGENT"
    exit 1
  fi

  CONTENT="${TS}|${HOOK}|${TOOL}|${AGENT}|${INPUT}|${DECISION}"
  EXPECTED_HASH=$(printf '%s|%s' "$CONTENT" "$STORED_PREV" | "${SHA256[@]}" | awk '{print $1}')

  if [[ "$STORED_HASH" != "$EXPECTED_HASH" ]]; then
    echo "CHAIN BROKEN at entry $LINE_NUM — hash mismatch (entry may be tampered)"
    echo "  expected hash : $EXPECTED_HASH"
    echo "  stored   hash : $STORED_HASH"
    echo "  entry         : $TS | $TOOL | $AGENT"
    exit 1
  fi

  EXPECTED_PREV="$STORED_HASH"
done < "$LOG_FILE"

echo "OK: audit chain intact ($LINE_NUM entries verified)"
exit 0
