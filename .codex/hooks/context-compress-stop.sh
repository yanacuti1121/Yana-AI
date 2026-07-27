#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Stop — real-transcript context compression (hermes_adapted Phase 4)
# Last Reviewed: 2026-07-13
#
# hermes_adapted Phase 4 (NousResearch/hermes-agent, MIT) — wires
# core/lib/hermes_adapted/context_compressor.py's boundary-aware compressor
# into a live hook via the core/lib/hermes_adapted/context_compressor_io.py
# adapter, using the REAL conversation transcript (Stop event's
# `transcript_path`, verified to exist by core/hooks/truth-gate-guard.sh's
# existing use of the same field).
#
# This is additive, not a replacement: the existing PostToolUse-triggered
# context-compress-trigger.sh -> auto-compress.sh pipeline is untouched and
# keeps running. That pipeline summarizes L2 session files + audit log + git
# log (a proxy for state, not the real conversation) with no head/tail
# boundary protection. This hook summarizes the actual message transcript
# with hermes' anchoring logic (never lets the user's most recent message or
# the assistant's last visible reply fall into the compressed region — two
# named upstream production bugs, #10896/#29824) and tool_call/tool_result
# pairing safety. Both write into core/memory/L2_session/ under different
# filename prefixes (auto-compress-* vs context-compress-*) so neither
# clobbers the other.
#
# Trigger: reuses context-monitor.js's existing severity tracking
# (/tmp/claude-ctx-<session>.json's lastSeverity) — the same signal
# context-compress-trigger.sh already checks — rather than re-deriving
# context pressure a second, differently-calibrated way.
#
# Runs the actual compression in the background (same reasoning as
# auto-compress.sh: the Ollama call can take up to ~60s, and Stop hooks are
# time-bounded — see hook-timeout-guard.sh wrapping truth-gate-guard.sh on
# the same event). The compressed summary lands in
# core/memory/L2_session/context-compress-<timestamp>.md by the time the
# NEXT turn starts, same latency tradeoff the existing pipeline already
# accepts.
#
# State: .claude/state/context-compressor-state.json, keyed by session_id —
# persists ContextCompressor's cross-call fields (_previous_summary,
# _last_savings_pct, compression_count) since each hook invocation is a
# fresh process. Read/write under flock (Python fcntl, not the `flock` CLI —
# not preinstalled on macOS), same convention as tool-guardrails-detector.sh.
#
# Never blocks (always exit 0). Fails open on missing jq/python3, missing
# transcript, or any Python exception (compression is a nice-to-have, not a
# safety control — a failure here must never be treated as a reason to warn
# or halt the turn).
#
# Hook event:   Stop
# Bypass:       YANA_CONTEXT_COMPRESS_BYPASS=1

set -uo pipefail

[[ "${YANA_CONTEXT_COMPRESS_BYPASS:-}" == "1" ]] && exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
STATE_FILE="$STATE_DIR/context-compressor-state.json"
mkdir -p "$STATE_DIR" "$PROJECT_DIR/core/memory/L2_session"

# Repo root for the Python import — same symlink-safe resolution as
# tool-guardrails-detector.sh, and for the same reason (state-file location
# and Python import root are different concerns; tests sandbox
# CLAUDE_PROJECT_DIR to a throwaway dir that has no core/ package).
_SELF="${BASH_SOURCE[0]}"
if command -v readlink >/dev/null 2>&1 && _RESOLVED=$(readlink -f "$_SELF" 2>/dev/null) && [[ -n "$_RESOLVED" ]]; then
  _SELF="$_RESOLVED"
fi
REPO_ROOT="$(cd "$(dirname "$_SELF")/../.." && pwd)"

INPUT=$(cat)
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")
TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null || echo "")

[[ -z "$TRANSCRIPT_PATH" || ! -f "$TRANSCRIPT_PATH" ]] && exit 0

# Reject path traversal in session ID (same guard context-compress-trigger.sh uses).
echo "$SESSION_ID" | grep -qE '[/\\]|\.\.' 2>/dev/null && exit 0

# ── Cheap severity check first — avoid spawning Python/Ollama every turn ──────
CTX_STATE_FILE="/tmp/claude-ctx-${SESSION_ID}.json"
[[ ! -f "$CTX_STATE_FILE" ]] && exit 0
SEVERITY=$(python3 -c \
  "import json; d=json.load(open('$CTX_STATE_FILE')); print(d.get('lastSeverity','OK'))" \
  2>/dev/null || echo "OK")
[[ "$SEVERITY" == "OK" ]] && exit 0

OUTPUT_FILE="$PROJECT_DIR/core/memory/L2_session/context-compress-$(date +%Y%m%dT%H%M%S).md"
OLLAMA_MODEL="${YANA_COMPRESS_MODEL:-freehuntx/qwen3-coder:14b}"
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"
CONTEXT_LENGTH="${YANA_CONTEXT_LENGTH:-200000}"

# ── Compress in the background — values via env, never interpolated into
# the Python source (shell-sanitize-law: never build code strings from
# variables) ───────────────────────────────────────────────────────────────
(
  cd "$REPO_ROOT" && \
  STATE_FILE="$STATE_FILE" SESSION_ID="$SESSION_ID" TRANSCRIPT_PATH="$TRANSCRIPT_PATH" \
  OUTPUT_FILE="$OUTPUT_FILE" OLLAMA_MODEL="$OLLAMA_MODEL" OLLAMA_HOST="$OLLAMA_HOST" \
  CONTEXT_LENGTH="$CONTEXT_LENGTH" \
  python3 -c '
import fcntl, json, os

from core.lib.hermes_adapted.context_compressor_io import (
    build_ollama_summarize_fn, dump_state, estimate_prompt_tokens,
    load_compressor, parse_transcript_to_messages, prune_stale_sessions,
)

messages = parse_transcript_to_messages(os.environ["TRANSCRIPT_PATH"])
if not messages:
    raise SystemExit(0)

prompt_tokens = estimate_prompt_tokens(messages)
session_id = os.environ["SESSION_ID"]
state_path = os.environ["STATE_FILE"]
summarize_fn = build_ollama_summarize_fn(os.environ["OLLAMA_MODEL"], os.environ["OLLAMA_HOST"])

with open(state_path, "a+") as f:
    fcntl.flock(f, fcntl.LOCK_EX)
    f.seek(0)
    content = f.read()
    try:
        d = json.loads(content) if content.strip() else {}
    except Exception:
        d = {}
    sessions = d.setdefault("sessions", {})

    compressor = load_compressor(sessions.get(session_id), int(os.environ["CONTEXT_LENGTH"]), summarize_fn)

    if compressor.should_compress(prompt_tokens):
        count_before = compressor.compression_count
        compressor.compress(messages, prompt_tokens)
        # compression_count only increments when compress() actually replaced
        # a middle window with a summary — NOT the same signal as
        # len(compressed) < len(messages): a single middle message getting
        # replaced by a single summary message leaves the count unchanged
        # even though real compression happened, so message-count comparison
        # silently misses exactly that (common, small-window) case.
        if compressor.compression_count > count_before:
            summary_text = compressor._previous_summary or ""  # noqa: SLF001
            with open(os.environ["OUTPUT_FILE"], "w") as out:
                out.write(f"## Auto-Compressed Context (real transcript)\n\n{summary_text}\n")

    sessions[session_id] = dump_state(compressor)
    d["sessions"] = prune_stale_sessions(sessions)

    f.seek(0)
    f.truncate()
    json.dump(d, f, indent=2)
' 2>/dev/null
) &

cat <<EOF
[context-compress] Context window at ${SEVERITY} level (real-transcript compressor).
On your next action, check core/memory/L2_session/context-compress-*.md
(most recent) if you need to recover detail that may have been summarized.
EOF

exit 0
