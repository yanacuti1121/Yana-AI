#!/usr/bin/env bash
# Yana AI Memory Decay — Ebbinghaus Forgetting Curve for L1 Atomic Facts
# Source: rohitg00/agentmemory (MIT) — decay model adapted for Yana AI L1 memory
#
# Computes retention score for each L1 fact using Ebbinghaus formula:
#   R = e^(-t/S)
#   t = days since fact file was last modified
#   S = stability constant (by confidence level):
#       high       → S = 90  (trusted facts, decay slow)
#       medium     → S = 30  (normal facts)
#       low        → S = 14  (weak evidence)
#       unverified → S = 7   (ephemeral observations)
#
# Retention thresholds:
#   R >= 0.5  → FRESH     (healthy)
#   R  < 0.5  → FADING    (consider re-verification)
#   R  < 0.2  → STALE     (candidate for deprecation or re-verify)
#   R  < 0.1  → DECAYED   (auto-flag, offer to deprecate)
#
# Usage:
#   bash core/scripts/decay-memory.sh              # show full report
#   bash core/scripts/decay-memory.sh --stale      # show only STALE + DECAYED
#   bash core/scripts/decay-memory.sh --auto-flag  # write decay_score to fact frontmatter
#   bash core/scripts/decay-memory.sh --dry-run    # same as default, no writes

set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
L1_DIR="$PROJECT_ROOT/memory/L1_atomic"

# Portable `sed -i` — GNU sed accepts `-i` alone; BSD/macOS sed requires an
# explicit (possibly empty) backup-suffix argument right after -i, otherwise
# it silently consumes the next argument as that suffix instead of erroring.
if sed --version >/dev/null 2>&1; then
  SED_INPLACE=(-i)
else
  SED_INPLACE=(-i '')
fi

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

SHOW_STALE_ONLY=false
AUTO_FLAG=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stale)      SHOW_STALE_ONLY=true ;;
    --auto-flag)  AUTO_FLAG=true ;;
    --dry-run)    ;;
    *) echo "Usage: $0 [--stale] [--auto-flag] [--dry-run]" >&2; exit 1 ;;
  esac
  shift
done

if [[ ! -d "$L1_DIR" ]]; then
  echo -e "${RED}[decay-memory] L1 directory not found: $L1_DIR${NC}" >&2
  exit 1
fi

# Stability constants by confidence level
stability_for() {
  case "$1" in
    high)       echo 90 ;;
    medium)     echo 30 ;;
    low)        echo 14 ;;
    unverified) echo 7  ;;
    *)          echo 7  ;;
  esac
}

# Ebbinghaus formula: R = e^(-t/S), output as 0-100 integer
retention_score() {
  local t="$1"   # days elapsed
  local s="$2"   # stability
  python3 -c "import math; print(round(math.exp(-$t/$s) * 100))"
}

# Status label by score
status_label() {
  local score=$1
  if   [[ $score -ge 50 ]]; then echo "FRESH"
  elif [[ $score -ge 20 ]]; then echo "FADING"
  elif [[ $score -ge 10 ]]; then echo "STALE"
  else                           echo "DECAYED"
  fi
}

NOW=$(date +%s)
TOTAL=0; FRESH=0; FADING=0; STALE=0; DECAYED=0

echo ""
echo -e "${CYAN}=== Yana AI Memory Decay Report — $(date -u '+%Y-%m-%d %H:%M UTC') ===${NC}"
echo -e "${DIM}Formula: R = e^(-t/S)  |  S: high=90d  medium=30d  low=14d  unverified=7d${NC}"
echo ""

printf "%-35s %-12s %5s %8s %10s\n" "FACT ID" "CONFIDENCE" "DAYS" "SCORE%" "STATUS"
echo "$(printf '─%.0s' {1..75})"

while IFS= read -r -d '' fact_file; do
  fname=$(basename "$fact_file")
  [[ "$fname" == "SCHEMA.md" || "$fname" == "INDEX.md" ]] && continue

  # Parse frontmatter fields
  fact_id=$(grep -m1 -E '^id:' "$fact_file" 2>/dev/null | sed 's/^id:\s*//' | tr -d '"' || echo "unknown")
  confidence=$(grep -m1 -E '^confidence:' "$fact_file" 2>/dev/null | sed 's/^confidence:\s*//' | tr -d '"' || echo "unverified")
  expires_at=$(grep -m1 -E '^expires_at:' "$fact_file" 2>/dev/null | sed 's/^expires_at:\s*//' | tr -d '"' || echo "")

  # Check if manually expired
  if [[ -n "$expires_at" ]]; then
    # GNU `date -d` vs BSD/macOS `date -j -f` — expires_at is always YYYY-MM-DD.
    exp_ts=$(date -d "$expires_at" +%s 2>/dev/null \
      || date -j -f "%Y-%m-%d" "$expires_at" +%s 2>/dev/null \
      || echo "0")
    if [[ $exp_ts -gt 0 && $NOW -gt $exp_ts ]]; then
      printf "%-35s %-12s %5s %8s %10s\n" "${fact_id:0:34}" "$confidence" "EXP" "-" "EXPIRED"
      echo -e "  ${DIM}$fact_file${NC}"
      continue
    fi
  fi

  # Days since last modification
  mtime=$(stat -c %Y "$fact_file" 2>/dev/null || stat -f %m "$fact_file" 2>/dev/null || echo "$NOW")
  days=$(( (NOW - mtime) / 86400 ))

  s=$(stability_for "$confidence")
  score=$(retention_score "$days" "$s")
  status=$(status_label "$score")

  TOTAL=$((TOTAL + 1))
  case "$status" in
    FRESH)   FRESH=$((FRESH+1)) ;;
    FADING)  FADING=$((FADING+1)) ;;
    STALE)   STALE=$((STALE+1)) ;;
    DECAYED) DECAYED=$((DECAYED+1)) ;;
  esac

  # Filter if --stale flag
  if $SHOW_STALE_ONLY && [[ "$status" == "FRESH" || "$status" == "FADING" ]]; then
    continue
  fi

  # Color by status
  local_color="$GREEN"
  [[ "$status" == "FADING"  ]] && local_color="$YELLOW"
  [[ "$status" == "STALE"   ]] && local_color="$RED"
  [[ "$status" == "DECAYED" ]] && local_color="$RED"

  printf "${local_color}%-35s %-12s %5d %8d%% %10s${NC}\n" \
    "${fact_id:0:34}" "$confidence" "$days" "$score" "$status"

  # Auto-flag: write decay_score to frontmatter
  if $AUTO_FLAG && [[ "$status" == "STALE" || "$status" == "DECAYED" ]]; then
    if grep -q "^decay_score:" "$fact_file"; then
      sed "${SED_INPLACE[@]}" "s/^decay_score:.*/decay_score: $score  # updated $(date -u '+%Y-%m-%d')/" "$fact_file"
    else
      # Insert after confidence line — avoid sed's `a` command here: GNU sed
      # allows the one-line `a text` form used before, but BSD/macOS sed only
      # accepts `a\` followed by a backslash-newline-text continuation, so the
      # old one-liner would fail with "extra characters at the end of a command".
      awk -v line="decay_score: $score  # ebbinghaus R=${score}% — re-verify or deprecate" '
        { print }
        /^confidence:/ { print line }
      ' "$fact_file" > "$fact_file.tmp" && mv "$fact_file.tmp" "$fact_file"
    fi
  fi

done < <(find "$L1_DIR" -name "*.md" -print0 2>/dev/null)

echo "$(printf '─%.0s' {1..75})"
echo ""
echo -e "  Total facts : ${CYAN}$TOTAL${NC}"
echo -e "  Fresh (≥50%): ${GREEN}$FRESH${NC}"
echo -e "  Fading      : ${YELLOW}$FADING${NC}"
echo -e "  Stale  (<20%): ${RED}$STALE${NC}"
echo -e "  Decayed(<10%): ${RED}$DECAYED${NC}"

if [[ $((STALE + DECAYED)) -gt 0 ]]; then
  echo ""
  echo -e "${YELLOW}Action: run 'bash core/scripts/deprecate-fact.sh <id>' for STALE/DECAYED facts${NC}"
  echo -e "${DIM}Or re-verify and update the 'confidence' field to reset decay timer.${NC}"
fi

echo ""
