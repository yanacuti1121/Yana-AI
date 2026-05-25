#!/usr/bin/env bash
# #12 — Fact deprecation workflow with audit trail.
# Mark an L1 fact as deprecated, move to archived/, update INDEX, write audit entry.
#
# Usage:
#   bash deprecate-fact.sh <fact-id> --reason "why"
#   bash deprecate-fact.sh <fact-id> --replaced-by <new-id> --reason "why"

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
L1_DIR="$PROJECT_ROOT/memory/L1_atomic"
ARCHIVE_DIR="$L1_DIR/archived"
INDEX_FILE="$L1_DIR/INDEX.md"
AUDIT_LOG="${YAMTAM_LOG:-/tmp/yamtam-audit.log}"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

FACT_ID=""
REASON=""
REPLACED_BY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reason)       shift; REASON="$1" ;;
    --replaced-by)  shift; REPLACED_BY="$1" ;;
    *)              FACT_ID="$1" ;;
  esac
  shift
done

if [[ -z "$FACT_ID" ]]; then
  echo "Usage: deprecate-fact.sh <fact-id> --reason \"why\" [--replaced-by <new-id>]" >&2
  exit 1
fi

FACT_FILE="$L1_DIR/${FACT_ID}.md"
if [[ ! -f "$FACT_FILE" ]]; then
  # Try without .md
  FACT_FILE="$L1_DIR/${FACT_ID%.md}.md"
  [[ ! -f "$FACT_FILE" ]] && echo "✗ Fact not found: $FACT_ID" >&2 && exit 1
fi

FACT_NAME=$(basename "$FACT_FILE" .md)
mkdir -p "$ARCHIVE_DIR"

# Inject deprecation metadata into frontmatter
python3 - "$FACT_FILE" "$NOW" "$REASON" "$REPLACED_BY" <<'PYEOF'
import sys, re

path, now, reason, replaced_by = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
with open(path) as f:
    content = f.read()

# Add deprecated fields inside first frontmatter block
def inject(content, now, reason, replaced_by):
    parts = content.split('---', 2)
    if len(parts) < 3:
        return content
    frontmatter = parts[1]
    # Remove any existing deprecated fields
    frontmatter = re.sub(r'\ndeprecated:.*', '', frontmatter)
    frontmatter = re.sub(r'\ndeprecated_at:.*', '', frontmatter)
    frontmatter = re.sub(r'\ndeprecation_reason:.*', '', frontmatter)
    frontmatter = re.sub(r'\nreplaced_by:.*', '', frontmatter)
    # Add new fields
    frontmatter += f"\ndeprecated: true"
    frontmatter += f"\ndeprecated_at: {now}"
    frontmatter += f"\ndeprecation_reason: {reason}"
    if replaced_by:
        frontmatter += f"\nreplaced_by: {replaced_by}"
    return f"---{frontmatter}---{parts[2]}"

new_content = inject(content, now, reason, replaced_by)
# Add visible notice at top of body
body_notice = f"\n> ⚠️ DEPRECATED {now[:10]} — {reason}"
if replaced_by:
    body_notice += f" Use {replaced_by} instead."
# Insert after second ---
parts = new_content.split('---', 2)
if len(parts) == 3:
    new_content = f"---{parts[1]}---{body_notice}\n{parts[2]}"

with open(path, 'w') as f:
    f.write(new_content)
print("ok")
PYEOF

# Move to archived/
DEST="$ARCHIVE_DIR/${FACT_NAME}.md"
mv "$FACT_FILE" "$DEST"

# Remove from INDEX.md
if [[ -f "$INDEX_FILE" ]]; then
  grep -v "$FACT_NAME" "$INDEX_FILE" > "${INDEX_FILE}.tmp" && mv "${INDEX_FILE}.tmp" "$INDEX_FILE"
fi

# Append audit entry
echo "{\"ts\":\"$NOW\",\"action\":\"deprecate\",\"fact\":\"$FACT_NAME\",\"reason\":\"$REASON\",\"replaced_by\":\"$REPLACED_BY\"}" >> "$AUDIT_LOG" 2>/dev/null || true

echo "✓ Deprecated: $FACT_NAME"
echo "  Reason      : $REASON"
[[ -n "$REPLACED_BY" ]] && echo "  Replaced by : $REPLACED_BY"
echo "  Archived to : memory/L1_atomic/archived/${FACT_NAME}.md"
