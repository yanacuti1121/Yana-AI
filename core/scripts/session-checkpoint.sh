#!/usr/bin/env bash
# YAMTAM ENGINE Script
# Version: 1.6.0 | Status: active
# Description: Session Checkpoint — snapshot git state + L2 facts every N tool calls
# Last Reviewed: 2026-05-23
# Hook type: called by session-checkpoint-hook.sh (PostToolUse)
# Requires: git, python3

set -uo pipefail

[[ "${YAMTAM_CHECKPOINT_BYPASS:-0}" == "1" ]] && exit 0

command -v git     >/dev/null 2>&1 || { echo "[session-checkpoint] git not found — skipping"; exit 0; }
command -v python3 >/dev/null 2>&1 || { echo "[session-checkpoint] python3 not found — skipping"; exit 0; }

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
CHECKPOINT_DIR="$STATE_DIR/checkpoints"
L2_DIR="$PROJECT_DIR/memory/L2_session"
BUDGET_FILE="${YAMTAM_TOKEN_BUDGET:-$STATE_DIR/token-budget.json}"
COUNTER_FILE="$STATE_DIR/checkpoint-counter.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EPOCH=$(date +%s)
MAX_CHECKPOINTS="${YAMTAM_MAX_CHECKPOINTS:-10}"
CHECKPOINT_EVERY="${YAMTAM_CHECKPOINT_EVERY:-5}"

# -- Parse args
CHECKPOINT_NAME=""
FORCE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)  CHECKPOINT_NAME="$2"; shift 2 ;;
    --force) FORCE=true; shift ;;
    *)       shift ;;
  esac
done

mkdir -p "$CHECKPOINT_DIR"

# -- Must be a git repo
if ! git -C "$PROJECT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  echo "[session-checkpoint] Not a git repo — skipping"
  exit 0
fi

# -- Auto-trigger: only every N calls
if [[ "$FORCE" != true ]]; then
  [[ ! -f "$COUNTER_FILE" ]] && echo '{"count":0}' > "$COUNTER_FILE"
  CURRENT_COUNT=$(python3 -c "import json; print(json.load(open('$COUNTER_FILE')).get('count',0))")
  NEXT_COUNT=$((CURRENT_COUNT + 1))
  python3 -c "import json; d=json.load(open('$COUNTER_FILE')); d['count']=$NEXT_COUNT; json.dump(d,open('$COUNTER_FILE','w'),indent=2)"
  (( NEXT_COUNT % CHECKPOINT_EVERY != 0 )) && exit 0
fi

# -- Checkpoint ID
CP_ID="cp-${EPOCH}"
[[ -n "$CHECKPOINT_NAME" ]] && CP_ID="cp-${EPOCH}-${CHECKPOINT_NAME//[^a-zA-Z0-9]/-}"
CP_DIR="$CHECKPOINT_DIR/$CP_ID"
mkdir -p "$CP_DIR"

# -- 1. Save git diff
GIT_STATUS=$(git -C "$PROJECT_DIR" status --porcelain 2>/dev/null || true)
HAS_CHANGES=false
[[ -n "$GIT_STATUS" ]] && HAS_CHANGES=true

git -C "$PROJECT_DIR" diff HEAD > "$CP_DIR/changes.diff" 2>/dev/null || touch "$CP_DIR/changes.diff"
DIFF_LINES=$(wc -l < "$CP_DIR/changes.diff" | tr -d ' ')

# -- 2. Git HEAD + branch
GIT_HEAD=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "no-commits")
GIT_BRANCH=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo "detached")

# -- 3. L2 snapshot
L2_SNAPSHOT_DIR="$CP_DIR/L2_snapshot"
mkdir -p "$L2_SNAPSHOT_DIR"
L2_COUNT=0
if [[ -d "$L2_DIR" ]]; then
  cp "$L2_DIR"/*.md "$L2_SNAPSHOT_DIR/" 2>/dev/null || true
  L2_COUNT=$(find "$L2_SNAPSHOT_DIR" -maxdepth 1 -name "*.md" \
    ! -name "SCHEMA.md" ! -name "INDEX.md" 2>/dev/null | wc -l | tr -d ' ')
fi

# -- 4. Token budget snapshot
TOKENS_USED=0
if [[ -f "$BUDGET_FILE" ]]; then
  cp "$BUDGET_FILE" "$CP_DIR/token-budget-snapshot.json" 2>/dev/null || true
  TOKENS_USED=$(python3 -c "import json; print(json.load(open('$BUDGET_FILE')).get('total_tokens_used',0))" 2>/dev/null || echo 0)
fi

# -- 5. Write manifest
TOOL_COUNT=$(python3 -c "import json; print(json.load(open('$COUNTER_FILE')).get('count',0))" 2>/dev/null || echo 0)
HAS_CHANGES_PY=$( [[ "$HAS_CHANGES" == true ]] && echo True || echo False )

python3 -c "
import json
m = {
  'id': '$CP_ID',
  'created_at': '$TIMESTAMP',
  'epoch': $EPOCH,
  'label': '${CHECKPOINT_NAME:-auto}',
  'git': {
    'head': '$GIT_HEAD',
    'branch': '$GIT_BRANCH',
    'had_changes': $HAS_CHANGES_PY,
    'diff_lines': $DIFF_LINES
  },
  'l2_facts_count': $L2_COUNT,
  'tokens_used_at_checkpoint': $TOKENS_USED,
  'tool_calls_at_checkpoint': $TOOL_COUNT
}
json.dump(m, open('$CP_DIR/manifest.json','w'), indent=2)
print('manifest written')
"

# -- 6. Update index
python3 -c "
import json, os, shutil
idx_f = '$CHECKPOINT_DIR/index.json'
idx = json.load(open(idx_f)) if os.path.exists(idx_f) else {'checkpoints':[]}
idx['checkpoints'].append({'id':'$CP_ID','created_at':'$TIMESTAMP','label':'${CHECKPOINT_NAME:-auto}','git_head':'$GIT_HEAD'})
idx['latest'] = '$CP_ID'
idx['count'] = len(idx['checkpoints'])
max_cp = $MAX_CHECKPOINTS
if len(idx['checkpoints']) > max_cp:
    for old in idx['checkpoints'][:-max_cp]:
        old_path = os.path.join('$CHECKPOINT_DIR', old['id'])
        shutil.rmtree(old_path, ignore_errors=True)
    idx['checkpoints'] = idx['checkpoints'][-max_cp:]
json.dump(idx, open(idx_f,'w'), indent=2)
"

echo "[session-checkpoint] ✓ Checkpoint saved: $CP_ID (branch=$GIT_BRANCH, L2=$L2_COUNT facts, tokens=$TOKENS_USED)"
exit 0
