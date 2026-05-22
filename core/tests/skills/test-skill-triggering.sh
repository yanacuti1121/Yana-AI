#!/usr/bin/env bash
# YAMTAM ENGINE v1.3.31 — Skill Trigger Phrase Test
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

# sangrokjung/claude-forge skills (v1.3.24)
check_skill "team-orchestrator"      "orchestrat"
check_skill "strategic-compact"      "compact"
check_skill "session-wrap"           "session"
check_skill "verification-engine"    "verification"
check_skill "skill-factory"          "skill"
check_skill "security-compliance"    "compliance"
check_skill "security-pipeline"      "security"
check_skill "stride-analysis-patterns" "threat"
check_skill "debugging-strategies"   "debug"
check_skill "extract-errors"         "error"
check_skill "build-system"           "build"
check_skill "cache-components"       "cache"
check_skill "verify-implementation"  "verify"

# karanb192-inspired skills (v1.3.24)
check_skill "hook-block-commands"    "block"
check_skill "hook-protect-secrets"   "secret"

# qdhenry/Claude-Command-Suite imports (v1.3.17)
check_skill "audit-env-variables"    "env"
check_skill "audit-env-variables"    "security"
check_skill "remove-dead-code"       "dead code"
check_skill "remove-dead-code"       "unused"
check_skill "file-watcher"           "file change"
check_skill "file-watcher"           "chokidar"
check_skill "setup-agent-tail"       "agent-tail"
check_skill "setup-agent-tail"       "log"

# rohitg00/affaan-m imports (v1.3.18) — phase 6
check_skill "api-design"             "REST"
check_skill "api-design"             "pagination"
check_skill "backend-patterns"       "backend"
check_skill "backend-patterns"       "Node.js"
check_skill "coding-standards"       "naming"
check_skill "coding-standards"       "readability"
check_skill "deep-research"          "research"
check_skill "deep-research"          "firecrawl"
check_skill "documentation-lookup"   "Context7"
check_skill "documentation-lookup"   "framework"
check_skill "e2e-testing"            "Playwright"
check_skill "e2e-testing"            "E2E"
check_skill "security-review"        "authentication"
check_skill "security-review"        "security"
check_skill "tdd-workflow"           "test-driven"
check_skill "tdd-workflow"           "coverage"
check_skill "verification-loop"      "verification"
check_skill "agent-introspection-debugging" "debugging"
check_skill "agent-introspection-debugging" "introspection"
check_skill "frontend-patterns"      "React"
check_skill "frontend-patterns"      "frontend"
check_skill "mcp-server-patterns"    "MCP"
check_skill "mcp-server-patterns"    "tools"

# gitnexus skills beyond gitnexus-guide (v1.3.11)
check_skill "gitnexus/gitnexus-cli"            "analyze"
check_skill "gitnexus/gitnexus-cli"            "index"
check_skill "gitnexus/gitnexus-debugging"      "bug"
check_skill "gitnexus/gitnexus-debugging"      "error"
check_skill "gitnexus/gitnexus-exploring"      "architecture"
check_skill "gitnexus/gitnexus-exploring"      "how"
check_skill "gitnexus/gitnexus-impact-analysis" "break"
check_skill "gitnexus/gitnexus-impact-analysis" "impact"
check_skill "gitnexus/gitnexus-pr-review"      "pull request"
check_skill "gitnexus/gitnexus-pr-review"      "review"
check_skill "gitnexus/gitnexus-refactoring"    "refactor"
check_skill "gitnexus/gitnexus-refactoring"    "rename"

# karpathy guidelines + l1-promote (v1.3.17 / v1.3.26)
check_skill "karpathy-guidelines"    "overcomplication"
check_skill "karpathy-guidelines"    "LLM"
check_skill "l1-promote"             "L2"
check_skill "l1-promote"             "promote"

# v1.3.27 — security skill pack + design/UX branch
check_skill "red-team-check"         "attack"
check_skill "red-team-check"         "red.team"
check_skill "blue-team-fix"          "vulnerability"
check_skill "blue-team-fix"          "blue.team"
check_skill "purple-team-report"     "purple"
check_skill "design-taste-frontend"  "visual"
check_skill "design-taste-frontend"  "taste"
check_skill "image-to-code"          "screenshot"
check_skill "image-to-code"          "image"
check_skill "ui-redesign"            "redesign"
check_skill "output-enforcement"     "output"
check_skill "minimalist-ui"          "minimalist"

# v1.3.28 — UI expansion
check_skill "aesthetic-anchor"       "visual"
check_skill "aesthetic-anchor"       "aesthetic"
check_skill "accessibility-audit"    "WCAG"
check_skill "accessibility-audit"    "accessibility"
check_skill "design-system-gen"      "design system"
check_skill "design-system-gen"      "token"
check_skill "ux-heuristics"          "heuristic"
check_skill "ux-heuristics"          "Nielsen"

# v1.3.29 — design/performance branch
check_skill "multi-agent-handoff"    "handoff"
check_skill "multi-agent-handoff"    "context"
check_skill "typography-system"      "font"
check_skill "typography-system"      "type"
check_skill "motion-design"          "animation"
check_skill "motion-design"          "easing"
check_skill "ui-states"              "loading"
check_skill "ui-states"              "skeleton"
check_skill "mobile-ux"              "touch"
check_skill "mobile-ux"              "mobile"
check_skill "web-performance"        "Core Web Vitals"
check_skill "web-performance"        "LCP"

# v1.3.30 — AI/LLM + backend/infra branches (83→99)
check_skill "llm-ui-patterns"        "streaming"
check_skill "llm-ui-patterns"        "AI"
check_skill "prompt-engineering"     "chain-of-thought"
check_skill "prompt-engineering"     "prompt"
check_skill "rag-architect"          "RAG"
check_skill "rag-architect"          "retrieval"
check_skill "slo-design"             "SLO"
check_skill "slo-design"             "error budget"
check_skill "incident-response-runbook" "runbook"
check_skill "incident-response-runbook" "incident"
check_skill "i18n-patterns"          "i18n"
check_skill "i18n-patterns"          "RTL"
check_skill "database-patterns"      "schema"
check_skill "database-patterns"      "N+1"
check_skill "auth-patterns"          "JWT"
check_skill "auth-patterns"          "auth"
check_skill "resilience-patterns"    "circuit breaker"
check_skill "resilience-patterns"    "retry"
check_skill "event-driven-architecture" "event"
check_skill "event-driven-architecture" "Kafka"
check_skill "observability-instrumentation" "structured"
check_skill "observability-instrumentation" "trace"
check_skill "cicd-patterns"          "CI/CD"
check_skill "cicd-patterns"          "pipeline"
check_skill "refactor-patterns"      "strangler"
check_skill "refactor-patterns"      "refactor"
check_skill "data-privacy"           "PII"
check_skill "data-privacy"           "privacy"
check_skill "graphql-patterns"       "GraphQL"
check_skill "graphql-patterns"       "N+1"
check_skill "adr-writing"            "ADR"
check_skill "adr-writing"            "decision"

# v1.3.31 — caching-patterns, api-rate-limiting
check_skill "caching-patterns"       "cache"
check_skill "caching-patterns"       "invalidat"
check_skill "api-rate-limiting"      "rate limit"
check_skill "api-rate-limiting"      "429"

# v1.3.31 session — load-testing, feature-flags, websocket-patterns, mlops, cloud-cost-optimization
check_skill "load-testing"           "k6"
check_skill "load-testing"           "load test"
check_skill "feature-flags"          "feature flag"
check_skill "feature-flags"          "LaunchDarkly"
check_skill "websocket-patterns"     "WebSocket"
check_skill "websocket-patterns"     "real-time"
check_skill "mlops"                  "model"
check_skill "mlops"                  "drift"
check_skill "cloud-cost-optimization" "cost"
check_skill "cloud-cost-optimization" "rightsizing"

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
