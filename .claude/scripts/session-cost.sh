#!/usr/bin/env bash
# Reads real token usage from Claude Code local JSONL session files.
# No API call. No telemetry. Offline-only.
#
# Usage: session-cost.sh [--all | --session <id> | --last]
#   --all       aggregate all sessions for this project
#   --session   specific session UUID
#   --last      most recent session only (default)

set -euo pipefail

MODE="${1:---last}"
SESSION_ID="${2:-}"

# Derive project slug from current working directory
CWD="$(pwd)"
PROJECT_SLUG="$(echo "$CWD" | tr '/' '-')"
PROJECT_DIR="$HOME/.claude/projects/$PROJECT_SLUG"

if [[ ! -d "$PROJECT_DIR" ]]; then
  echo "No Claude Code session data found for: $CWD"
  echo "Expected directory: $PROJECT_DIR"
  exit 0
fi

JSONL_FILES=()

case "$MODE" in
  --all)
    mapfile -t JSONL_FILES < <(find "$PROJECT_DIR" -maxdepth 1 -name "*.jsonl" | sort)
    ;;
  --session)
    if [[ -f "$PROJECT_DIR/$SESSION_ID.jsonl" ]]; then
      JSONL_FILES=("$PROJECT_DIR/$SESSION_ID.jsonl")
    else
      echo "Session not found: $SESSION_ID"
      exit 1
    fi
    ;;
  --last|*)
    LATEST=$(find "$PROJECT_DIR" -maxdepth 1 -name "*.jsonl" | sort -t/ -k9 | tail -1)
    if [[ -n "$LATEST" ]]; then
      JSONL_FILES=("$LATEST")
    fi
    ;;
esac

if [[ ${#JSONL_FILES[@]} -eq 0 ]]; then
  echo "No JSONL session files found."
  exit 0
fi

python3 - "${JSONL_FILES[@]}" <<'PYEOF'
import sys, json, os
from datetime import datetime

files = sys.argv[1:]

total_input = 0
total_output = 0
total_cache_create = 0
total_cache_read = 0
total_web_search = 0
total_web_fetch = 0
total_turns = 0
models_seen = set()
session_ids = set()
earliest = None
latest = None

for fpath in files:
    session_id = os.path.basename(fpath).replace('.jsonl', '')
    session_ids.add(session_id[:8])

    with open(fpath) as f:
        lines = []
        for l in f:
            if not l.strip():
                continue
            try:
                lines.append(json.loads(l))
            except json.JSONDecodeError:
                pass

    for rec in lines:
        if rec.get('type') != 'assistant':
            continue
        msg = rec.get('message', {})
        usage = msg.get('usage', {})
        if not usage:
            continue

        total_turns += 1
        total_input        += usage.get('input_tokens', 0)
        total_output       += usage.get('output_tokens', 0)
        total_cache_create += usage.get('cache_creation_input_tokens', 0)
        total_cache_read   += usage.get('cache_read_input_tokens', 0)
        srv = usage.get('server_tool_use', {})
        total_web_search   += srv.get('web_search_requests', 0)
        total_web_fetch    += srv.get('web_fetch_requests', 0)

        model = msg.get('model', '')
        if model:
            models_seen.add(model)

        ts = rec.get('timestamp', '')
        if ts:
            try:
                dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                if earliest is None or dt < earliest:
                    earliest = dt
                if latest is None or dt > latest:
                    latest = dt
            except Exception:
                pass

total_billed = total_input + total_output + total_cache_create
# cache_read is billed at ~0.1x, cache_create at ~1.25x vs input
# These are approximations — Sonnet 4.x pricing
PRICE_INPUT        = 3.00 / 1_000_000   # per token
PRICE_OUTPUT       = 15.00 / 1_000_000
PRICE_CACHE_CREATE = 3.75 / 1_000_000
PRICE_CACHE_READ   = 0.30 / 1_000_000

est_cost = (
    total_input        * PRICE_INPUT +
    total_output       * PRICE_OUTPUT +
    total_cache_create * PRICE_CACHE_CREATE +
    total_cache_read   * PRICE_CACHE_READ
)

cache_hit_rate = 0
cacheable = total_cache_create + total_cache_read
if cacheable > 0:
    cache_hit_rate = total_cache_read / cacheable * 100

label = "All sessions" if len(files) > 1 else f"Session {list(session_ids)[0]}"
period = ""
if earliest and latest:
    period = f"  Period:  {earliest.strftime('%Y-%m-%d %H:%M')} → {latest.strftime('%Y-%m-%d %H:%M')} UTC"

print()
print(f"Session Cost Report — YAMTAM ENGINE")
print(f"{'─'*50}")
print(f"  Scope:   {label}")
if period:
    print(period)
print(f"  Model:   {', '.join(sorted(models_seen)) or 'unknown'}")
print(f"{'─'*50}")
print(f"  Input tokens:         {total_input:>10,}")
print(f"  Output tokens:        {total_output:>10,}")
print(f"  Cache write tokens:   {total_cache_create:>10,}")
print(f"  Cache read tokens:    {total_cache_read:>10,}")
print(f"{'─'*50}")
print(f"  Cache hit rate:       {cache_hit_rate:>9.1f}%")
print(f"  AI turns:             {total_turns:>10,}")
print(f"  Web searches:         {total_web_search:>10,}")
print(f"  Web fetches:          {total_web_fetch:>10,}")
print(f"{'─'*50}")
print(f"  Est. cost (USD):      ${est_cost:>9.4f}")
print(f"{'─'*50}")
print(f"  Note: cost estimate uses Sonnet 4.x list pricing.")
print(f"        Actual billing depends on your plan/tier.")
print(f"        No data sent anywhere. Read from local JSONL only.")
print()
PYEOF
