#!/usr/bin/env bash
# Stop hook — YAMTAM ENGINE L3 Truth Gate Guard
#
# Fires after each Claude turn. Reads the last assistant message from the
# session transcript, scans for claim verbs (done/passed/fixed/deployed…),
# and warns on stdout when none of the required evidence patterns are present.
#
# Non-blocking: always exits 0. Stdout is shown to Claude as post-turn
# context, giving it a chance to self-correct or use fallback phrasing.
#
# Hook event:   Stop
# Requires:     jq
# Bypass:       YAMTAM_TRUTH_GATE_BYPASS=1
#
# Test seam:    TRUTH_GATE_TEST_TEXT="<text>" — skips transcript read;
#               used by core/tests/hooks/run-hook-tests.sh
#
# Reference:    gates/truth_gate.md

set -uo pipefail

[[ "${YAMTAM_TRUTH_GATE_BYPASS:-}" == "1" ]] && exit 0

command -v jq >/dev/null 2>&1 || exit 0

# ── Resolve text to scan ─────────────────────────────────────────────────────

LAST_TEXT=""

if [[ -n "${TRUTH_GATE_TEST_TEXT:-}" ]]; then
  LAST_TEXT="$TRUTH_GATE_TEST_TEXT"
else
  INPUT=$(cat)
  TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null || true)

  if [[ -n "$TRANSCRIPT_PATH" && -f "$TRANSCRIPT_PATH" ]]; then
    LAST_TEXT=$(jq -r '
      [ .[] | select(.role == "assistant") ] | last |
      if . == null then ""
      elif (.content | type) == "array" then
        [ .content[] | select(.type == "text") | .text ] | join("\n")
      else
        .content
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

# ── Evidence detection ────────────────────────────────────────────────────────
# Strong evidence: actual command output present in the response.
EVIDENCE_PATTERN='(git (status|diff|log|push|show|commit|merge)\b|On branch |HEAD detached|nothing to commit|Changes not staged|Changes to be committed|Untracked files:|commit [0-9a-f]{6,}|\$ git |\bpassed\b.{0,30}test|\bfailed\b.{0,30}test|[0-9]+ tests? (passed|failed|skipped)|(PASS|FAIL)[^a-z].{0,10}[0-9]+|✓ [0-9]+|✗ [0-9]+|exit code [0-9]|\[remote\]|remote: Counting|remote: Compressing|To https?://|To git@|Pushed to |Deploy (succeeded|failed)|Build (succeeded|failed)|Health check)'

if printf '%s' "$LAST_TEXT" | grep -qiE "$EVIDENCE_PATTERN"; then
  exit 0
fi

# ── Qualifier detection ───────────────────────────────────────────────────────
# Fallback phrasing per truth_gate.md — agent has acknowledged lack of evidence.
QUALIFIER_PATTERN='\b(reportedly|claimed|claims|unverified|not verified|not confirmed|no commit|no test output|no ci output|no evidence|cannot confirm|unable to verify|expected to|not re.?verified)\b'

if printf '%s' "$LAST_TEXT" | grep -qiE "$QUALIFIER_PATTERN"; then
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
echo "   Reference: gates/truth_gate.md"
echo ""

exit 0
