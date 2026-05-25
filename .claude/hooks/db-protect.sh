#!/usr/bin/env bash
# YAMTAM ENGINE Hook
# Version: 1.3.26
# Status: active
# Description: Block destructive database operations
# Last Reviewed: 2026-05-19
# PreToolUse hook — Database Protection Layer
# Replit-Incident Defense
#
# Blocks any operation touching production database / production env without
# explicit human approval, regardless of how the command is phrased.
#
# Inspired by the July 2025 Replit incident: an AI agent deleted a production
# database in seconds despite "DO NOT TOUCH" instructions. The lesson:
# instructions are not enough. Hooks must enforce.
#
# Behavior:
#   - FAIL CLOSED: if jq missing, block everything DB-related
#   - Block any command targeting production env vars (DATABASE_URL, etc.)
#   - Block prisma db push / migrate deploy in production
#   - Block any CLI tool with --production / --env=production flags
#   - Require YAMTAM_PROD_APPROVED=1 to bypass (per-command, not session-wide)

set -uo pipefail

if ! command -v jq >/dev/null 2>&1; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked: db-protect requires jq. Install jq and retry. Failing closed because production data is irreversible."}}
JSON
  exit 2
fi

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // ""')
[[ "$TOOL_NAME" != "Bash" ]] && exit 0

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
[[ -z "$CMD" ]] && exit 0

# Single-command bypass for human-approved emergency operations
if [[ "${YAMTAM_PROD_APPROVED:-}" == "1" ]]; then
  exit 0
fi

deny() {
  jq -n --arg reason "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$reason}}'
  exit 2
}

# ── Layer 1: Production env file/var references ─────────────────────────────
# Block reads/writes to .env.production, env files for prod
if echo "$CMD" | grep -qE '\.env\.production|\.env\.prod\b|env\.production'; then
  deny "Blocked: production env file detected. Production secrets must not be touched by AI. Set YAMTAM_PROD_APPROVED=1 for one command only after human review."
fi

# Block sourcing or exporting prod DATABASE_URL
if echo "$CMD" | grep -qE 'DATABASE_URL.*prod|PROD_DATABASE_URL|PRODUCTION_DB'; then
  deny "Blocked: production DATABASE_URL reference detected. Use staging/dev DB. Set YAMTAM_PROD_APPROVED=1 after human review."
fi

# ── Layer 2: Prisma destructive operations ──────────────────────────────────
# prisma db push --force-reset — DESTROYS database
if echo "$CMD" | grep -qE 'prisma\s+db\s+push.*--force-reset|prisma\s+migrate\s+reset'; then
  deny "Blocked: prisma db push --force-reset / migrate reset DESTROYS the database. This is exactly the Replit incident. Set YAMTAM_PROD_APPROVED=1 only after backup + human approval."
fi

# prisma migrate deploy — runs in production
if echo "$CMD" | grep -qE 'prisma\s+migrate\s+deploy'; then
  if echo "$CMD" | grep -qE 'NODE_ENV=production|--env\s*=?\s*prod'; then
    deny "Blocked: prisma migrate deploy in production environment. Migrations must be reviewed by human first. Use staging environment for testing."
  fi
fi

# ── Layer 3: Database CLI tools ──────────────────────────────────────────────
# psql/mysql/mongo direct connection to prod
if echo "$CMD" | grep -qE 'psql\s+.*prod|mysql\s+.*prod|mongo\s+.*prod'; then
  deny "Blocked: direct DB CLI connection to production. Use read-only replicas for inspection. Set YAMTAM_PROD_APPROVED=1 after human review."
fi

# Generic destructive SQL on any host
if echo "$CMD" | grep -qiE 'DELETE\s+FROM.*WHERE\s+1\s*=\s*1|DELETE\s+FROM\s+\w+\s*;|UPDATE\s+\w+\s+SET.*WHERE\s+1\s*=\s*1'; then
  deny "Blocked: bulk DELETE / UPDATE without proper WHERE clause. This deletes/modifies entire table. Use targeted WHERE conditions."
fi

# ── Layer 4: Cloud provider production commands ─────────────────────────────
# Render, Vercel, Heroku, AWS, GCP, Fly.io destructive ops
if echo "$CMD" | grep -qE '\b(render|vercel|heroku|fly|gcloud|aws)\s+.*\b(delete|destroy|teardown|drop)'; then
  deny "Blocked: cloud provider destructive command. These operations affect production infrastructure. Require human to run manually."
fi

# Render/Vercel direct deploy to production
if echo "$CMD" | grep -qE 'vercel\s+--prod|render\s+deploy.*prod|fly\s+deploy.*--prod'; then
  deny "Blocked: direct production deploy. Production deploys must go through CI/CD with explicit human approval, not from AI agent."
fi

# ── Layer 5: Mass file operations ───────────────────────────────────────────
# rm with wildcard at root
if echo "$CMD" | grep -qE 'rm\s+.*-r.*\s+/[^/]*\*|rm\s+.*-r.*\s+\*'; then
  deny "Blocked: rm with root-level wildcard. This pattern can wipe entire directories. Use explicit paths."
fi

# find with -delete
if echo "$CMD" | grep -qE 'find\s+.*-delete\b'; then
  deny "Blocked: find -delete operates silently on many files. Use find without -delete first to list, then targeted rm."
fi

# Allow
exit 0
