#!/usr/bin/env bash
# tool-proxy-enforcer.sh — PreToolUse:Bash hook
# Version: 1.0.0
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

# Bypass — sovereign only
if [[ "${YANA_TOOL_PROXY_BYPASS:-0}" == "1" ]]; then
  LOG_FILE="${YANA_LOG:-/tmp/yana-ai-audit.log}"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] TOOL-PROXY-BYPASS used cmd='$(echo "$COMMAND" | head -c 80)'" >> "$LOG_FILE" 2>/dev/null || true
  exit 0
fi

# ── Subshell injection (tool-proxy sanitize phase 2a/2b) ─────────────────────
if echo "$COMMAND" | grep -qP '\$\(|`|<\(|\$\{'; then
  deny "[tool-proxy-enforcer] Blocked: subshell injection pattern detected (\$(), \`, <(), \${}). Use explicit commands instead of subshell substitution."
fi

# ── Pipe-to-interpreter (anti-evasion-law.md, tool-proxy phase 2d) ───────────
if echo "$COMMAND" | grep -qiP '\|\s*(bash|sh|zsh|python3?|node|perl|ruby|php)\b'; then
  deny "[tool-proxy-enforcer] Blocked: pipe-to-interpreter detected. This is a TIER 1 security violation (anti-evasion-law.md). Never pipe content into a shell interpreter."
fi

# ── Base64 decode + pipe (anti-evasion pattern 2) ────────────────────────────
if echo "$COMMAND" | grep -qiP 'base64\s+(--decode|-d).*\|'; then
  deny "[tool-proxy-enforcer] Blocked: base64 decode piped to command — encoded execution evasion (anti-evasion-law.md gate L1)."
fi

# ── Process substitution bypass ───────────────────────────────────────────────
if echo "$COMMAND" | grep -qiP '(source|bash|sh)\s+<\('; then
  deny "[tool-proxy-enforcer] Blocked: process substitution into interpreter (source <(...) / bash <(...)). Anti-evasion-law.md gate L1."
fi

# ── openssl decode + exec ─────────────────────────────────────────────────────
if echo "$COMMAND" | grep -qiP 'openssl\s+(enc|base64).*-d.*\|'; then
  deny "[tool-proxy-enforcer] Blocked: openssl decode pipe — obfuscated execution evasion (anti-evasion-law.md)."
fi

exit 0
