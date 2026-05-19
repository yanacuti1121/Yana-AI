#!/usr/bin/env bash
# YAMTAM ENGINE v1.3.15 — Skill Trigger Phrase Test
#
# Verifies that skill SKILL.md description fields contain the right trigger phrases.
# This does NOT test AI routing — it tests that the descriptions are correctly written
# so they would route correctly when read by an agent.
#
# Usage: bash core/tests/skills/test-skill-triggering.sh

set -uo pipefail

SKILLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/skills"
PASS=0
FAIL=0

check_skill() {
    local skill_name="$1"
    local expected_phrase="$2"
    local skill_file="$SKILLS_DIR/$skill_name/SKILL.md"

    if [[ ! -f "$skill_file" ]]; then
        echo "FAIL [$skill_name]: SKILL.md not found at $skill_file"
        FAIL=$((FAIL + 1))
        return
    fi

    if grep -qi "$expected_phrase" "$skill_file" 2>/dev/null; then
        echo "PASS [$skill_name]: found trigger phrase '$expected_phrase'"
        PASS=$((PASS + 1))
    else
        echo "FAIL [$skill_name]: trigger phrase '$expected_phrase' NOT found in description"
        FAIL=$((FAIL + 1))
    fi
}

echo "=== YAMTAM Skill Trigger Phrase Test ==="
echo "Skills dir: $SKILLS_DIR"
echo ""

# Core existing skills
check_skill "git-lessons"        "past bugs"
check_skill "gitnexus/gitnexus-guide" "codebase"

# New skills from v1.3.12 Superpowers import + v1.3.13 glebis/claude-skills
check_skill "plan-first"         "implement"
check_skill "plan-first"         "multi-step"
check_skill "verify-before-done" "done"
check_skill "verify-before-done" "fixed"
check_skill "debug-protocol"     "bug"
check_skill "debug-protocol"     "error"
check_skill "branch-finish"      "merge"
check_skill "branch-finish"      "done"
check_skill "worktree-safety"    "experiment"
check_skill "worktree-safety"    "feature"
check_skill "tdd"                "red green refactor"
check_skill "tdd"                "test-driven"

# New skills from v1.3.15
check_skill "executing-plans"         "execute"
check_skill "executing-plans"         "proceed"
check_skill "requesting-code-review"  "review this"
check_skill "requesting-code-review"  "code review"
check_skill "receiving-code-review"   "review comments"
check_skill "receiving-code-review"   "address the feedback"
check_skill "writing-skills"          "create a skill"
check_skill "writing-skills"          "write a skill"

# LSP navigation skill (v1.3.16)
check_skill "lsp-navigation"     "defined"
check_skill "lsp-navigation"     "references"
check_skill "lsp-navigation"     "grep"

# Telemetry analysis skill (v1.3.20)
check_skill "telemetry-analysis" "hook"
check_skill "telemetry-analysis" "audit"
check_skill "telemetry-analysis" "telemetry"

# Subagent dependency skill (v1.3.20)
check_skill "subagent-dependency" "parallel"
check_skill "subagent-dependency" "orchestrate"
check_skill "subagent-dependency" "dependency"

# alirezarezvani/claude-skills imports (v1.3.22)
check_skill "agenthub"           "parallel"
check_skill "agenthub"           "worktree"
check_skill "write-a-skill"      "skill"
check_skill "handoff"            "handoff"
check_skill "caveman"            "caveman"
check_skill "code-tour"          "tour"
check_skill "chaos-engineering"  "chaos"
check_skill "llm-cost-optimizer" "cost"
check_skill "pulse"              "reddit"
check_skill "research"           "research"

# disler-inspired skills (v1.3.22)
check_skill "session-context"    "git"
check_skill "pre-compact-backup" "compact"

echo ""
echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "Total:  $((PASS + FAIL))"

if [[ $FAIL -gt 0 ]]; then
    echo "Result: FAIL"
    exit 1
else
    echo "Result: PASS"
    exit 0
fi
