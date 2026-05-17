#!/usr/bin/env bash
# Read-only script — Search YAMTAM L2 Session Memory facts.
#
# Usage:
#   bash core/scripts/search-session-facts.sh [KEYWORD]
#   bash core/scripts/search-session-facts.sh --all
#   bash core/scripts/search-session-facts.sh --tag TAG
#
# Options:
#   KEYWORD   Search in statement field (case-insensitive)
#   --all     List every session fact
#   --tag TAG Filter by tag (case-insensitive, partial match)
#
# Exit 0 if matches found, exit 1 if no matches.

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
L2_DIR="$PROJECT_ROOT/memory/L2_session"

if [[ ! -d "$L2_DIR" ]]; then
  echo "Error: memory/L2_session/ not found. Run from yamtam-engine root." >&2
  exit 1
fi

KEYWORD=""
FILTER_TAG=""
MODE_ALL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) MODE_ALL=true ;;
    --tag) shift; FILTER_TAG="$1" ;;
    --*)   echo "Unknown option: $1" >&2; exit 1 ;;
    *)     KEYWORD="$1" ;;
  esac
  shift
done

if [[ -z "$KEYWORD" && -z "$FILTER_TAG" && "$MODE_ALL" == false ]]; then
  echo "Usage: search-session-facts.sh [KEYWORD] [--tag TAG]"
  echo "       search-session-facts.sh --all"
  exit 1
fi

MATCH_COUNT=0
header_printed=false

print_header() {
  [[ "$header_printed" == true ]] && return
  if [[ -n "$KEYWORD" ]]; then
    echo "=== L2 Session Memory Search: \"$KEYWORD\" ==="
  elif [[ -n "$FILTER_TAG" ]]; then
    echo "=== L2 Session Memory: tag=$FILTER_TAG ==="
  else
    echo "=== L2 Session Memory: All Facts ==="
  fi
  echo ""
  header_printed=true
}

while IFS= read -r -d '' fact_file; do
  [[ "$(basename "$fact_file")" == "SCHEMA.md" ]] && continue

  fact_id=$(grep -m1 -oE '^id:\s*.+' "$fact_file" 2>/dev/null \
    | sed 's/^id:\s*//' | tr -d '"' || true)
  fact_statement=$(grep -m1 -oE '^statement:\s*.+' "$fact_file" 2>/dev/null \
    | sed 's/^statement:\s*//' | tr -d '"' || true)
  fact_source=$(grep -m1 -oE '^source:\s*.+' "$fact_file" 2>/dev/null \
    | sed 's/^source:\s*//' | tr -d '"' || true)
  fact_tags=$(grep -m1 -oE '^tags:\s*.+' "$fact_file" 2>/dev/null \
    | sed 's/^tags:\s*//' | tr -d '"' || true)

  [[ -z "$fact_id" ]] && continue

  # Tag filter
  if [[ -n "$FILTER_TAG" ]]; then
    if ! printf '%s' "$fact_tags" | grep -qiF "$FILTER_TAG" 2>/dev/null; then
      continue
    fi
  fi

  # Keyword filter
  if [[ -n "$KEYWORD" ]]; then
    if ! printf '%s' "$fact_statement" | grep -qiF "$KEYWORD" 2>/dev/null; then
      continue
    fi
  fi

  print_header

  rel_file="${fact_file#$PROJECT_ROOT/}"
  statement_short="${fact_statement:0:80}"
  [[ "${#fact_statement}" -gt 80 ]] && statement_short="${statement_short}…"

  tags_display=""
  [[ -n "$fact_tags" ]] && tags_display=" | tags: $fact_tags"

  echo "[$fact_id] session | provisional$tags_display"
  echo "  $statement_short"
  echo "  Source: $fact_source | File: $rel_file"
  echo ""

  MATCH_COUNT=$((MATCH_COUNT + 1))

done < <(find "$L2_DIR" -maxdepth 1 -name "*.md" -print0 2>/dev/null | sort -z)

if [[ $MATCH_COUNT -eq 0 ]]; then
  if [[ -n "$KEYWORD" ]]; then
    echo "No session facts found matching \"$KEYWORD\"."
  else
    echo "No session facts found."
  fi
  exit 1
else
  echo "Found $MATCH_COUNT session fact(s)."
  exit 0
fi
