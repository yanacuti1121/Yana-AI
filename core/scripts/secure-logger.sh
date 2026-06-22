#!/usr/bin/env bash
# Append-only audit logger + egress/secret scanner
# Usage: secure-logger.sh <event_type> <message>
#        secure-logger.sh --scan-egress "<command string>"  → exit 2 if secret detected
# Inspired by: fluent/fluentd append-only log, gitleaks/gitleaks secret patterns
set -euo pipefail

# ── Egress scan mode ──────────────────────────────────────────────────────────
# Detects API keys / secrets being passed to network commands (curl, wget, http)
# Based on gitleaks rule categories: generic-api-key, aws, github, openai, stripe
if [[ "${1:-}" == "--scan-egress" ]]; then
  CMD="${2:-}"
  NETWORK_CMD=0
  echo "$CMD" | grep -qiE "(curl|wget|http[[:space:]]|Invoke-WebRequest|fetch\()" && NETWORK_CMD=1

  if [[ "$NETWORK_CMD" -eq 1 ]]; then
    # gitleaks-derived secret patterns
    SECRET_PATTERNS=(
      # AWS
      "AKIA[0-9A-Z]{16}"
      "ASIA[0-9A-Z]{16}"
      "AROA[0-9A-Z]{16}"
      # GitHub tokens
      "ghp_[A-Za-z0-9]{36}"
      "gho_[A-Za-z0-9]{36}"
      "ghs_[A-Za-z0-9]{36}"
      "ghr_[A-Za-z0-9]{36}"
      "github_pat_[A-Za-z0-9_]{82}"
      # OpenAI
      "sk-[A-Za-z0-9]{48}"
      "sk-proj-[A-Za-z0-9_-]{40,}"
      # Anthropic
      "sk-ant-[A-Za-z0-9_-]{40,}"
      # Stripe
      "sk_live_[A-Za-z0-9]{24,}"
      "pk_live_[A-Za-z0-9]{24,}"
      "rk_live_[A-Za-z0-9]{24,}"
      # Generic: key/token/secret/password in query/body params
      "(key|token|secret|password|passwd|api_key|apikey|auth)[[:space:]]*=[[:space:]]*['\"][A-Za-z0-9+/=_-]{8,}"
      # Google
      "AIza[0-9A-Za-z\\-_]{35}"
      # Slack
      "xox[baprs]-[0-9A-Za-z\\-]{10,}"
      # Twilio
      "SK[0-9a-fA-F]{32}"
      # Private keys
      "-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY"
    )

    for pattern in "${SECRET_PATTERNS[@]}"; do
      if echo "$CMD" | grep -qP "$pattern" 2>/dev/null || echo "$CMD" | grep -qE "$pattern" 2>/dev/null; then
        echo "[yana-ai/secure-logger] EGRESS BLOCKED — secret pattern detected in network command"
        echo "  Pattern : $pattern"
        echo "  Gate    : L1 (data exfiltration prevention)"
        LOG_DIR="${YANA_LOG_DIR:-core/memory/audit}"
        LOG_FILE="$LOG_DIR/agent-actions.log"
        chmod 644 "$LOG_FILE" 2>/dev/null || true
        echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") | session=${YANA_SESSION_ID:-unknown} | EGRESS_BLOCKED | pattern=$pattern" >> "$LOG_FILE" 2>/dev/null || true
        chmod 444 "$LOG_FILE" 2>/dev/null || true
        exit 2
      fi
    done
  fi
  exit 0
fi

LOG_DIR="${YANA_LOG_DIR:-core/memory/audit}"
LOG_FILE="$LOG_DIR/agent-actions.log"

EVENT_TYPE="${1:-event}"
MESSAGE="${2:-}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SESSION="${YANA_SESSION_ID:-unknown}"
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "no-git")

# ── Initialize log directory if needed ────────────────────────────────────────
if [[ ! -d "$LOG_DIR" ]]; then
  mkdir -p "$LOG_DIR"
  echo "# Yana AI Agent Audit Log — append-only" > "$LOG_FILE"
  echo "# Format: timestamp | session | commit | event_type | message" >> "$LOG_FILE"
fi

# ── Remove read-only lock temporarily to append ───────────────────────────────
chmod 644 "$LOG_FILE" 2>/dev/null || true

# ── Hash-chain computation (audit-hardening-policy.md / Trillian model) ───────
PREV_HASH="GENESIS"
if [[ -f "$LOG_FILE" ]]; then
  LAST_LINE=$(tail -1 "$LOG_FILE" 2>/dev/null || true)
  if [[ -n "$LAST_LINE" ]] && echo "$LAST_LINE" | grep -q "hash="; then
    PREV_HASH=$(echo "$LAST_LINE" | grep -oE 'hash=[A-Fa-f0-9]+' | cut -d= -f2 || echo "LEGACY")
  elif [[ -n "$LAST_LINE" ]]; then
    PREV_HASH="LEGACY"
  fi
fi

RAW_ENTRY="$TIMESTAMP|$SESSION|$GIT_COMMIT|$EVENT_TYPE|$MESSAGE|$PREV_HASH"
# macOS ships neither sha256sum nor an alias for it; `shasum -a 256` is the
# native equivalent and emits the same "<hash>  -" output format.
if command -v sha256sum >/dev/null 2>&1; then
  THIS_HASH=$(echo -n "$RAW_ENTRY" | sha256sum | cut -d' ' -f1)
elif command -v shasum >/dev/null 2>&1; then
  THIS_HASH=$(echo -n "$RAW_ENTRY" | shasum -a 256 | cut -d' ' -f1)
else
  THIS_HASH="PENDING"
fi

# ── Write log entry ───────────────────────────────────────────────────────────
echo "$TIMESTAMP | session=$SESSION | commit=$GIT_COMMIT | $EVENT_TYPE | $MESSAGE | prev=$PREV_HASH | hash=$THIS_HASH" >> "$LOG_FILE"

# ── Re-lock as append-only (read + write by owner, no execute, no delete) ─────
# chattr +a works on Linux ext4 (makes file append-only at kernel level)
# Fallback: chmod 444 (read-only — still prevents casual deletion)
if command -v chattr &>/dev/null; then
  chattr +a "$LOG_FILE" 2>/dev/null || chmod 444 "$LOG_FILE" 2>/dev/null || true
else
  chmod 444 "$LOG_FILE" 2>/dev/null || true
fi

# ── Emit to stdout for real-time visibility ────────────────────────────────────
echo "[audit] $TIMESTAMP $EVENT_TYPE: $MESSAGE"
