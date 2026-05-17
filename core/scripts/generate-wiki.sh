#!/usr/bin/env bash
# Generate a static wiki from the gitnexus knowledge graph and commit it to docs/wiki/.
# Requires: npx, gitnexus index built (run `npx gitnexus analyze` first).
#
# Usage:
#   bash generate-wiki.sh [--force] [--model MODEL] [--api-key KEY] [--base-url URL]
#   bash generate-wiki.sh --commit    # auto-commit after generation
#
# Output: docs/wiki/ in the current project root (git-tracked).

set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
WIKI_OUT="$PROJECT_ROOT/docs/wiki"
GITNEXUS_WIKI_DIR="$PROJECT_ROOT/.gitnexus/wiki"

FORCE=""
MODEL=""
API_KEY=""
BASE_URL=""
AUTO_COMMIT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)       FORCE="--force" ;;
    --model)       shift; MODEL="--model $1" ;;
    --api-key)     shift; API_KEY="--api-key $1" ;;
    --base-url)    shift; BASE_URL="--base-url $1" ;;
    --commit)      AUTO_COMMIT=true ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
  shift
done

cd "$PROJECT_ROOT"

echo "=== generate-wiki: checking gitnexus index ==="

if ! npx gitnexus status &>/dev/null; then
  echo "ERROR: gitnexus index not found. Run 'npx gitnexus analyze' first." >&2
  exit 1
fi

echo "=== generate-wiki: running npx gitnexus wiki ==="
# shellcheck disable=SC2086
npx gitnexus wiki $FORCE $MODEL $API_KEY $BASE_URL

# Copy from .gitnexus/wiki/ to docs/wiki/ for git tracking
if [[ -d "$GITNEXUS_WIKI_DIR" ]]; then
  mkdir -p "$WIKI_OUT"
  cp -r "$GITNEXUS_WIKI_DIR/." "$WIKI_OUT/"
  echo "=== generate-wiki: copied to $WIKI_OUT ==="
else
  # Some versions write directly to docs/ or wiki/ — find and move
  for candidate in "$PROJECT_ROOT/wiki" "$PROJECT_ROOT/.gitnexus/docs"; do
    if [[ -d "$candidate" ]]; then
      mkdir -p "$WIKI_OUT"
      cp -r "$candidate/." "$WIKI_OUT/"
      echo "=== generate-wiki: copied from $candidate to $WIKI_OUT ==="
      break
    fi
  done
fi

if [[ ! -d "$WIKI_OUT" ]] || [[ -z "$(ls -A "$WIKI_OUT" 2>/dev/null)" ]]; then
  echo "WARNING: wiki output directory empty or not found at $WIKI_OUT" >&2
  echo "Check .gitnexus/ for wiki output and copy manually." >&2
  exit 1
fi

FILE_COUNT=$(find "$WIKI_OUT" -type f | wc -l)
echo "=== generate-wiki: $FILE_COUNT files in $WIKI_OUT ==="

if [[ "$AUTO_COMMIT" == "true" ]]; then
  git -C "$PROJECT_ROOT" add docs/wiki/
  CHANGED=$(git -C "$PROJECT_ROOT" diff --cached --name-only | wc -l)
  if [[ "$CHANGED" -gt 0 ]]; then
    git -C "$PROJECT_ROOT" commit -m "docs: regenerate wiki from gitnexus graph ($FILE_COUNT files)"
    echo "=== generate-wiki: committed $CHANGED changed files ==="
  else
    echo "=== generate-wiki: wiki unchanged, nothing to commit ==="
  fi
fi

echo "=== Done. Agents can now read docs/wiki/ instead of scanning code. ==="
