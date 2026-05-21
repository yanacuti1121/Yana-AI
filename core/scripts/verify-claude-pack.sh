#!/usr/bin/env bash
set -euo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$ROOT"

# Support two layouts:
#   source repo:    core/scripts/verify-claude-pack.js  (this repo)
#   installed pack: .claude/scripts/verify-claude-pack.js  (target project)
if [[ -f ".claude/scripts/verify-claude-pack.js" ]]; then
  SCRIPTS_DIR=".claude/scripts"
elif [[ -f "core/scripts/verify-claude-pack.js" ]]; then
  SCRIPTS_DIR="core/scripts"
else
  echo "ERROR: verify-claude-pack.js not found (tried .claude/scripts/ and core/scripts/)" >&2
  exit 1
fi

node "$SCRIPTS_DIR/verify-claude-pack.js"
node "$SCRIPTS_DIR/hook-health.js"
