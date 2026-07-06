#!/usr/bin/env bash
# Yana AI: multi-agent-launch.sh test suite
# Exercises cmd_status's 5-state classification (working/blocked/done/failed/
# killed) added 2026-07-06, plus the exit-code-capturing spawn wrapper and its
# signal-forwarding fix. Supports running from any directory.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TARGET="$ROOT_DIR/core/scripts/multi-agent-launch.sh"

PASS=0
FAIL=0

_TEMP_PATHS=()
register_temp() { _TEMP_PATHS+=("$1"); }
_cleanup_temps() {
    local p
    for p in "${_TEMP_PATHS[@]:-}"; do
        [[ -n "$p" ]] && rm -rf "$p"
    done
}
trap _cleanup_temps EXIT

assert_contains() {
    local desc="$1" haystack="$2" needle="$3"
    if [[ "$haystack" == *"$needle"* ]]; then
        echo "PASS: $desc"
        ((PASS++))
    else
        echo "FAIL: $desc (expected to find '$needle')"
        ((FAIL++))
    fi
}

echo "=== multi-agent-launch.sh: syntax check ==="
if bash -n "$TARGET"; then
    echo "PASS: bash -n syntax check"
    ((PASS++))
else
    echo "FAIL: bash -n syntax check"
    ((FAIL++))
fi

echo ""
echo "=== multi-agent-launch.sh: cmd_status 5-state classification ==="

STATE_DIR="$(mktemp -d)"; register_temp "$STATE_DIR"
LOG_DIR="$(mktemp -d)"; register_temp "$LOG_DIR"
export YANA_AGENT_STATE="$STATE_DIR"
export YANA_AGENT_LOGS="$LOG_DIR"
export YANA_AGENT_STALE_SECONDS=1

FUNCS_FILE="$(mktemp)"; register_temp "$FUNCS_FILE"
sed '/^# ─── Router/,$d' "$TARGET" > "$FUNCS_FILE"

OUTPUT="$(bash -c '
source "'"$FUNCS_FILE"'"
init_dirs

# working: keeps writing to its log for longer than the check delay below
( for i in $(seq 1 20); do echo "tick $i" >> "'"$LOG_DIR"'/fresh.log"; sleep 0.5; done ) &
reg_set fresh pid "$!"; reg_set fresh status running; reg_set fresh started "$(ts)"

# blocked: writes once, then goes quiet past the stale threshold while alive
( echo "one line" >> "'"$LOG_DIR"'/stale.log"; sleep 8 ) &
reg_set stale pid "$!"; reg_set stale status running; reg_set stale started "$(ts)"

# done: exits 0 through the same wrapper spawn_agent uses
(
  trap "kill -TERM \"\$child_pid\" 2>/dev/null" TERM
  ( exit 0 ) &
  child_pid=$!
  wait "$child_pid"
  echo $? > "$EXIT_DIR/ok.exit"
) &
reg_set ok pid "$!"; reg_set ok status running; reg_set ok started "$(ts)"

# failed: exits non-zero through the same wrapper
(
  trap "kill -TERM \"\$child_pid\" 2>/dev/null" TERM
  ( exit 1 ) &
  child_pid=$!
  wait "$child_pid"
  echo $? > "$EXIT_DIR/bad.exit"
) &
reg_set bad pid "$!"; reg_set bad status running; reg_set bad started "$(ts)"

sleep 4
cmd_status
' 2>&1)"

# Strip ANSI color codes before substring matching
PLAIN_OUTPUT="$(printf '%s' "$OUTPUT" | sed -E 's/\x1b\[[0-9;]*m//g')"

assert_contains "fresh shows working (log still updating)" "$PLAIN_OUTPUT" "fresh                  working"
assert_contains "stale shows blocked (log idle past threshold, still alive)" "$PLAIN_OUTPUT" "stale                  blocked"
assert_contains "ok shows done (exit 0)" "$PLAIN_OUTPUT" "ok                     done"
assert_contains "bad shows failed (exit 1)" "$PLAIN_OUTPUT" "bad                    failed"
assert_contains "Failed counter is no longer a dead 0" "$PLAIN_OUTPUT" "Failed: 1"

echo ""
echo "=== multi-agent-launch.sh: kill signal reaches the real child, not just the wrapper ==="

STATE_DIR2="$(mktemp -d)"; register_temp "$STATE_DIR2"
LOG_DIR2="$(mktemp -d)"; register_temp "$LOG_DIR2"
CHILD_PID_FILE="$(mktemp)"; register_temp "$CHILD_PID_FILE"

bash -c '
export YANA_AGENT_STATE="'"$STATE_DIR2"'"
export YANA_AGENT_LOGS="'"$LOG_DIR2"'"
source "'"$FUNCS_FILE"'"
init_dirs
(
  trap "kill -TERM \"\$child_pid\" 2>/dev/null" TERM
  ( echo start >> "'"$LOG_DIR2"'/longrun.log"; sleep 30; echo "SHOULD_NOT_APPEAR" >> "'"$LOG_DIR2"'/longrun.log" ) &
  child_pid=$!
  echo "$child_pid" > "'"$CHILD_PID_FILE"'"
  wait "$child_pid"
) &
wrapper_pid=$!
echo "$wrapper_pid" > "'"$STATE_DIR2"'/wrapper.pid"
sleep 1
kill -TERM "$wrapper_pid" 2>/dev/null
sleep 1
'

CHILD_PID="$(cat "$CHILD_PID_FILE" 2>/dev/null || echo "")"
WRAPPER_PID="$(cat "$STATE_DIR2/wrapper.pid" 2>/dev/null || echo "")"

if [[ -n "$CHILD_PID" ]] && ! kill -0 "$CHILD_PID" 2>/dev/null; then
    echo "PASS: real child process was terminated when the wrapper PID received SIGTERM"
    ((PASS++))
else
    echo "FAIL: real child process is still alive after killing the wrapper, kill switch regressed"
    ((FAIL++))
fi

if [[ -n "$WRAPPER_PID" ]] && ! kill -0 "$WRAPPER_PID" 2>/dev/null; then
    echo "PASS: wrapper process itself exited"
    ((PASS++))
else
    echo "FAIL: wrapper process still alive"
    ((FAIL++))
fi

if ! grep -q "SHOULD_NOT_APPEAR" "$LOG_DIR2/longrun.log" 2>/dev/null; then
    echo "PASS: killed process did not continue running past the kill point"
    ((PASS++))
else
    echo "FAIL: killed process kept running after SIGTERM (orphaned)"
    ((FAIL++))
fi

echo ""
echo "=== multi-agent-launch.sh: SIGKILL leaves 'unknown', not silently 'done' ==="
# Regression for a real finding from the 2026-07-06 security review: a
# process killed before it can write its own exit file (SIGKILL, matching
# this repo's own resource-quota-law.md OOM policy) used to fall through
# to the "no exit file" branch, which defaulted to reporting a clean "done".

STATE_DIR3="$(mktemp -d)"; register_temp "$STATE_DIR3"
LOG_DIR3="$(mktemp -d)"; register_temp "$LOG_DIR3"

SIGKILL_OUTPUT="$(bash -c '
source "'"$FUNCS_FILE"'"
export YANA_AGENT_STATE="'"$STATE_DIR3"'"
export YANA_AGENT_LOGS="'"$LOG_DIR3"'"
init_dirs
name="victim"
rm -f "$EXIT_DIR/${name}.exit"
(
  trap "kill -TERM \"\$child_pid\" 2>/dev/null" TERM
  ( sleep 30 ) &
  child_pid=$!
  wait "$child_pid"
  echo $? > "$EXIT_DIR/${name}.exit"
) &
reg_set "$name" pid "$!"; reg_set "$name" status running; reg_set "$name" started "$(ts)"
sleep 1
kill -KILL "$(reg_get "$name" pid)" 2>/dev/null
sleep 1
cmd_status
' 2>&1)"

SIGKILL_PLAIN="$(printf '%s' "$SIGKILL_OUTPUT" | sed -E 's/\x1b\[[0-9;]*m//g')"
assert_contains "SIGKILLed agent shows unknown, not a false done" "$SIGKILL_PLAIN" "victim                 unknown"

echo ""
echo "=== multi-agent-launch.sh: eval-injection via a crafted task is rejected ==="
# Regression for a real, reproduced RCE from the 2026-07-06 security review:
# a task containing a single quote used to escape the eval'd command string
# and execute arbitrary shell commands.

MARKER_FILE="$(mktemp -u)"; register_temp "$MARKER_FILE"
STATE_DIR4="$(mktemp -d)"; register_temp "$STATE_DIR4"
LOG_DIR4="$(mktemp -d)"; register_temp "$LOG_DIR4"

YANA_AGENT_STATE="$STATE_DIR4" YANA_AGENT_LOGS="$LOG_DIR4" \
  bash "$TARGET" start --agents "safeName:harmless'; touch $MARKER_FILE; echo '" --concurrency 1 >/dev/null 2>&1
sleep 1

if [[ ! -f "$MARKER_FILE" ]]; then
    echo "PASS: single quote in task did not escape the eval'd command"
    ((PASS++))
else
    echo "FAIL: task injection executed an arbitrary command"
    ((FAIL++))
fi

echo ""
echo "=== multi-agent-launch.sh: path traversal via a crafted agent name is rejected ==="
# Regression for a real, reproduced path-traversal finding: an agent name
# like "../escaped" used to write its log/pid/exit files one directory
# above the intended state/log directories.

STATE_DIR5="$(mktemp -d)"; register_temp "$STATE_DIR5"
LOG_DIR5="$(mktemp -d)"; register_temp "$LOG_DIR5"

YANA_AGENT_STATE="$STATE_DIR5" YANA_AGENT_LOGS="$LOG_DIR5" \
  bash "$TARGET" start --agents "../escaped:harmless" --concurrency 1 >/dev/null 2>&1

if [[ ! -f "$(dirname "$LOG_DIR5")/escaped.log" && ! -f "$(dirname "$STATE_DIR5")/escaped.pid" ]]; then
    echo "PASS: '../escaped' agent name did not write outside its state/log directories"
    ((PASS++))
else
    echo "FAIL: path traversal via agent name wrote a file outside the intended directory"
    ((FAIL++))
fi

echo ""
echo "=== multi-agent-launch.sh: backtick/\$() in task no longer survives the double-eval through safe-run.sh ==="
# Regression for a real, reproduced RCE found in a follow-up review of the
# quote-escaping fix above: the escaping protected the first eval inside
# spawn_agent, but the fallback command routed through safe-run.sh, which
# does its own COMMAND="$*"; eval "$COMMAND" internally, a second,
# independent re-tokenization the first escaping could not survive.
# Fixed by switching spawn_agent to array-based invocation (no eval at
# all) and dropping safe-run.sh from this fallback path entirely.

MARKER_BACKTICK="$(mktemp -u)"; register_temp "$MARKER_BACKTICK"
STATE_DIR6="$(mktemp -d)"; register_temp "$STATE_DIR6"
LOG_DIR6="$(mktemp -d)"; register_temp "$LOG_DIR6"

YANA_AGENT_STATE="$STATE_DIR6" YANA_AGENT_LOGS="$LOG_DIR6" \
  bash "$TARGET" start --agents "n1:harmless \`touch $MARKER_BACKTICK\`" --concurrency 1 >/dev/null 2>&1
sleep 1

if [[ ! -f "$MARKER_BACKTICK" ]]; then
    echo "PASS: backtick command substitution in task did not execute"
    ((PASS++))
else
    echo "FAIL: backtick injection executed an arbitrary command"
    ((FAIL++))
fi

MARKER_DOLLAR="$(mktemp -u)"; register_temp "$MARKER_DOLLAR"
STATE_DIR7="$(mktemp -d)"; register_temp "$STATE_DIR7"
LOG_DIR7="$(mktemp -d)"; register_temp "$LOG_DIR7"

YANA_AGENT_STATE="$STATE_DIR7" YANA_AGENT_LOGS="$LOG_DIR7" \
  bash "$TARGET" start --agents "n2:harmless \$(touch $MARKER_DOLLAR)" --concurrency 1 >/dev/null 2>&1
sleep 1

if [[ ! -f "$MARKER_DOLLAR" ]]; then
    echo "PASS: \$(...) command substitution in task did not execute"
    ((PASS++))
else
    echo "FAIL: \$(...) injection executed an arbitrary command"
    ((FAIL++))
fi

echo ""
echo "=== multi-agent-launch.sh: reg_set no longer breaks out of its Python string literal ==="
# Regression for a real, reproduced RCE: task_escaped only protected the
# command string built for execution; the same raw, unescaped task was
# separately written to the registry via reg_set, which used to
# string-interpolate name/field/val directly into a python3 -c program.
# A single quote in task closed the Python string literal early, and
# arbitrary Python (os.system, etc.) ran after it. Fixed by passing
# name/field/val through sys.argv instead of interpolating into source.

MARKER_PY="$(mktemp -u)"; register_temp "$MARKER_PY"
STATE_DIR8="$(mktemp -d)"; register_temp "$STATE_DIR8"
LOG_DIR8="$(mktemp -d)"; register_temp "$LOG_DIR8"

YANA_AGENT_STATE="$STATE_DIR8" YANA_AGENT_LOGS="$LOG_DIR8" \
  bash "$TARGET" start --agents "n3:foo'; import os; os.system('touch $MARKER_PY'); junk='bar" --concurrency 1 >/dev/null 2>&1
sleep 1

if [[ ! -f "$MARKER_PY" ]]; then
    echo "PASS: single quote in task did not break out of reg_set's Python string literal"
    ((PASS++))
else
    echo "FAIL: reg_set Python-string-literal breakout executed an arbitrary command"
    ((FAIL++))
fi

echo ""
echo "=== multi-agent-launch.sh: 'log' rejects a path-traversal agent name ==="
# Regression for a real, reproduced arbitrary-file-read found in a
# follow-up review: cmd_log built $LOG_DIR/${name}.log without validating
# name at all (unlike cmd_start), so a crafted name could read any file on
# disk ending in ".log" straight to stdout, with no registry entry needed.

SECRET_DIR="$(mktemp -d)"; register_temp "$SECRET_DIR"
echo "SECRET_CONTENT_XYZ" > "$SECRET_DIR/target.log"
TRAVERSAL_NAME="../../../../../../../../../..${SECRET_DIR}/target"

LOG_OUTPUT="$(bash "$TARGET" log "$TRAVERSAL_NAME" 2>&1)"
if [[ "$LOG_OUTPUT" != *"SECRET_CONTENT_XYZ"* ]]; then
    echo "PASS: 'log' did not disclose a file outside LOG_DIR via traversal"
    ((PASS++))
else
    echo "FAIL: 'log' disclosed an arbitrary file's contents via a traversal name"
    ((FAIL++))
fi

echo ""
echo "=== multi-agent-launch.sh: 'kill' rejects an invalid target name ==="
# Defense-in-depth regression: kill's target also builds a file path
# ($PID_DIR/${target}.pid) without validation before this fix.

KILL_OUTPUT="$(bash "$TARGET" kill "../../../etc/whatever" 2>&1)"
KILL_EXIT=$?
if [[ "$KILL_OUTPUT" == *"REJECT"* || "$KILL_OUTPUT" == *"không hợp lệ"* ]]; then
    echo "PASS: 'kill' rejected an invalid, path-traversal-shaped target"
    ((PASS++))
else
    echo "FAIL: 'kill' accepted a path-traversal-shaped target without rejecting it"
    ((FAIL++))
fi

echo ""
echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
if [[ $FAIL -eq 0 ]]; then
    echo "Result: PASS"
    exit 0
else
    echo "Result: FAIL"
    exit 1
fi
