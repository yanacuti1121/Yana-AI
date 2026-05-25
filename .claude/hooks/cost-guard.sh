#!/usr/bin/env bash
# YAMTAM ENGINE Hook
# Version: 1.3.26
# Status: active
# Description: Warn when session cost exceeds budget threshold
# Last Reviewed: 2026-05-19
# PreToolUse hook — YAMTAM ENGINE v1.2 Cost Guard
#
# Purpose: warn/block known high-cost operations before they burn context,
# Claude usage, or Codespaces time. This hook is intentionally conservative:
# it does not modify commands and does not claim token metering it cannot know.
#
# Enforced:
#   - blocks full Playwright/E2E runs in Codespaces unless explicitly allowed
#   - blocks unscoped full-repo scans
#   - warns on long-running commands without timeout
#   - Budget Mode ON makes rules stricter
#
# Fails open: parse/tool errors allow the operation.

set -uo pipefail

block() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 2
}

warn() {
  jq -n --arg ctx "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: $ctx
    }
  }'
  exit 0
}

command -v jq >/dev/null 2>&1 || exit 0
INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
[[ "$TOOL_NAME" != "Bash" ]] && exit 0
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || true)
[[ -z "$CMD" ]] && exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
BUDGET_MODE_FILE="$STATE_DIR/BUDGET_MODE"
BUDGET_MODE="off"
[[ -f "$BUDGET_MODE_FILE" ]] && BUDGET_MODE="$(tr -d '[:space:]' < "$BUDGET_MODE_FILE" 2>/dev/null || echo off)"
[[ "$BUDGET_MODE" != "on" ]] && BUDGET_MODE="off"

IN_CODESPACES=false
if [[ -n "${CODESPACE_NAME:-}" || -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" || "${CODESPACES:-}" == "true" ]]; then
  IN_CODESPACES=true
fi

# Explicit bypass for maintainers when intentionally running expensive checks.
if [[ "${YAMTAM_COST_GUARD_BYPASS:-}" == "1" ]]; then
  exit 0
fi

# ── Rule 1: Block full E2E in Codespaces ────────────────────────────────────
# Allow targeted single spec, --grep, --project=smoke, --list.
is_playwright=false
if printf '%s' "$CMD" | grep -Eq '(^|[;&|[:space:]])(npx[[:space:]]+)?playwright[[:space:]]+test|npm[[:space:]]+run[[:space:]]+test:e2e|pnpm[[:space:]]+(run[[:space:]]+)?test:e2e|yarn[[:space:]]+test:e2e'; then
  is_playwright=true
fi

if [[ "$is_playwright" == true && "$IN_CODESPACES" == true && "${YAMTAM_ALLOW_FULL_E2E:-}" != "1" ]]; then
  allowed_targeted=false
  if printf '%s' "$CMD" | grep -Eq -- '--grep|--project=smoke|--list'; then
    allowed_targeted=true
  fi
  # Allow explicit single spec files, e.g. tests/e2e/foo.spec.ts
  if printf '%s' "$CMD" | grep -Eq 'tests/e2e/[^[:space:]]+\.spec\.(ts|tsx|js|mjs)([[:space:]]|$)'; then
    allowed_targeted=true
  fi
  # Block broad directories or no target.
  if [[ "$allowed_targeted" == false ]] || printf '%s' "$CMD" | grep -Eq 'playwright[[:space:]]+test([[:space:]]+tests/e2e/?([[:space:]]|$)|[[:space:]]*$)|npm[[:space:]]+run[[:space:]]+test:e2e([[:space:]]|$)|pnpm[[:space:]]+(run[[:space:]]+)?test:e2e([[:space:]]|$)'; then
    block "Cost Guard: full E2E is blocked in Codespaces. Use GitHub Actions, --grep, --project=smoke, --list, or a single spec file. Set YAMTAM_ALLOW_FULL_E2E=1 only when intentional."
  fi
fi

# ── Rule 2: Block unscoped repo scan ────────────────────────────────────────
# Blocks find/grep/rg over repo root without a scope or depth/include limit.
if printf '%s' "$CMD" | grep -Eq 'grep[[:space:]].*(-r|-R|-rn|-nR).*[[:space:]]\.([[:space:]]|$)|grep[[:space:]].*(-r|-R|-rn|-nR).*[[:space:]]/workspaces|rg[[:space:]]+(--files[[:space:]]*)?$|rg[[:space:]]+\.([[:space:]]|$)|find[[:space:]]+\.([[:space:]]|$)|find[[:space:]]+/workspaces'; then
  if ! printf '%s' "$CMD" | grep -Eq -- '--include|--glob|-g[[:space:]]|--maxdepth|-maxdepth|app/|lib/|components/|tests/|docs/|\.claude/|--files-with-matches|--type'; then
    block "Cost Guard: unscoped full-repo scan detected. Add a path scope like app/ or lib/, use --include/--glob, or set -maxdepth."
  fi
fi

# ── Rule 3: Warn on long-running commands without timeout ───────────────────
if printf '%s' "$CMD" | grep -Eq '(^|[;&|[:space:]])(npm[[:space:]]+run[[:space:]]+build|pnpm[[:space:]]+(run[[:space:]]+)?build|yarn[[:space:]]+build|next[[:space:]]+build|docker[[:space:]]+build|docker compose[[:space:]].*up|prisma[[:space:]]+migrate|tsc[[:space:]]+--build)'; then
  if ! printf '%s' "$CMD" | grep -Eq 'timeout[[:space:]]+[0-9]+|--timeout'; then
    warn "Cost Guard: long-running command detected. Prefer wrapping with timeout 300 <command>. This hook warns only; it does not rewrite commands."
  fi
fi

# ── Rule 4: Budget Mode stricter shell protections ──────────────────────────
if [[ "$BUDGET_MODE" == "on" ]]; then
  if printf '%s' "$CMD" | grep -Eq '(^|[;&|[:space:]])(npm[[:space:]]+install|pnpm[[:space:]]+install|yarn[[:space:]]+install|docker|gh[[:space:]]+workflow[[:space:]]+run|git[[:space:]]+push)'; then
    warn "Budget Mode is ON: command may be costly or state-changing. Confirm scope before proceeding."
  fi
fi

exit 0
