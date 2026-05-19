#!/usr/bin/env bash
# YAMTAM ENGINE Hook
# Version: 1.3.22
# Status: active
# Description: Enforce RBAC — block actions outside agent role
# Last Reviewed: 2026-05-19
# PreToolUse hook — YAMTAM ENGINE v1.2 RBAC Guard
#
# Lightweight policy guard. Fails open for manual/user calls and unknown agents.
# This is intentionally narrow until agent identity is reliably available.

set -uo pipefail
command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
AGENT_NAME=$(printf '%s' "$INPUT" | jq -r '.agent_name // ""' 2>/dev/null || true)

# Manual/user calls or missing agent metadata should not be blocked.
[[ -z "$TOOL_NAME" || -z "$AGENT_NAME" || "$AGENT_NAME" == "null" ]] && exit 0

RBAC_CONFIG_FILE="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/rbac.json"
[[ -f "$RBAC_CONFIG_FILE" ]] || exit 0

mapfile -t ROLES < <(jq -r --arg agent "$AGENT_NAME" '.agent_roles[$agent][]? // empty' "$RBAC_CONFIG_FILE" 2>/dev/null)
[[ ${#ROLES[@]} -eq 0 ]] && exit 0

permission_granted=false
for role in "${ROLES[@]}"; do
  while IFS= read -r perm; do
    case "$perm" in
      "tool:$TOOL_NAME"|"tool:$TOOL_NAME:"*|"tool:$TOOL_NAME:exec"|"tool:$TOOL_NAME:read"|"tool:$TOOL_NAME:write"|"tool:$TOOL_NAME:edit"|"tool:$TOOL_NAME:append")
        permission_granted=true
        break
        ;;
    esac
  done < <(jq -r --arg role "$role" '.roles[$role].permissions[]? // empty' "$RBAC_CONFIG_FILE" 2>/dev/null)
  [[ "$permission_granted" == true ]] && break
done

if [[ "$permission_granted" != true ]]; then
  jq -n --arg agent "$AGENT_NAME" --arg tool "$TOOL_NAME" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: ("RBAC Guard: agent \($agent) is not allowed to use tool \($tool). Check .claude/rbac.json to grant the required permission.")
    }
  }'
  exit 2
fi

exit 0
