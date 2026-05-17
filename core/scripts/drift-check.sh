#!/usr/bin/env bash
# Read-only script — YAMTAM Engine Status Drift Detector
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
  CUTOFF=$(date -d "7 days ago" +%Y-%m-%d 2>/dev/null \
    || date -v-7d +%Y-%m-%d 2>/dev/null \
    || true)

  while IFS= read -r -d '' task_file; do
    rel_path="${task_file#$PROJECT_ROOT/}"

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

      hits=$(grep -rl "$search_term" \
        "$PROJECT_ROOT/core" \
        "$PROJECT_ROOT/gates" \
        "$PROJECT_ROOT/docs" \
        2>/dev/null | wc -l || true)

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

    expires_at=$(grep -oE 'expires_at:\s*[0-9]{4}-[0-9]{2}-[0-9]{2}' "$fact_file" 2>/dev/null \
      | head -1 \
      | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' || true)

    [[ -z "$expires_at" ]] && continue

    if [[ "$expires_at" < "$TODAY" ]]; then
      rel_path="${fact_file#$PROJECT_ROOT/}"
      emit_issue "STALE: $rel_path has expires_at $expires_at (before today $TODAY)"
    fi
  done < <(find "$L1_DIR" -maxdepth 1 -name "*.md" -print0 2>/dev/null)
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
