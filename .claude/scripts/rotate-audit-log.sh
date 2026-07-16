#!/usr/bin/env bash
# Yana AI Script
# Version: 1.6.0 | Status: active
# Description: Audit Log Rotation — rotate audit-chain.log when > MAX_SIZE (default 10MB)
# Last Reviewed: 2026-05-23
# Usage: bash rotate-audit-log.sh [--max-size-mb N] [--keep N] [--dry-run]
# Cron-safe: yes (exits 0 if nothing to do)

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
AUDIT_LOG="$STATE_DIR/audit-chain.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EPOCH=$(date +%s)

MAX_SIZE_MB="${YANA_AUDIT_MAX_MB:-10}"
KEEP="${YANA_AUDIT_KEEP:-5}"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-size-mb) shift; MAX_SIZE_MB="$1" ;;
    --keep)        shift; KEEP="$1" ;;
    --dry-run)     DRY_RUN=true ;;
    *) ;;
  esac
  shift
done

if [[ ! -f "$AUDIT_LOG" ]]; then
  echo "[rotate-audit-log] No audit log at $AUDIT_LOG — nothing to do"
  exit 0
fi

# Check size
FILE_SIZE_BYTES=$(stat -c%s "$AUDIT_LOG" 2>/dev/null || stat -f%z "$AUDIT_LOG" 2>/dev/null || echo 0)
MAX_SIZE_BYTES=$(( MAX_SIZE_MB * 1024 * 1024 ))

if [[ "$FILE_SIZE_BYTES" -lt "$MAX_SIZE_BYTES" ]]; then
  SIZE_MB=$(( FILE_SIZE_BYTES / 1024 / 1024 ))
  echo "[rotate-audit-log] Size ${SIZE_MB}MB < ${MAX_SIZE_MB}MB — no rotation needed"
  exit 0
fi

ROTATED="$AUDIT_LOG.$EPOCH"
LINES=$(wc -l < "$AUDIT_LOG" | tr -d ' ')
echo "[rotate-audit-log] Rotating: ${FILE_SIZE_BYTES} bytes, ${LINES} entries"
echo "  → $ROTATED"

if [[ "$DRY_RUN" == true ]]; then
  echo "  [DRY RUN] No changes applied"
  exit 0
fi

# Rotate
cp "$AUDIT_LOG" "$ROTATED"
: > "$AUDIT_LOG"

# Write rotation event to fresh log
# BUG FIX (2026-07-16): this used to write a plain dict with no hash/
# prev_hash at all — verify-audit-chain.sh could never verify it (a missing
# hash field always mismatches the recomputed one), so every rotation
# permanently broke the chain right at its own first entry. Now goes
# through the same shared, lockable, verifiable helper session-rollback.sh
# uses. The log was just truncated above, so tail -1 is empty here and this
# correctly becomes a fresh GENESIS-rooted first entry for the new chain.
source "$(dirname "${BASH_SOURCE[0]}")/lib/audit-chain-append.sh"
ROTATE_INPUT=$(printf '{"archived":"%s","lines_archived":%s,"size_bytes":%s}' "$ROTATED" "$LINES" "$FILE_SIZE_BYTES")
audit_chain_append "rotate-audit-log" "rotate" "system" "$ROTATE_INPUT" "rotated" 2>/dev/null || true

# Prune old rotations beyond KEEP
python3 -c "
import os, glob
logs = sorted(glob.glob('$AUDIT_LOG.*'))
keep = int('$KEEP')
to_delete = logs[:max(0, len(logs) - keep)]
for f in to_delete:
    os.remove(f)
    print(f'  pruned: {f}')
if to_delete:
    print(f'  kept {keep} rotation(s)')
" 2>/dev/null || true

echo "[rotate-audit-log] ✓ Rotation complete"
echo "  Archived : $ROTATED"
echo "  Time     : $TIMESTAMP"
exit 0
