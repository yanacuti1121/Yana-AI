#!/usr/bin/env bash
# Yana AI Hook
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
# Bypass: YANA_PROMPT_INJECT_BYPASS=1
# Test seam: PROMPT_INJECT_TEST_INPUT="<text>"

set -uo pipefail

[[ "${YANA_PROMPT_INJECT_BYPASS:-}" == "1" ]] && exit 0

# BUG FIX (2026-08-16, found while wiring this dormant hook): this was a
# bare `command -v jq >/dev/null 2>&1 || exit 0` — a completely silent
# exit on any environment missing jq, disabling every injection check in
# this file (identity override, system-prompt extraction, jailbreak
# triggers, embedded-base64, multi-turn manipulation) with no warning at
# all. Violates this directory's own CLAUDE.md rule ("Hooks must never
# silently allow a risky action... A hook that does nothing without
# explanation is worse than no hook") — the same class of bug already
# found and fixed in tool-validator.sh's jq-missing path. Loud stderr
# warning added; behavior (allow through) is unchanged, since failing
# closed here would block every Bash/Write/Edit/WebFetch call on any
# jq-less machine for a soft-injection heuristic, not a hard security
# boundary — the fix is visibility, not a stricter default.
if ! command -v jq >/dev/null 2>&1; then
  echo "⚠️  Prompt Injection Guard [L3.5]: jq not found — ALL injection detection disabled (identity override, system-prompt extraction, jailbreak triggers, base64/multi-turn heuristics skipped). Install jq to restore protection." >&2
  exit 0
fi

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
  deny "Blocked [L3.5 Prompt Injection]: Identity override or instruction-ignore pattern detected in tool input. This matches known prompt injection techniques. If this is legitimate content (e.g. writing security test cases), set YANA_PROMPT_INJECT_BYPASS=1."
fi

# System prompt extraction
if printf '%s' "$SCAN_TEXT" | grep -qiE \
  '(print (your|the) (system |full )?prompt)|(reveal (your|the) (instructions?|system prompt|context))|(show me (your|the) (prompt|instructions?|training))|(what (is|are) your (instructions?|system prompt|guidelines))|(repeat (everything|all) (above|before this))'; then
  deny "Blocked [L3.5 Prompt Injection]: System prompt extraction attempt detected. Patterns like 'print your system prompt' or 'reveal your instructions' indicate prompt injection. Set YANA_PROMPT_INJECT_BYPASS=1 if writing security test content."
fi

# Jailbreak trigger words
if printf '%s' "$SCAN_TEXT" | grep -qiE \
  '\b(DAN mode|Developer Mode|jailbreak (mode|enabled?|activated?)|STAN mode|AIM mode|maximum (power|capability)|unrestricted mode|god mode|bypass (all|your) (filters?|restrictions?|safety))\b'; then
  deny "Blocked [L3.5 Prompt Injection]: Jailbreak trigger phrase detected ('DAN mode', 'Developer Mode', 'bypass filters', etc.). Set YANA_PROMPT_INJECT_BYPASS=1 if writing security test content."
fi

# ── Soft warn patterns — suspicious but may be legitimate ────────────────────

# Embedded base64 that decodes to instruction-like content (heuristic: long b64 strings mid-text)
if printf '%s' "$SCAN_TEXT" | grep -qE '[A-Za-z0-9+/]{60,}={0,2}'; then
  DECODED=$(printf '%s' "$SCAN_TEXT" | grep -oE '[A-Za-z0-9+/]{60,}={0,2}' | head -1 | base64 -d 2>/dev/null || true)
  if printf '%s' "$DECODED" | grep -qiE '(ignore|disregard|forget|you are now|system prompt|instructions?)'; then
    warn "⚠️  Prompt Injection Guard [L3.5]: Base64-encoded string in tool input decodes to instruction-like content. Review before proceeding. Decoded prefix: $(printf '%s' "$DECODED" | head -c 80)... | Bypass: YANA_PROMPT_INJECT_BYPASS=1"
  fi
fi

# Multi-turn manipulation markers
if printf '%s' "$SCAN_TEXT" | grep -qiE \
  '(previous (conversation|session|context) said|earlier you (agreed|said|confirmed|promised)|in (our|a) previous (chat|session|turn) you)'; then
  warn "⚠️  Prompt Injection Guard [L3.5]: Multi-turn context manipulation pattern detected ('in our previous session you agreed...'). Verify this content is expected. Reference: core/rules/43-prompt-jailbreak-advanced.md | Bypass: YANA_PROMPT_INJECT_BYPASS=1"
fi

exit 0
