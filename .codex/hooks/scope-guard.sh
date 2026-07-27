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
  Write|Edit|MultiEdit|mcp__*) ;;
  *) exit 0 ;;
esac

TARGET=$(printf '%s' "$INPUT" | jq -r '.tool_input.path // .tool_input.file_path // ""' 2>/dev/null || true)

# MultiEdit may have a top-level file_path
if [[ -z "$TARGET" && "$TOOL_NAME" == "MultiEdit" ]]; then
  TARGET=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null || true)
fi

# Normalise: strip leading ./ and leading absolute path prefix if inside PROJECT_ROOT
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# ── Guarded path patterns (2026-07-11: extracted so the MCP fallback below
# can reuse it against each candidate leaf, not just the primary $TARGET) ──
check_target() {
  local t="$1" filename
  case "$t" in
    app/*|app)               echo "app/ (product application code)"; return ;;
    components/*|components) echo "components/ (product UI components)"; return ;;
    lib/*|lib)                echo "lib/ (product library code)"; return ;;
    db/*|db)                  echo "db/ (product database schema)"; return ;;
    migrations/*|migrate/*)   echo "migrations/ (database migrations — irreversible risk)"; return ;;
    public/*|public)          echo "public/ (product static assets)"; return ;;
    src/*)                    echo "src/ (product source — confirm this is not a Yana AI-only task)"; return ;;
  esac
  filename=$(basename "$t")
  case "$filename" in
    .env|.env.*|*.env)      echo ".env file (secrets must not be written by agents)"; return ;;
    vercel.json)            echo "vercel.json (production deployment config)"; return ;;
    next.config.js|next.config.ts|next.config.mjs) echo "next.config.* (production config)"; return ;;
    docker-compose*.yml|docker-compose*.yaml)       echo "docker-compose (infrastructure config)"; return ;;
    *.prod.js|*.prod.ts|*.production.*)             echo "*.prod.* (production-specific file)"; return ;;
  esac
}

VIOLATION=""
TARGET_NORM=""

if [[ -n "$TARGET" ]]; then
  TARGET_NORM="${TARGET#./}"
  TARGET_NORM="${TARGET_NORM#"$PROJECT_ROOT"/}"
  VIOLATION=$(check_target "$TARGET_NORM")
fi

# ── MCP fallback (2026-07-11) ─────────────────────────────────────────────
# MCP file-writing tools don't share a single field path for the target
# location the way native Write/Edit/MultiEdit do (server-specific key
# names: "target_location", "destination", ...). When the primary
# .path/.file_path extraction found nothing and this is an MCP call, scan
# every string leaf in tool_input independently against check_target() —
# safe to be broad here because this hook is advisory-only (never blocks,
# see the module header), unlike guard-destructive.sh's blocking checks.
if [[ -z "$VIOLATION" && "$TOOL_NAME" == mcp__* ]]; then
  while IFS= read -r leaf; do
    [[ -z "$leaf" ]] && continue
    leaf_norm="${leaf#./}"
    leaf_norm="${leaf_norm#"$PROJECT_ROOT"/}"
    v=$(check_target "$leaf_norm")
    if [[ -n "$v" ]]; then
      TARGET="$leaf"
      TARGET_NORM="$leaf_norm"
      VIOLATION="$v"
      break
    fi
  done < <(printf '%s' "$INPUT" | jq -r '.tool_input // {} | [.. | strings] | .[]' 2>/dev/null)
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
