#!/usr/bin/env bash
# Snapshot current session state: git diff + L2 facts → checkpoint file.
# Usage: bash session-checkpoint.sh [--label "description"]
#
# Creates: core/memory/L2_session/checkpoint-<timestamp>.json
# Exit 0 always (non-blocking).

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
L2_DIR="$PROJECT_ROOT/core/memory/L2_session"
CHECKPOINT_DIR="$L2_DIR/checkpoints"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")

LABEL=""
for arg in "$@"; do
  [[ "$arg" == "--label" ]] && shift && LABEL="${1:-}" && shift || true
done

mkdir -p "$CHECKPOINT_DIR"

# ── 1. Git state snapshot ─────────────────────────────────────────────────────
GIT_STATUS=$(git -C "$PROJECT_ROOT" status --short 2>/dev/null | head -50 || echo "")
GIT_DIFF_STAT=$(git -C "$PROJECT_ROOT" diff --stat 2>/dev/null | tail -5 || echo "")
GIT_HEAD=$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo "unknown")

# ── 2. L2 facts snapshot ──────────────────────────────────────────────────────
L2_FACTS=()
while IFS= read -r fact_file; do
  [[ "$(basename "$fact_file")" =~ ^(SCHEMA|INDEX) ]] && continue
  content=$(cat "$fact_file" 2>/dev/null || true)
  L2_FACTS+=("$content")
done < <(find "$L2_DIR" -maxdepth 1 -name "*.md" 2>/dev/null | sort)

# ── 3. Token budget snapshot ──────────────────────────────────────────────────
BUDGET_FILE="$L2_DIR/token-budget.json"
BUDGET_SNAPSHOT=""
[[ -f "$BUDGET_FILE" ]] && BUDGET_SNAPSHOT=$(cat "$BUDGET_FILE" 2>/dev/null || true)

# ── 4. Write checkpoint ───────────────────────────────────────────────────────
CHECKPOINT_FILE="$CHECKPOINT_DIR/checkpoint-${TIMESTAMP}.json"

python3 - "$CHECKPOINT_FILE" "$NOW" "$GIT_HEAD" "$GIT_BRANCH" "$LABEL" <<PYEOF
import json, sys

out_path, now, git_head, git_branch, label = sys.argv[1:6]

data = {
    "created_at": now,
    "label": label,
    "git": {
        "head": git_head,
        "branch": git_branch,
        "status": """$GIT_STATUS""",
        "diff_stat": """$GIT_DIFF_STAT"""
    },
    "l2_facts_count": ${#L2_FACTS[@]},
    "budget_snapshot": """$BUDGET_SNAPSHOT""".strip() or None,
}

with open(out_path, 'w') as f:
    json.dump(data, f, indent=2)

print(f"checkpoint: {out_path}")
PYEOF

# Keep only last 10 checkpoints
CHECKPOINT_COUNT=$(find "$CHECKPOINT_DIR" -name "checkpoint-*.json" | wc -l | tr -d ' ')
if [[ "$CHECKPOINT_COUNT" -gt 10 ]]; then
  find "$CHECKPOINT_DIR" -name "checkpoint-*.json" | sort | head -$((CHECKPOINT_COUNT - 10)) | xargs rm -f
fi

LABEL_SUFFIX="${LABEL:+ ($LABEL)}"
echo "[session-checkpoint] Checkpoint saved${LABEL_SUFFIX} — HEAD: ${GIT_HEAD:0:8}"
echo "[session-checkpoint] File: $CHECKPOINT_FILE"
