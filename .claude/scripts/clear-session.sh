#!/usr/bin/env bash
# Script — Clear all L2 Session Memory facts.
#
# Deletes all *.md files in memory/L2_session/ except SCHEMA.md.
# Run at the start of each new work session to avoid carry-over from
# a previous session. Also useful when switching tasks mid-session.
#
# Usage:
#   bash core/scripts/clear-session.sh           # clears with confirmation
#   bash core/scripts/clear-session.sh --force   # clears without confirmation
#
# Safety: never deletes SCHEMA.md.

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
L2_DIR="$PROJECT_ROOT/memory/L2_session"

if [[ ! -d "$L2_DIR" ]]; then
  echo "Error: $L2_DIR not found. Run from yamtam-engine root." >&2
  exit 1
fi

FORCE=false
[[ "${1:-}" == "--force" ]] && FORCE=true

# Count facts to delete
FACTS=$(find "$L2_DIR" -maxdepth 1 -name "*.md" ! -name "SCHEMA.md" 2>/dev/null)
COUNT=$(printf '%s' "$FACTS" | grep -c '.' 2>/dev/null || echo 0)

if [[ "$COUNT" -eq 0 ]]; then
  echo "L2 Session Memory is already empty."
  exit 0
fi

echo "=== Clear L2 Session Memory ==="
echo "Found $COUNT session fact(s) to delete:"
printf '%s' "$FACTS" | while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  id=$(grep -m1 -oE '^id:\s*.+' "$f" 2>/dev/null | sed 's/^id:\s*//' || true)
  echo "  - $(basename "$f") ${id:+(id: $id)}"
done
echo ""

if [[ "$FORCE" != true ]]; then
  read -rp "Delete all $COUNT session fact(s)? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi
fi

DELETED=0
while IFS= read -r -d '' fact_file; do
  [[ "$(basename "$fact_file")" == "SCHEMA.md" ]] && continue
  rm "$fact_file" && DELETED=$((DELETED + 1))
done < <(find "$L2_DIR" -maxdepth 1 -name "*.md" ! -name "SCHEMA.md" -print0 2>/dev/null)

echo "Cleared $DELETED session fact(s) from memory/L2_session/."
