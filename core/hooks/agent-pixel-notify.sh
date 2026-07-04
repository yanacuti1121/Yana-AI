#!/usr/bin/env bash
# Yana AI Hook
# Description: Notify the (optional, external) Pixel Office bridge server
# whenever a subagent is spawned (PreToolUse) or finishes (PostToolUse).
#
# This is a side-channel visual notification only — it never gates or blocks
# the real tool call. If the bridge server isn't running, this is a no-op.
# The bridge lives entirely outside this repo (/workspaces/yana-pixel-bridge);
# this script is the only point of contact between the two.
#
# Usage (wired in .claude/settings.json):
#   PreToolUse  matcher "Agent|Task" -> agent-pixel-notify.sh start
#   PostToolUse matcher "Agent|Task" -> agent-pixel-notify.sh stop

EVENT="${1:-start}"
BRIDGE_URL="${YANA_PIXEL_BRIDGE_URL:-http://127.0.0.1:5000}/webhook/agent-hook"

INPUT="$(cat)"

if command -v jq >/dev/null 2>&1; then
  TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // "Agent"' 2>/dev/null)
  SUBAGENT_TYPE=$(printf '%s' "$INPUT" | jq -r '.tool_input.subagent_type // "general-purpose"' 2>/dev/null)
  DESCRIPTION=$(printf '%s' "$INPUT" | jq -r '.tool_input.description // ""' 2>/dev/null)
else
  TOOL_NAME="Agent"
  SUBAGENT_TYPE="general-purpose"
  DESCRIPTION=""
fi

PAYLOAD=$(printf '{"event":"%s","tool_name":"%s","subagent_type":"%s","description":"%s"}' \
  "$EVENT" "$TOOL_NAME" "$SUBAGENT_TYPE" "${DESCRIPTION//\"/\\\"}")

# Fire-and-forget: 1s connect/total timeout, never fail the actual tool call.
curl -s -m 1 -X POST "$BRIDGE_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" >/dev/null 2>&1 || true

exit 0
