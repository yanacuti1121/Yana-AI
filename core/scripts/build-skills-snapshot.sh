#!/usr/bin/env bash
# YAMTAM ENGINE — Skills Snapshot Builder
#
# Generates a compact index of all skills (name + description + key triggers)
# for use as a cached context block in API calls. Reduces token usage by ~90%
# compared to sending full SKILL.md contents.
#
# Output: .claude/skills-snapshot.md  (also printed to stdout)
# Usage:  bash core/scripts/build-skills-snapshot.sh
#         bash core/scripts/build-skills-snapshot.sh > custom-output.md

set -uo pipefail

SKILLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/skills"
OUTPUT_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.claude/skills-snapshot.md"
mkdir -p "$(dirname "$OUTPUT_FILE")"

SKILL_COUNT=0
SNAPSHOT=""

SNAPSHOT+="# YAMTAM Skills Snapshot\n"
SNAPSHOT+="# Generated: $(date -Iseconds)\n"
SNAPSHOT+="# Use as cached system context block (prompt-caching-strategy)\n\n"

while IFS= read -r skill_file; do
  # Extract frontmatter fields
  NAME=$(grep -m1 "^name:" "$skill_file" | sed 's/^name: *//' | tr -d '"')

  # Extract description (handles multi-line >-style YAML)
  DESC=$(awk '/^description:/{found=1; next} found && /^[a-z]/{exit} found{print}' "$skill_file" \
    | tr -s ' \n' ' ' | sed 's/^ *//' | cut -c1-200)

  if [[ -z "$NAME" ]]; then
    continue
  fi

  SNAPSHOT+="## $NAME\n$DESC\n\n"
  SKILL_COUNT=$((SKILL_COUNT + 1))
done < <(find "$SKILLS_DIR" -name "SKILL.md" | sort)

SNAPSHOT+="---\nTotal: $SKILL_COUNT skills\n"

# Write to file and stdout
printf "%b" "$SNAPSHOT" | tee "$OUTPUT_FILE"

echo "" >&2
echo "Snapshot written: $OUTPUT_FILE" >&2
echo "Skills indexed:   $SKILL_COUNT" >&2
echo "Approx tokens:    $(printf "%b" "$SNAPSHOT" | wc -c | awk '{printf "%dk\n", $1/4}')" >&2
