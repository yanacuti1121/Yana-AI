#!/usr/bin/env bash
# PostToolUse hook — YAMTAM ENGINE Hash-Chain Audit Log
# Each JSONL entry includes a SHA-256 hash of its content + previous entry hash.
# If any entry is tampered, all subsequent hashes break — independently verifiable
# by core/scripts/verify-audit-chain.sh.

set -uo pipefail
command -v jq >/dev/null 2>&1 || exit 0
command -v sha256sum >/dev/null 2>&1 || exit 0

GENESIS_HASH=$(printf 'YAMTAM_GENESIS' | sha256sum | awk '{print $1}')

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
AGENT_NAME=$(printf '%s' "$INPUT" | jq -r '.agent_name // "manual"' 2>/dev/null || true)
TOOL_INPUT=$(printf '%s' "$INPUT" | jq -c '.tool_input // {}' 2>/dev/null || echo '{}')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

STATE_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}/.claude/state"
mkdir -p "$STATE_DIR" 2>/dev/null || true
LOG_FILE="$STATE_DIR/audit-chain.log"

# ── Secret masking ────────────────────────────────────────────────────────────
INPUT_SAFE="${TOOL_INPUT:0:300}"
FILE_PATH=$(printf '%s' "$TOOL_INPUT" | jq -r '.file_path // .path // ""' 2>/dev/null || true)
if [[ "$FILE_PATH" =~ \.(env|pem|key|secret|cred) ]] || \
   printf '%s' "$INPUT_SAFE" | grep -qiE '(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|BEARER)'; then
  INPUT_SAFE="[REDACTED]"
fi

# ── Hash chaining ─────────────────────────────────────────────────────────────
PREV_HASH=$(tail -1 "$LOG_FILE" 2>/dev/null | jq -r '.hash // ""' 2>/dev/null || true)
[[ -z "$PREV_HASH" ]] && PREV_HASH="$GENESIS_HASH"

CONTENT="${TIMESTAMP}|audit-log|${TOOL_NAME}|${AGENT_NAME}|${INPUT_SAFE}|allow"
HASH=$(printf '%s|%s' "$CONTENT" "$PREV_HASH" | sha256sum | awk '{print $1}')

# ── Write JSONL entry ─────────────────────────────────────────────────────────
jq -cn \
  --arg ts        "$TIMESTAMP" \
  --arg hook      "audit-log" \
  --arg tool      "$TOOL_NAME" \
  --arg agent     "$AGENT_NAME" \
  --arg input     "$INPUT_SAFE" \
  --arg decision  "allow" \
  --arg prev_hash "$PREV_HASH" \
  --arg hash      "$HASH" \
  '{ts:$ts,hook:$hook,tool:$tool,agent:$agent,input:$input,decision:$decision,prev_hash:$prev_hash,hash:$hash}' \
  >> "$LOG_FILE"

exit 0
