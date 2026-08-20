#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: UserPromptSubmit -- embedding recall over the turn-capture log (hermes_adapted Phase 5b)
# Last Reviewed: 2026-08-20
#
# hermes_adapted Phase 5b (NousResearch/hermes-agent, MIT) -- the read half
# of what Phase 5a (core/hooks/memory-turn-sync-stop.sh) wrote: embeds the
# current prompt, searches .claude/state/memory-turn-log.jsonl for similar
# past turns via cached embeddings, surfaces the top matches.
#
# Registered alongside (not merged into) session-bootstrap.sh, same reasoning
# Phase 5a used for not touching it: session-bootstrap.sh is live and
# verified, this is new, more failure-prone logic (a network call, embedding
# math) that shouldn't share a hook with something that already works.
#
# Fires before every prompt Claude receives, same as session-bootstrap.sh --
# stdout is injected as additional context, and this BLOCKS the turn until
# it returns. That is the entire reason for the rate-limited backfill and
# short per-call timeout in core/lib/hermes_adapted/memory_manager_io.py:
# EMBED_TIMEOUT_SECONDS * (1 + MAX_EMBEDDINGS_PER_PREFETCH) is this module's
# own worst-case latency budget, kept comfortably under
# hook-timeout-guard.sh's YANA_HOOK_TIMEOUT (30s default) rather than relying
# on that external guard as the only backstop.
#
# Output wrapped via the same context_scrubber.build_memory_context_block()
# session-bootstrap.sh already uses for L1 facts, so recalled turns are
# marked the same way ("recalled memory context, not new user input") --
# reuses the existing anti-injection framing rather than inventing a second
# one.
#
# Never blocks on failure (missing jq/python3, Ollama unreachable, empty
# log, no match above threshold all just mean no output this turn).
#
# Hook event:   UserPromptSubmit
# Blocking:     yes (stdout goes into Claude context -- keep it bounded)
# Bypass:       YANA_MEMORY_RECALL_BYPASS=1

set -uo pipefail

[[ "${YANA_MEMORY_RECALL_BYPASS:-}" == "1" ]] && exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

INPUT=$(cat)
PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // ""' 2>/dev/null || true)
[[ -z "$PROMPT" ]] && exit 0
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")

# Reject path traversal in session ID (same guard the Phase 4/5a Stop hooks use).
echo "$SESSION_ID" | grep -qE '[/\\]|\.\.' 2>/dev/null && exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
LOG_FILE="$STATE_DIR/memory-turn-log.jsonl"
CACHE_FILE="$STATE_DIR/memory-turn-embeddings.jsonl"

# Nothing captured yet -- skip the Ollama round-trip entirely rather than
# embed a query with nothing to compare it against.
[[ ! -s "$LOG_FILE" ]] && exit 0

mkdir -p "$STATE_DIR"

# Repo root for the Python import -- same symlink-safe resolution as the
# other hermes_adapted hooks, for the same reason (state-file location and
# Python import root are different concerns; tests sandbox
# CLAUDE_PROJECT_DIR to a throwaway dir with no core/ package).
_SELF="${BASH_SOURCE[0]}"
if command -v readlink >/dev/null 2>&1 && _RESOLVED=$(readlink -f "$_SELF" 2>/dev/null) && [[ -n "$_RESOLVED" ]]; then
  _SELF="$_RESOLVED"
fi
REPO_ROOT="$(cd "$(dirname "$_SELF")/../.." && pwd)"

EMBED_MODEL="${YANA_EMBED_MODEL:-nomic-embed-text}"
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"

# Prompt text goes via stdin, not an env var or CLI arg -- it can contain
# arbitrary characters (quotes, newlines) that would be unsafe to
# interpolate. Everything else crosses the bash/Python boundary via env
# vars only, matching shell-sanitize-law.md's "never build code strings
# from variables".
RECALL=$(cd "$REPO_ROOT" && \
  printf '%s' "$PROMPT" | \
  SESSION_ID="$SESSION_ID" LOG_FILE="$LOG_FILE" CACHE_FILE="$CACHE_FILE" \
  EMBED_MODEL="$EMBED_MODEL" OLLAMA_HOST="$OLLAMA_HOST" \
  python3 -c '
import os
import sys

from core.lib.hermes_adapted.memory_manager_io import recall_for_prompt

query = sys.stdin.read()
result = recall_for_prompt(
    query,
    os.environ["SESSION_ID"],
    os.environ["LOG_FILE"],
    os.environ["CACHE_FILE"],
    embed_model=os.environ["EMBED_MODEL"],
    ollama_host=os.environ["OLLAMA_HOST"],
)
sys.stdout.write(result)
' 2>/dev/null)

[[ -z "$RECALL" ]] && exit 0

WRAPPED=$(cd "$REPO_ROOT" && printf '%s' "$RECALL" | python3 -c '
import sys
try:
    from core.lib.hermes_adapted.context_scrubber import build_memory_context_block
    sys.stdout.write(build_memory_context_block(sys.stdin.read()))
except Exception:
    sys.exit(1)
' 2>/dev/null)

if [[ -n "$WRAPPED" ]]; then
  printf '%s\n' "$WRAPPED"
fi

exit 0
