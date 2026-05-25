#!/usr/bin/env bash
# YAMTAM ENGINE Hook
# Version: 1.3.26
# Status: active
# Description: Advisory warn on cross-scope commits
# Last Reviewed: 2026-05-19
# PreToolUse hook — YAMTAM ENGINE L2 Commit Gate
#
# Fires before git commit. Warns (non-blocking) when the staged changes
# contain product paths that YAMTAM-scoped tasks must not touch without
# explicit cross-scope approval.
#
# Why at commit time: scope-guard.sh warns at write time, but the agent
# may have received approval since then. This gate catches commits where
# cross-scope changes are being locked in without documented approval.
#
# Behaviour:
#   - Advisory warn (additionalContext) — does not block
#   - Fails open: any error → exit 0
#   - Bypass: YAMTAM_SCOPE_OK=1 (same flag as scope-guard.sh)
#
# Reference: gates/action_gate.md § Risk Levels (L2 — Commit)

set -uo pipefail

[[ "${YAMTAM_SCOPE_OK:-}" == "1" ]] && exit 0

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)

[[ "$TOOL_NAME" != "Bash" ]] && exit 0

CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || true)

# Only intercept git commit commands
if ! printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+commit\b'; then
  exit 0
fi

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Test seam: COMMIT_GATE_TEST_STAGED="file1\nfile2" — injects staged list without real git
if [[ -n "${COMMIT_GATE_TEST_STAGED:-}" ]]; then
  STAGED=$(printf '%s' "$COMMIT_GATE_TEST_STAGED" | tr '|' '\n')
else
  STAGED=$(git -C "$PROJECT_ROOT" diff --cached --name-only 2>/dev/null || true)
fi
[[ -z "$STAGED" ]] && exit 0

# Product path patterns (mirrors scope-guard.sh)
PRODUCT_PATHS=$(printf '%s' "$STAGED" | grep -E \
  '^(app/|components/|lib/|db/|migrations/|migrate/|public/|src/)' \
  2>/dev/null || true)

# File-level product paths
PRODUCT_FILES=$(printf '%s' "$STAGED" | grep -E \
  '(\.env(\.|$)|vercel\.json$|next\.config\.(js|ts|mjs)$|docker-compose.*\.(yml|yaml)$|.*\.prod\.(js|ts)|.*\.production\.)' \
  2>/dev/null || true)

ALL_PRODUCT=$(printf '%s\n%s' "$PRODUCT_PATHS" "$PRODUCT_FILES" | grep -v '^$' | sort -u || true)
[[ -z "$ALL_PRODUCT" ]] && exit 0

FILE_COUNT=$(printf '%s' "$ALL_PRODUCT" | wc -l | tr -d ' ')
SAMPLE=$(printf '%s' "$ALL_PRODUCT" | head -4 | tr '\n' '  ')

jq -n --arg count "$FILE_COUNT" --arg sample "$SAMPLE" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext: ("⚠️  Commit Gate (L2): this commit includes \($count) product path(s): \($sample). YAMTAM-scoped tasks must not commit product code without explicit cross-scope approval. If approved this session, set YAMTAM_SCOPE_OK=1 and document the approval in the commit message. If not approved, stop and request it. Reference: gates/action_gate.md § Scope Rules.")
  }
}'

exit 0
