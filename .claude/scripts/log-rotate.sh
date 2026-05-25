#!/usr/bin/env bash
# Audit log rotation — keeps active log lean, archives to releases/logs/
# Usage:
#   log-rotate.sh                     — rotate if log > MAX_BYTES (default 5MB)
#   log-rotate.sh --force             — rotate regardless of size
#   log-rotate.sh --dry-run           — show what would happen, no writes
#   log-rotate.sh --max-bytes <N>     — override size threshold (bytes)
#   log-rotate.sh --keep-lines <N>    — lines to keep in active log after rotation (default 500)
set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_DIR="${YAMTAM_LOG_DIR:-$PROJECT_ROOT/core/memory/audit}"
LOG_FILE="$LOG_DIR/agent-actions.log"
ARCHIVE_DIR="$PROJECT_ROOT/releases/logs"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H%M%SZ")
MAX_BYTES=$((5 * 1024 * 1024))  # 5MB default
KEEP_LINES=500
FORCE=false
DRY_RUN=false

YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)      FORCE=true ;;
    --dry-run)    DRY_RUN=true ;;
    --max-bytes)  shift; MAX_BYTES="$1" ;;
    --keep-lines) shift; KEEP_LINES="$1" ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

# ── Check if log exists ───────────────────────────────────────────────────────
if [[ ! -f "$LOG_FILE" ]]; then
  echo "[log-rotate] No audit log at $LOG_FILE — nothing to rotate."
  exit 0
fi

CURRENT_BYTES=$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)
CURRENT_LINES=$(wc -l < "$LOG_FILE" 2>/dev/null || echo 0)
CURRENT_MB=$(echo "scale=2; $CURRENT_BYTES / 1048576" | bc 2>/dev/null || echo "?")

echo -e "${CYAN}[log-rotate] Audit log: ${CURRENT_MB}MB / ${CURRENT_LINES} lines${NC}"

if [[ "$FORCE" == false && "$CURRENT_BYTES" -lt "$MAX_BYTES" ]]; then
  echo "[log-rotate] Below ${MAX_BYTES} bytes threshold — no rotation needed."
  exit 0
fi

echo -e "${YELLOW}[log-rotate] Rotation triggered (force=$FORCE)${NC}"
$DRY_RUN && echo -e "${YELLOW}[log-rotate] DRY RUN — no changes will be written${NC}"

# ── Archive ───────────────────────────────────────────────────────────────────
ARCHIVE_FILE="$ARCHIVE_DIR/audit-$TIMESTAMP.log.gz"

if [[ "$DRY_RUN" == false ]]; then
  mkdir -p "$ARCHIVE_DIR"

  # Unlock log for reading
  chmod 644 "$LOG_FILE" 2>/dev/null || true

  # Compress full log to archive
  gzip -c "$LOG_FILE" > "$ARCHIVE_FILE"
  echo -e "${GREEN}[log-rotate] Archived: $ARCHIVE_FILE${NC}"

  # Keep only last N lines in active log
  HEADER=$(head -2 "$LOG_FILE")
  TAIL_CONTENT=$(tail -n "$KEEP_LINES" "$LOG_FILE")
  {
    echo "$HEADER"
    echo "# [log-rotate] Rotated at $TIMESTAMP — archived to releases/logs/"
    echo "$TAIL_CONTENT"
  } > "${LOG_FILE}.tmp"
  mv "${LOG_FILE}.tmp" "$LOG_FILE"

  # Re-lock as append-only
  if command -v chattr &>/dev/null; then
    chattr +a "$LOG_FILE" 2>/dev/null || chmod 444 "$LOG_FILE" 2>/dev/null || true
  else
    chmod 444 "$LOG_FILE" 2>/dev/null || true
  fi

  NEW_LINES=$(wc -l < "$LOG_FILE" 2>/dev/null || echo "?")
  echo -e "${GREEN}[log-rotate] Active log trimmed to $NEW_LINES lines (kept last $KEEP_LINES).${NC}"
else
  echo "[log-rotate] Would archive to: $ARCHIVE_FILE"
  echo "[log-rotate] Would keep last $KEEP_LINES lines in active log."
fi

# ── Clean old archives (keep last 20) ────────────────────────────────────────
if [[ "$DRY_RUN" == false && -d "$ARCHIVE_DIR" ]]; then
  ARCHIVE_COUNT=$(find "$ARCHIVE_DIR" -name "audit-*.log.gz" | wc -l)
  if [[ "$ARCHIVE_COUNT" -gt 20 ]]; then
    EXCESS=$((ARCHIVE_COUNT - 20))
    find "$ARCHIVE_DIR" -name "audit-*.log.gz" | sort | head -n "$EXCESS" | xargs rm -f
    echo "[log-rotate] Pruned $EXCESS old archive(s) — kept 20 most recent."
  fi
fi

echo -e "${GREEN}[log-rotate] Done.${NC}"
