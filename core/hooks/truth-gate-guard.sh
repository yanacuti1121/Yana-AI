#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: L3 Truth Gate — warn on unsupported done/passed/clean claims
# Last Reviewed: 2026-07-02
# Stop hook — Yana AI L3 Truth Gate Guard
#
# Fires after each Claude turn. Reads the last assistant message from the
# session transcript, scans for claim verbs (done/passed/fixed/deployed…),
# and warns on stdout when none of the required evidence patterns are present.
#
# Also cross-checks the verification ledger written by
# verify-evidence-track.sh (.claude/state/verification-ledger.json): if
# files were edited since the last real verify-command run in this session,
# it warns even when the response text contains plausible-looking "evidence"
# strings — text pattern matching can be faked, a real recorded exit code
# can't. Concept inspired by (not ported from) NousResearch/hermes-agent's
# verification_evidence.py, rebuilt Yana AI-native (bash + JSON ledger,
# static command allowlist, no SQLite).
#
# Non-blocking: always exits 0. Stdout is shown to Claude as post-turn
# context, giving it a chance to self-correct or use fallback phrasing.
#
# Hook event:   Stop
# Requires:     jq
# Bypass:       YANA_TRUTH_GATE_BYPASS=1
#
# Test seam:    TRUTH_GATE_TEST_TEXT="<text>" — skips transcript read;
#               used by core/tests/hooks/run-hook-tests.sh
#               TRUTH_GATE_TEST_LEDGER="<json>" — injects a ledger state for
#               the same test seam instead of reading the real ledger file
#               TRUTH_GATE_TEST_SESSION_ID — session key to look up in the
#               injected ledger (defaults to "default")
#
# Reference:    gates/truth_gate.md

set -uo pipefail

[[ "${YANA_TRUTH_GATE_BYPASS:-}" == "1" ]] && exit 0

command -v jq >/dev/null 2>&1 || exit 0

# ── Resolve text to scan ─────────────────────────────────────────────────────

LAST_TEXT=""
SESSION_ID="default"

if [[ -n "${TRUTH_GATE_TEST_TEXT:-}" ]]; then
  LAST_TEXT="$TRUTH_GATE_TEST_TEXT"
  SESSION_ID="${TRUTH_GATE_TEST_SESSION_ID:-default}"
else
  INPUT=$(cat)
  TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null || true)
  SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")

  if [[ -n "$TRANSCRIPT_PATH" && -f "$TRANSCRIPT_PATH" ]]; then
    # Transcript is JSONL (one JSON object per line, NOT a single array) —
    # must slurp with -s. Each line's real shape is
    # {"type": "assistant"|"user"|..., "message": {"role": ..., "content": ...}, ...}
    # — there is no top-level .role. Filtering on .role without -s silently
    # matched nothing on every real transcript (verified against a live
    # session file); .type + .message.content is the actual schema.
    LAST_TEXT=$(jq -s -r '
      [ .[] | select(.type == "assistant") | .message.content ] | last |
      if . == null then ""
      elif type == "array" then
        [ .[] | select(.type == "text") | .text ] | join("\n")
      else
        .
      end
    ' "$TRANSCRIPT_PATH" 2>/dev/null || true)
  fi
fi

[[ -z "$LAST_TEXT" ]] && exit 0

# ── Claim verb detection ──────────────────────────────────────────────────────
# Word-boundary match on claim verbs from gates/truth_gate.md
CLAIM_PATTERN='\b(done|finished|complete|completed|passed|passing|clean|working|fixed|resolved|ready|merged|pushed|deployed|released|shipped|verified|confirmed|tested|validated)\b'

if ! printf '%s' "$LAST_TEXT" | grep -qiE "$CLAIM_PATTERN"; then
  exit 0
fi

FOUND=$(printf '%s' "$LAST_TEXT" \
  | grep -oiE "$CLAIM_PATTERN" \
  | sort -u \
  | tr '\n' ',' \
  | sed 's/,$//')

# ── Evidence detection (text-based — can be gamed by plausible-looking text) ─
EVIDENCE_PATTERN='(git (status|diff|log|push|show|commit|merge)\b|On branch |HEAD detached|nothing to commit|Changes not staged|Changes to be committed|Untracked files:|commit [0-9a-f]{6,}|\$ git |\bpassed\b.{0,30}test|\bfailed\b.{0,30}test|[0-9]+ tests? (passed|failed|skipped)|(PASS|FAIL)[^a-z].{0,10}[0-9]+|✓ [0-9]+|✗ [0-9]+|exit code [0-9]|\[remote\]|remote: Counting|remote: Compressing|To https?://|To git@|Pushed to |Deploy (succeeded|failed)|Build (succeeded|failed)|Health check)'

TEXT_EVIDENCE_FOUND=0
printf '%s' "$LAST_TEXT" | grep -qiE "$EVIDENCE_PATTERN" && TEXT_EVIDENCE_FOUND=1

# ── Qualifier detection ───────────────────────────────────────────────────────
# Fallback phrasing per truth_gate.md — agent has acknowledged lack of evidence.
QUALIFIER_PATTERN='\b(reportedly|claimed|claims|unverified|not verified|not confirmed|no commit|no test output|no ci output|no evidence|cannot confirm|unable to verify|expected to|not re.?verified)\b'

if printf '%s' "$LAST_TEXT" | grep -qiE "$QUALIFIER_PATTERN"; then
  exit 0
fi

# ── Ledger cross-check (structural — cannot be gamed by response text) ──────
LEDGER_STALE=0
LEDGER_PATHS=""

if [[ -n "${TRUTH_GATE_TEST_LEDGER:-}" ]]; then
  LEDGER_JSON="$TRUTH_GATE_TEST_LEDGER"
else
  PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
  LEDGER_FILE="$PROJECT_DIR/.claude/state/verification-ledger.json"
  LEDGER_JSON=""
  [[ -f "$LEDGER_FILE" ]] && LEDGER_JSON=$(cat "$LEDGER_FILE" 2>/dev/null || true)
fi

if [[ -n "$LEDGER_JSON" ]]; then
  LEDGER_STALE=$(printf '%s' "$LEDGER_JSON" \
    | jq -r --arg sid "$SESSION_ID" '(.sessions[$sid].edited_since_last_verify // false) | if . then "1" else "0" end' 2>/dev/null || echo 0)
  [[ "$LEDGER_STALE" == "1" ]] && LEDGER_PATHS=$(printf '%s' "$LEDGER_JSON" \
    | jq -r --arg sid "$SESSION_ID" '(.sessions[$sid].changed_paths // []) | join(", ")' 2>/dev/null || echo "")
fi

# Old behavior preserved: text evidence present + ledger not stale -> pass.
# New: text evidence present but ledger says code changed since the last
# real verify run -> still warn, because plausible-looking text isn't proof
# a test actually ran after the edit.
if [[ "$TEXT_EVIDENCE_FOUND" == "1" && "$LEDGER_STALE" == "0" ]]; then
  exit 0
fi

# ── Session Trust Decrement ───────────────────────────────────────────────────
# Script path is always relative to this hook's location, not CLAUDE_PROJECT_DIR.
# CLAUDE_PROJECT_DIR is only used by session-trust.sh itself for the state file.
_TRUST_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../scripts/session-trust.sh"
TRUST_SCORE=100
if [[ -x "$_TRUST_SCRIPT" ]]; then
  TRUST_SCORE=$(bash "$_TRUST_SCRIPT" decrement 10 2>/dev/null || echo 100)
fi

# ── Warn ─────────────────────────────────────────────────────────────────────
echo ""
if (( TRUST_SCORE < 50 )); then
  echo "🔴 LOW TRUST SESSION (score: ${TRUST_SCORE}/100) — double evidence required for all claims."
fi
echo "⚠️  TRUTH GATE (L3): Claim verb(s) detected without evidence."
echo "   Found: $FOUND"
echo "   Required in same response: git output, test runner counts,"
echo "   file content shown, CI log, or deploy stdout."
echo "   If evidence is unavailable, use instead:"
echo "     claimed / reportedly / expected / unverified"
if [[ "$LEDGER_STALE" == "1" ]]; then
  echo "   🔍 Evidence ledger: files changed since the last verify-command run"
  echo "      in this session — response text alone cannot substitute for this."
  echo "      Changed: ${LEDGER_PATHS:-unknown}"
fi
echo "   Reference: gates/truth_gate.md (L3 language) | gates/anti-fake-pass-gate.md (L4 process)"
echo ""

exit 0
