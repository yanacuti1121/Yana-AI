#!/usr/bin/env bash
# Yana AI — Auto Feedback Loop (AutoGen-inspired self-correction)
#
# Runs a test command, captures failures, writes structured error context
# to .claude/signals/feedback.pending for the agent to read and fix.
# Loops until pass or max attempts reached.
#
# Usage: bash core/scripts/feedback-loop.sh "<test-cmd>" [max-attempts]
# Example: bash core/scripts/feedback-loop.sh "bash core/tests/skills/test-skill-triggering.sh" 5

set -uo pipefail

TEST_CMD="${1:-npm test}"
MAX_ATTEMPTS="${2:-5}"
SIGNAL_DIR=".claude/signals"
mkdir -p "$SIGNAL_DIR"

# DF-3: Validate TEST_CMD against key destructive patterns before any
# execution. This mirrors safe-run.sh's BLOCKED_PATTERNS — an agent-supplied
# test command string could otherwise chain destructive shell operations.
DANGEROUS_CMD_PATTERNS=(
  "rm -rf" "rm -r " "rm -fr"
  "git push --force" "git push -f "
  "git reset --hard" "git clean -f"
  "dd if=" "mkfs\." "fdisk" "> /dev/"
  "DROP TABLE" "DROP DATABASE" "TRUNCATE TABLE"
  "npm publish"
  "\| bash" "\| sh " "\| python" "\| python3"
  "base64 -d.*\|" "source <[(]" "bash <[(]"
  "LD_PRELOAD=" "LD_LIBRARY_PATH="
  "[{][^}]*rm[^}]*[}]"
)
for _pat in "${DANGEROUS_CMD_PATTERNS[@]}"; do
  if echo "$TEST_CMD" | grep -qiE "$_pat"; then
    echo "[feedback-loop] BLOCKED: TEST_CMD matched dangerous pattern '$_pat': $TEST_CMD" >&2
    exit 1
  fi
done
unset _pat

echo "=== Yana AI Feedback Loop ==="
echo "Command:      $TEST_CMD"
echo "Max attempts: $MAX_ATTEMPTS"
echo ""

attempt=1
while [[ $attempt -le $MAX_ATTEMPTS ]]; do
  echo "--- Attempt $attempt / $MAX_ATTEMPTS ---"

  set +e
  # shell-sanitize-law.md §eval exception: TEST_CMD is a user-supplied test command string;
  # array form cannot be reconstructed from a single positional arg. bash -c spawns a
  # subshell (safer than eval — does not modify current shell env/functions).
  OUTPUT=$(bash -c -- "$TEST_CMD" 2>&1)
  EXIT_CODE=$?
  set -e

  if [[ $EXIT_CODE -eq 0 ]]; then
    echo ""
    echo "✅ PASS on attempt $attempt"
    rm -f "$SIGNAL_DIR/feedback.pending"
    printf '{"status":"pass","attempt":%d,"command":"%s"}\n' "$attempt" "$TEST_CMD" \
      > "$SIGNAL_DIR/feedback.done"
    exit 0
  fi

  echo "❌ FAIL (exit $EXIT_CODE)"

  # Extract FAIL lines for compact error context
  FAIL_LINES=$(echo "$OUTPUT" | grep -E "^(FAIL|ERROR|✗|×)" | head -30 || true)
  TAIL_LINES=$(echo "$OUTPUT" | tail -30)

  # Write structured feedback for the agent
  python3 -c "
import json, sys
data = {
  'status': 'fail',
  'attempt': $attempt,
  'max_attempts': $MAX_ATTEMPTS,
  'test_command': sys.argv[1],
  'fail_lines': sys.argv[2],
  'tail_output': sys.argv[3],
  'instruction': 'Read fail_lines and tail_output. Fix the implementation so tests pass. Do NOT modify test assertions — fix the source files. Then write {} to .claude/signals/fix.applied'
}
print(json.dumps(data, indent=2))
" "$TEST_CMD" "$FAIL_LINES" "$TAIL_LINES" > "$SIGNAL_DIR/feedback.pending"

  echo "Feedback written to $SIGNAL_DIR/feedback.pending"
  echo ""
  echo "Waiting for fix signal at $SIGNAL_DIR/fix.applied ..."

  rm -f "$SIGNAL_DIR/fix.applied"
  until [[ -f "$SIGNAL_DIR/fix.applied" ]]; do sleep 2; done
  rm -f "$SIGNAL_DIR/fix.applied"

  echo "Fix applied — retrying..."
  echo ""
  attempt=$((attempt + 1))
done

echo ""
echo "💥 MAX ATTEMPTS ($MAX_ATTEMPTS) REACHED — tests still failing"
printf '{"status":"exhausted","attempts":%d,"command":"%s"}\n' "$MAX_ATTEMPTS" "$TEST_CMD" \
  > "$SIGNAL_DIR/feedback.done"
rm -f "$SIGNAL_DIR/feedback.pending"
exit 1
