#!/usr/bin/env bash
# tool-proxy.sh — Intercept / Sanitize / Mutate / RateLimit / Execute pipeline
# Every agent tool call passes through this proxy before execution.
#
# Usage:  bash core/scripts/tool-proxy.sh <command> [args...]
# Env:    YAMTAM_TOOL_TIMEOUT      — max exec seconds  (default: 30)
#         YAMTAM_TOOL_MAX_MEM      — ulimit -v KB       (default: 524288 = 512MB)
#         YAMTAM_PROXY_LOG         — audit log path     (default: releases/logs/tool-proxy.log)
#         YAMTAM_PROXY_DRY_RUN     — 1 = log+sanitize only, no exec
#         YAMTAM_RETRY_MAX         — max retries on 429/503 (default: 4)
#         YAMTAM_RETRY_BASE_MS     — base backoff milliseconds (default: 1000)
#         YAMTAM_RETRY_MAX_JITTER  — max jitter milliseconds  (default: 500)
#
# Exit codes:
#   0  — executed successfully
#   1  — mutate-layer block (resource / env violation)
#   3  — sanitize-layer block (injection / subshell detected)
#   4  — intercept-layer block (empty command)
#   5  — rate-limit-layer block (max retries exceeded on 429/503)
#
# Gate: L2 (sanitize) + L1 (mutate) + rate-limit retry layer
# Source: koajs/koa (onion compose), axios/axios (interceptors),
#         expressjs/express (scope), caddyserver/caddy (handler chain),
#         nwtgck/piping-server (pipe-through),
#         vercel/async-retry (exponential backoff), sindresorhus/delay (jitter)
set -uo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
TIMEOUT_SEC="${YAMTAM_TOOL_TIMEOUT:-30}"
MAX_MEM_KB="${YAMTAM_TOOL_MAX_MEM:-524288}"
LOG_FILE="${YAMTAM_PROXY_LOG:-releases/logs/tool-proxy.log}"
DRY_RUN="${YAMTAM_PROXY_DRY_RUN:-0}"
SESSION_ID="${YAMTAM_SESSION_ID:-unknown}"
RETRY_MAX="${YAMTAM_RETRY_MAX:-4}"
RETRY_BASE_MS="${YAMTAM_RETRY_BASE_MS:-1000}"
RETRY_MAX_JITTER="${YAMTAM_RETRY_MAX_JITTER:-500}"
PHASE=""

# ─── Helpers ─────────────────────────────────────────────────────────────────
log_proxy() {
  local level="$1"; local msg="$2"; local extra="${3:-}"
  local ts; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local entry="{\"ts\":\"${ts}\",\"level\":\"${level}\",\"phase\":\"${PHASE}\",\"session\":\"${SESSION_ID}\",\"cmd\":\"${SAFE_CMD:-}\",\"msg\":\"${msg}\"${extra:+,${extra}}}"
  mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
  echo "$entry" >> "$LOG_FILE" 2>/dev/null || echo "$entry" >&2  # fallback to stderr on ENOSPC
}

proxy_block() {
  local reason="$1"; local exit_code="$2"
  log_proxy "BLOCK" "$reason" "\"exit\":${exit_code}"
  echo "[tool-proxy] BLOCKED (${PHASE}): ${reason}" >&2
  exit "$exit_code"
}

# ─── PHASE 1 — INTERCEPT ─────────────────────────────────────────────────────
PHASE="intercept"

if [[ $# -eq 0 ]]; then
  proxy_block "empty command" 4
fi

RAW_CMD="$1"; shift
RAW_ARGS=("$@")
SAFE_CMD="$(printf '%s ' "$RAW_CMD" "${RAW_ARGS[@]}" | cut -c1-120)"  # truncated for log safety

log_proxy "INFO" "intercepted" "\"args_count\":${#RAW_ARGS[@]}"

# ─── PHASE 2 — SANITIZE ──────────────────────────────────────────────────────
PHASE="sanitize"

# 2a. Block subshell injection in any argument
SUBSHELL_RE='\$\(|`|<\(|\$\{'
for arg in "${RAW_ARGS[@]}"; do
  if [[ "$arg" =~ $SUBSHELL_RE ]]; then
    proxy_block "subshell escape in arg: $(printf '%s' "$arg" | head -c 60)" 3
  fi
done

# 2b. Block subshell injection in the command itself
if [[ "$RAW_CMD" =~ $SUBSHELL_RE ]]; then
  proxy_block "subshell escape in command: $(printf '%s' "$RAW_CMD" | head -c 60)" 3
fi

# 2c. Strip injection characters from each argument (sanitize, not block)
sanitize_arg() {
  local v="$1"
  # Strip unquoted shell metacharacters that have no place in a tool arg
  v="${v//;/}"          # semicolon command chain
  v="${v//|/}"          # pipe
  v="${v//&/}"          # background / AND
  v="${v//>/}"          # output redirect
  v="${v//</}"          # input redirect
  v="${v//$'\n'/}"      # newline (prompt injection via arg)
  v="${v//$'\r'/}"      # carriage return
  v="${v//../}"         # path traversal double-dot
  echo "$v"
}

CLEAN_ARGS=()
for arg in "${RAW_ARGS[@]}"; do
  CLEAN_ARGS+=("$(sanitize_arg "$arg")")
done

# 2d. Block known pipe-to-interpreter patterns in command string
PIPE_EXEC_RE='(\|[[:space:]]*(bash|sh|python3?|node|perl|ruby)|curl.*\|.*sh|wget.*\|.*bash)'
FULL_CMD_STR="$RAW_CMD ${CLEAN_ARGS[*]:-}"
if [[ "$FULL_CMD_STR" =~ $PIPE_EXEC_RE ]]; then
  proxy_block "pipe-to-interpreter pattern: $(echo "$FULL_CMD_STR" | head -c 80)" 3
fi

log_proxy "INFO" "sanitized" "\"stripped_args\":${#CLEAN_ARGS[@]}"

# ─── PHASE 3 — MUTATE ────────────────────────────────────────────────────────
PHASE="mutate"

FINAL_CMD="$RAW_CMD"
FINAL_ARGS=("${CLEAN_ARGS[@]}")
MUTATIONS=()

# 3a. Auto-add ulimit memory cap (silent mutation — no user error)
if ! (ulimit -v "$MAX_MEM_KB" 2>/dev/null); then
  log_proxy "WARN" "ulimit -v not supported on this platform"
fi

# 3b. Auto-wrap with timeout if the command is not already timeout/time
if [[ "$FINAL_CMD" != "timeout" && "$FINAL_CMD" != "time" ]]; then
  FINAL_ARGS=("${FINAL_ARGS[@]}")
  FINAL_CMD="timeout"
  FINAL_ARGS=("$TIMEOUT_SEC" "$RAW_CMD" "${CLEAN_ARGS[@]}")
  MUTATIONS+=("timeout=${TIMEOUT_SEC}s")
fi

# 3c. Auto-add --no-pager for git commands (prevents blocking on large output)
if [[ "$RAW_CMD" == "git" ]] && [[ ! " ${CLEAN_ARGS[*]:-} " =~ " --no-pager " ]]; then
  FINAL_ARGS=("--no-pager" "${FINAL_ARGS[@]:1}")  # insert after 'timeout N git'
  MUTATIONS+=("git --no-pager")
fi

# 3d. Block LD_PRELOAD / LD_LIBRARY_PATH injection via env (Gate L2)
if [[ -n "${LD_PRELOAD:-}" ]]; then
  proxy_block "LD_PRELOAD set in environment" 1
fi
if [[ -n "${LD_LIBRARY_PATH:-}" ]]; then
  proxy_block "LD_LIBRARY_PATH set in environment" 1
fi

[[ ${#MUTATIONS[@]} -gt 0 ]] && log_proxy "INFO" "mutated" "\"mutations\":\"${MUTATIONS[*]}\""

# ─── DRY RUN check ───────────────────────────────────────────────────────────
if [[ "$DRY_RUN" == "1" ]]; then
  log_proxy "INFO" "dry-run — would execute: $FINAL_CMD ${FINAL_ARGS[*]:-}"
  echo "[tool-proxy] DRY-RUN: $FINAL_CMD ${FINAL_ARGS[*]:-}"
  exit 0
fi

# ─── PHASE 4 — RATE-LIMIT + EXECUTE ─────────────────────────────────────────
PHASE="rate-limit"

# Detect HTTP commands eligible for 429/503 retry
is_http_cmd() {
  case "$1" in curl|wget|http|xh|httpie) return 0 ;; esac
  return 1
}

# Exponential backoff with full jitter: sleep = rand(0, min(cap, base * 2^attempt))
# Cap = base * 2^4 = 16× base to prevent runaway sleep
backoff_sleep() {
  local attempt="$1"
  local cap_ms=$(( RETRY_BASE_MS * (1 << attempt) ))
  [[ "$cap_ms" -gt 30000 ]] && cap_ms=30000   # hard cap 30s
  local jitter=$(( RANDOM % RETRY_MAX_JITTER ))
  local sleep_ms=$(( (RANDOM % cap_ms) + jitter ))
  local sleep_s
  sleep_s=$(python3 -c "print(${sleep_ms}/1000)" 2>/dev/null || echo "1")
  log_proxy "INFO" "rate-limit backoff" "\"attempt\":${attempt},\"sleep_ms\":${sleep_ms}"
  echo "[tool-proxy] RATE-LIMIT: backoff ${sleep_ms}ms (attempt ${attempt}/${RETRY_MAX})" >&2
  sleep "$sleep_s"
}

# Extract HTTP status from curl/wget output (check tmp response file)
# curl -w "%{http_code}" writes status to stdout when -o /dev/null
extract_http_status() {
  local tmp_status_file="$1"
  [[ -f "$tmp_status_file" ]] && cat "$tmp_status_file" | tr -d '[:space:]' || echo "0"
}

PHASE="execute"
log_proxy "INFO" "executing"
ulimit -v "$MAX_MEM_KB" 2>/dev/null || true

# For HTTP commands: wrap with retry loop for 429/503
if is_http_cmd "$RAW_CMD"; then
  STATUS_FILE="$(mktemp /tmp/proxy-status-XXXXXX)"
  trap 'rm -f "$STATUS_FILE"' EXIT

  # Inject -w "%{http_code}" -o /dev/null for status capture (curl only)
  RETRY_ATTEMPT=0
  while [[ "$RETRY_ATTEMPT" -le "$RETRY_MAX" ]]; do
    if [[ "$RAW_CMD" == "curl" ]]; then
      # Run curl, capture HTTP status code in STATUS_FILE
      "$FINAL_CMD" "${FINAL_ARGS[@]}" -w "%{http_code}" --silent --output /dev/stderr \
        2>/dev/null > "$STATUS_FILE" || true
      HTTP_STATUS="$(extract_http_status "$STATUS_FILE")"
    else
      # Non-curl HTTP: run normally, cannot inspect status code
      "$FINAL_CMD" "${FINAL_ARGS[@]}"
      exit $?
    fi

    if [[ "$HTTP_STATUS" == "429" || "$HTTP_STATUS" == "503" ]]; then
      if [[ "$RETRY_ATTEMPT" -ge "$RETRY_MAX" ]]; then
        proxy_block "max retries (${RETRY_MAX}) exceeded on HTTP ${HTTP_STATUS}" 5
      fi
      backoff_sleep "$RETRY_ATTEMPT"
      RETRY_ATTEMPT=$(( RETRY_ATTEMPT + 1 ))
    else
      log_proxy "INFO" "http-complete" "\"status\":${HTTP_STATUS},\"retries\":${RETRY_ATTEMPT}"
      exit 0
    fi
  done
else
  # Non-HTTP command: exec directly (replaces shell, no retry)
  exec "$FINAL_CMD" "${FINAL_ARGS[@]}"
fi
