#!/usr/bin/env bash
# YAMTAM ENGINE Hook
# Version: 1.3.22
# Status: active
# Description: Block unauthorized deploys (gh/kubectl/docker/gcloud/fly/heroku)
# Last Reviewed: 2026-05-19
# PreToolUse hook — YAMTAM ENGINE L4 Deploy Gate
#
# Blocks deploy commands that are NOT already caught by db-protect.sh.
# db-protect.sh covers: vercel --prod, render deploy prod, fly deploy --prod,
#   prisma migrate deploy in production, cloud provider destructive ops.
#
# This hook covers the remaining deploy surface:
#   - GitHub Actions workflow dispatch (gh workflow run)
#   - Kubernetes apply/rollout (kubectl)
#   - Docker push to registries
#   - Google Cloud Run / App Engine deploys
#   - Fly.io deploys (any, not just --prod — Fly has no staging by default)
#   - Heroku process/release commands
#   - Generic "deploy" scripts with production indicators
#
# Risk level: L4 per gates/action_gate.md
#
# Bypass: YAMTAM_DEPLOY_APPROVED=1 (same session, single command)
# Fails closed when jq missing — deploy commands are irreversible.

set -uo pipefail

if ! command -v jq >/dev/null 2>&1; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Deploy Gate: jq missing. Failing closed — deploy operations are irreversible. Install jq and retry, or set YAMTAM_DEPLOY_APPROVED=1 after human review."}}
JSON
  exit 2
fi

[[ "${YAMTAM_DEPLOY_APPROVED:-}" == "1" ]] && exit 0

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)

[[ "$TOOL_NAME" != "Bash" ]] && exit 0

CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || true)
[[ -z "$CMD" ]] && exit 0

deny() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 2
}

# ── GitHub Actions workflow dispatch ────────────────────────────────────────
# gh workflow run triggers CI/CD which may deploy to production.
if printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:]])gh[[:space:]]+workflow[[:space:]]+run\b'; then
  deny "Deploy Gate (L4): gh workflow run can trigger production deploys. Verify the workflow does not deploy to production before proceeding. Set YAMTAM_DEPLOY_APPROVED=1 after human review."
fi

# ── Kubernetes ───────────────────────────────────────────────────────────────
if printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:]])kubectl[[:space:]]+(apply|rollout|set[[:space:]]+image|replace|patch|delete)\b'; then
  deny "Deploy Gate (L4): kubectl write operation detected. Kubernetes changes affect live infrastructure. Set YAMTAM_DEPLOY_APPROVED=1 after reviewing the manifest and confirming the target namespace is not production (or has backup)."
fi

# ── Docker push ──────────────────────────────────────────────────────────────
if printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:]])docker[[:space:]]+push\b'; then
  deny "Deploy Gate (L4): docker push publishes an image to a registry. If this image is used in production, this is a production deploy. Set YAMTAM_DEPLOY_APPROVED=1 after confirming the target registry and tag."
fi

# ── Google Cloud ─────────────────────────────────────────────────────────────
if printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:]])gcloud[[:space:]]+(app[[:space:]]+deploy|run[[:space:]]+deploy|functions[[:space:]]+deploy|builds[[:space:]]+submit)\b'; then
  deny "Deploy Gate (L4): gcloud deploy detected. This pushes code to Google Cloud infrastructure. Set YAMTAM_DEPLOY_APPROVED=1 after human review and confirming the target project/region."
fi

# ── Fly.io ───────────────────────────────────────────────────────────────────
# Fly has no staging concept by default — any fly deploy touches production.
# db-protect.sh already catches fly deploy --prod; this catches bare fly deploy.
if printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:]])fly[[:space:]]+(deploy|launch|machine[[:space:]]+run|scale)\b'; then
  deny "Deploy Gate (L4): Fly.io deploy detected. Fly.io apps are production by default (no built-in staging). Set YAMTAM_DEPLOY_APPROVED=1 after confirming the app name and that this is intentional."
fi

# ── Heroku ───────────────────────────────────────────────────────────────────
if printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:]])heroku[[:space:]]+(releases:promote|container:release|ps:scale|run:detached)\b'; then
  deny "Deploy Gate (L4): Heroku production operation detected. Set YAMTAM_DEPLOY_APPROVED=1 after human review."
fi

# ── Generic production deploy scripts ───────────────────────────────────────
# Catch common deploy script patterns with production indicators.
if printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:]])(bash|sh|node|npx|pnpm|yarn|npm[[:space:]]+run)[[:space:]]+.*deploy'; then
  if printf '%s' "$CMD" | grep -qiE '\b(prod|production|live|release)\b'; then
    deny "Deploy Gate (L4): deploy script with production indicator detected. Set YAMTAM_DEPLOY_APPROVED=1 after human review of the deploy target and scope."
  fi
fi

exit 0
