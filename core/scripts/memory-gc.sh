#!/usr/bin/env bash
# Session-end Memory Garbage Collector
# Promotes valuable L2 facts → L1_atomic, then wipes L2.
# Usage:
#   memory-gc.sh              — auto mode: promote all facts passing criteria, then wipe L2
#   memory-gc.sh --dry-run    — show what would be promoted/wiped, no writes
#   memory-gc.sh --wipe-only  — wipe L2 without promoting (discard session)
set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
L2_DIR="$PROJECT_ROOT/memory/L2_session"
L1_DIR="$PROJECT_ROOT/memory/L1_atomic"
LOG_SCRIPT="$PROJECT_ROOT/core/scripts/secure-logger.sh"
ADD_FACT="$PROJECT_ROOT/core/scripts/add-fact.sh"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DRY_RUN=false
WIPE_ONLY=false

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=true ;;
    --wipe-only) WIPE_ONLY=true ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

if [[ ! -d "$L2_DIR" ]]; then
  echo -e "${YELLOW}[memory-gc] No L2 directory found at $L2_DIR — nothing to GC.${NC}"
  exit 0
fi

mkdir -p "$L1_DIR"

echo -e "${CYAN}[memory-gc] Starting session GC — $TIMESTAMP${NC}"
$DRY_RUN && echo -e "${YELLOW}[memory-gc] DRY RUN — no changes will be written${NC}"

# ── Promotion criteria ────────────────────────────────────────────────────────
# A fact is promoted if it meets 2+ of these:
#   1. Has at least 1 tag
#   2. Statement length > 20 chars (not trivial)
#   3. Has evidence field
#   4. Not session-state-only (statement doesn't start with "currently" / "right now")
#   5. Does not already exist in L1 (no duplicate id)

PROMOTED=0
SKIPPED=0
WIPED=0

while IFS= read -r -d '' fact_file; do
  fname=$(basename "$fact_file")
  [[ "$fname" == "SCHEMA.md" || "$fname" == "INDEX.md" ]] && continue

  fact_id=$(grep -m1 -oE '^id:\s*.+' "$fact_file" 2>/dev/null | sed 's/^id:\s*//' | tr -d '"' || true)
  fact_statement=$(grep -m1 -oE '^statement:\s*.+' "$fact_file" 2>/dev/null | sed 's/^statement:\s*//' | tr -d '"' || true)
  fact_tags=$(grep -m1 -oE '^tags:\s*.+' "$fact_file" 2>/dev/null | sed 's/^tags:\s*//' | tr -d '"[]' || true)
  fact_evidence=$(grep -m1 -oE '^evidence:\s*.+' "$fact_file" 2>/dev/null | sed 's/^evidence:\s*//' | tr -d '"' || true)

  [[ -z "$fact_id" || -z "$fact_statement" ]] && continue

  # Score the fact
  score=0
  [[ -n "$fact_tags" ]]                                    && score=$((score + 1))
  [[ ${#fact_statement} -gt 20 ]]                          && score=$((score + 1))
  [[ -n "$fact_evidence" ]]                                && score=$((score + 1))
  echo "$fact_statement" | grep -qiE "^(currently|right now|just now|in this session)" \
    || score=$((score + 1))
  [[ ! -f "$L1_DIR/$fact_id.md" ]]                        && score=$((score + 1))

  if [[ "$WIPE_ONLY" == true ]]; then
    # Skip promotion phase
    :
  elif [[ $score -ge 2 ]]; then
    echo -e "${GREEN}[memory-gc] PROMOTE${NC} [$fact_id] score=$score/5 — $fact_statement"
    if [[ "$DRY_RUN" == false ]]; then
      # Copy fact to L1 and tag it as promoted
      cp "$fact_file" "$L1_DIR/$fact_id.md"
      # Append promoted_from metadata
      echo "" >> "$L1_DIR/$fact_id.md"
      echo "<!-- promoted-from: L2 | gc-run: $TIMESTAMP -->" >> "$L1_DIR/$fact_id.md"
      bash "$LOG_SCRIPT" memory_gc_promote "promoted L2→L1: $fact_id" 2>/dev/null || true
    fi
    PROMOTED=$((PROMOTED + 1))
  else
    echo -e "${YELLOW}[memory-gc] SKIP${NC}    [$fact_id] score=$score/5 — below threshold"
    SKIPPED=$((SKIPPED + 1))
  fi

  # Wipe L2 fact regardless of promotion outcome
  if [[ "$DRY_RUN" == false ]]; then
    rm -f "$fact_file"
    WIPED=$((WIPED + 1))
  fi

done < <(find "$L2_DIR" -maxdepth 1 -name "*.md" -print0 2>/dev/null | sort -z)

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}[memory-gc] Summary:${NC}"
echo -e "  Promoted to L1 : $PROMOTED"
echo -e "  Skipped (low score): $SKIPPED"
echo -e "  L2 facts wiped : $WIPED"
$DRY_RUN && echo -e "  ${YELLOW}(dry run — no changes written)${NC}"

if [[ "$DRY_RUN" == false ]]; then
  bash "$LOG_SCRIPT" memory_gc_complete \
    "gc done: promoted=$PROMOTED skipped=$SKIPPED wiped=$WIPED" 2>/dev/null || true
fi

echo -e "${GREEN}[memory-gc] Done.${NC}"
