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

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_ROOT/.claude/state"
LOG_FILE="${1:-$STATE_DIR/audit-chain.log}"
KNOWN_BREAKS_FILE="$PROJECT_ROOT/core/config/audit-chain-known-breaks.json"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "INFO: No audit chain log found at $LOG_FILE"
  exit 0
fi

# A documented, human-reviewed exception list for entries whose prev_hash
# legitimately doesn't match the running EXPECTED_PREV — e.g. a concurrent-
# write race captured and fixed after the fact (see audit-log.sh's 2026-07-16
# mkdir-lock fix).
#
# SECURITY FIX (2026-07-16, code-auditor review, reproduced live): the first
# version of this function matched on ts+hash alone, on the theory that the
# entry's own hash-self-check below (against its OWN claimed prev_hash)
# made forgery infeasible. That reasoning was incomplete and the bypass was
# demonstrated: an attacker who can already write to audit-chain.log (the
# exact threat model this file exists to catch) doesn't need to forge
# anything — they can fabricate arbitrary garbage as entry 1, then splice
# in a byte-for-byte copy of any real allowlisted line from elsewhere in
# real history as entry 2. ts+hash still matched, the self-check still
# passed (it's a real, previously-valid entry), and verification silently
# resumed as if the fabricated entry 1 had never happened — exit 0, no
# CHAIN BROKEN line, indistinguishable from a clean run.
#
# The fix: also require the CURRENT, ACTUALLY-COMPUTED $EXPECTED_PREV (the
# value this script has genuinely derived by walking every real entry from
# GENESIS up to this point in THIS run) to match a value recorded in the
# allowlist at the time a human reviewed the real historical break. An
# attacker can still replay the ts+hash pair, but they cannot make the
# genuinely-computed EXPECTED_PREV match the recorded one without either
# reproducing the entire real, untampered prefix up to that exact point
# (which defeats forging anything) or a SHA-256 preimage attack (treated as
# infeasible). This is what the original comment claimed to guarantee.
is_known_break() {
  local ts="$1" hash="$2" expected_prev="$3"
  [[ -f "$KNOWN_BREAKS_FILE" ]] || return 1
  jq -e --arg ts "$ts" --arg hash "$hash" --arg expected_prev "$expected_prev" \
    '(.known_breaks // []) | any(.ts == $ts and .hash == $hash and .expected_prev == $expected_prev)' \
    "$KNOWN_BREAKS_FILE" >/dev/null 2>&1
}

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
    if is_known_break "$TS" "$STORED_HASH" "$EXPECTED_PREV"; then
      echo "NOTE: entry $LINE_NUM ($TS | $TOOL | $AGENT) is a documented, reviewed break — see core/config/audit-chain-known-breaks.json. Its own hash is still verified below; continuing the chain from it."
    else
      echo "CHAIN BROKEN at entry $LINE_NUM — prev_hash mismatch"
      echo "  expected prev : $EXPECTED_PREV"
      echo "  stored   prev : $STORED_PREV"
      echo "  entry         : $TS | $TOOL | $AGENT"
      exit 1
    fi
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
