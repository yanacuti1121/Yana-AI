#!/usr/bin/env bash
# YAMTAM ENGINE v1.3.11 — Hook Test Suite
# Tests hooks with mock stdin inputs to verify block/warn logic.
# Supports running from any directory.

set -uo pipefail

# ── Path Resolution ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOKS_DIR="$CLAUDE_DIR/hooks"
RESULTS_DIR="$CLAUDE_DIR/state/test-results"

mkdir -p "$RESULTS_DIR"

# ── Dependency & File Checks ─────────────────────────────────────────────────
if ! command -v jq >/dev/null 2>&1; then
    echo "Error: 'jq' is required but not installed. Please install jq and retry."
    exit 1
fi

FAIL_COUNT=0
TOTAL_COUNT=0

echo "=== YAMTAM Hook Test Suite v1.3.11 ==="
echo "Hooks directory: $HOOKS_DIR"
echo ""

test_hook() {
    local hook_name=$1
    local test_name=$2
    local input_json=$3
    local expected_decision=$4
    local env_var=${5:-""}
    local env_val=${6:-""}

    TOTAL_COUNT=$((TOTAL_COUNT + 1))
    
    if [[ ! -f "$HOOKS_DIR/$hook_name" ]]; then
        echo "FAIL: Hook file not found: $HOOKS_DIR/$hook_name"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
    fi

    echo -n "Testing $hook_name [$test_name]... "
    
    local output
    if [[ -n "$env_var" ]]; then
        output=$(echo "$input_json" | env "$env_var"="$env_val" bash "$HOOKS_DIR/$hook_name" 2>/dev/null)
    else
        output=$(echo "$input_json" | bash "$HOOKS_DIR/$hook_name" 2>/dev/null)
    fi
    
    local actual_decision="allow"
    if [[ -n "$output" ]]; then
        # Check if output is valid JSON
        if ! echo "$output" | jq . >/dev/null 2>&1; then
            echo "FAIL (Invalid JSON output)"
            echo "Output: $output"
            FAIL_COUNT=$((FAIL_COUNT + 1))
            return 1
        fi
        
        actual_decision=$(echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // "allow"')
        
        # Special case for token-scope-guard which warns instead of denies
        if [[ "$hook_name" == "token-scope-guard.sh" ]]; then
            if echo "$output" | jq -e '.hookSpecificOutput.additionalContext' >/dev/null; then
                actual_decision="warn"
            fi
        fi
    fi

    if [[ "$actual_decision" == "$expected_decision" ]]; then
        echo "PASS"
    else
        echo "FAIL (Expected $expected_decision, got $actual_decision)"
        [[ -n "$output" ]] && echo "Output: $output"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
    fi
}

# 1. api-destruct-guard.sh
echo "--- api-destruct-guard.sh ---"
test_hook "api-destruct-guard.sh" "Block curl DELETE" '{"tool_name":"Bash","tool_input":{"command":"curl -X DELETE https://api.railway.app/v1/project"}}' "deny"
test_hook "api-destruct-guard.sh" "Block GraphQL mutation" '{"tool_name":"Bash","tool_input":{"command":"curl -X POST -d \"mutation { volumeDelete(id: 1) }\" https://api.railway.app/graphql"}}' "deny"
test_hook "api-destruct-guard.sh" "Allow safe GET" '{"tool_name":"Bash","tool_input":{"command":"curl https://api.github.com/repos/owner/repo"}}' "allow"
test_hook "api-destruct-guard.sh" "Bypass with flag" '{"tool_name":"Bash","tool_input":{"command":"curl -X DELETE https://api.railway.app/v1/project"}}' "allow" "YAMTAM_PROD_APPROVED" "1"

# 2. token-scope-guard.sh (Warns, doesn't deny)
echo ""
echo "--- token-scope-guard.sh ---"
test_hook "token-scope-guard.sh" "Warn on .env read" '{"tool_name":"Read","tool_input":{"file_path":".env.production"}}' "warn"
test_hook "token-scope-guard.sh" "Warn on grep token" '{"tool_name":"Grep","tool_input":{"pattern":"RAILWAY_TOKEN","path":"."}}' "warn"
test_hook "token-scope-guard.sh" "Allow safe read" '{"tool_name":"Read","tool_input":{"file_path":"README.md"}}' "allow"

# 3. guard-destructive.sh
echo ""
echo "--- guard-destructive.sh ---"
test_hook "guard-destructive.sh" "Block rm -rf" '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' "deny"
test_hook "guard-destructive.sh" "Block git push --force" '{"tool_name":"Bash","tool_input":{"command":"git push origin main --force"}}' "deny"
test_hook "guard-destructive.sh" "Allow ls" '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}' "allow"

# 4. db-protect.sh
echo ""
echo "--- db-protect.sh ---"
test_hook "db-protect.sh" "Block prisma migrate reset" '{"tool_name":"Bash","tool_input":{"command":"npx prisma migrate reset"}}' "deny"
test_hook "db-protect.sh" "Block prod DATABASE_URL" '{"tool_name":"Bash","tool_input":{"command":"export DATABASE_URL=postgres://prod-db"}}' "deny"
test_hook "db-protect.sh" "Allow prisma generate" '{"tool_name":"Bash","tool_input":{"command":"npx prisma generate"}}' "allow"

# 5. truth-gate-guard.sh
# Uses TRUTH_GATE_TEST_TEXT env var to inject text without a real transcript file.
# Expected "warn" means the hook outputs "TRUTH GATE" warning text on stdout.
# Expected "allow" means the hook produces no output (no claim verbs found, or
# evidence/qualifier present).
echo ""
echo "--- truth-gate-guard.sh ---"

test_truth_gate() {
    local test_name=$1
    local text_input=$2
    local expect_warn=$3   # "warn" or "allow"
    local use_bypass=${4:-"no"}  # "bypass" to set YAMTAM_TRUTH_GATE_BYPASS=1

    TOTAL_COUNT=$((TOTAL_COUNT + 1))

    if [[ ! -f "$HOOKS_DIR/truth-gate-guard.sh" ]]; then
        echo "FAIL: Hook file not found: $HOOKS_DIR/truth-gate-guard.sh"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
    fi

    echo -n "Testing truth-gate-guard.sh [$test_name]... "

    local output
    if [[ "$use_bypass" == "bypass" ]]; then
        output=$(TRUTH_GATE_TEST_TEXT="$text_input" YAMTAM_TRUTH_GATE_BYPASS=1 bash "$HOOKS_DIR/truth-gate-guard.sh" <<< '{}' 2>/dev/null || true)
    else
        output=$(TRUTH_GATE_TEST_TEXT="$text_input" bash "$HOOKS_DIR/truth-gate-guard.sh" <<< '{}' 2>/dev/null || true)
    fi

    if [[ "$expect_warn" == "warn" ]]; then
        if echo "$output" | grep -q "TRUTH GATE"; then
            echo "PASS"
        else
            echo "FAIL (Expected TRUTH GATE warning, got: ${output:0:120})"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        fi
    else
        if [[ -z "$output" ]]; then
            echo "PASS"
        else
            echo "FAIL (Expected no output, got: ${output:0:120})"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        fi
    fi
}

test_truth_gate "No claim verbs" \
  "Here is what I found in the codebase." \
  "allow"

test_truth_gate "Claim with git evidence" \
  "The hook is fixed. git status shows: nothing to commit, working tree clean." \
  "allow"

test_truth_gate "Claim with test count evidence" \
  "Build done. 42 tests passed, 0 failed." \
  "allow"

test_truth_gate "Bare claim — no evidence" \
  "The bug is fixed." \
  "warn"

test_truth_gate "Multiple bare claims — no evidence" \
  "Tests passed. Build is clean. Feature deployed." \
  "warn"

test_truth_gate "Qualifier phrasing — reportedly" \
  "Reportedly fixed, no commit found to confirm." \
  "allow"

test_truth_gate "Qualifier phrasing — unverified" \
  "Build status unverified — no recent CI output seen." \
  "allow"

test_truth_gate "Bypass env var suppresses warn" \
  "The feature is done." \
  "allow" \
  "bypass"

# 6. cost-guard.sh
echo ""
echo "--- cost-guard.sh ---"
test_hook "cost-guard.sh" "Block unscoped grep -r ." \
  '{"tool_name":"Bash","tool_input":{"command":"grep -r password ."}}' \
  "deny"
test_hook "cost-guard.sh" "Allow scoped grep" \
  '{"tool_name":"Bash","tool_input":{"command":"grep -r password . --include=\"*.ts\""}}' \
  "allow"
test_hook "cost-guard.sh" "Allow non-Bash tool" \
  '{"tool_name":"Read","tool_input":{"file_path":"README.md"}}' \
  "allow"
test_hook "cost-guard.sh" "Allow safe Bash" \
  '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}' \
  "allow"
test_hook "cost-guard.sh" "Bypass suppresses block" \
  '{"tool_name":"Bash","tool_input":{"command":"grep -r password ."}}' \
  "allow" "YAMTAM_COST_GUARD_BYPASS" "1"

# 7. commit-gate.sh
# Uses COMMIT_GATE_TEST_STAGED env var to inject staged file list (pipe-separated).
echo ""
echo "--- commit-gate.sh ---"

test_commit_gate() {
    local test_name=$1
    local staged_files=$2   # pipe-separated list, empty = no staged files
    local expect=$3         # "warn" or "allow"
    local bypass=${4:-"no"}

    TOTAL_COUNT=$((TOTAL_COUNT + 1))

    if [[ ! -f "$HOOKS_DIR/commit-gate.sh" ]]; then
        echo "FAIL: Hook file not found: $HOOKS_DIR/commit-gate.sh"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
    fi

    echo -n "Testing commit-gate.sh [$test_name]... "

    local input='{"tool_name":"Bash","tool_input":{"command":"git commit -m \"feat: update\""}}'
    local output
    if [[ "$bypass" == "bypass" ]]; then
        output=$(echo "$input" | COMMIT_GATE_TEST_STAGED="$staged_files" YAMTAM_SCOPE_OK=1 \
            bash "$HOOKS_DIR/commit-gate.sh" 2>/dev/null || true)
    else
        output=$(echo "$input" | COMMIT_GATE_TEST_STAGED="$staged_files" \
            bash "$HOOKS_DIR/commit-gate.sh" 2>/dev/null || true)
    fi

    if [[ "$expect" == "warn" ]]; then
        if echo "$output" | jq -e '.hookSpecificOutput.additionalContext' >/dev/null 2>&1; then
            echo "PASS"
        else
            echo "FAIL (Expected additionalContext warn, got: ${output:0:120})"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        fi
    else
        if [[ -z "$output" ]]; then
            echo "PASS"
        else
            echo "FAIL (Expected no output, got: ${output:0:120})"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        fi
    fi
}

test_commit_gate "Warn on app/ staged file" \
    "app/components/Button.tsx" "warn"
test_commit_gate "Warn on db/ staged file" \
    "db/schema.prisma" "warn"
test_commit_gate "Warn on .env staged" \
    ".env.production" "warn"
test_commit_gate "Warn on multiple product files" \
    "app/page.tsx|lib/auth.ts|README.md" "warn"
test_commit_gate "Allow YAMTAM-only staged files" \
    "core/hooks/guard-destructive.sh|ROADMAP.md" "allow"
test_commit_gate "Allow empty staged list" \
    "" "allow"
test_commit_gate "Bypass suppresses warn" \
    "app/components/Button.tsx" "allow" "bypass"

# Override CMD to test non-commit command
TOTAL_COUNT=$((TOTAL_COUNT + 1))
echo -n "Testing commit-gate.sh [Allow non-commit command]... "
_out=$(echo '{"tool_name":"Bash","tool_input":{"command":"git status"}}' \
    | COMMIT_GATE_TEST_STAGED="app/page.tsx" bash "$HOOKS_DIR/commit-gate.sh" 2>/dev/null || true)
if [[ -z "$_out" ]]; then echo "PASS"; else echo "FAIL (got: ${_out:0:80})"; FAIL_COUNT=$((FAIL_COUNT + 1)); fi

# 8. deploy-gate.sh
echo ""
echo "--- deploy-gate.sh ---"
test_hook "deploy-gate.sh" "Block gh workflow run" \
  '{"tool_name":"Bash","tool_input":{"command":"gh workflow run deploy.yml"}}' \
  "deny"
test_hook "deploy-gate.sh" "Block kubectl apply" \
  '{"tool_name":"Bash","tool_input":{"command":"kubectl apply -f k8s/deployment.yaml"}}' \
  "deny"
test_hook "deploy-gate.sh" "Block docker push" \
  '{"tool_name":"Bash","tool_input":{"command":"docker push myapp:latest"}}' \
  "deny"
test_hook "deploy-gate.sh" "Block gcloud run deploy" \
  '{"tool_name":"Bash","tool_input":{"command":"gcloud run deploy myservice --image gcr.io/proj/myapp"}}' \
  "deny"
test_hook "deploy-gate.sh" "Block fly deploy" \
  '{"tool_name":"Bash","tool_input":{"command":"fly deploy"}}' \
  "deny"
test_hook "deploy-gate.sh" "Allow safe Bash" \
  '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}' \
  "allow"
test_hook "deploy-gate.sh" "Allow Read tool" \
  '{"tool_name":"Read","tool_input":{"file_path":"README.md"}}' \
  "allow"
test_hook "deploy-gate.sh" "Bypass suppresses block" \
  '{"tool_name":"Bash","tool_input":{"command":"kubectl apply -f k8s/deployment.yaml"}}' \
  "allow" "YAMTAM_DEPLOY_APPROVED" "1"

# 9. session-trust.sh
echo ""
echo "--- session-trust.sh ---"

test_session_trust() {
    local test_name=$1
    local cmd=$2
    local arg=${3:-""}
    local expect=$4

    TOTAL_COUNT=$((TOTAL_COUNT + 1))
    local script="$HOOKS_DIR/../scripts/session-trust.sh"

    if [[ ! -f "$script" ]]; then
        echo "FAIL: session-trust.sh not found"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        return 1
    fi

    echo -n "Testing session-trust.sh [$test_name]... "

    local tmpdir
    tmpdir=$(mktemp -d)
    local result
    if [[ -n "$arg" ]]; then
        result=$(CLAUDE_PROJECT_DIR="$tmpdir" bash "$script" "$cmd" "$arg" 2>/dev/null || true)
    else
        result=$(CLAUDE_PROJECT_DIR="$tmpdir" bash "$script" "$cmd" 2>/dev/null || true)
    fi
    rm -rf "$tmpdir"

    if [[ "$result" == "$expect" ]]; then
        echo "PASS"
    else
        echo "FAIL (expected '$expect', got '$result')"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

test_session_trust "default score is 100"  "get"        ""   "100"
test_session_trust "decrement 10 → 90"     "decrement"  "10" "90"
test_session_trust "reset → 100"           "reset"      ""   "100"
test_session_trust "floor at 0"            "decrement"  "999" "0"
test_session_trust "show alias"            "show"       ""   "100"

echo ""
echo "=== Summary ==="
echo "Total tests: $TOTAL_COUNT"
echo "Passed: $((TOTAL_COUNT - FAIL_COUNT))"
echo "Failed: $FAIL_COUNT"

if [[ $FAIL_COUNT -gt 0 ]]; then
    echo "Result: FAIL"
    exit 1
else
    echo "Result: PASS"
    exit 0
fi
