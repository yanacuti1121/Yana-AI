#!/usr/bin/env bash
# YAMTAM ENGINE Hook
# Version: 1.3.26
# Status: active
# Description: Block destructive API calls (DELETE/DROP/TRUNCATE patterns)
# Last Reviewed: 2026-05-19
# PreToolUse hook — API Destruction Guard
# API Destructive Action Guard
#
# Lesson from PocketOS: agent called a single Railway GraphQL mutation that
# deleted a production volume + all backups in 9 seconds. db-protect.sh from
# v1.2.7 catches CLI tools (vercel, render, prisma). This hook catches
# RAW HTTP calls (curl, wget, http) carrying destructive verbs to APIs.
#
# Patterns blocked:
#   - curl/wget/http with -X DELETE
#   - GraphQL mutations containing delete/destroy/drop/wipe verbs
#   - Direct calls to known destructive endpoints (railway.app, vercel.com, etc)
#
# Bypass: YAMTAM_PROD_APPROVED=1 (same flag as db-protect.sh)
#
# Fails closed when jq missing (data destruction is irreversible).

set -uo pipefail

if ! command -v jq >/dev/null 2>&1; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked: api-destruct-guard requires jq. Failing closed because destructive API calls are irreversible. Install jq and retry."}}
JSON
  exit 2
fi

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
[[ "$TOOL_NAME" != "Bash" ]] && exit 0

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
[[ -z "$CMD" ]] && exit 0

# Same bypass flag as db-protect.sh
[[ "${YAMTAM_PROD_APPROVED:-}" == "1" ]] && exit 0

deny() {
  jq -n --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 2
}

# ── Layer 1: HTTP DELETE methods ────────────────────────────────────────────
if echo "$CMD" | grep -qE '\b(curl|wget|http|httpie)\b.*(-X[[:space:]]+|--request[[:space:]]+|--method[[:space:]]+)DELETE\b'; then
  deny "Blocked: HTTP DELETE call detected. The PocketOS incident (April 2026) was a single GraphQL mutation that wiped a production database in 9 seconds. Set YAMTAM_PROD_APPROVED=1 only after verifying the target endpoint and scope."
fi

# ── Layer 2: GraphQL destructive mutations ──────────────────────────────────
# Match any GraphQL mutation that contains a destructive verb on a resource.
# Catches: volumeDelete, deleteUser, destroyDatabase, dropTable, wipeAccount, removeProject, truncateTable, etc.
if echo "$CMD" | grep -qiE 'mutation[[:space:]]*\{[^}]*(delete|destroy|drop|wipe|truncate|remove|teardown)[A-Z]?'; then
  deny "Blocked: destructive GraphQL mutation detected. Patterns like 'volumeDelete', 'destroyDatabase', 'dropTable' are how the PocketOS incident happened. Verify scope, environment, and permissions before retrying with YAMTAM_PROD_APPROVED=1."
fi

# Heuristic: any GraphQL with delete keyword on prod-looking host
if echo "$CMD" | grep -qiE 'railway\.(app|com).*delete|api\.vercel\.com.*delete|api\.render\.com.*delete|api\.fly\.io.*delete'; then
  deny "Blocked: destructive call to cloud provider API (Railway/Vercel/Render/Fly). These are the kind of calls that caused the PocketOS incident. Use the provider's CLI with explicit confirmation, or run via human."
fi

# ── Layer 3: Force-DELETE via cloud SDKs ───────────────────────────────────
if echo "$CMD" | grep -qiE '(railway|vercel|fly|gcloud|aws|heroku)\b.*\b(volume|database|db|disk)\b.*\b(delete|destroy|remove)\b'; then
  deny "Blocked: cloud SDK deletion of volume/database/disk. The PocketOS incident: agent called Railway volume delete API. Use the dashboard for destructive infra ops."
fi

# ── Layer 4: SSH-based remote destruction ──────────────────────────────────
if echo "$CMD" | grep -qE 'ssh\s+.*\b(rm\s+-rf|drop\s+(table|database)|truncate)'; then
  deny "Blocked: ssh + destructive command. Even targeted ssh-based destruction must be human-driven."
fi

exit 0
