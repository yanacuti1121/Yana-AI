#!/usr/bin/env bash
# YAMTAM ENGINE — Auto Feedback Loop (AutoGen-inspired self-correction)
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

echo "=== YAMTAM Feedback Loop ==="
echo "Command:      $TEST_CMD"
echo "Max attempts: $MAX_ATTEMPTS"
echo ""

attempt=1
while [[ $attempt -le $MAX_ATTEMPTS ]]; do
  echo "--- Attempt $attempt / $MAX_ATTEMPTS ---"

  set +e
  OUTPUT=$(eval "$TEST_CMD" 2>&1)
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
