#!/usr/bin/env bash
# Check the tier classification of a skill before loading.
# Usage: bash skill-tier-check.sh <skill-name>
#        bash skill-tier-check.sh --list [tier]
#        bash skill-tier-check.sh --stats
#
# Tiers:
#   DEFAULT_SAFE — AI can load anytime
#   MANUAL_ONLY  — Load only when user explicitly requests this category of work
#   GATED        — Requires explicit sovereign approval before loading
#   DEPRECATED   — Outdated; see replaced_by in SKILL.md

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
TIER_FILE="${YAMTAM_SKILL_TIERS:-$PROJECT_ROOT/core/config/skill-tiers.json}"

if [[ ! -f "$TIER_FILE" ]]; then
  echo "✗ skill-tiers.json not found at $TIER_FILE" >&2
  exit 1
fi

command -v python3 >/dev/null 2>&1 || { echo "✗ python3 required" >&2; exit 1; }

MODE="check"
SKILL_NAME=""
FILTER_TIER=""

for arg in "$@"; do
  case "$arg" in
    --list)  MODE="list" ;;
    --stats) MODE="stats" ;;
    DEFAULT_SAFE|MANUAL_ONLY|GATED|DEPRECATED) FILTER_TIER="$arg" ;;
    *)       SKILL_NAME="$arg" ;;
  esac
done

python3 - "$TIER_FILE" "$MODE" "$SKILL_NAME" "$FILTER_TIER" <<'PYEOF'
import json, sys

tier_file, mode, skill_name, filter_tier = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

with open(tier_file) as f:
    data = json.load(f)

skills = data.get('skills', {})
meta = data.get('_meta', {})

TIER_ICONS = {
    'DEFAULT_SAFE': '✅',
    'MANUAL_ONLY':  '⚠️ ',
    'GATED':        '🔒',
    'DEPRECATED':   '❌',
}

if mode == 'stats':
    counts = meta.get('counts', {})
    total = meta.get('total', 0)
    print(f"Skill Tiers — {total} total ({meta.get('version', '?')})")
    print()
    for tier, desc in meta.get('tiers', {}).items():
        icon = TIER_ICONS.get(tier, '  ')
        count = counts.get(tier, 0)
        pct = f"{count/total*100:.0f}%" if total else "0%"
        print(f"  {icon} {tier:<15} {count:>3} ({pct})")
        print(f"     {desc}")
    sys.exit(0)

if mode == 'list':
    results = [(k, v) for k, v in sorted(skills.items()) if not filter_tier or v == filter_tier]
    print(f"{'All skills' if not filter_tier else filter_tier} ({len(results)}):")
    for name, tier in results:
        icon = TIER_ICONS.get(tier, '  ')
        print(f"  {icon} {tier:<15} {name}")
    sys.exit(0)

# Single skill check
if not skill_name:
    print("Usage: skill-tier-check.sh <skill-name>  or  --list [TIER]  or  --stats")
    sys.exit(1)

tier = skills.get(skill_name)
if not tier:
    # Fuzzy match
    matches = [k for k in skills if skill_name.lower() in k.lower()]
    if matches:
        print(f"Skill '{skill_name}' not found. Did you mean:")
        for m in matches[:5]:
            icon = TIER_ICONS.get(skills[m], '  ')
            print(f"  {icon} {m} ({skills[m]})")
    else:
        print(f"Skill '{skill_name}' not found in tier registry.")
    sys.exit(1)

icon = TIER_ICONS.get(tier, '  ')
desc = meta.get('tiers', {}).get(tier, '')
print(f"{icon} {skill_name}: {tier}")
print(f"   {desc}")

if tier == 'GATED':
    print("   → Requires sovereign approval before loading.")
    print("   → Set YAMTAM_SKILL_GATE_APPROVED=<skill-name> to grant.")
elif tier == 'MANUAL_ONLY':
    print("   → Only load when user explicitly requests this type of work.")
elif tier == 'DEPRECATED':
    print("   → Check the skill's SKILL.md for the replaced_by field.")
PYEOF
