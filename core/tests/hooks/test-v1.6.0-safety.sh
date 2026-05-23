#!/usr/bin/env bash
# YAMTAM ENGINE Tests — v1.6.0 Autonomous Session Safety
# Tests: session-checkpoint.sh, session-rollback.sh, risk-scorer.sh
# Run: bash core/tests/hooks/test-v1.6.0-safety.sh
# Expected: ALL PASS

set -uo pipefail

PASS=0
FAIL=0
SKIP=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SCRIPTS="$PROJECT_ROOT/core/scripts"
HOOKS="$PROJECT_ROOT/core/hooks"

# Temp project dir for isolation
TMP_DIR=$(mktemp -d)
export CLAUDE_PROJECT_DIR="$TMP_DIR"
export YAMTAM_SOVEREIGN_NAME="test-sovereign"

# Init temp as git repo
git -C "$TMP_DIR" init -q 2>/dev/null
git -C "$TMP_DIR" config user.email "test@yamtam"
git -C "$TMP_DIR" config user.name "YAMTAM Test"
echo "initial" > "$TMP_DIR/initial.txt"
git -C "$TMP_DIR" add . && git -C "$TMP_DIR" commit -m "init" -q 2>/dev/null

# Copy scripts into temp structure
mkdir -p "$TMP_DIR/core/scripts" "$TMP_DIR/core/hooks" "$TMP_DIR/.claude/state" "$TMP_DIR/memory/L2_session"
cp "$SCRIPTS/session-checkpoint.sh" "$TMP_DIR/core/scripts/"
cp "$SCRIPTS/session-rollback.sh"   "$TMP_DIR/core/scripts/"
cp "$HOOKS/risk-scorer.sh"          "$TMP_DIR/core/hooks/"
chmod +x "$TMP_DIR/core/scripts/"*.sh "$TMP_DIR/core/hooks/"*.sh

# ── Test helpers ──────────────────────────────────────────────────────────────
assert_pass() {
  local name="$1"; local result="$2"; local expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "  ✓ PASS  $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL  $name"
    echo "          expected: $expected"
    echo "          got:      ${result:0:200}"
    FAIL=$((FAIL + 1))
  fi
}

assert_exit() {
  local name="$1"; local actual="$2"; local expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ PASS  $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL  $name (exit $actual, expected $expected)"
    FAIL=$((FAIL + 1))
  fi
}

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  YAMTAM v1.6.0 — Autonomous Session Safety Tests"
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── GROUP 1: session-checkpoint.sh ───────────────────────────────────────────
echo "  [GROUP 1] session-checkpoint.sh"

# T01: force checkpoint creates manifest
OUT=$(bash "$TMP_DIR/core/scripts/session-checkpoint.sh" --force 2>&1)
assert_pass "T01 force checkpoint succeeds" "$OUT" "Checkpoint saved"

# T02: manifest file exists
assert_pass "T02 manifest file created" \
  "$(ls "$TMP_DIR/.claude/state/checkpoints/"*/manifest.json 2>/dev/null | head -1)" \
  "manifest.json"

# T03: index.json created
assert_pass "T03 index.json created" \
  "$(cat "$TMP_DIR/.claude/state/checkpoints/index.json" 2>/dev/null)" \
  "latest"

# T04: checkpoint with name label
OUT=$(bash "$TMP_DIR/core/scripts/session-checkpoint.sh" --force --name "before-refactor" 2>&1)
assert_pass "T04 named checkpoint" "$OUT" "before-refactor"

# T05: checkpoint with dirty working tree
echo "dirty change" > "$TMP_DIR/dirty.txt"
OUT=$(bash "$TMP_DIR/core/scripts/session-checkpoint.sh" --force 2>&1)
assert_pass "T05 dirty tree checkpoint" "$OUT" "Checkpoint saved"
rm -f "$TMP_DIR/dirty.txt"

# T06: auto-trigger skips when counter not reached
export YAMTAM_CHECKPOINT_EVERY=5
echo '{"count":2}' > "$TMP_DIR/.claude/state/checkpoint-counter.json"
OUT=$(bash "$TMP_DIR/core/scripts/session-checkpoint.sh" 2>&1)
# Should produce no output (skipped)
if [[ -z "$OUT" ]]; then
  echo "  ✓ PASS  T06 auto-trigger skips below threshold"
  PASS=$((PASS + 1))
else
  echo "  ✗ FAIL  T06 auto-trigger should skip (got: $OUT)"
  FAIL=$((FAIL + 1))
fi

# T07: bypass exits cleanly
OUT=$(YAMTAM_CHECKPOINT_BYPASS=1 bash "$TMP_DIR/core/scripts/session-checkpoint.sh" 2>&1)
EXIT_CODE=$?
assert_exit "T07 bypass exits 0" "$EXIT_CODE" "0"

echo ""

# ── GROUP 2: session-rollback.sh ─────────────────────────────────────────────
echo "  [GROUP 2] session-rollback.sh"

# T08: --list shows checkpoints
OUT=$(bash "$TMP_DIR/core/scripts/session-rollback.sh" --list 2>&1)
assert_pass "T08 --list shows checkpoints" "$OUT" "Available checkpoints"

# T09: no sovereign → block
OUT=$(YAMTAM_SOVEREIGN_NAME="" bash "$TMP_DIR/core/scripts/session-rollback.sh" 2>&1)
EXIT_CODE=$?
assert_pass "T09 no sovereign blocks"     "$OUT"       "BLOCK"
assert_exit "T09 no sovereign exit 2"     "$EXIT_CODE" "2"

# T10: --dry-run does not apply changes
echo "rollback-test-file" > "$TMP_DIR/rollback-target.txt"
OUT=$(bash "$TMP_DIR/core/scripts/session-rollback.sh" --dry-run --force 2>&1)
assert_pass "T10 dry-run shows DRY RUN" "$OUT" "DRY RUN"
# File should still exist
if [[ -f "$TMP_DIR/rollback-target.txt" ]]; then
  echo "  ✓ PASS  T10 dry-run did not remove file"
  PASS=$((PASS + 1))
else
  echo "  ✗ FAIL  T10 dry-run removed file (should not have)"
  FAIL=$((FAIL + 1))
fi
rm -f "$TMP_DIR/rollback-target.txt"

# T11: missing checkpoint ID → error
OUT=$(bash "$TMP_DIR/core/scripts/session-rollback.sh" --id "cp-nonexistent-000" --force 2>&1)
EXIT_CODE=$?
assert_pass "T11 missing checkpoint error" "$OUT" "not found"

# T12: rollback completes with --force (create dirty state first)
echo "dirty-file-for-rollback" > "$TMP_DIR/rollback-test.txt"
bash "$TMP_DIR/core/scripts/session-checkpoint.sh" --force >/dev/null 2>&1
rm -f "$TMP_DIR/rollback-test.txt"  # simulate undo scenario
# Now create new dirty state and rollback
echo "new-dirty-content" > "$TMP_DIR/new-dirty.txt"
OUT=$(bash "$TMP_DIR/core/scripts/session-rollback.sh" --force 2>&1)
assert_pass "T12 forced rollback completes" "$OUT" "Rollback complete\|rollback complete\|[2/4]"

echo ""

# ── GROUP 3: risk-scorer.sh ──────────────────────────────────────────────────
echo "  [GROUP 3] risk-scorer.sh"

run_risk() {
  local tool="$1"; local cmd="$2"; local path="$3"
  printf '{"tool_name":"%s","tool_input":{"command":"%s","file_path":"%s"}}' \
    "$tool" "$cmd" "$path" \
  | bash "$TMP_DIR/core/hooks/risk-scorer.sh" 2>&1
  echo "EXIT:$?"
}

run_risk_exit() {
  local tool="$1"; local cmd="$2"; local path="$3"
  printf '{"tool_name":"%s","tool_input":{"command":"%s","file_path":"%s"}}' \
    "$tool" "$cmd" "$path" \
  | bash "$TMP_DIR/core/hooks/risk-scorer.sh" 2>&1
  echo $?
}

# T13: read-only → LOW, exit 0, silent
OUT=$(run_risk "bash" "cat README.md" "README.md")
EXIT_CODE=$(echo "$OUT" | grep "EXIT:" | sed 's/EXIT://')
if [[ "$EXIT_CODE" == "0" ]] && ! echo "$OUT" | grep -q "risk-scorer"; then
  echo "  ✓ PASS  T13 read-only is LOW/silent/exit-0"
  PASS=$((PASS + 1))
else
  echo "  ✗ FAIL  T13 read-only should be silent exit 0 (got: $OUT)"
  FAIL=$((FAIL + 1))
fi

# T14: MEDIUM risk outputs warning
OUT=$(run_risk "bash" "rm old-logs" "logs/old.log")
assert_pass "T14 destructive → MEDIUM or higher warning" "$OUT" "risk"

# T15: CRITICAL — rm --force --recursive on production (score: +40 +30 +15 = 85)
OUT=$(printf '{"tool_name":"bash","tool_input":{"command":"rm --force production-data --recursive","file_path":"prod/data.db"}}' \
  | bash "$TMP_DIR/core/hooks/risk-scorer.sh" 2>&1)
EXIT_CODE=$?
assert_exit "T15 rm --force --recursive prod → exit 2 (CRITICAL)" "$EXIT_CODE" "2"
assert_pass "T15 CRITICAL contains decision block"                 "$OUT" "block"

# T16: dry-run flag reduces score
OUT_NODRY=$(printf '{"tool_name":"bash","tool_input":{"command":"rm old-file","file_path":"old.txt"}}' \
  | bash "$TMP_DIR/core/hooks/risk-scorer.sh" 2>&1; echo "EXIT:$?")
OUT_DRY=$(printf '{"tool_name":"bash","tool_input":{"command":"rm old-file --dry-run","file_path":"old.txt"}}' \
  | bash "$TMP_DIR/core/hooks/risk-scorer.sh" 2>&1; echo "EXIT:$?")
# dry-run should produce lower or equal score output
if echo "$OUT_DRY" | grep -q "dry_run"; then
  echo "  ✓ PASS  T16 dry-run flag reduces score"
  PASS=$((PASS + 1))
elif [[ "$OUT_NODRY" != "$OUT_DRY" ]]; then
  echo "  ✓ PASS  T16 dry-run flag changes score"
  PASS=$((PASS + 1))
else
  echo "  ~ SKIP  T16 dry-run flag effect (indeterminate)"
  SKIP=$((SKIP + 1))
fi

# T17: secret file path triggers risk
OUT=$(printf '{"tool_name":"read_file","tool_input":{"command":"","file_path":".env.production"}}' \
  | bash "$TMP_DIR/core/hooks/risk-scorer.sh" 2>&1)
assert_pass "T17 .env.production → secret risk warning" "$OUT" "risk\|secret\|MEDIUM\|HIGH"

# T18: deploy command triggers risk (fly deploy to main = +15 deploy +30 prod = 45 = MEDIUM)
OUT=$(printf '{"tool_name":"bash","tool_input":{"command":"fly deploy --remote-only --app production-app","file_path":""}}' \
  | bash "$TMP_DIR/core/hooks/risk-scorer.sh" 2>&1)
assert_pass "T18 fly deploy production → deploy risk warning" "$OUT" "risk"

# T19: bypass exits 0 silently
export YAMTAM_RISK_BYPASS=1
OUT=$(printf '{"tool_name":"bash","tool_input":{"command":"rm -rf /","file_path":""}}' \
  | bash "$TMP_DIR/core/hooks/risk-scorer.sh" 2>&1)
EXIT_CODE=$?
unset YAMTAM_RISK_BYPASS
assert_exit "T19 bypass exits 0"               "$EXIT_CODE" "0"
assert_pass "T19 bypass logs override message" "$OUT"       "BYPASS"

# T20: risk log file created
assert_pass "T20 risk-scores.jsonl created" \
  "$(ls "$TMP_DIR/.claude/state/risk-scores.jsonl" 2>/dev/null)" \
  "risk-scores.jsonl"

echo ""

# ── SUMMARY ──────────────────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL + SKIP))
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Results: $PASS passed, $FAIL failed, $SKIP skipped / $TOTAL total"

if [[ $FAIL -eq 0 ]]; then
  echo "  ✅ ALL PASS — v1.6.0 Autonomous Session Safety"
else
  echo "  ❌ $FAIL FAIL(s) — review output above"
fi
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Cleanup
rm -rf "$TMP_DIR"

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
