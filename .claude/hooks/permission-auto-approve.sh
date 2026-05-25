#!/usr/bin/env bash
# YAMTAM ENGINE Hook
# Version: 1.3.26
# Status: active
# Description: PermissionRequest — auto-approve known safe read-only tool patterns
# Last Reviewed: 2026-05-19
#
# Fires when Claude Code shows a permission dialog.
# Reduces interruption for provably safe operations.
# Conservative by design: only approves read-only tools; passes everything else.
#
# Auto-APPROVE:
#   Read, Glob, Grep, LS — always read-only, no side effects
#   Bash read-only commands: git status/log/diff, ls, cat, find, wc, grep
#
# Auto-DENY:
#   (none — never auto-deny, let the user decide)
#
# Pass-through (exit 0, no decision):
#   All write operations, unknown tools, ambiguous cases
#
# Hook event:   PermissionRequest
# Blocking:     yes (exit 2 enforces decision)
# Bypass:       YAMTAM_PERMISSION_BYPASS=1
# Requires:     jq

set -uo pipefail

[[ "${YAMTAM_PERMISSION_BYPASS:-}" == "1" ]] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
[[ -z "$TOOL_NAME" ]] && exit 0

allow() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      permissionDecision: "allow",
      permissionDecisionReason: $reason
    }
  }'
  exit 2
}

# ── Always-safe read-only tools ───────────────────────────────────────────────
case "$TOOL_NAME" in
  Read|Glob|Grep|LS)
    allow "Read-only tool — auto-approved by YAMTAM permission-auto-approve"
    ;;
esac

# ── Bash: approve only known read-only commands ───────────────────────────────
if [[ "$TOOL_NAME" == "Bash" ]]; then
  CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || true)
  CMD_TRIMMED=$(echo "$CMD" | sed 's/^\s*//' | tr -s ' ')
  FIRST_TOKEN=$(echo "$CMD_TRIMMED" | awk '{print $1}')

  case "$FIRST_TOKEN" in
    ls|cat|head|tail|wc|find|grep|rg|fd|echo|printf|pwd|which|type|file|stat)
      # Safe only if no pipe to write commands or redirects
      if ! echo "$CMD" | grep -qE '(>|>>|\|.*rm|\|.*mv|\|.*cp|\|.*tee|\|.*write)'; then
        allow "Read-only bash command ($FIRST_TOKEN) — auto-approved by YAMTAM"
      fi
      ;;
    git)
      GIT_SUB=$(echo "$CMD_TRIMMED" | awk '{print $2}')
      case "$GIT_SUB" in
        status|log|diff|show|branch|tag|remote|fetch|stash\ list|describe|blame|shortlog|rev-parse|ls-files|ls-tree|for-each-ref)
          allow "Read-only git command (git $GIT_SUB) — auto-approved by YAMTAM"
          ;;
      esac
      ;;
    python3|python|node|jq)
      # Only approve if it's piped from stdin and read-only looking
      if echo "$CMD" | grep -qE '^\s*(python3?|node|jq)\s+-[cC]\s+' && \
         ! echo "$CMD" | grep -qE '(open.*w|write|unlink|os\.remove|fs\.write)'; then
        allow "Read-only script invocation — auto-approved by YAMTAM"
      fi
      ;;
  esac
fi

# ── Pass through everything else ──────────────────────────────────────────────
exit 0
