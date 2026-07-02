#!/usr/bin/env bash
# Yana AI Hook
# Version: 1.7.0
# Status: active
# Description: L1.5 Tool Use Validation — schema-validate tool inputs, block path traversal and SSRF
# Last Reviewed: 2026-05-24
# PreToolUse hook — fires before any tool call to validate input structure and safety.
#
# Validates:
#   Bash       — no null bytes, no control chars smuggled as commands
#   Write/Edit — path traversal prevention (../../), absolute paths outside project
#   WebFetch   — URL format validation, SSRF guard (private IP ranges blocked)
#   All tools  — tool name allowlist check (blocks unknown/phantom tools)
#
# Exit behaviour:
#   exit 0          — allow
#   JSON + exit 2   — block
#   additionalContext + exit 0 — warn
#
# Bypass: YANA_TOOL_VALID_BYPASS=1
# Test seam: TOOL_VALID_TEST_INPUT="<json>"

set -uo pipefail

[[ "${YANA_TOOL_VALID_BYPASS:-}" == "1" ]] && exit 0

command -v jq >/dev/null 2>&1 || exit 0

# ── Read input ────────────────────────────────────────────────────────────────

if [[ -n "${TOOL_VALID_TEST_INPUT:-}" ]]; then
  INPUT="$TOOL_VALID_TEST_INPUT"
else
  INPUT=$(cat)
fi

TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
[[ -z "$TOOL_NAME" ]] && exit 0

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

warn() {
  local msg="$1"
  jq -n --arg msg "$msg" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: $msg
    }
  }'
  exit 0
}

# ── Tool allowlist — block phantom/unknown tools ──────────────────────────────
KNOWN_TOOLS="Bash|Read|Write|Edit|MultiEdit|WebFetch|WebSearch|TodoRead|TodoWrite|Task|ExitPlanMode|EnterPlanMode|dispatch_agent|computer"
if ! printf '%s' "$TOOL_NAME" | grep -qE "^($KNOWN_TOOLS)$"; then
  warn "⚠️  Tool Validator [L1.5]: Unknown tool '${TOOL_NAME}' requested. This tool is not in the Yana AI known-tools allowlist. Verify this tool exists and is expected before allowing. Reference: core/hooks/tool-validator.sh"
fi

# ── Bash: null byte and control character injection ───────────────────────────
if [[ "$TOOL_NAME" == "Bash" ]]; then
  CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || true)

  # Null bytes in commands — always malicious
  if printf '%s' "$CMD" | grep -qP '\x00' 2>/dev/null || \
     printf '%s' "$CMD" | LC_ALL=C grep -q $'\x00' 2>/dev/null; then
    deny "Blocked [L1.5 Tool Validator]: Null byte (\\x00) detected in Bash command. Null byte injection is a known attack vector for bypassing string-based filters. Bypass: YANA_TOOL_VALID_BYPASS=1"
  fi

  # Command timeout field validation — must be a number if present
  TIMEOUT_VAL=$(printf '%s' "$INPUT" | jq -r '.tool_input.timeout // ""' 2>/dev/null || true)
  if [[ -n "$TIMEOUT_VAL" ]] && ! printf '%s' "$TIMEOUT_VAL" | grep -qE '^[0-9]+$'; then
    deny "Blocked [L1.5 Tool Validator]: Invalid 'timeout' field in Bash tool input — must be a non-negative integer, got: '${TIMEOUT_VAL}'. Bypass: YANA_TOOL_VALID_BYPASS=1"
  fi
fi

# ── Write / Edit: path traversal prevention ───────────────────────────────────
if [[ "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "Edit" || "$TOOL_NAME" == "MultiEdit" ]]; then
  FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.path // .tool_input.file_path // ""' 2>/dev/null || true)

  if [[ -z "$FILE_PATH" && "$TOOL_NAME" == "MultiEdit" ]]; then
    FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null || true)
  fi

  if [[ -n "$FILE_PATH" ]]; then
    # Sensitive system paths — always block (check before absolute path warn)
    if printf '%s' "$FILE_PATH" | grep -qE '^(/etc/(passwd|shadow|sudoers|hosts|crontab|ssh)|/root/|/proc/|/sys/)'; then
      deny "Blocked [L1.5 Tool Validator]: Write to sensitive system path '${FILE_PATH}' is not allowed. System files must not be written by AI agents. Bypass: YANA_TOOL_VALID_BYPASS=1"
    fi

    # Path traversal: ../../ sequences targeting outside project root
    if printf '%s' "$FILE_PATH" | grep -qE '(^|/)\.\.(/|$)'; then
      deny "Blocked [L1.5 Tool Validator]: Path traversal detected in '${FILE_PATH}'. Sequences like '../..' can escape the project root. Use absolute paths within the project or project-relative paths. Bypass: YANA_TOOL_VALID_BYPASS=1"
    fi

    # Absolute paths outside project root (warn, not block — may be legitimate)
    PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
    if [[ "$FILE_PATH" == /* ]] && [[ "$FILE_PATH" != "$PROJECT_ROOT"* ]]; then
      warn "⚠️  Tool Validator [L1.5]: Write/Edit target '${FILE_PATH}' is outside the project root '${PROJECT_ROOT}'. Confirm this is intentional. Bypass: YANA_TOOL_VALID_BYPASS=1"
    fi
  fi
fi

# ── WebFetch: URL validation and SSRF guard ───────────────────────────────────
if [[ "$TOOL_NAME" == "WebFetch" ]]; then
  URL=$(printf '%s' "$INPUT" | jq -r '.tool_input.url // ""' 2>/dev/null || true)

  if [[ -n "$URL" ]]; then
    # Must be http or https
    if ! printf '%s' "$URL" | grep -qE '^https?://'; then
      deny "Blocked [L1.5 Tool Validator]: WebFetch URL '${URL}' must use http:// or https:// scheme. Other schemes (file://, ftp://, data://) are not allowed. Bypass: YANA_TOOL_VALID_BYPASS=1"
    fi

    # SSRF guard: block private IP ranges and localhost
    # Portable scheme-strip (no sed \? — that's a GNU extension; BSD/macOS
    # sed treats it as a literal "?" and never strips the scheme, which
    # silently defeats every check below on macOS while passing on Linux CI).
    HOST="${URL#http://}"
    HOST="${HOST#https://}"
    HOST="${HOST%%/*}"
    HOST="${HOST%%:*}"
    if printf '%s' "$HOST" | grep -qE \
      '^(localhost|127\.[0-9]+\.[0-9]+\.[0-9]+|0\.0\.0\.0|::1|10\.[0-9]+\.[0-9]+\.[0-9]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9]+\.[0-9]+|192\.168\.[0-9]+\.[0-9]+|169\.254\.[0-9]+\.[0-9]+|100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.[0-9]+\.[0-9]+)$'; then
      deny "Blocked [L1.5 Tool Validator]: WebFetch to private/loopback address '${HOST}' is blocked (SSRF guard). Fetching internal network addresses may expose internal services. Bypass: YANA_TOOL_VALID_BYPASS=1"
    fi

    # Block metadata services (cloud SSRF)
    if printf '%s' "$HOST" | grep -qE \
      '^(169\.254\.169\.254|metadata\.google\.internal|169\.254\.170\.2|fd00:ec2::254)$'; then
      deny "Blocked [L1.5 Tool Validator]: WebFetch to cloud metadata endpoint '${HOST}' is blocked. Accessing instance metadata services can expose cloud credentials. Bypass: YANA_TOOL_VALID_BYPASS=1"
    fi
  fi
fi

exit 0
