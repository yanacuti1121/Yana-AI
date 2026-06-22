#!/usr/bin/env bash
# migrate-agent-identity.sh
# Migrate a single-file agent.md → agent/IDENTITY.md + SOUL.md + agent.md
# Usage: bash migrate-agent-identity.sh <agent-name>
# Example: bash migrate-agent-identity.sh code-auditor

set -euo pipefail

# Portable `sed -i` — GNU sed accepts `-i` alone; BSD/macOS sed requires an
# explicit (possibly empty) backup-suffix argument right after -i, otherwise
# it silently consumes the next argument as that suffix instead of erroring.
if sed --version >/dev/null 2>&1; then
  SED_INPLACE=(-i)
else
  SED_INPLACE=(-i '')
fi

AGENTS_DIR="$(dirname "$0")/../../core/agents"
AGENT_NAME="${1:-}"

if [[ -z "$AGENT_NAME" ]]; then
  echo "Usage: $0 <agent-name>"
  echo "Available: $(ls "$AGENTS_DIR"/*.md 2>/dev/null | xargs -n1 basename | sed 's/.md//' | tr '\n' ' ')"
  exit 1
fi

SRC="$AGENTS_DIR/${AGENT_NAME}.md"
DEST_DIR="$AGENTS_DIR/${AGENT_NAME}"

if [[ ! -f "$SRC" ]]; then
  echo "ERROR: $SRC not found"
  exit 1
fi

if [[ -d "$DEST_DIR" ]]; then
  echo "ERROR: $DEST_DIR already exists — skip or remove first"
  exit 1
fi

mkdir -p "$DEST_DIR"

# 1. Copy main agent file
cp "$SRC" "$DEST_DIR/${AGENT_NAME}.md"
echo "  ✓ Copied ${AGENT_NAME}.md"

# 2. Extract frontmatter name/description for IDENTITY stub
AGENT_DESC=$(grep '^description:' "$SRC" | head -1 | sed 's/^description: //' | tr -d '"')

# 3. Create IDENTITY.md stub — human fills in personality
cat > "$DEST_DIR/IDENTITY.md" << EOF
# ${AGENT_NAME^} — Identity

**Agent:** ${AGENT_NAME}
**Mô tả:** ${AGENT_DESC}

## Vai trò

<!-- TODO: Mô tả agent này là ai, làm gì, và KHÔNG làm gì -->

## Phong cách

<!-- TODO: Giọng điệu, cách giao tiếp, đặc điểm nổi bật -->
EOF
echo "  ✓ Created IDENTITY.md (stub — cần fill in)"

# 4. Create SOUL.md stub
cat > "$DEST_DIR/SOUL.md" << EOF
# ${AGENT_NAME^} — Soul

## Giá trị cốt lõi

<!-- TODO: 3-5 giá trị định nghĩa cách agent này hành xử -->

## Failure modes phải tránh

<!-- TODO: Những gì agent này hay làm sai — và cách tránh -->
EOF
echo "  ✓ Created SOUL.md (stub — cần fill in)"

# 5. Update MANIFEST.json
MANIFEST="$(dirname "$0")/../../MANIFEST.json"
if grep -q "\"core/agents/${AGENT_NAME}.md\"" "$MANIFEST"; then
  sed "${SED_INPLACE[@]}" "s|\"core/agents/${AGENT_NAME}.md\"|\"core/agents/${AGENT_NAME}/${AGENT_NAME}.md\"|g" "$MANIFEST"
  echo "  ✓ Updated MANIFEST.json"
else
  echo "  ⚠ ${AGENT_NAME}.md not found in MANIFEST — add manually"
fi

# 6. Remove old file
rm "$SRC"
echo "  ✓ Removed old ${AGENT_NAME}.md"

echo ""
echo "Done: core/agents/${AGENT_NAME}/"
echo "  → Fill in IDENTITY.md + SOUL.md với personality của agent"
