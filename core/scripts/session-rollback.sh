#!/usr/bin/env bash
# Yana AI Script
# Version: 1.6.0 | Status: active
# Description: Session Rollback — restore working tree to a saved checkpoint
# Last Reviewed: 2026-05-23
# Requires: git, python3

set -uo pipefail

command -v git     >/dev/null 2>&1 || { echo "[session-rollback] ERROR: git not found"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "[session-rollback] ERROR: python3 not found"; exit 1; }

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
CHECKPOINT_DIR="$STATE_DIR/checkpoints"
L2_DIR="$PROJECT_DIR/memory/L2_session"
INDEX_FILE="$CHECKPOINT_DIR/index.json"

TARGET_ID=""
DRY_RUN=false
FORCE=false
LIST_MODE=false
RESTORE_L2=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id)         TARGET_ID="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=true; shift ;;
    --force)      FORCE=true; shift ;;
    --list)       LIST_MODE=true; shift ;;
    --restore-l2) RESTORE_L2=true; shift ;;
    *)            shift ;;
  esac
done

# -- List mode
if [[ "$LIST_MODE" == true ]]; then
  if [[ ! -f "$INDEX_FILE" ]]; then
    echo "[session-rollback] No checkpoints found"; exit 0
  fi
  echo ""
  echo "  Available checkpoints:"
  echo "  ─────────────────────────────────────────────"
  python3 -c "
import json
idx = json.load(open('$INDEX_FILE'))
cps = idx.get('checkpoints', [])
latest = idx.get('latest', '')
for cp in reversed(cps):
    m = ' <- latest' if cp['id'] == latest else ''
    print(f\"  {cp['id']}  {cp['created_at']}  [{cp['label']}]{m}\")
print(f'  Total: {len(cps)} checkpoints')
"
  echo ""; exit 0
fi

# -- Sovereign check
SOVEREIGN="${YANA_SOVEREIGN_NAME:-}"
if [[ -z "$SOVEREIGN" ]]; then
  echo "[session-rollback] BLOCK: YANA_SOVEREIGN_NAME not set"
  echo "  Set: export YANA_SOVEREIGN_NAME='your name'"
  exit 2
fi

# -- Resolve checkpoint
if [[ ! -f "$INDEX_FILE" ]]; then
  echo "[session-rollback] ERROR: No checkpoint index at $INDEX_FILE"; exit 1
fi

if [[ -z "$TARGET_ID" ]]; then
  TARGET_ID=$(python3 -c "import json; print(json.load(open('$INDEX_FILE')).get('latest',''))" 2>/dev/null || true)
  [[ -z "$TARGET_ID" ]] && { echo "[session-rollback] ERROR: No checkpoints in index"; exit 1; }
  echo "[session-rollback] Using latest: $TARGET_ID"
fi

CP_DIR="$CHECKPOINT_DIR/$TARGET_ID"
MANIFEST="$CP_DIR/manifest.json"
DIFF_FILE="$CP_DIR/changes.diff"

if [[ ! -d "$CP_DIR" ]]; then
  echo "[session-rollback] ERROR: Checkpoint not found: $TARGET_ID"
  echo "  Use --list to see available checkpoints"
  exit 1
fi

[[ ! -f "$MANIFEST" ]] && { echo "[session-rollback] ERROR: manifest missing in $CP_DIR"; exit 1; }

# -- Show info
echo ""
echo "  Yana AI SESSION ROLLBACK"
echo "  ─────────────────────────────────────────────"
python3 -c "
import json
m = json.load(open('$MANIFEST'))
print(f\"  Checkpoint : {m['id']}\")
print(f\"  Created    : {m['created_at']}\")
print(f\"  Label      : {m['label']}\")
print(f\"  Branch     : {m['git']['branch']}\")
print(f\"  HEAD       : {m['git']['head'][:12]}...\")
print(f\"  Diff lines : {m['git']['diff_lines']}\")
print(f\"  L2 facts   : {m['l2_facts_count']}\")
"
echo ""

DIFF_LINES=$(wc -l < "$DIFF_FILE" 2>/dev/null | tr -d ' ' || echo 0)

# -- Dry run (check before anything else)
if [[ "$DRY_RUN" == true ]]; then
  if [[ "$DIFF_LINES" -gt 0 ]]; then
    echo "  Files that would be restored:"
    grep "^diff --git" "$DIFF_FILE" | sed 's/diff --git a\//  * /' | sed 's/ b\/.*//' | head -20
  else
    echo "  No file changes at this checkpoint (working tree was clean)"
  fi
  echo "  [DRY RUN] No changes applied."; exit 0
fi

if [[ "$DIFF_LINES" -eq 0 ]]; then
  echo "  No file changes at this checkpoint"
  [[ "$RESTORE_L2" == false ]] && { echo "  Nothing to rollback."; exit 0; }
else
  echo "  Files to restore:"
  grep "^diff --git" "$DIFF_FILE" | sed 's/diff --git a\//  * /' | sed 's/ b\/.*//' | head -20
  echo ""
fi

# -- Confirm
if [[ "$FORCE" != true ]]; then
  printf "  Confirm rollback? (yes/no): "
  read -r CONFIRM
  [[ "$CONFIRM" != "yes" ]] && { echo "  Rollback cancelled."; exit 0; }
  echo ""
fi

# -- Pre-rollback checkpoint
echo "  [1/4] Saving pre-rollback snapshot..."
YANA_CHECKPOINT_BYPASS=0 bash "$(dirname "$0")/session-checkpoint.sh" \
  --name "pre-rollback-$(date +%s)" --force 2>/dev/null || true

# -- Apply rollback
echo "  [2/4] Restoring working tree..."
if [[ "$DIFF_LINES" -gt 0 ]]; then
  if git -C "$PROJECT_DIR" apply --reverse "$DIFF_FILE" 2>/dev/null; then
    echo "         OK: reverse-applied diff"
  else
    git -C "$PROJECT_DIR" checkout HEAD -- . 2>/dev/null || true
    echo "         OK: reset to HEAD (reverse-apply failed)"
  fi
else
  echo "         Nothing to apply (was clean)"
fi

# -- Restore L2
echo "  [3/4] L2 session facts..."
L2_SNAPSHOT="$CP_DIR/L2_snapshot"
if [[ "$RESTORE_L2" == true && -d "$L2_SNAPSHOT" ]]; then
  COUNT=$(find "$L2_SNAPSHOT" -maxdepth 1 -name "*.md" \
    ! -name "SCHEMA.md" ! -name "INDEX.md" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$COUNT" -gt 0 ]]; then
    mkdir -p "$L2_DIR"
    find "$L2_DIR" -maxdepth 1 -name "*.md" \
      ! -name "SCHEMA.md" ! -name "INDEX.md" -delete 2>/dev/null || true
    cp "$L2_SNAPSHOT"/*.md "$L2_DIR/" 2>/dev/null || true
    echo "         Restored $COUNT L2 facts"
  fi
else
  echo "         Skipped (add --restore-l2 to include)"
fi

# -- Audit entry
# BUG FIX (2026-07-16): this used to hand-roll its own entry (no prev_hash,
# a different hash formula than audit-log.sh/verify-audit-chain.sh use, and
# no lock) — every rollback permanently broke the chain. Now goes through
# the shared helper both this script and rotate-audit-log.sh use, which
# produces a verifiable entry and takes the same lock audit-log.sh does.
echo "  [4/4] Writing audit entry..."
source "$(dirname "${BASH_SOURCE[0]}")/lib/audit-chain-append.sh"
# SECURITY FIX (2026-07-16, code-auditor review): TARGET_ID used to be
# spliced directly into a Python string literal inside `python3 -c "..."` —
# a value containing a stray quote could break out of the literal and
# execute arbitrary Python. Passed via a real environment variable instead,
# read with os.environ (never interpolated into source text) so no value
# of TARGET_ID/RESTORE_L2 can be parsed as anything but data.
ROLLBACK_INPUT=$(YANA_ROLLBACK_TARGET_ID="$TARGET_ID" YANA_ROLLBACK_RESTORE_L2="$RESTORE_L2" python3 -c "
import json, os
print(json.dumps({
    'checkpoint_id': os.environ.get('YANA_ROLLBACK_TARGET_ID', ''),
    'restore_l2': os.environ.get('YANA_ROLLBACK_RESTORE_L2', 'false') == 'true',
}))
" 2>/dev/null || echo '{}')
audit_chain_append "session-rollback" "rollback" "sovereign:$SOVEREIGN" "$ROLLBACK_INPUT" "rollback_applied" 2>/dev/null || true

echo ""
echo "  Rollback complete"
echo "  Checkpoint : $TARGET_ID"
echo "  Sovereign  : $SOVEREIGN"
echo "  Time       : $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""
exit 0
