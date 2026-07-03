#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: PostToolUse — track verify-command evidence + edit staleness for Truth Gate
# Last Reviewed: 2026-07-02
#
# Yana AI-native evidence ledger. Concept inspired by (not ported from)
# NousResearch/hermes-agent's agent/verification_evidence.py — rebuilt for
# our bash+JSON hook stack: no SQLite, no dynamic per-project command
# detector (static allowlist instead), writes a ledger that
# truth-gate-guard.sh (Stop hook) cross-checks against claim-verb text.
#
# Fires after every tool call (matcher ".*"):
#   - Bash running a recognized verify command (test/lint/build/typecheck)
#     -> records pass/fail (real exit code) + clears "edited since last verify"
#   - Edit / Write / MultiEdit -> sets "edited since last verify" + logs path
#
# Ledger: .claude/state/verification-ledger.json, keyed by session_id.
# Never blocks (always exit 0). Fails open on missing jq/python3.
#
# Hook event:   PostToolUse
# Bypass:       YANA_VERIFY_TRACK_BYPASS=1

set -uo pipefail

[[ "${YANA_VERIFY_TRACK_BYPASS:-}" == "1" ]] && exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
[[ -z "$TOOL_NAME" ]] && exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
LEDGER_FILE="$STATE_DIR/verification-ledger.json"
mkdir -p "$STATE_DIR"

SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")

# ── Recognized verify commands (static allowlist, checked one at a time) ────
# Deliberately static, not a dynamic per-project-type detector like
# upstream's project_facts_for() — simpler, no extra module, covers the
# common cases used in this repo and most JS/Python/Rust/Go projects.
_VERIFY_PATTERNS=(
  '(^|&&|\|\||;)[[:space:]]*(npm|pnpm|yarn|bun)[[:space:]]+(test|run[[:space:]]+(test|lint|build|typecheck))'
  '(^|&&|\|\||;)[[:space:]]*(pytest|python3?[[:space:]]+-m[[:space:]]+pytest)'
  '(^|&&|\|\||;)[[:space:]]*cargo[[:space:]]+(test|build|check|clippy)'
  '(^|&&|\|\||;)[[:space:]]*go[[:space:]]+(test|build|vet)'
  '(^|&&|\|\||;)[[:space:]]*(eslint|tsc|ruff|mypy|pyright)\b'
  '(^|&&|\|\||;)[[:space:]]*bash[[:space:]]+core/tests/'
)

if [[ "$TOOL_NAME" == "Bash" ]]; then
  COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || true)
  [[ -z "$COMMAND" ]] && exit 0

  MATCHED=0
  for pattern in "${_VERIFY_PATTERNS[@]}"; do
    if printf '%s' "$COMMAND" | grep -qEi "$pattern"; then
      MATCHED=1
      break
    fi
  done
  [[ "$MATCHED" == "0" ]] && exit 0

  EXIT_CODE=$(printf '%s' "$INPUT" | jq -r '.tool_response.exit_code // .tool_output.exit_code // 0' 2>/dev/null || echo 0)
  [[ "$EXIT_CODE" =~ ^-?[0-9]+$ ]] || EXIT_CODE=0
  STATUS="passed"
  [[ "$EXIT_CODE" != "0" ]] && STATUS="failed"

  # Values passed via env, never interpolated into the Python source string —
  # command text comes from a live Bash tool call and must not be trusted
  # (shell-sanitize-law: never construct code strings from variables).
  LEDGER_FILE="$LEDGER_FILE" SESSION_ID="$SESSION_ID" VERIFY_COMMAND="$COMMAND" \
  VERIFY_STATUS="$STATUS" VERIFY_EXIT="$EXIT_CODE" python3 -c '
import json, os
from datetime import datetime, timezone

path = os.environ["LEDGER_FILE"]
d = {}
if os.path.exists(path):
    try:
        d = json.load(open(path))
    except Exception:
        d = {}
sessions = d.setdefault("sessions", {})
sessions[os.environ["SESSION_ID"]] = {
    "last_verify": {
        "command": os.environ["VERIFY_COMMAND"][:300],
        "status": os.environ["VERIFY_STATUS"],
        "exit_code": int(os.environ["VERIFY_EXIT"]),
        "at": datetime.now(timezone.utc).isoformat(),
    },
    "edited_since_last_verify": False,
    "changed_paths": [],
}
json.dump(d, open(path, "w"), indent=2)
' 2>/dev/null
  exit 0
fi

if [[ "$TOOL_NAME" == "Edit" || "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "MultiEdit" ]]; then
  FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null || true)
  [[ -z "$FILE_PATH" ]] && exit 0

  LEDGER_FILE="$LEDGER_FILE" SESSION_ID="$SESSION_ID" EDITED_PATH="$FILE_PATH" python3 -c '
import json, os

path = os.environ["LEDGER_FILE"]
d = {}
if os.path.exists(path):
    try:
        d = json.load(open(path))
    except Exception:
        d = {}
sessions = d.setdefault("sessions", {})
s = sessions.setdefault(os.environ["SESSION_ID"], {
    "last_verify": None,
    "edited_since_last_verify": False,
    "changed_paths": [],
})
s["edited_since_last_verify"] = True
paths = set(s.get("changed_paths") or [])
paths.add(os.environ["EDITED_PATH"])
s["changed_paths"] = sorted(paths)[-50:]
json.dump(d, open(path, "w"), indent=2)
' 2>/dev/null
  exit 0
fi

exit 0
