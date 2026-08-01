#!/usr/bin/env bash
# Manifest drift checker — semver/semver-inspired zero-drift release gate
# Counts actual files in each component dir and compares to MANIFEST.json declared counts.
# Usage:
#   validate-manifest.sh              — check all components, exit 1 on drift
#   validate-manifest.sh --fix        — update MANIFEST.json counts to match reality
#   validate-manifest.sh --component <name>  — check one component only
#   validate-manifest.sh --verbose    — show per-file breakdowns
set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
MANIFEST="$PROJECT_ROOT/MANIFEST.json"
FIX_MODE=false
VERBOSE=false
COMPONENT_FILTER=""

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fix)       FIX_MODE=true ;;
    --verbose)   VERBOSE=true ;;
    --component) shift; COMPONENT_FILTER="$1" ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

if [[ ! -f "$MANIFEST" ]]; then
  echo -e "${RED}[validate-manifest] MANIFEST.json not found at $MANIFEST${NC}" >&2
  exit 1
fi

if ! command -v python3 &>/dev/null; then
  echo -e "${RED}[validate-manifest] python3 required${NC}" >&2
  exit 1
fi

DRIFT_COUNT=0
CHECKED_COUNT=0

check_component() {
  local name="$1"
  local dir="$2"
  local pattern="$3"   # find -name pattern
  local declared="$4"

  [[ -n "$COMPONENT_FILTER" && "$name" != "$COMPONENT_FILTER" ]] && return

  if [[ ! -d "$PROJECT_ROOT/$dir" ]]; then
    echo -e "${YELLOW}[validate-manifest] SKIP $name — directory $dir not found${NC}"
    return
  fi

  # Count actual files
  actual=$(find "$PROJECT_ROOT/$dir" -name "$pattern" 2>/dev/null | wc -l | tr -d ' ')

  CHECKED_COUNT=$((CHECKED_COUNT + 1))

  if [[ "$actual" -eq "$declared" ]]; then
    echo -e "${GREEN}[validate-manifest] OK${NC}    $name: declared=$declared actual=$actual"
  else
    echo -e "${RED}[validate-manifest] DRIFT${NC} $name: declared=$declared actual=$actual (delta=$(( actual - declared )))"
    DRIFT_COUNT=$((DRIFT_COUNT + 1))

    if [[ "$VERBOSE" == true ]]; then
      echo "  Actual files:"
      find "$PROJECT_ROOT/$dir" -name "$pattern" 2>/dev/null | sort | while read -r f; do
        echo "    ${f#"$PROJECT_ROOT"/}"
      done
    fi

    if [[ "$FIX_MODE" == true ]]; then
      python3 - <<PYEOF
import json, pathlib
m = json.loads(pathlib.Path("$MANIFEST").read_text())
comp = m.get("components", {})
if "$name" in comp:
    if isinstance(comp["$name"], dict):
        comp["$name"]["count"] = $actual
    else:
        comp["$name"] = $actual
m["components"] = comp
pathlib.Path("$MANIFEST").write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n")
print("[validate-manifest] Fixed $name count → $actual")
PYEOF
    fi
  fi
}

echo -e "${CYAN}[validate-manifest] Checking MANIFEST drift — $(date -u +%Y-%m-%dT%H:%M:%SZ)${NC}"
echo ""

# ── Read declared counts from MANIFEST ───────────────────────────────────────
read_count() {
  python3 -c "
import json, sys
m = json.load(open('$MANIFEST'))
c = m.get('components', {}).get('$1', {})
if isinstance(c, dict): print(c.get('count', 0))
elif isinstance(c, int): print(c)
else: print(0)
"
}

# ── Component checks ──────────────────────────────────────────────────────────
# Find patterns below MUST match drift-check.sh (the only one of the three
# count-validator scripts actually wired into CI — .github/workflows/ci.yml)
# exactly. They didn't, silently, until 2026-07-13: core/scripts has 3 .js
# files this script's old scripts pattern missed, and agents wasn't excluding
# README.md/uppercase-leading companion docs the way drift-check.sh does —
# both real, confirmed disagreements, not hypothetical.
check_component "commands" "core/commands" "*.md"      "$(read_count commands)"
check_component "rules"    "core/rules"    "*.md"      "$(read_count rules)"
check_component "templates" "core/templates" "*.md"    "$(read_count templates)"

# Agents: exclude README.md and uppercase-leading companion docs (some
# agents used to live under core/agents/emotions/, which conflated
# companion docs inside an agent's own subdir with separate agents — all
# happen to be the only uppercase-leading filenames under core/agents/)
agents_actual=$(find "$PROJECT_ROOT/core/agents" -type f -name '*.md' ! -name 'README.md' ! -name '[A-Z]*' 2>/dev/null | wc -l | tr -d ' ')
agents_declared=$(read_count agents)
CHECKED_COUNT=$((CHECKED_COUNT + 1))
if [[ "$agents_actual" -eq "$agents_declared" ]]; then
  echo -e "${GREEN}[validate-manifest] OK${NC}    agents: declared=$agents_declared actual=$agents_actual"
else
  echo -e "${RED}[validate-manifest] DRIFT${NC} agents: declared=$agents_declared actual=$agents_actual (delta=$(( agents_actual - agents_declared )))"
  DRIFT_COUNT=$((DRIFT_COUNT + 1))
  if [[ "$FIX_MODE" == true ]]; then
    python3 -c "
import json, pathlib
m = json.loads(pathlib.Path('$MANIFEST').read_text())
m['components']['agents']['count'] = $agents_actual
pathlib.Path('$MANIFEST').write_text(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
print('[validate-manifest] Fixed agents count → $agents_actual')
"
  fi
fi

# Hooks: all top-level files except CLAUDE.md and dotfiles (matches
# drift-check.sh exactly — not just *.sh/*.js, so a future non-shell/JS
# hook file doesn't silently create a new disagreement)
hooks_actual=$(find "$PROJECT_ROOT/core/hooks" -maxdepth 1 -type f ! -name 'CLAUDE.md' ! -name '.*' 2>/dev/null | wc -l | tr -d ' ')
hooks_declared=$(read_count hooks)
CHECKED_COUNT=$((CHECKED_COUNT + 1))
if [[ "$hooks_actual" -eq "$hooks_declared" ]]; then
  echo -e "${GREEN}[validate-manifest] OK${NC}    hooks: declared=$hooks_declared actual=$hooks_actual"
else
  echo -e "${RED}[validate-manifest] DRIFT${NC} hooks: declared=$hooks_declared actual=$hooks_actual (delta=$(( hooks_actual - hooks_declared )))"
  DRIFT_COUNT=$((DRIFT_COUNT + 1))
  if [[ "$FIX_MODE" == true ]]; then
    python3 -c "
import json, pathlib
m = json.loads(pathlib.Path('$MANIFEST').read_text())
m['components']['hooks']['count'] = $hooks_actual
pathlib.Path('$MANIFEST').write_text(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
print('[validate-manifest] Fixed hooks count → $hooks_actual')
"
  fi
fi

# Skills: count SKILL.md files (each skill dir has one)
skills_actual=$(find "$PROJECT_ROOT/core/skills" -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
skills_declared=$(read_count skills)
CHECKED_COUNT=$((CHECKED_COUNT + 1))
if [[ "$skills_actual" -eq "$skills_declared" ]]; then
  echo -e "${GREEN}[validate-manifest] OK${NC}    skills: declared=$skills_declared actual=$skills_actual"
else
  echo -e "${RED}[validate-manifest] DRIFT${NC} skills: declared=$skills_declared actual=$skills_actual (delta=$(( skills_actual - skills_declared )))"
  DRIFT_COUNT=$((DRIFT_COUNT + 1))
  if [[ "$FIX_MODE" == true ]]; then
    python3 -c "
import json, pathlib
m = json.loads(pathlib.Path('$MANIFEST').read_text())
m['components']['skills']['count'] = $skills_actual
pathlib.Path('$MANIFEST').write_text(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
print('[validate-manifest] Fixed skills count → $skills_actual')
"
  fi
fi

# Scripts: all top-level files (matches drift-check.sh exactly — not just
# .sh/.js/.py, so a future script in another language doesn't silently
# create a new disagreement)
scripts_actual=$(find "$PROJECT_ROOT/core/scripts" -maxdepth 1 -type f ! -name '.*' 2>/dev/null | wc -l | tr -d ' ')
scripts_declared=$(read_count scripts)
CHECKED_COUNT=$((CHECKED_COUNT + 1))
if [[ "$scripts_actual" -eq "$scripts_declared" ]]; then
  echo -e "${GREEN}[validate-manifest] OK${NC}    scripts: declared=$scripts_declared actual=$scripts_actual"
else
  echo -e "${RED}[validate-manifest] DRIFT${NC} scripts: declared=$scripts_declared actual=$scripts_actual (delta=$(( scripts_actual - scripts_declared )))"
  DRIFT_COUNT=$((DRIFT_COUNT + 1))
  if [[ "$FIX_MODE" == true ]]; then
    python3 -c "
import json, pathlib
m = json.loads(pathlib.Path('$MANIFEST').read_text())
m['components']['scripts']['count'] = $scripts_actual
pathlib.Path('$MANIFEST').write_text(json.dumps(m, indent=2, ensure_ascii=False) + '\n')
print('[validate-manifest] Fixed scripts count → $scripts_actual')
"
  fi
fi

# ── Semver bump validation ────────────────────────────────────────────────────
# MANIFEST.json's version field is the PRODUCT axis (see VERSIONING.md —
# 3 independent axes: product/npm, Rust crate rt-v*, Python package py-v*,
# each with its own tag prefix since the 2026-07-05 publish.yml fix).
# --match restricts this to product-axis tags so a future rt-v*/py-v* tag
# (neither exists yet, but the workflow now creates them) can't be picked
# up by --abbrev=0's "most recent tag" and produce a false-positive
# mismatch warning against a completely different axis's version.
MANIFEST_VERSION=$(python3 -c "import json; print(json.load(open('$MANIFEST'))['version'])")
GIT_TAG_VERSION=$(git -C "$PROJECT_ROOT" describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || echo "none")

echo ""
echo -e "${CYAN}[validate-manifest] Semver check:${NC}"
echo "  MANIFEST version : $MANIFEST_VERSION"
echo "  Latest git tag   : $GIT_TAG_VERSION"

if [[ "$GIT_TAG_VERSION" != "none" && "$GIT_TAG_VERSION" != "v$MANIFEST_VERSION" && "$GIT_TAG_VERSION" != "$MANIFEST_VERSION" ]]; then
  echo -e "${YELLOW}[validate-manifest] WARNING: MANIFEST version ($MANIFEST_VERSION) != latest tag ($GIT_TAG_VERSION)${NC}"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}[validate-manifest] Summary: $CHECKED_COUNT components checked, $DRIFT_COUNT drifted${NC}"

if [[ $DRIFT_COUNT -gt 0 ]]; then
  echo -e "${RED}[validate-manifest] DRIFT DETECTED — merge block active${NC}"
  echo "  Fix: run with --fix to auto-update MANIFEST.json counts"
  echo "  Or:  manually sync counts before pushing"
  $FIX_MODE && echo -e "${GREEN}[validate-manifest] Auto-fix applied — re-run to verify${NC}"
  $FIX_MODE || exit 1
else
  echo -e "${GREEN}[validate-manifest] CLEAN — no drift detected${NC}"
fi
