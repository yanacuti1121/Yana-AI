#!/usr/bin/env bash
# Read-only script — Search YAMTAM L1 Atomic Memory facts.
#
# Usage:
#   bash core/scripts/search-facts.sh [KEYWORD]
#   bash core/scripts/search-facts.sh [KEYWORD] [--type TYPE] [--scope SCOPE] [--confidence LEVEL] [--tag TAG]
#   bash core/scripts/search-facts.sh --all
#   bash core/scripts/search-facts.sh --expired
#
# Options:
#   KEYWORD           Search in statement field (case-insensitive)
#   --all             List every fact regardless of keyword
#   --expired         Show only facts whose expires_at is in the past
#   --type TYPE       Filter by type: fact | decision | constraint | assumption | observation
#   --scope SCOPE     Filter by scope: YAMTAM | product | both
#   --confidence LVL  Filter by confidence: unverified | low | medium | high
#   --tag TAG         Filter by tag (case-insensitive, partial match)
#
# Exit 0 if matches found, exit 1 if no matches.

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
L1_DIR="$PROJECT_ROOT/memory/L1_atomic"
TODAY=$(date +%Y-%m-%d)

if [[ ! -d "$L1_DIR" ]]; then
  echo "Error: memory/L1_atomic/ not found. Run from yamtam-engine root." >&2
  exit 1
fi

# ── Parse args ────────────────────────────────────────────────────────────────
KEYWORD=""
FILTER_TYPE=""
FILTER_SCOPE=""
FILTER_CONFIDENCE=""
FILTER_TAG=""
MODE_ALL=false
MODE_EXPIRED=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)        MODE_ALL=true ;;
    --expired)    MODE_EXPIRED=true ;;
    --type)       shift; FILTER_TYPE="$1" ;;
    --scope)      shift; FILTER_SCOPE="$1" ;;
    --confidence) shift; FILTER_CONFIDENCE="$1" ;;
    --tag)        shift; FILTER_TAG="$1" ;;
    --*)          echo "Unknown option: $1" >&2; exit 1 ;;
    *)            KEYWORD="$1" ;;
  esac
  shift
done

if [[ -z "$KEYWORD" && -z "$FILTER_TAG" && "$MODE_ALL" == false && "$MODE_EXPIRED" == false ]]; then
  echo "Usage: search-facts.sh [KEYWORD] [--type TYPE] [--scope SCOPE] [--confidence LEVEL] [--tag TAG]"
  echo "       search-facts.sh --all"
  echo "       search-facts.sh --expired"
  exit 1
fi

# ── Search ────────────────────────────────────────────────────────────────────
MATCH_COUNT=0

header_printed=false

print_header() {
  [[ "$header_printed" == true ]] && return
  if [[ -n "$KEYWORD" ]]; then
    echo "=== L1 Atomic Memory Search: \"$KEYWORD\" ==="
  elif [[ "$MODE_EXPIRED" == true ]]; then
    echo "=== L1 Atomic Memory: Expired Facts ==="
  else
    echo "=== L1 Atomic Memory: All Facts ==="
  fi
  echo ""
  header_printed=true
}

while IFS= read -r -d '' fact_file; do
  [[ "$(basename "$fact_file")" == "INDEX.md" ]] && continue
  [[ "$(basename "$fact_file")" == "SCHEMA.md" ]] && continue

  # ── Extract frontmatter fields ──────────────────────────────────────────
  fact_id=$(grep -m1 -oE '^id:\s*.+' "$fact_file" 2>/dev/null \
    | sed 's/^id:\s*//' | tr -d '"' || true)
  fact_type=$(grep -m1 -oE '^type:\s*.+' "$fact_file" 2>/dev/null \
    | sed 's/^type:\s*//' | tr -d '"' || true)
  fact_scope=$(grep -m1 -oE '^scope:\s*.+' "$fact_file" 2>/dev/null \
    | sed 's/^scope:\s*//' | tr -d '"' || true)
  fact_confidence=$(grep -m1 -oE '^confidence:\s*.+' "$fact_file" 2>/dev/null \
    | sed 's/^confidence:\s*//' | tr -d '"' || true)
  fact_statement=$(grep -m1 -oE '^statement:\s*.+' "$fact_file" 2>/dev/null \
    | sed 's/^statement:\s*//' | tr -d '"' || true)
  fact_source=$(grep -m1 -oE '^source:\s*.+' "$fact_file" 2>/dev/null \
    | sed 's/^source:\s*//' | tr -d '"' || true)
  fact_expires=$(grep -m1 -oE '^expires_at:\s*[0-9-]+' "$fact_file" 2>/dev/null \
    | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' || true)
  fact_tags=$(grep -m1 -oE '^tags:\s*.+' "$fact_file" 2>/dev/null \
    | sed 's/^tags:\s*//' | tr -d '"' || true)

  [[ -z "$fact_id" ]] && continue

  # ── Apply filters ───────────────────────────────────────────────────────
  if [[ -n "$FILTER_TYPE" && "$fact_type" != "$FILTER_TYPE" ]]; then
    continue
  fi
  if [[ -n "$FILTER_SCOPE" && "$fact_scope" != "$FILTER_SCOPE" ]]; then
    continue
  fi
  if [[ -n "$FILTER_CONFIDENCE" && "$fact_confidence" != "$FILTER_CONFIDENCE" ]]; then
    continue
  fi
  if [[ -n "$FILTER_TAG" ]]; then
    if ! printf '%s' "$fact_tags" | grep -qiF "$FILTER_TAG" 2>/dev/null; then
      continue
    fi
  fi

  # Keyword match (case-insensitive, searches statement)
  if [[ -n "$KEYWORD" ]]; then
    if ! printf '%s' "$fact_statement" | grep -qiF "$KEYWORD" 2>/dev/null; then
      continue
    fi
  fi

  # Expired filter
  if [[ "$MODE_EXPIRED" == true ]]; then
    [[ -z "$fact_expires" ]] && continue
    [[ "$fact_expires" < "$TODAY" ]] || continue
  fi

  # ── Print result ────────────────────────────────────────────────────────
  print_header

  rel_file="${fact_file#"$PROJECT_ROOT"/}"
  statement_short="${fact_statement:0:80}"
  [[ "${#fact_statement}" -gt 80 ]] && statement_short="${statement_short}…"

  expired_flag=""
  if [[ -n "$fact_expires" && "$fact_expires" < "$TODAY" ]]; then
    expired_flag=" ⚠️  EXPIRED ($fact_expires)"
  elif [[ -n "$fact_expires" ]]; then
    expired_flag=" (expires $fact_expires)"
  fi

  tags_display=""
  [[ -n "$fact_tags" ]] && tags_display=" | tags: $fact_tags"
  echo "[$fact_id] $fact_type | $fact_scope | $fact_confidence$expired_flag$tags_display"
  echo "  $statement_short"
  echo "  Source: $fact_source | File: $rel_file"
  echo ""

  MATCH_COUNT=$((MATCH_COUNT + 1))

done < <(find "$L1_DIR" -maxdepth 1 -name "*.md" -print0 2>/dev/null | sort -z)

# ── Summary ───────────────────────────────────────────────────────────────────
if [[ $MATCH_COUNT -eq 0 ]]; then
  if [[ -n "$KEYWORD" ]]; then
    echo "No facts found matching \"$KEYWORD\"."
  else
    echo "No facts found."
  fi
  exit 1
else
  echo "Found $MATCH_COUNT fact(s)."
  exit 0
fi
