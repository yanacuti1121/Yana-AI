#!/usr/bin/env bash
# Append-only audit logger — agents write here; file is chmod 444 after init
# Usage: secure-logger.sh <event_type> <message>
# Inspired by: fluent/fluentd append-only log architecture
set -euo pipefail

LOG_DIR="${YAMTAM_LOG_DIR:-core/memory/audit}"
LOG_FILE="$LOG_DIR/agent-actions.log"

EVENT_TYPE="${1:-event}"
MESSAGE="${2:-}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SESSION="${YAMTAM_SESSION_ID:-unknown}"
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "no-git")

# ── Initialize log directory if needed ────────────────────────────────────────
if [[ ! -d "$LOG_DIR" ]]; then
  mkdir -p "$LOG_DIR"
  echo "# YAMTAM Agent Audit Log — append-only" > "$LOG_FILE"
  echo "# Format: timestamp | session | commit | event_type | message" >> "$LOG_FILE"
fi

# ── Remove read-only lock temporarily to append ───────────────────────────────
chmod 644 "$LOG_FILE" 2>/dev/null || true

# ── Write log entry ───────────────────────────────────────────────────────────
echo "$TIMESTAMP | session=$SESSION | commit=$GIT_COMMIT | $EVENT_TYPE | $MESSAGE" >> "$LOG_FILE"

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
