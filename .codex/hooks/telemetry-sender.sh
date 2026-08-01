#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Emit telemetry events to session log
# Last Reviewed: 2026-05-19
# PostToolUse hook — Yana AI v1.2 Local Telemetry
# Local-only, factual telemetry. Does not estimate token usage and does not send
# network requests. This exists to support later dashboards without fake data.

set -uo pipefail
command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
AGENT_NAME=$(printf '%s' "$INPUT" | jq -r '.agent_name // "manual"' 2>/dev/null || true)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
STATE_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/state"
mkdir -p "$STATE_DIR" 2>/dev/null || true
printf '{"ts":"%s","agent":"%s","tool":"%s"}\n' "$TIMESTAMP" "$AGENT_NAME" "$TOOL_NAME" >> "$STATE_DIR/telemetry.jsonl"
exit 0
