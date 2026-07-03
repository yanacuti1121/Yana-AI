#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Warn when agent reads secrets or writes to product directories
# Last Reviewed: 2026-05-19
# PreToolUse hook — Yana AI Scope Guard
#
# Warns when Write/Edit/MultiEdit targets product directories that
# Yana AI-scoped tasks must not touch without explicit cross-scope approval.
#
# Guarded paths (from gates/action_gate.md § Scope Rules):
#   app/  components/  lib/  db/  migrations/  public/
#   .env*  vercel.json  next.config.*  docker-compose*.yml  *.prod.*
#
# Behaviour:
#   - Advisory warn (additionalContext) — does not block
#   - Logs to .claude/state/scope-guard.log
#
# Bypass:
#   YANA_SCOPE_OK=1  — set for one command when cross-scope is approved
#
# Fails open on parse errors.
#
# Reference: gates/action_gate.md

set -uo pipefail

[[ "${YANA_SCOPE_OK:-}" == "1" ]] && exit 0

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)

case "$TOOL_NAME" in
  Write|Edit|MultiEdit) ;;
  *) exit 0 ;;
esac

TARGET=$(printf '%s' "$INPUT" | jq -r '.tool_input.path // .tool_input.file_path // ""' 2>/dev/null || true)

# MultiEdit may have a top-level file_path
if [[ -z "$TARGET" && "$TOOL_NAME" == "MultiEdit" ]]; then
  TARGET=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null || true)
fi

[[ -z "$TARGET" ]] && exit 0

# Normalise: strip leading ./ and leading absolute path prefix if inside PROJECT_ROOT
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
TARGET_NORM="${TARGET#./}"
TARGET_NORM="${TARGET_NORM#"$PROJECT_ROOT"/}"

# ── Guarded path patterns ─────────────────────────────────────────────────────
VIOLATION=""

case "$TARGET_NORM" in
  app/*|app)               VIOLATION="app/ (product application code)" ;;
  components/*|components) VIOLATION="components/ (product UI components)" ;;
  lib/*|lib)               VIOLATION="lib/ (product library code)" ;;
  db/*|db)                 VIOLATION="db/ (product database schema)" ;;
  migrations/*|migrate/*)  VIOLATION="migrations/ (database migrations — irreversible risk)" ;;
  public/*|public)         VIOLATION="public/ (product static assets)" ;;
  src/*)                   VIOLATION="src/ (product source — confirm this is not a Yana AI-only task)" ;;
esac

if [[ -z "$VIOLATION" ]]; then
  # File-level guards
  filename=$(basename "$TARGET_NORM")
  case "$filename" in
    .env|.env.*|*.env)      VIOLATION=".env file (secrets must not be written by agents)" ;;
    vercel.json)            VIOLATION="vercel.json (production deployment config)" ;;
    next.config.js|next.config.ts|next.config.mjs) VIOLATION="next.config.* (production config)" ;;
    docker-compose*.yml|docker-compose*.yaml)       VIOLATION="docker-compose (infrastructure config)" ;;
    *.prod.js|*.prod.ts|*.production.*)             VIOLATION="*.prod.* (production-specific file)" ;;
  esac
fi

[[ -z "$VIOLATION" ]] && exit 0

# ── Log ───────────────────────────────────────────────────────────────────────
STATE_DIR="$PROJECT_ROOT/.claude/state"
mkdir -p "$STATE_DIR" 2>/dev/null || true
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
AGENT=$(printf '%s' "$INPUT" | jq -r '.agent_name // "manual"' 2>/dev/null || true)
printf '%s | tool=%s | agent=%s | target=%s | violation=%s\n' \
  "$TS" "$TOOL_NAME" "$AGENT" "$TARGET_NORM" "$VIOLATION" \
  >> "$STATE_DIR/scope-guard.log" 2>/dev/null || true

# ── Warn (non-blocking) ───────────────────────────────────────────────────────
jq -n --arg v "$VIOLATION" --arg t "$TARGET_NORM" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext: ("⚠️  Scope Guard: writing to " + $t + " crosses the Yana AI scope boundary (" + $v + "). Yana AI-scoped tasks must not edit product code without explicit cross-scope approval from the user in this session. If approved, set YANA_SCOPE_OK=1 and state the scope approval in your response. Reference: gates/action_gate.md § Scope Rules. Logged to .claude/state/scope-guard.log.")
  }
}'

exit 0
