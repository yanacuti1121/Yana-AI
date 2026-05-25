#!/usr/bin/env bash
# YAMTAM ENGINE Hook
# Version: 1.7.0
# Status: active
# Description: L3.5 Prompt Injection Guard — detect and block injection patterns in tool inputs
# Last Reviewed: 2026-05-24
# PreToolUse hook — fires before Bash, Write, Edit, WebFetch tool calls.
#
# Scans tool input text for prompt injection patterns:
#   - Identity override attempts ("you are now", "ignore previous instructions")
#   - System prompt extraction ("print your system prompt", "reveal instructions")
#   - Instruction smuggling via encoded text (Base64 embedded directives)
#   - Jailbreak trigger phrases
#   - Multi-turn manipulation markers
#
# Exit behaviour:
#   exit 0          — allow
#   JSON + exit 2   — block (hard injection patterns)
#   additionalContext + exit 0 — warn (soft patterns)
#
# Bypass: YAMTAM_PROMPT_INJECT_BYPASS=1
# Test seam: PROMPT_INJECT_TEST_INPUT="<text>"

set -uo pipefail

[[ "${YAMTAM_PROMPT_INJECT_BYPASS:-}" == "1" ]] && exit 0

command -v jq >/dev/null 2>&1 || exit 0

# ── Read input ────────────────────────────────────────────────────────────────

if [[ -n "${PROMPT_INJECT_TEST_INPUT:-}" ]]; then
  SCAN_TEXT="$PROMPT_INJECT_TEST_INPUT"
  TOOL_NAME="Bash"
else
  INPUT=$(cat)
  TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)

  case "$TOOL_NAME" in
    Bash)
      SCAN_TEXT=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || true)
      ;;
    Write|Edit|MultiEdit)
      SCAN_TEXT=$(printf '%s' "$INPUT" | jq -r '
        .tool_input.content //
        .tool_input.new_string //
        (.tool_input.edits // [] | map(.new_string) | join("\n")) //
        ""
      ' 2>/dev/null || true)
      ;;
    WebFetch)
      SCAN_TEXT=$(printf '%s' "$INPUT" | jq -r '.tool_input.url // ""' 2>/dev/null || true)
      ;;
    *)
      exit 0
      ;;
  esac
fi

[[ -z "$SCAN_TEXT" ]] && exit 0

deny() {
  local reason="$1"
  jq -n \
    --arg reason "$reason" \
    '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $reason
      }
    }'
  exit 2
}

warn() {
  local msg="$1"
  jq -n --arg msg "$msg" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: $msg
    }
  }'
  exit 0
}

# ── Hard block patterns — clear injection attempts ────────────────────────────

# Identity override
if printf '%s' "$SCAN_TEXT" | grep -qiE \
  '(ignore (all |your )?(previous|prior|earlier|above) (instructions?|rules?|constraints?|guidelines?))|(disregard (your|all) (training|instructions?|rules?|programming))|(you are (now |no longer )?(an? )?(AI|assistant|claude|language model))|(forget (everything|all) (you know|your instructions?))|(new (persona|identity|role|mode)[:]\s*(DAN|AIM|STAN|JAILBREAK))'; then
  deny "Blocked [L3.5 Prompt Injection]: Identity override or instruction-ignore pattern detected in tool input. This matches known prompt injection techniques. If this is legitimate content (e.g. writing security test cases), set YAMTAM_PROMPT_INJECT_BYPASS=1."
fi

# System prompt extraction
if printf '%s' "$SCAN_TEXT" | grep -qiE \
  '(print (your|the) (system |full )?prompt)|(reveal (your|the) (instructions?|system prompt|context))|(show me (your|the) (prompt|instructions?|training))|(what (is|are) your (instructions?|system prompt|guidelines))|(repeat (everything|all) (above|before this))'; then
  deny "Blocked [L3.5 Prompt Injection]: System prompt extraction attempt detected. Patterns like 'print your system prompt' or 'reveal your instructions' indicate prompt injection. Set YAMTAM_PROMPT_INJECT_BYPASS=1 if writing security test content."
fi

# Jailbreak trigger words
if printf '%s' "$SCAN_TEXT" | grep -qiE \
  '\b(DAN mode|Developer Mode|jailbreak (mode|enabled?|activated?)|STAN mode|AIM mode|maximum (power|capability)|unrestricted mode|god mode|bypass (all|your) (filters?|restrictions?|safety))\b'; then
  deny "Blocked [L3.5 Prompt Injection]: Jailbreak trigger phrase detected ('DAN mode', 'Developer Mode', 'bypass filters', etc.). Set YAMTAM_PROMPT_INJECT_BYPASS=1 if writing security test content."
fi

# ── Soft warn patterns — suspicious but may be legitimate ────────────────────

# Embedded base64 that decodes to instruction-like content (heuristic: long b64 strings mid-text)
if printf '%s' "$SCAN_TEXT" | grep -qE '[A-Za-z0-9+/]{60,}={0,2}'; then
  DECODED=$(printf '%s' "$SCAN_TEXT" | grep -oE '[A-Za-z0-9+/]{60,}={0,2}' | head -1 | base64 -d 2>/dev/null || true)
  if printf '%s' "$DECODED" | grep -qiE '(ignore|disregard|forget|you are now|system prompt|instructions?)'; then
    warn "⚠️  Prompt Injection Guard [L3.5]: Base64-encoded string in tool input decodes to instruction-like content. Review before proceeding. Decoded prefix: $(printf '%s' "$DECODED" | head -c 80)... | Bypass: YAMTAM_PROMPT_INJECT_BYPASS=1"
  fi
fi

# Multi-turn manipulation markers
if printf '%s' "$SCAN_TEXT" | grep -qiE \
  '(previous (conversation|session|context) said|earlier you (agreed|said|confirmed|promised)|in (our|a) previous (chat|session|turn) you)'; then
  warn "⚠️  Prompt Injection Guard [L3.5]: Multi-turn context manipulation pattern detected ('in our previous session you agreed...'). Verify this content is expected. Reference: core/rules/43-prompt-jailbreak-advanced.md | Bypass: YAMTAM_PROMPT_INJECT_BYPASS=1"
fi

exit 0
