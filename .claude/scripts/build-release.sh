#!/usr/bin/env bash
# Build a YAMTAM ENGINE release pack zip.
#
# Usage:
#   bash core/scripts/build-release.sh [VERSION]
#   VERSION defaults to value in MANIFEST.json
#
# Output:
#   releases/yamtam-engine-<VERSION>-fixed.zip
#
# The zip is structured so that:
#   unzip yamtam-engine-<VERSION>-fixed.zip -d .claude/
# drops all assets directly into the target project's .claude/ directory.
#
# Includes: hooks/ scripts/ commands/ agents/ rules/ config/ tests/ skills/ templates/
#           gates/ docs/ prompts/  (project-root assets referenced by skills at runtime)
# Excludes: .gitkeep files, *.js.map, node_modules/, .git/, binary images in docs/

set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
RELEASES_DIR="$PROJECT_ROOT/releases"
CORE_DIR="$PROJECT_ROOT/core"

# ── Resolve version ───────────────────────────────────────────────────────────
if [[ $# -ge 1 && -n "$1" ]]; then
  VERSION="$1"
else
  MANIFEST="$PROJECT_ROOT/MANIFEST.json"
  if command -v jq >/dev/null 2>&1 && [[ -f "$MANIFEST" ]]; then
    VERSION=$(jq -r '.version' "$MANIFEST" 2>/dev/null || true)
  fi
  VERSION="${VERSION:-1.3.26}"
fi

PACK_NAME="yamtam-engine-v${VERSION}-fixed.zip"
OUTPUT="$RELEASES_DIR/$PACK_NAME"

mkdir -p "$RELEASES_DIR"

echo "=== YAMTAM ENGINE — Build Release Pack ==="
echo "Version: $VERSION"
echo "Output:  $OUTPUT"
echo ""

# ── Pre-flight checks ─────────────────────────────────────────────────────────
echo "[ 1/4 ] Syntax check hooks and scripts..."
bash -n "$CORE_DIR"/hooks/*.sh 2>&1 && echo "        hooks: OK"
bash -n "$CORE_DIR"/scripts/*.sh 2>&1 && echo "        scripts: OK"

echo "[ 2/4 ] Run hook tests..."
if bash "$CORE_DIR/tests/hooks/run-hook-tests.sh" > /tmp/yamtam-test-output.txt 2>&1; then
  PASS_LINE=$(grep "Passed:" /tmp/yamtam-test-output.txt || true)
  echo "        tests: $PASS_LINE"
else
  echo "ERROR: Hook tests failed. Aborting release build." >&2
  cat /tmp/yamtam-test-output.txt >&2
  exit 1
fi

echo "[ 3/4 ] Drift check..."
if bash "$CORE_DIR/scripts/drift-check.sh" > /tmp/yamtam-drift-output.txt 2>&1; then
  cat /tmp/yamtam-drift-output.txt
else
  echo "WARNING: Drift detected — review before distributing:" >&2
  cat /tmp/yamtam-drift-output.txt >&2
fi

# ── Build zip ─────────────────────────────────────────────────────────────────
echo "[ 4/4 ] Building zip..."

# Remove existing pack if present
[[ -f "$OUTPUT" ]] && rm "$OUTPUT"

cd "$CORE_DIR"

zip -r "$OUTPUT" \
  hooks/ \
  scripts/ \
  commands/ \
  agents/ \
  rules/ \
  config/ \
  tests/ \
  skills/ \
  templates/ \
  --exclude "*.gitkeep" \
  --exclude "*/.gitkeep" \
  --exclude "*.js.map" \
  --exclude "node_modules/*" \
  2>/dev/null

# Add project-root assets that skills and commands reference at runtime
cd "$PROJECT_ROOT"

zip -r "$OUTPUT" \
  gates/ \
  docs/ \
  prompts/ \
  --exclude "*.gitkeep" \
  --exclude "docs/*.png" \
  --exclude "docs/*.jpg" \
  --exclude "docs/*.gif" \
  2>/dev/null

# ── Verify zip ────────────────────────────────────────────────────────────────
FILE_COUNT=$(unzip -l "$OUTPUT" | tail -1 | awk '{print $2}')
SIZE=$(du -sh "$OUTPUT" | cut -f1)

echo ""
echo "=== Release pack built ==="
echo "File:  $OUTPUT"
echo "Size:  $SIZE"
echo "Files: $FILE_COUNT"
echo ""
echo "Apply to a target project:"
echo "  unzip $PACK_NAME -d /path/to/project/.claude/"
echo "  bash /path/to/project/.claude/tests/hooks/run-hook-tests.sh"

# ── Update latest symlink (for plugin install URL) ────────────────────────────
LATEST="$RELEASES_DIR/yamtam-engine-latest.zip"
ln -sf "$PACK_NAME" "$LATEST"
echo "Latest: $LATEST -> $PACK_NAME"
