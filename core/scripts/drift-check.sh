#!/usr/bin/env bash
# Read-only script — Yana AI Engine Status Drift Detector
#
# Checks three classes of drift and prints one issue per line.
# Exit 0 if clean, exit 1 if any drift found.
#
# Checks:
#   1. TASK DRIFT  — .tasks/ files claiming "done" with no recent git commit
#   2. OVERCLAIM   — README.md features that grep cannot find in codebase
#   3. STALE FACTS — memory/L1_atomic/ facts with expires_at in the past
#
# Usage:
#   bash core/scripts/drift-check.sh
#   Integrate into /verify (core/commands/verify.md, Step 4)

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
ISSUE_COUNT=0
TODAY=$(date +%Y-%m-%d)

emit_issue() {
  echo "$1"
  ISSUE_COUNT=$((ISSUE_COUNT + 1))
}

# ── Check 1: Task drift ───────────────────────────────────────────────────────
# For each file in .tasks/ that claims status "done" or contains [x],
# check whether any git commit in the last 7 days touched that file.
# If not, flag DRIFT.

TASKS_DIR="$PROJECT_ROOT/.tasks"

if [[ -d "$TASKS_DIR" ]]; then
  while IFS= read -r -d '' task_file; do
    rel_path="${task_file#"$PROJECT_ROOT"/}"

    # Skip template files
    [[ "$rel_path" == *TEMPLATE* ]] && continue

    # Check if file claims "done"
    if grep -qiE '(status\s*:\s*done|\[x\]|status\s*:\s*complete)' "$task_file" 2>/dev/null; then
      # Check for a recent commit touching this file (within 7 days)
      recent_commit=$(git -C "$PROJECT_ROOT" log \
        --since="7 days ago" \
        --oneline \
        -- "$rel_path" 2>/dev/null | head -1 || true)

      if [[ -z "$recent_commit" ]]; then
        emit_issue "DRIFT: $rel_path claims done but no git commit in last 7 days touched it"
      fi
    fi
  done < <(find "$TASKS_DIR" -maxdepth 2 -name "*.md" -print0 2>/dev/null)
fi

# ── Check 2: README overclaim ─────────────────────────────────────────────────
# Scan README.md for lines that claim a feature exists (under a ## Features
# or similar heading) and check if grep finds any evidence of it in core/.
# Heuristic: lines starting with "- " or "* " under a Features/Highlights
# heading that contain a noun phrase — we grep for the first 2 significant
# words of the bullet in core/ (scripts, hooks, commands, agents).
# Flag only if ZERO hits in the codebase tree.

README="$PROJECT_ROOT/README.md"

if [[ -f "$README" ]]; then
  in_features_section=false

  while IFS= read -r line; do
    # Detect section headings
    if echo "$line" | grep -qiE '^#{1,3}\s+(feature|highlight|what|capability|component)'; then
      in_features_section=true
      continue
    fi
    # Leave features section on next heading
    if echo "$line" | grep -qE '^#{1,3}\s+'; then
      in_features_section=false
      continue
    fi

    [[ "$in_features_section" != true ]] && continue

    # Only check bullet lines with enough content
    if echo "$line" | grep -qE '^\s*[-*]\s+.{10,}'; then
      # Extract a search term: first "word" that looks like a code artifact
      # (contains -, _, /, or is Title-Cased)
      search_term=$(echo "$line" \
        | sed 's/^\s*[-*]\s*//' \
        | grep -oE '[a-zA-Z][a-zA-Z0-9_/-]{3,}' \
        | head -1 || true)

      [[ -z "$search_term" ]] && continue

      # Skip very generic terms that would always match
      case "$search_term" in
        the|and|for|with|that|this|from|your|when|into|each|over|more|less|using|based|built|also|only|both) continue ;;
      esac

      # Use -q + early exit via head -1 to avoid scanning whole tree per term.
      # timeout 5 prevents any single grep from hanging on large repos.
      if timeout 5 grep -rlqF --binary-files=without-match \
          --exclude-dir=releases \
          --exclude="*.zip" \
          "$search_term" \
          "$PROJECT_ROOT/core" \
          "$PROJECT_ROOT/gates" \
          "$PROJECT_ROOT/docs" \
          2>/dev/null; then
        hits=1
      elif find "$PROJECT_ROOT" -maxdepth 2 -name "*${search_term}*" 2>/dev/null | grep -q .; then
        hits=1
      else
        hits=0
      fi

      if [[ "${hits:-0}" -eq 0 ]]; then
        emit_issue "OVERCLAIM: README.md mentions '$search_term' but grep finds no evidence in core/ gates/ docs/"
      fi
    fi
  done < "$README"
fi

# ── Check 3: Stale L1 facts ──────────────────────────────────────────────────
# Read each fact file in memory/L1_atomic/*.md (excluding INDEX.md).
# If expires_at is present and the date is before today, flag STALE.

L1_DIR="$PROJECT_ROOT/memory/L1_atomic"

if [[ -d "$L1_DIR" ]]; then
  while IFS= read -r -d '' fact_file; do
    [[ "$(basename "$fact_file")" == "INDEX.md" ]] && continue
    [[ "$(basename "$fact_file")" == "SCHEMA.md" ]] && continue

    expires_at=$(grep -oE 'expires_at:\s*[0-9]{4}-[0-9]{2}-[0-9]{2}' "$fact_file" 2>/dev/null \
      | head -1 \
      | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' || true)

    [[ -z "$expires_at" ]] && continue

    if [[ "$expires_at" < "$TODAY" ]]; then
      rel_path="${fact_file#"$PROJECT_ROOT"/}"
      emit_issue "STALE: $rel_path has expires_at $expires_at (before today $TODAY)"
    fi
  done < <(find "$L1_DIR" -maxdepth 1 -name "*.md" -print0 2>/dev/null)
fi

# ── Check 4: MANIFEST cross-count ────────────────────────────────────────────
# Compare MANIFEST.json count fields vs actual files on disk.
# Flag DRIFT if they diverge. Skip release zips/binaries.

MANIFEST_FILE="$PROJECT_ROOT/MANIFEST.json"

if [[ -f "$MANIFEST_FILE" ]] && command -v python3 >/dev/null 2>&1; then
  manifest_count() {
    python3 -c "
import json, sys
with open('$MANIFEST_FILE') as f:
    m = json.load(f)
comp = m.get('components', {})
cat = sys.argv[1]
if cat in comp:
    c = comp[cat]
    if isinstance(c, dict):
        print(c.get('count', -1))
    else:
        print(-1)
else:
    print(-1)
" "$1" 2>/dev/null || echo -1
  }

  disk_count() {
    local n
    # shell-sanitize-law.md §eval exception: argument is always a hardcoded find+wc
    # string constructed internally (see cross_check callsites below) — not user input.
    # bash -c used instead of eval to avoid current-shell side-effects.
    n=$(bash -c -- "$1" 2>/dev/null | tr -d '[:space:]')
    echo "${n:-0}"
  }

  cross_check() {
    local label="$1"
    local manifest_n
    manifest_n=$(manifest_count "$label")
    local disk_n
    disk_n=$(disk_count "$2")

    if [[ "$manifest_n" == "-1" ]]; then return; fi

    if [[ "$manifest_n" != "$disk_n" ]]; then
      emit_issue "COUNT DRIFT: $label — MANIFEST.json says $manifest_n, disk has $disk_n"
    fi
  }

  # core/agents/emotions/*.md are per-agent emotion-journal companion files,
  # not agent definitions (verified 2026-06-21: 98 of them, one per most
  # agents). IDENTITY.md/SOUL.md/CAPABILITIES.md are companion docs inside an
  # agent's own subdir, not separate agents — all happen to be the only
  # uppercase-leading filenames under core/agents/, so excluding by that
  # pattern is safe and self-documenting rather than hardcoding each name.
  cross_check "agents"    "find '$PROJECT_ROOT/core/agents' -type f -name '*.md' ! -path '*/emotions/*' ! -name 'README.md' ! -name '[A-Z]*' | wc -l"
  cross_check "commands"  "find '$PROJECT_ROOT/core/commands' -type f -name '*.md' | wc -l"
  cross_check "hooks"     "find '$PROJECT_ROOT/core/hooks' -maxdepth 1 -type f ! -name 'CLAUDE.md' ! -name '.*' | wc -l"
  cross_check "scripts"   "find '$PROJECT_ROOT/core/scripts' -maxdepth 1 -type f ! -name '.*' | wc -l"
  cross_check "skills"    "find '$PROJECT_ROOT/core/skills' -name 'SKILL.md' | wc -l"
  cross_check "templates" "find '$PROJECT_ROOT/core/templates' -type f -name '*.md' | wc -l"
  cross_check "tests"     "find '$PROJECT_ROOT/core/tests' -name '*.sh' | wc -l"
  cross_check "rules"     "find '$PROJECT_ROOT/core/rules' -type f -name '*.md' | wc -l"

  # ── MANIFEST actual_present integrity ─────────────────────────────────────
  # Check 1: every path in actual_present must exist on disk
  # Check 2: disk file count must match len(actual_present) for key categories
  python3 - << PYEOF 2>/dev/null
import json, os, sys
root = '$PROJECT_ROOT'
with open('$MANIFEST_FILE') as f:
    m = json.load(f)
comp = m.get('components', {})
issues = []

for cat, cfg in comp.items():
    if not isinstance(cfg, dict): continue
    lst = cfg.get('actual_present', [])
    for path in lst:
        full = os.path.join(root, path)
        if not os.path.exists(full):
            issues.append(f'MANIFEST GHOST: {path} listed in actual_present but not on disk')

for issue in issues:
    print(issue)
PYEOF
  while IFS= read -r ghost_issue; do
    [[ -n "$ghost_issue" ]] && emit_issue "$ghost_issue"
  done < <(python3 - << PYEOF 2>/dev/null
import json, os
root = '$PROJECT_ROOT'
with open('$MANIFEST_FILE') as f:
    m = json.load(f)
comp = m.get('components', {})
for cat, cfg in comp.items():
    if not isinstance(cfg, dict): continue
    for path in cfg.get('actual_present', []):
        full = os.path.join(root, path)
        if not os.path.exists(full):
            print(f'MANIFEST GHOST: {path} listed in actual_present but not on disk')
PYEOF
)

  # ── plugin.json / marketplace.json vs disk counts ─────────────────────────
  PLUGIN_FILE="$PROJECT_ROOT/.claude-plugin/plugin.json"
  MARKET_FILE="$PROJECT_ROOT/.claude-plugin/marketplace.json"

  meta_check() {
    local label="$1" file="$2" field="$3" disk_cmd="$4"
    local meta_n disk_n
    meta_n=$(python3 -c "
import json, sys
with open('$file') as f: d=json.load(f)
key='$field'
# Support nested: contents.hooks or stats.hooks
parts=key.split('.')
val=d
for p in parts:
    val=val.get(p,-1) if isinstance(val,dict) else -1
print(val)
" 2>/dev/null || echo -1)
    disk_n=$(bash -c -- "$disk_cmd" 2>/dev/null | tr -d '[:space:]')
    [[ "$meta_n" == "-1" ]] && return
    if [[ "$meta_n" != "$disk_n" ]]; then
      emit_issue "META DRIFT [$label]: $file says $meta_n, disk has $disk_n"
    fi
  }

  if [[ -f "$PLUGIN_FILE" ]]; then
    meta_check "plugin hooks"     "$PLUGIN_FILE" "contents.hooks"    "find '$PROJECT_ROOT/core/hooks' -maxdepth 1 -type f ! -name 'CLAUDE.md' ! -name '.*' | wc -l"
    meta_check "plugin skills"    "$PLUGIN_FILE" "contents.skills"   "find '$PROJECT_ROOT/core/skills' -name 'SKILL.md' | wc -l"
    meta_check "plugin commands"  "$PLUGIN_FILE" "contents.commands" "find '$PROJECT_ROOT/core/commands' -type f -name '*.md' | wc -l"
    meta_check "plugin agents"    "$PLUGIN_FILE" "contents.agents"   "find '$PROJECT_ROOT/core/agents' -type f -name '*.md' ! -path '*/emotions/*' ! -name 'README.md' ! -name '[A-Z]*' | wc -l"
    meta_check "plugin scripts"   "$PLUGIN_FILE" "contents.scripts"  "find '$PROJECT_ROOT/core/scripts' -maxdepth 1 -type f ! -name '.*' | wc -l"
    # checks total must equal sum of breakdown
    python3 - << PYEOF 2>/dev/null | while IFS= read -r issue; do emit_issue "$issue"; done
import json
with open('$PLUGIN_FILE') as f: d=json.load(f)
c=d.get('contents',{})
total=c.get('checks',-1)
b=c.get('checks_breakdown',{})
s=sum(b.values()) if b else -1
if total!=-1 and s!=-1 and total!=s:
    print(f'CHECKS SUM DRIFT: plugin.json checks={total} but breakdown sums to {s}')
PYEOF
  fi

  if [[ -f "$MARKET_FILE" ]]; then
    meta_check "market hooks"    "$MARKET_FILE" "stats.hooks"    "find '$PROJECT_ROOT/core/hooks' -maxdepth 1 -type f ! -name 'CLAUDE.md' ! -name '.*' | wc -l"
    meta_check "market skills"   "$MARKET_FILE" "stats.skills"   "find '$PROJECT_ROOT/core/skills' -name 'SKILL.md' | wc -l"
    meta_check "market commands" "$MARKET_FILE" "stats.commands" "find '$PROJECT_ROOT/core/commands' -type f -name '*.md' | wc -l"
    meta_check "market agents"   "$MARKET_FILE" "stats.agents"   "find '$PROJECT_ROOT/core/agents' -type f -name '*.md' ! -path '*/emotions/*' ! -name 'README.md' ! -name '[A-Z]*' | wc -l"
    meta_check "market scripts"  "$MARKET_FILE" "stats.scripts"  "find '$PROJECT_ROOT/core/scripts' -maxdepth 1 -type f ! -name '.*' | wc -l"
  fi
fi

# ── Report ────────────────────────────────────────────────────────────────────

if [[ $ISSUE_COUNT -eq 0 ]]; then
  echo "drift-check: CLEAN — no drift, overclaims, or stale facts"
  exit 0
else
  echo ""
  echo "drift-check: $ISSUE_COUNT issue(s) found"
  exit 1
fi
