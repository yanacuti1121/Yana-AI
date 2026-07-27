#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: PostToolUse/Stop — per-turn tool-call loop detector (warn-only)
# Last Reviewed: 2026-07-06
#
# hermes_adapted Phase 3 (NousResearch/hermes-agent, MIT) — wires
# core/lib/hermes_adapted/tool_guardrails.py's per-turn loop detector into a
# live hook via the core/lib/hermes_adapted/tool_guardrails_io.py adapter.
# Detects: the same tool call failing with identical arguments, the same tool
# failing repeatedly with varying arguments, or an idempotent (read-only)
# call returning the same result with no progress.
#
# Warn-only — Yana AI's config (tool_guardrails_io.build_config()) leaves
# hard_stop_enabled off, so this hook never blocks a tool call, only prints
# an advisory line. A hard-stop mode is a possible future opt-in, not this.
#
# Registered under TWO events with a distinguishing positional arg, same
# pattern as agent-pixel-notify.sh's start/stop registration:
#   record  (PostToolUse) — score the just-finished call, warn on a loop
#   reset   (Stop)         — clear this session's per-turn state
#
# State: .claude/state/tool-guardrail-state.json, keyed by session_id.
# - The success/failure signal (exit_code/is_error) is extracted via a tiny,
#   always-small jq query run BEFORE the truncation below, so a large but
#   genuinely failing command (e.g. a verbose flaky test suite) still gets
#   correctly classified as failed even though its full output never reaches
#   Python intact. Reviewed 2026-07-06: an earlier version derived `failed`
#   only from the (truncated) full tool_response, which silently reclassified
#   large repeated failures as "succeeded" once output exceeded the cap —
#   defeating the detector on exactly the noisy commands it's most useful
#   for. This diagnostic extraction is what fixes that.
# - tool_input/tool_response are still capped before crossing into Python
#   (oversized payloads can't hang or crash this hook), but an invalid/
#   truncated tool_input no longer collapses to the same empty `{}` for every
#   large call — it keeps the truncated fragment itself as part of the
#   signature, so distinct large calls still hash differently instead of
#   colliding into a false "this looks like a loop" warning.
# - Sessions untouched for 6h are pruned on every write (tool_guardrails_io.
#   prune_stale_sessions) so state can't grow unboundedly across a repo's
#   lifetime from sessions that never cleanly fire Stop (crash, bypass).
# - Reads/writes are done under an flock'd file handle (Python's fcntl, not
#   the `flock` CLI — not preinstalled on macOS) to avoid a lost-update race
#   if two invocations of this hook ever run concurrently.
#
# Never blocks (always exit 0). Fails open on missing jq/python3.
#
# Hook event:   PostToolUse (record) / Stop (reset)
# Bypass:       YANA_TOOLGUARD_BYPASS=1

set -uo pipefail

[[ "${YANA_TOOLGUARD_BYPASS:-}" == "1" ]] && exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

MODE="${1:-record}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
STATE_FILE="$STATE_DIR/tool-guardrail-state.json"
mkdir -p "$STATE_DIR"

# Where to import core.lib.hermes_adapted from — always this script's own
# repo, NOT $PROJECT_DIR. Tests deliberately override CLAUDE_PROJECT_DIR to a
# throwaway dir to sandbox state-file writes (matches verify-evidence-track.sh's
# test convention); cd-ing into that throwaway dir for the Python import would
# break `from core.lib...` since it has no core/ package. State-file location
# and Python import root are two different concerns and must stay separate.
# Resolves through a symlink too (readlink -f), not just BASH_SOURCE's raw
# path — a symlinked invocation would otherwise silently resolve to the
# wrong root and the import would fail open with no warning ever again.
_SELF="${BASH_SOURCE[0]}"
if command -v readlink >/dev/null 2>&1 && _RESOLVED=$(readlink -f "$_SELF" 2>/dev/null) && [[ -n "$_RESOLVED" ]]; then
  _SELF="$_RESOLVED"
fi
REPO_ROOT="$(cd "$(dirname "$_SELF")/../.." && pwd)"

INPUT=$(cat)
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")

if [[ "$MODE" == "reset" ]]; then
  STATE_FILE="$STATE_FILE" SESSION_ID="$SESSION_ID" python3 -c '
import fcntl, json, os

from core.lib.hermes_adapted.tool_guardrails_io import prune_stale_sessions

path = os.environ["STATE_FILE"]
with open(path, "a+") as f:
    fcntl.flock(f, fcntl.LOCK_EX)
    f.seek(0)
    content = f.read()
    try:
        d = json.loads(content) if content.strip() else {}
    except Exception:
        d = {}
    sessions = d.setdefault("sessions", {})
    sessions.pop(os.environ["SESSION_ID"], None)
    d["sessions"] = prune_stale_sessions(sessions)
    f.seek(0)
    f.truncate()
    json.dump(d, f, indent=2)
' 2>/dev/null
  exit 0
fi

# ── record mode (PostToolUse) ────────────────────────────────────────────────
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
[[ -z "$TOOL_NAME" ]] && exit 0

# Tiny, always-small — extracted from the RAW payload before any truncation,
# so the pass/fail signal survives even when the full response doesn't.
DIAG_JSON=$(printf '%s' "$INPUT" | jq -c '{
  exit_code: (.tool_response.exit_code // .tool_output.exit_code // null),
  is_error: (.tool_response.is_error // .tool_output.is_error // null)
}' 2>/dev/null || echo '{}')

# Compact JSON, capped — see header note on why truncation fails open safely
# (the diagnostic fields above are captured separately and don't depend on
# this staying intact).
TOOL_INPUT_JSON=$(printf '%s' "$INPUT" | jq -c '.tool_input // {}' 2>/dev/null || echo '{}')
TOOL_INPUT_JSON="${TOOL_INPUT_JSON:0:8000}"
TOOL_RESPONSE_JSON=$(printf '%s' "$INPUT" | jq -c '.tool_response // .tool_output // null' 2>/dev/null || echo 'null')
TOOL_RESPONSE_JSON="${TOOL_RESPONSE_JSON:0:8000}"

# Values passed via env, never interpolated into the Python source string —
# same convention as verify-evidence-track.sh (shell-sanitize-law: never
# construct code strings from variables).
WARN_MESSAGE=$(
  cd "$REPO_ROOT" && \
  STATE_FILE="$STATE_FILE" SESSION_ID="$SESSION_ID" TOOL_NAME="$TOOL_NAME" \
  TOOL_INPUT_JSON="$TOOL_INPUT_JSON" TOOL_RESPONSE_JSON="$TOOL_RESPONSE_JSON" \
  DIAG_JSON="$DIAG_JSON" \
  python3 -c '
import fcntl, json, os, sys

from core.lib.hermes_adapted.tool_guardrails_io import derive_failed, dump_state, load_controller, prune_stale_sessions

tool_name = os.environ["TOOL_NAME"]

try:
    tool_input = json.loads(os.environ["TOOL_INPUT_JSON"])
    if not isinstance(tool_input, dict):
        raise ValueError("tool_input is not a dict")
except Exception:
    # Truncated/invalid JSON — do NOT collapse every large call to the same
    # {}, which would make distinct large payloads hash identically (a false
    # "this looks like a loop" warning). Keep the truncated fragment itself
    # so different truncated inputs still differ from each other.
    tool_input = {"_truncated_raw": os.environ["TOOL_INPUT_JSON"]}

try:
    tool_response = json.loads(os.environ["TOOL_RESPONSE_JSON"])
except Exception:
    tool_response = None

try:
    diag = json.loads(os.environ.get("DIAG_JSON", "{}"))
except Exception:
    diag = {}

# Prefer the untruncated diagnostic signal; only fall back to inspecting the
# (possibly truncated) full response text when neither field was present.
if diag.get("exit_code") is not None:
    failed = diag["exit_code"] != 0
elif diag.get("is_error") is not None:
    failed = bool(diag["is_error"])
else:
    failed = derive_failed(tool_name, tool_response)

path = os.environ["STATE_FILE"]
with open(path, "a+") as f:
    fcntl.flock(f, fcntl.LOCK_EX)
    f.seek(0)
    content = f.read()
    try:
        d = json.loads(content) if content.strip() else {}
    except Exception:
        d = {}
    sessions = d.setdefault("sessions", {})
    session_id = os.environ["SESSION_ID"]

    controller = load_controller(sessions.get(session_id))
    result_text = tool_response if isinstance(tool_response, str) else json.dumps(tool_response, ensure_ascii=False, default=str)
    decision = controller.after_call(tool_name, tool_input, result_text, failed=failed)

    sessions[session_id] = dump_state(controller)
    d["sessions"] = prune_stale_sessions(sessions)

    f.seek(0)
    f.truncate()
    json.dump(d, f, indent=2)

if decision.action in ("warn", "halt"):
    sys.stdout.write(decision.message)
' 2>/dev/null
)

if [[ -n "$WARN_MESSAGE" ]]; then
  printf '[Yana AI] Tool loop warning: %s\n' "$WARN_MESSAGE"
fi

exit 0
