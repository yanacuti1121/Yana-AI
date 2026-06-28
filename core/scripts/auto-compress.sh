#!/usr/bin/env bash
# auto-compress.sh — compress session state via Ollama when context runs low
# Called by context-compress-trigger.sh (PostToolUse)
# Output: core/memory/L2_session/auto-compress-<timestamp>.md
#
# Anti-thrash: skips if last compression < 5 min ago (lock file guard).
# Fails silently — never blocks a tool call.

set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
SESSION_DIR="$PROJECT_ROOT/core/memory/L2_session"
AUDIT_LOG="$PROJECT_ROOT/core/memory/audit/agent-actions.log"
LOCK_FILE="$SESSION_DIR/.compress-lock"
OUTPUT_FILE="$SESSION_DIR/auto-compress-$(date +%Y%m%dT%H%M%S).md"
OLLAMA_MODEL="${YANA_COMPRESS_MODEL:-freehuntx/qwen3-coder:14b}"
MIN_INTERVAL_SECONDS=300  # 5 minutes

mkdir -p "$SESSION_DIR"

# ── Anti-thrash guard ─────────────────────────────────────────────────────────
if [[ -f "$LOCK_FILE" ]]; then
  lock_age=$(( $(date +%s) - $(date -r "$LOCK_FILE" +%s 2>/dev/null || echo 0) ))
  if [[ $lock_age -lt $MIN_INTERVAL_SECONDS ]]; then
    exit 0
  fi
fi
touch "$LOCK_FILE"

# ── Collect session state ─────────────────────────────────────────────────────
SESSION_FACTS=""
if [[ -d "$SESSION_DIR" ]]; then
  # Collect existing L2 session facts, skip the compress files themselves
  SESSION_FACTS=$(find "$SESSION_DIR" -name "*.md" ! -name "auto-compress-*" \
    -exec cat {} \; 2>/dev/null | head -300 || true)
fi

RECENT_AUDIT=""
if [[ -f "$AUDIT_LOG" ]]; then
  RECENT_AUDIT=$(tail -60 "$AUDIT_LOG" 2>/dev/null || true)
fi

GIT_STATE=""
if command -v git >/dev/null 2>&1; then
  GIT_STATE=$(git -C "$PROJECT_ROOT" log --oneline -5 2>/dev/null || true)
fi

# Nothing to compress
if [[ -z "$SESSION_FACTS" && -z "$RECENT_AUDIT" ]]; then
  exit 0
fi

# ── Build compression prompt ──────────────────────────────────────────────────
PROMPT="You are a session state compressor for an AI coding assistant.
Summarize the following session data into a concise, structured summary under 250 words.
Preserve: what was completed, key decisions, current task state, open items, next steps.
Drop: conversational filler, repeated information, raw log noise.
Be specific and factual — this summary will restore context for the next session.

GIT (last 5 commits):
${GIT_STATE:-none}

SESSION FACTS:
${SESSION_FACTS:-none}

RECENT AUDIT LOG:
${RECENT_AUDIT:-none}

Output strictly in this format:
## Auto-Compressed Session [$(date '+%Y-%m-%d %H:%M')]
### Completed
### In Progress
### Key Decisions
### Open Items
### Next Steps"

# ── Call Ollama via HTTP API (stream:false avoids CLI line-wrap artifacts) ────
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"

# Build JSON payload — escape PROMPT for JSON
PAYLOAD=$(python3 -c "
import json, sys
prompt = sys.stdin.read()
print(json.dumps({'model': '$OLLAMA_MODEL', 'prompt': prompt, 'stream': False}))
" <<< "$PROMPT" 2>/dev/null) || { exit 0; }

# macOS: timeout is gtimeout (coreutils); Linux: timeout
TIMEOUT_BIN=$(command -v gtimeout 2>/dev/null || command -v timeout 2>/dev/null || true)

call_ollama() {
  curl -sf --max-time 60 \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "${OLLAMA_HOST}/api/generate" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('response',''))"
}

if [[ -n "$TIMEOUT_BIN" ]]; then
  "$TIMEOUT_BIN" 65 bash -c "$(declare -f call_ollama); call_ollama" \
    > "$OUTPUT_FILE" 2>/dev/null || { rm -f "$OUTPUT_FILE"; exit 0; }
else
  call_ollama > "$OUTPUT_FILE" 2>/dev/null || { rm -f "$OUTPUT_FILE"; exit 0; }
fi

# Verify output is non-empty
if [[ ! -s "$OUTPUT_FILE" ]]; then
  rm -f "$OUTPUT_FILE"
  exit 0
fi

echo "$OUTPUT_FILE"
