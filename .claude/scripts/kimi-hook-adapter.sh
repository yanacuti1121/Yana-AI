#!/usr/bin/env bash
# kimi-hook-adapter.sh — Kimi Code CLI PreToolUse hook
# Status: active
# Description: Translates Kimi Code CLI's PreToolUse hook contract into a
#   call to the existing safe-run.sh enforcement wrapper — Kimi Code CLI
#   uses the same exit-code contract as Claude Code's own hooks (exit 0 =
#   allow, exit 2 = block; confirmed against platform.kimi.ai/docs and
#   moonshotai.github.io/kimi-code/en/customization/hooks), so this is a
#   thin translation layer, not a reimplementation of the block logic.
#
# Exit behaviour (Kimi's contract):
#   exit 0  — allow the command
#   exit 2  — block the command (message on stderr)
#
# Why this can't just check safe-run.sh's own exit code directly: safe-run.sh
# uses exit 1 for BOTH "I blocked this" (destructive pattern / hard-mode
# elevated-risk match) AND "the command ran and itself exited 1" (e.g. grep
# finding no match) — since it ends in `eval "$COMMAND"` with no explicit
# `exit $?`, a naturally-failing command's exit code becomes safe-run.sh's
# own exit code. Exit code alone can't tell those apart, so this script
# captures safe-run.sh's combined output and only translates to exit 2 when
# one of safe-run.sh's own block markers ("BLOCKED", "HARD BLOCK", "Aborted
# by user") is actually present — otherwise a normal exit-1 command result
# is passed straight through, not misreported to Kimi as policy-blocked.
#
# Usage: bash core/scripts/kimi-hook-adapter.sh   (reads PreToolUse JSON on stdin)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAFE_RUN="$SCRIPT_DIR/safe-run.sh"

INPUT=$(cat)

# Extract command — try jq first, fallback to python3 (matches
# tool-proxy-enforcer.sh's existing extraction pattern).
if command -v jq >/dev/null 2>&1; then
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
else
  COMMAND=$(echo "$INPUT" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || true)
fi

[[ -z "$COMMAND" ]] && exit 0

if [[ ! -f "$SAFE_RUN" ]]; then
  echo "[kimi-hook-adapter] safe-run.sh not found at $SAFE_RUN" >&2
  exit 2
fi

# Passed as one quoted argument, not word-split — safe-run.sh reassembles
# via "$*" internally, so a single arg round-trips identically while
# avoiding glob/word-splitting on untrusted command text here.
OUTPUT=$(bash "$SAFE_RUN" --engine kimi "$COMMAND" 2>&1)
STATUS=$?

if [[ $STATUS -ne 0 ]] && echo "$OUTPUT" | grep -qE "BLOCKED|HARD BLOCK|Aborted by user"; then
  echo "$OUTPUT" >&2
  exit 2
fi

echo "$OUTPUT"
exit "$STATUS"
