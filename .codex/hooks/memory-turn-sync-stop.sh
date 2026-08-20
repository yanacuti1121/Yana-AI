#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Stop -- auto-capture the last turn into a local memory log (hermes_adapted Phase 5a)
# Last Reviewed: 2026-08-20
#
# hermes_adapted Phase 5a (NousResearch/hermes-agent, MIT) -- wires
# core/lib/hermes_adapted/memory_manager.py's MemoryManager into a live hook
# via the new core/lib/hermes_adapted/memory_manager_io.py adapter, using the
# REAL conversation transcript (Stop event's transcript_path, same field
# core/hooks/context-compress-stop.sh already reads).
#
# Write path only: this captures the last user/assistant turn pair into a
# local JSONL log. It does NOT implement recall/prefetch and does NOT touch
# core/hooks/session-bootstrap.sh (Phase 1, already live) -- that stays a
# separate, later decision. See memory_manager_io.py's module docstring for
# why several MemoryProvider Protocol methods are stubbed rather than wired.
#
# Runs alongside context-compress-stop.sh (different Stop hook entry, same
# event) -- both read transcript_path independently and write to different
# locations, so neither affects the other.
#
# State: .claude/state/memory-turn-log.jsonl -- plain append-only JSONL, not
# the per-session JSON object other hermes_adapted state files use, since
# this is a sequential log rather than mutable per-session state. Pruned by
# age and count on every write (memory_manager_io.py's _append_and_prune).
#
# Never blocks (always exit 0). Fails open on missing jq/python3, missing
# transcript, or any Python exception (memory capture is a nice-to-have, not
# a safety control).
#
# Hook event:   Stop
# Bypass:       YANA_MEMORY_SYNC_BYPASS=1

set -uo pipefail

[[ "${YANA_MEMORY_SYNC_BYPASS:-}" == "1" ]] && exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
LOG_FILE="$STATE_DIR/memory-turn-log.jsonl"
mkdir -p "$STATE_DIR"

# Repo root for the Python import -- same symlink-safe resolution as
# context-compress-stop.sh/tool-guardrails-detector.sh, and for the same
# reason (state-file location and Python import root are different
# concerns; tests sandbox CLAUDE_PROJECT_DIR to a throwaway dir with no
# core/ package).
_SELF="${BASH_SOURCE[0]}"
if command -v readlink >/dev/null 2>&1 && _RESOLVED=$(readlink -f "$_SELF" 2>/dev/null) && [[ -n "$_RESOLVED" ]]; then
  _SELF="$_RESOLVED"
fi
REPO_ROOT="$(cd "$(dirname "$_SELF")/../.." && pwd)"

INPUT=$(cat)
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")
TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null || echo "")

[[ -z "$TRANSCRIPT_PATH" || ! -f "$TRANSCRIPT_PATH" ]] && exit 0

# Reject path traversal in session ID (same guard context-compress-stop.sh uses).
echo "$SESSION_ID" | grep -qE '[/\\]|\.\.' 2>/dev/null && exit 0

# Pure local file I/O, no network call -- backgrounded anyway for
# consistency with the other Stop hooks and to keep this hook's own latency
# off the Stop event's critical path regardless.
(
  cd "$REPO_ROOT" && \
  SESSION_ID="$SESSION_ID" TRANSCRIPT_PATH="$TRANSCRIPT_PATH" LOG_FILE="$LOG_FILE" \
  python3 -c '
import os

from core.lib.hermes_adapted.memory_manager_io import sync_last_turn

sync_last_turn(
    os.environ["TRANSCRIPT_PATH"],
    os.environ["SESSION_ID"],
    os.environ["LOG_FILE"],
)
' 2>/dev/null
) &

exit 0
