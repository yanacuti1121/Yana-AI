#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Auto-checkpoint trigger — calls session-checkpoint.sh every N tool calls
# Hook type: PostToolUse
# Last Reviewed: 2026-05-23
#
# Thin wrapper around core/scripts/session-checkpoint.sh.
# Install in settings.json hooks.PostToolUse alongside audit-log.sh.
#
# Config via env:
#   YANA_CHECKPOINT_EVERY=5    — checkpoint every N tool calls (default: 5)
#   YANA_MAX_CHECKPOINTS=10    — max checkpoints to keep (default: 10)
#   YANA_CHECKPOINT_BYPASS=1   — disable auto-checkpointing

set -uo pipefail

[[ "${YANA_CHECKPOINT_BYPASS:-0}" == "1" ]] && exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$(dirname "$SCRIPT_DIR")/scripts"

if [[ -f "$SCRIPTS_DIR/session-checkpoint.sh" ]]; then
  bash "$SCRIPTS_DIR/session-checkpoint.sh"
else
  # Fallback: try relative from project dir
  PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
  FALLBACK="$PROJECT_DIR/core/scripts/session-checkpoint.sh"
  [[ -f "$FALLBACK" ]] && bash "$FALLBACK"
fi

exit 0
