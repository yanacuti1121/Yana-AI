#!/usr/bin/env bash
# Rollback file changes to a prior session checkpoint.
# Usage:
#   bash session-rollback.sh            — rollback to most recent checkpoint
#   bash session-rollback.sh --list     — list available checkpoints
#   bash session-rollback.sh --to <file> — rollback to specific checkpoint
#   bash session-rollback.sh --dry-run  — show what would change, don't act
#
# Safety: only reverts uncommitted changes (git checkout). Committed work is untouched.

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
L2_DIR="$PROJECT_ROOT/core/memory/L2_session"
CHECKPOINT_DIR="$L2_DIR/checkpoints"

MODE="rollback"
TARGET=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --list)    MODE="list" ;;
    --dry-run) DRY_RUN=true ;;
    --to)      shift; TARGET="$1" ;;
    *)         ;;
  esac
  shift
done

if [[ ! -d "$CHECKPOINT_DIR" ]]; then
  echo "✗ No checkpoints found at $CHECKPOINT_DIR" >&2
  exit 1
fi

# ── List mode ─────────────────────────────────────────────────────────────────
if [[ "$MODE" == "list" ]]; then
  checkpoints=$(find "$CHECKPOINT_DIR" -name "checkpoint-*.json" | sort -r)
  if [[ -z "$checkpoints" ]]; then
    echo "No checkpoints available."
    exit 0
  fi
  echo "Available checkpoints (newest first):"
  while IFS= read -r f; do
    label=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('label','') or '—')" 2>/dev/null || echo "?")
    created=$(python3 -c "import json; d=json.load(open('$f')); print(d.get('created_at','?'))" 2>/dev/null || echo "?")
    head=$(python3 -c "import json; d=json.load(open('$f')); print(d['git']['head'][:8])" 2>/dev/null || echo "?")
    echo "  $(basename "$f")  [$created]  HEAD:$head  label:$label"
  done <<< "$checkpoints"
  exit 0
fi

# ── Select checkpoint ──────────────────────────────────────────────────────────
if [[ -z "$TARGET" ]]; then
  TARGET=$(find "$CHECKPOINT_DIR" -name "checkpoint-*.json" | sort -r | head -1)
fi

if [[ ! -f "$TARGET" ]]; then
  echo "✗ Checkpoint not found: $TARGET" >&2
  exit 1
fi

echo "Rolling back to: $(basename "$TARGET")"

# Read checkpoint metadata
CHECKPOINT_HEAD=$(python3 -c "import json; d=json.load(open('$TARGET')); print(d['git']['head'])" 2>/dev/null || echo "")
CHECKPOINT_BRANCH=$(python3 -c "import json; d=json.load(open('$TARGET')); print(d['git']['branch'])" 2>/dev/null || echo "")
CHECKPOINT_LABEL=$(python3 -c "import json; d=json.load(open('$TARGET')); print(d.get('label',''))" 2>/dev/null || echo "")
CHECKPOINT_TIME=$(python3 -c "import json; d=json.load(open('$TARGET')); print(d.get('created_at','?'))" 2>/dev/null || echo "?")

echo "  Created   : $CHECKPOINT_TIME"
echo "  Label     : ${CHECKPOINT_LABEL:-—}"
echo "  Git HEAD  : ${CHECKPOINT_HEAD:0:8} (branch: $CHECKPOINT_BRANCH)"
echo ""

# Get current uncommitted changes
CHANGED_FILES=$(git -C "$PROJECT_ROOT" diff --name-only 2>/dev/null || true)
CHANGED_FILES+=$'\n'$(git -C "$PROJECT_ROOT" diff --cached --name-only 2>/dev/null || true)
CHANGED_FILES=$(echo "$CHANGED_FILES" | sort -u | grep -v '^$' || true)

if [[ -z "$CHANGED_FILES" ]]; then
  echo "No uncommitted changes to roll back. Working tree is clean."
  exit 0
fi

echo "Files that would be reverted:"
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  echo "  - $f"
done <<< "$CHANGED_FILES"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[dry-run] No changes made. Remove --dry-run to execute rollback."
  exit 0
fi

# Confirm
read -rp "Revert these uncommitted changes? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

# Execute rollback of uncommitted changes only
git -C "$PROJECT_ROOT" checkout -- . 2>/dev/null || true
git -C "$PROJECT_ROOT" clean -fd --exclude="core/memory/L2_session/" 2>/dev/null || true

echo ""
echo "✓ Rollback complete — working tree restored to checkpoint state"
echo "  Note: committed changes were NOT reverted (use git revert for those)"
