#!/usr/bin/env bash
# Yana AI Hook
# Version: 1.3.26
# Status: active
# Description: Block destructive shell commands (rm -rf, kill, etc.)
# Last Reviewed: 2026-05-19
# PreToolUse hook — blocks destructive shell commands before they execute.
# Reads the tool input JSON from stdin, inspects the command, and denies
# patterns that are irreversible or dangerous in a shared codebase.
#
# Exit behaviour:
#   exit 0          — allow the command
#   JSON + exit 2   — block the command and show the reason to Claude

set -euo pipefail

# ── Native Rust fast path (audit 2026-06-21) ─────────────────────────────────
# If yana-rt is installed and on PATH, delegate to the in-process Rust port:
# no jq dependency, no subprocess-per-call cost. `exec` hands stdin/stdout
# straight through and the script's exit code becomes yana-rt's exit code —
# tested byte-for-byte identical to the bash logic below (same 7 patterns,
# same deny-reason text; see src/guard/mod.rs::cmd_destructive). Falls
# through unchanged to the jq-based logic if yana-rt isn't found, so this
# hook keeps working exactly as before on a machine without it installed.
if command -v yana-rt >/dev/null 2>&1; then
  exec yana-rt guard destructive
fi

# ── Dependency guard ─────────────────────────────────────────────────────────
# This hook requires `jq` to parse the tool-input JSON. If jq is missing we
# FAIL CLOSED: block the command so the user installs jq rather than silently
# letting destructive commands through. (Previous behaviour crashed, which
# Claude Code interprets as "hook didn't block" — effectively disabling the
# guard. That would be very bad for `rm -rf`, `DROP TABLE`, force-push, etc.)
if ! command -v jq >/dev/null 2>&1; then
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Blocked: the destructive-command guard requires `jq` but it is not installed. Install jq (macOS: `brew install jq` · Debian/Ubuntu: `sudo apt-get install jq` · Windows: `winget install jqlang.jq`) and retry. This fails closed so that destructive shell commands cannot slip past a broken guard."
  }
}
EOF
  exit 2
fi

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

deny() {
  local reason="$1"
  jq -n \
    --arg reason "$reason" \
    '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $reason
      }
    }'
  exit 2
}

# ── Destructive filesystem operations ────────────────────────────────────────
if echo "$COMMAND" | grep -qE '(^|[;&|])\s*rm\s+-[a-zA-Z]*r[a-zA-Z]*f|rm\s+-[a-zA-Z]*f[a-zA-Z]*r'; then
  deny "Blocked: 'rm -rf' is irreversible. Use targeted 'rm' with explicit paths, or ask the human to confirm first."
fi

# ── Dangerous git operations ──────────────────────────────────────────────────
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*--force|git\s+push\s+.*-f\b'; then
  deny "Blocked: 'git push --force' is not allowed. The orchestrator pushes branches; force-pushing risks overwriting shared history."
fi

if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard'; then
  deny "Blocked: 'git reset --hard' discards uncommitted work irreversibly. Use 'git stash' or commit before resetting."
fi

if echo "$COMMAND" | grep -qE 'git\s+clean\s+.*-f'; then
  deny "Blocked: 'git clean -f' permanently deletes untracked files. Ask the human to confirm before running this."
fi

# Direct pushes to main/master are handled by branch protection, but block at hook level too.
if echo "$COMMAND" | grep -qE 'git\s+push\s+(origin\s+)?(main|master)\b'; then
  deny "Blocked: direct push to main/master. Create a feature branch and open a PR instead."
fi

# ── Destructive SQL operations ────────────────────────────────────────────────
if echo "$COMMAND" | grep -qiE '\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b'; then
  deny "Blocked: destructive SQL (DROP TABLE / TRUNCATE) detected. Database migrations must be reversible. Use ALTER/soft-delete patterns and ask the human to confirm schema drops."
fi

# ── Dangerous package operations ─────────────────────────────────────────────
if echo "$COMMAND" | grep -qE 'npm\s+publish|yarn\s+publish|pnpm\s+publish'; then
  deny "Blocked: publishing to npm requires explicit human approval. Ask the human to run this command manually."
fi

# Allow everything else
exit 0
