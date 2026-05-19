#!/usr/bin/env bash
# YAMTAM ENGINE Hook
# Version: 1.3.22
# Status: active
# Description: Validate completion claims have evidence before Stop
# Last Reviewed: 2026-05-19
# Stop hook — checks completion quality before Claude finishes a turn.
# Warns (non-blocking) when implementation files were modified but docs
# were not updated, so the model can add a follow-up or the human knows
# to ask for a docs pass.
#
# Non-blocking: always exits 0. Output on stdout is shown to Claude as
# a message after its turn, giving it a chance to self-correct.

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# ── Gather files modified in the working tree since the last commit ───────────
# This catches both staged and unstaged changes made during the session.
MODIFIED=$(git -C "$PROJECT_ROOT" diff --name-only HEAD 2>/dev/null || true)
STAGED=$(git -C "$PROJECT_ROOT" diff --name-only --cached 2>/dev/null || true)
ALL_CHANGED=$(printf '%s\n%s\n' "$MODIFIED" "$STAGED" | sort -u | grep -v '^$' || true)

[[ -z "$ALL_CHANGED" ]] && exit 0

# ── Categorise changes ────────────────────────────────────────────────────────
IMPL_FILES=$(echo "$ALL_CHANGED" | grep -E '\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|swift|kt)$' || true)
DOCS_FILES=$(echo "$ALL_CHANGED"  | grep -E '^docs/' || true)
TEST_FILES=$(echo "$ALL_CHANGED"  | grep -E '\.(spec|test)\.(ts|tsx|js|jsx|py)$' || true)
TODO_CHANGED=$(echo "$ALL_CHANGED" | grep -E '^TODO\.md$' || true)

WARNINGS=()

# Warn if implementation changed but docs untouched (and there are docs to update).
if [[ -n "$IMPL_FILES" && -z "$DOCS_FILES" && -d "$PROJECT_ROOT/docs" ]]; then
  WARNINGS+=("- Implementation files were modified but no docs/ files were updated. If this change affects behaviour, update the relevant docs/ section before marking the task complete.")
fi

# Warn if implementation changed but TODO.md not updated.
if [[ -n "$IMPL_FILES" && -z "$TODO_CHANGED" ]]; then
  WARNINGS+=("- TODO.md was not updated. If a task was completed, mark it done and move it to the Completed section.")
fi

# Warn if there are implementation changes but no test file changes (and a tests/ dir exists).
if [[ -n "$IMPL_FILES" && -z "$TEST_FILES" ]]; then
  if [[ -d "$PROJECT_ROOT/tests" || -d "$PROJECT_ROOT/src" ]]; then
    WARNINGS+=("- No test files were modified alongside implementation changes. Verify that existing tests still pass, or add tests for new behaviour.")
  fi
fi

# ── Output warnings ───────────────────────────────────────────────────────────
if [[ ${#WARNINGS[@]} -gt 0 ]]; then
  echo "⚠️  Completion check — please review before finishing:"
  for w in "${WARNINGS[@]}"; do
    echo "$w"
  done
fi

# ── Predictive next-step analysis ─────────────────────────────────────────────
# When a TODO.md task is marked complete, signal @project-manager to suggest
# the 3 most logical next steps with risk assessment.
if [[ -n "$TODO_CHANGED" && -f "$PROJECT_ROOT/PRD.md" ]]; then
  TODO_DIFF=$(git -C "$PROJECT_ROOT" diff HEAD -- TODO.md 2>/dev/null || true)
  TASK_COMPLETED=$(echo "$TODO_DIFF" | grep -E '^\+.*(\[x\]|✅|Completed)' || true)
  if [[ -n "$TASK_COMPLETED" ]]; then
    echo ""
    echo "📊 Predictive Analysis — task completion detected."
    echo "   @project-manager: Read PRD.md and TODO.md, then suggest:"
    echo "   1. The 3 highest-value next tasks (with FR reference from PRD)"
    echo "   2. Risk assessment per task (High/Medium/Low + one-sentence reason)"
    echo "   3. Any blocking dependency to resolve first"
    echo "   Cap: 150 words. Suggest only — do not start implementing."
  fi
fi

exit 0
