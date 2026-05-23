#!/usr/bin/env bash
# Sweep L1 atomic memory for facts past their expires_at date.
# Expired facts are moved to memory/L1_atomic/archived/ and removed from INDEX.md.
#
# Exit codes:
#   0 — sweep complete (0 or more facts archived)
#   1 — unexpected error
#
# Flags:
#   --dry-run   List expired facts without moving them
#   --force     Skip confirmation prompt

set -uo pipefail

DRY_RUN=false
FORCE=false
for arg in "$@"; do
  [[ "$arg" == "--dry-run" ]] && DRY_RUN=true
  [[ "$arg" == "--force"   ]] && FORCE=true
done

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
L1_DIR="$PROJECT_ROOT/memory/L1_atomic"
ARCHIVE_DIR="$L1_DIR/archived"
INDEX_FILE="$L1_DIR/INDEX.md"
TODAY=$(date -u +%Y-%m-%d)

if [[ ! -d "$L1_DIR" ]]; then
  echo "✗ L1 atomic memory directory not found: $L1_DIR" >&2
  exit 1
fi

mkdir -p "$ARCHIVE_DIR"

expired=()
while IFS= read -r fact_file; do
  expires_at=$(grep -m1 '^expires_at:' "$fact_file" 2>/dev/null | sed 's/expires_at:[[:space:]]*//' | tr -d '"' | xargs)
  [[ -z "$expires_at" || "$expires_at" == "null" ]] && continue
  # Compare dates lexicographically (YYYY-MM-DD format is safe)
  if [[ "$expires_at" < "$TODAY" ]]; then
    expired+=("$fact_file")
  fi
done < <(find "$L1_DIR" -maxdepth 1 -name "*.md" ! -name "INDEX.md" ! -name "SCHEMA.md" | sort)

if [[ ${#expired[@]} -eq 0 ]]; then
  echo "✓ No expired facts found (checked as of $TODAY)."
  exit 0
fi

echo "Found ${#expired[@]} expired fact(s):"
for f in "${expired[@]}"; do
  name=$(basename "$f")
  expires=$(grep -m1 '^expires_at:' "$f" | sed 's/expires_at:[[:space:]]*//' | tr -d '"' | xargs)
  stmt=$(grep -m1 '^statement:' "$f" | sed 's/statement:[[:space:]]*//' | tr -d '"' | xargs | cut -c1-80)
  echo "  ⚠  $name  (expired: $expires)"
  echo "     $stmt"
done

if [[ "$DRY_RUN" == "true" ]]; then
  echo ""
  echo "[dry-run] No files moved. Re-run without --dry-run to archive."
  exit 0
fi

if [[ "$FORCE" != "true" ]]; then
  echo ""
  read -rp "Archive ${#expired[@]} expired fact(s)? [y/N] " confirm
  [[ "$confirm" != "y" && "$confirm" != "Y" ]] && echo "Aborted." && exit 0
fi

archived=0
for f in "${expired[@]}"; do
  name=$(basename "$f")
  dest="$ARCHIVE_DIR/$name"
  mv "$f" "$dest"
  echo "+ archived: $name → memory/L1_atomic/archived/$name"
  archived=$((archived + 1))

  # Remove from INDEX.md if present
  if [[ -f "$INDEX_FILE" ]]; then
    # Remove the line referencing this file
    grep -v "$name" "$INDEX_FILE" > "${INDEX_FILE}.tmp" && mv "${INDEX_FILE}.tmp" "$INDEX_FILE"
  fi
done

echo ""
echo "Summary: $archived fact(s) archived to memory/L1_atomic/archived/"
echo "Tip: review archived facts and delete if no longer needed, or re-add with updated expires_at."
