#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT" || exit 1
RUST_CLI="$REPO_ROOT/target/debug/flock_lock_prototype_cli"
PY_HELPER="$REPO_ROOT/core/lib/py/flock_run.py"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/yana-flock-proto.XXXXXX")"
export CLAUDE_PROJECT_DIR="$TMP_ROOT"

cleanup() {
  [[ -d "$TMP_ROOT" ]] && rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

cargo build --quiet --bin flock_lock_prototype_cli --features flock-lock-prototype || exit 1
[[ -x "$RUST_CLI" ]] || { echo "FAIL: prototype CLI was not built" >&2; exit 1; }
source "$REPO_ROOT/core/lib/flock_lock_prototype.sh"

PASS_COUNT=0
FAIL_COUNT=0
pass() { printf 'PASS: %s\n' "$1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { printf 'FAIL: %s\n' "$1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
now_ns() { python3 -c 'import time; print(time.clock_gettime_ns(time.CLOCK_MONOTONIC))'; }

resolved_lock_file() {
  local resource="$1" lock_name
  lock_name=$(_yana_flock_proto_name_for "$resource") || return 1
  printf '%s/.claude/state/locks/%s.lock\n' "$TMP_ROOT" "$lock_name"
}

run_python() {
  local resource="$1" timeout="$2" lock_file
  shift 2
  [[ "${1:-}" == "--" ]] && shift
  lock_file=$(resolved_lock_file "$resource") || return 2
  mkdir -p "$(dirname "$lock_file")"
  python3 "$PY_HELPER" --lock-file "$lock_file" --timeout "$timeout" -- "$@"
}

run_rust() {
  local resource="$1" timeout="$2"
  shift 2
  [[ "${1:-}" == "--" ]] && shift
  CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUST_CLI" --resource "$resource" --timeout "$timeout" -- "$@"
}

run_bash_helper() {
  local resource="$1" timeout="$2"
  shift 2
  [[ "${1:-}" == "--" ]] && shift
  CLAUDE_PROJECT_DIR="$TMP_ROOT" flock_lock_with "$resource" "$timeout" -- "$@"
}

wait_ready() {
  local ready_file="$1"
  for _ in $(seq 1 100); do
    [[ -f "$ready_file" ]] && return 0
    sleep 0.02
  done
  return 1
}

no_overlap_test() {
  local label="$1" holder_runner="$2" contender_runner="$3" resource="$4"
  local log="$TMP_ROOT/${resource}.log"
  local ready="$TMP_ROOT/${resource}.ready"
  : > "$log"
  "$holder_runner" "$resource" 5 -- bash -c 'touch "$2"; echo "HOLDER_ENTER $(python3 -c "import time; print(time.clock_gettime_ns(time.CLOCK_MONOTONIC))")" >> "$1"; sleep 1; echo "HOLDER_EXIT $(python3 -c "import time; print(time.clock_gettime_ns(time.CLOCK_MONOTONIC))")" >> "$1"' _ "$log" "$ready" &
  local holder_pid=$!
  if ! wait_ready "$ready"; then
    fail "$label: holder did not acquire"
    kill -KILL "$holder_pid" 2>/dev/null || true
    wait "$holder_pid" 2>/dev/null || true
    return
  fi
  "$contender_runner" "$resource" 5 -- bash -c 'echo "CONTENDER_ENTER $(python3 -c "import time; print(time.clock_gettime_ns(time.CLOCK_MONOTONIC))")" >> "$1"' _ "$log" &
  local contender_pid=$!
  wait "$holder_pid"
  wait "$contender_pid"
  local holder_exit contender_enter
  holder_exit=$(awk '/^HOLDER_EXIT/ { print $2 }' "$log")
  contender_enter=$(awk '/^CONTENDER_ENTER/ { print $2 }' "$log")
  if [[ -n "$holder_exit" && -n "$contender_enter" ]] && (( contender_enter > holder_exit )); then
    pass "$label"
  else
    fail "$label: holder_exit='$holder_exit' contender_enter='$contender_enter'"
  fi
}

echo '=== mutual exclusion ==='
no_overlap_test python-vs-python run_python run_python "py-py-$$"
no_overlap_test rust-vs-rust run_rust run_rust "rust-rust-$$"
no_overlap_test python-vs-rust run_python run_rust "py-rust-$$"
no_overlap_test rust-vs-python run_rust run_python "rust-py-$$"
no_overlap_test bash-vs-rust run_bash_helper run_rust "bash-rust-$$"
no_overlap_test bash-vs-python run_bash_helper run_python "bash-py-$$"

echo '=== stable inode ==='
INODE_RESOURCE="inode-$$"
run_rust "$INODE_RESOURCE" 5 -- true
INODE_PATH=$(resolved_lock_file "$INODE_RESOURCE")
INODE_BEFORE=$(stat -f '%i' "$INODE_PATH" 2>/dev/null || stat -c '%i' "$INODE_PATH" 2>/dev/null)
for _ in $(seq 1 10); do
  run_python "$INODE_RESOURCE" 5 -- true
  run_rust "$INODE_RESOURCE" 5 -- true
done
INODE_AFTER=$(stat -f '%i' "$INODE_PATH" 2>/dev/null || stat -c '%i' "$INODE_PATH" 2>/dev/null)
[[ "$INODE_BEFORE" == "$INODE_AFTER" ]] && pass "stable inode ($INODE_BEFORE)" || fail "stable inode changed"

echo '=== timeout ==='
TIMEOUT_RESOURCE="timeout-$$"
run_python "$TIMEOUT_RESOURCE" 5 -- bash -c 'touch "$1"; sleep 2' _ "$TMP_ROOT/timeout-ready" &
TIMEOUT_HOLDER=$!
if wait_ready "$TMP_ROOT/timeout-ready"; then
  TIMEOUT_LOG="$TMP_ROOT/timeout-entered"
  started=$(now_ns)
  run_rust "$TIMEOUT_RESOURCE" 0.3 -- bash -c 'touch "$1"' _ "$TIMEOUT_LOG"
  timeout_exit=$?
  elapsed_ms=$(( ($(now_ns) - started) / 1000000 ))
  [[ "$timeout_exit" -eq 2 && ! -e "$TIMEOUT_LOG" && "$elapsed_ms" -ge 250 ]] && pass "timeout fails closed" || fail "timeout exit=$timeout_exit elapsed=${elapsed_ms}ms"
else
  fail 'timeout holder did not become ready'
fi
wait "$TIMEOUT_HOLDER"
for invalid_timeout in nan inf -1; do
  run_python "invalid-timeout-${invalid_timeout}-$$" "$invalid_timeout" -- true >/dev/null 2>&1
  [[ $? -eq 2 ]] && pass "python rejects timeout $invalid_timeout" || fail "python accepted timeout $invalid_timeout"
done

start_exec_target() {
  local kind="$1" resource="$2" state_dir="$3" mode="$4"
  local target=$'import os, signal, sys, time\nstate, mode = sys.argv[1:]\nopen(state + "/target.pid", "w").write(str(os.getpid()))\nopen(state + "/ready", "w").close()\nif mode == "TERM":\n    signal.signal(signal.SIGTERM, lambda *_: sys.exit(42))\nwhile True:\n    time.sleep(1)'
  if [[ "$kind" == python ]]; then
    local lock_file
    lock_file=$(resolved_lock_file "$resource")
    mkdir -p "$(dirname "$lock_file")"
    python3 "$PY_HELPER" --lock-file "$lock_file" --timeout 5 -- python3 -c "$target" "$state_dir" "$mode" &
  else
    CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUST_CLI" --resource "$resource" --timeout 5 -- python3 -c "$target" "$state_dir" "$mode" &
  fi
  STARTED_PID=$!
}

signal_test() {
  local kind="$1" signal_name="$2" expected_exit="$3"
  local resource="signal-${kind}-${signal_name}-$$-${RANDOM}${RANDOM}"
  local state_dir="$TMP_ROOT/$resource"
  mkdir -p "$state_dir"
  local helper_pid
  start_exec_target "$kind" "$resource" "$state_dir" "$signal_name"
  local helper_pid="$STARTED_PID"
  if ! wait_ready "$state_dir/ready"; then
    fail "$kind $signal_name target did not become ready"
    return
  fi
  local target_pid
  target_pid=$(cat "$state_dir/target.pid")
  if [[ "$helper_pid" != "$target_pid" ]]; then
    fail "$kind $signal_name helper PID $helper_pid != target PID $target_pid"
    kill -KILL "$helper_pid" 2>/dev/null || true
    return
  fi
  kill "-$signal_name" "$target_pid"
  wait "$helper_pid"
  local target_exit=$?
  local contender_log="$state_dir/contender"
  run_rust "$resource" 1 -- bash -c 'touch "$1"' _ "$contender_log"
  local contender_exit=$?
  if [[ "$target_exit" -eq "$expected_exit" && "$contender_exit" -eq 0 && -e "$contender_log" ]] && ! kill -0 "$target_pid" 2>/dev/null; then
    pass "$kind $signal_name target lifecycle"
  else
    fail "$kind $signal_name target_exit=$target_exit contender_exit=$contender_exit"
  fi
}

echo '=== signal lifecycle ==='
for kind in python rust; do
  for _ in $(seq 1 5); do
    signal_test "$kind" KILL 137
  done
  signal_test "$kind" TERM 42
done

exec_failure_test() {
  local kind="$1" resource="exec-failure-${kind}-$$" output="$TMP_ROOT/${kind}-exec-failure"
  "run_${kind}" "$resource" 1 -- does-not-exist-yana-flock-prototype >/dev/null 2>&1
  local failed_exit=$?
  run_python "$resource" 1 -- bash -c 'touch "$1"' _ "$output"
  local contender_exit=$?
  [[ "$failed_exit" -eq 2 && "$contender_exit" -eq 0 && -e "$output" ]] && pass "$kind exec failure releases lock" || fail "$kind exec failure=$failed_exit contender=$contender_exit"
}

echo '=== exec failure ==='
exec_failure_test python
exec_failure_test rust

fd_inheritance_test() {
  local kind="$1" mode="$2"
  local resource="fd-${kind}-${mode}-$$-${RANDOM}${RANDOM}"
  local state_dir="$TMP_ROOT/$resource"
  mkdir -p "$state_dir"
  local script=$'import os, sys, time\nstate, mode = sys.argv[1:]\npid = os.fork()\nif pid == 0:\n    open(state + "/grandchild.pid", "w").write(str(os.getpid()))\n    if mode == "exec":\n        os.execvp("sleep", ["sleep", "30"])\n    time.sleep(30)\n    os._exit(0)\nos._exit(0)'
  "run_${kind}" "$resource" 5 -- python3 -c "$script" "$state_dir" "$mode"
  local target_exit=$?
  local grandchild_pid
  for _ in $(seq 1 100); do [[ -f "$state_dir/grandchild.pid" ]] && break; sleep 0.02; done
  grandchild_pid=$(cat "$state_dir/grandchild.pid" 2>/dev/null || true)
  run_rust "$resource" 0.3 -- true >/dev/null 2>&1
  local contender_exit=$?
  if [[ "$target_exit" -eq 0 && -n "$grandchild_pid" && "$contender_exit" -eq 2 ]] && kill -0 "$grandchild_pid" 2>/dev/null; then
    pass "$kind $mode inherited-FD retention observed"
  else
    fail "$kind $mode inherited-FD target=$target_exit contender=$contender_exit"
  fi
  kill -TERM "$grandchild_pid" 2>/dev/null || true
}

echo '=== documented inherited-FD limitation ==='
for kind in python rust; do
  fd_inheritance_test "$kind" fork
  fd_inheritance_test "$kind" exec
done

argv_test() {
  local kind="$1" resource="argv-${kind}-$$" output="$TMP_ROOT/${kind}-argv.json"
  local -a expected=("space value" "quote\"and'quote" "" "ユニコード" "-leading")
  "run_${kind}" "$resource" 5 -- python3 -c 'import json, sys; json.dump(sys.argv[2:], open(sys.argv[1], "w"), ensure_ascii=False)' "$output" "${expected[@]}"
  python3 - "$output" <<'PY'
import json
import sys
expected = ["space value", "quote\"and'quote", "", "ユニコード", "-leading"]
raise SystemExit(0 if json.load(open(sys.argv[1])) == expected else 1)
PY
  [[ $? -eq 0 ]] && pass "$kind argv preserved" || fail "$kind argv changed"
}

echo '=== argv preservation ==='
argv_test python
argv_test rust
argv_test bash_helper

preservation_test() {
  local kind="$1" resource="preserve-${kind}-$$" output="$TMP_ROOT/${kind}-preservation"
  local expected_env="caller-${kind}-preserved"
  local requested_cwd="$TMP_ROOT/${kind}-cwd"
  local path_bin="$TMP_ROOT/${kind}-path-bin"
  local expected_path="$path_bin:$PATH"
  mkdir -p "$requested_cwd" "$path_bin"
  local expected_cwd
  expected_cwd=$(cd "$requested_cwd" && pwd -P) || return 1
  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'printf "%s\\t%s\\t%s\\tPATH_LOOKUP_OK\\n" "$YANA_FLOCK_CALLER_ENV" "$(pwd -P)" "$PATH" > "$1"' \
    > "$path_bin/yana-flock-path-probe"
  chmod +x "$path_bin/yana-flock-path-probe"

  (
    cd "$requested_cwd" || exit 1
    YANA_FLOCK_CALLER_ENV="$expected_env" PATH="$expected_path" \
      "run_${kind}" "$resource" 5 -- yana-flock-path-probe "$output"
  )
  local target_exit=$?
  local observed_env observed_cwd observed_path observed_lookup
  IFS=$'\t' read -r observed_env observed_cwd observed_path observed_lookup < "$output" 2>/dev/null || true
  if [[ "$target_exit" -eq 0 && "$observed_env" == "$expected_env" && "$observed_cwd" == "$expected_cwd" && "$observed_path" == "$expected_path" && "$observed_lookup" == PATH_LOOKUP_OK ]]; then
    pass "$kind environment/cwd/PATH preserved"
  else
    fail "$kind preservation exit=$target_exit env='$observed_env' cwd='$observed_cwd' path='$observed_path' lookup='$observed_lookup'"
  fi
}

echo '=== environment, cwd, and PATH preservation ==='
preservation_test python
preservation_test rust
preservation_test bash_helper

echo '=== Bash Python availability policy ==='
(
  PATH="$TMP_ROOT/no-python-path" run_bash_helper "no-python-$$" 1 -- true >/dev/null 2>&1
)
[[ $? -eq 2 ]] && pass 'bash helper fails closed without python3' || fail 'bash helper did not fail closed without python3'

printf '\n=== SUMMARY ===\nPassed: %s\nFailed: %s\n' "$PASS_COUNT" "$FAIL_COUNT"
[[ "$FAIL_COUNT" -eq 0 ]] && echo 'Result: PASS' || echo 'Result: FAIL'
exit $(( FAIL_COUNT > 0 ? 1 : 0 ))
