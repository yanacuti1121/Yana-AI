#!/usr/bin/env bash
# core/tests/locking/test-flock-prototype-cross-language.sh — PROTOTYPE
# evidence harness for the kernel-flock locking design. Not wired into
# CI. Exercises core/lib/py/flock_run.py, src/guard/flock_lock.rs (via
# target/debug/flock_lock_prototype_cli), and core/lib/flock_lock_prototype.sh
# as genuinely separate OS processes racing the SAME lock file, to prove
# (not assume) cross-language mutual exclusion, crash recovery without a
# stale-timeout wait, stable inode identity, exit-code/signal propagation,
# and timeout behavior.
set -uo pipefail

REPO_ROOT="/Users/vutam/Desktop/yana-prototype-kernel-lock"
export CLAUDE_PROJECT_DIR="$REPO_ROOT"
RUST_CLI="$REPO_ROOT/target/debug/flock_lock_prototype_cli"
PY_HELPER="$REPO_ROOT/core/lib/py/flock_run.py"
source "$REPO_ROOT/core/lib/flock_lock_prototype.sh"

if [[ ! -x "$RUST_CLI" ]]; then
  echo "FAIL: $RUST_CLI not built — run: cargo build --bin flock_lock_prototype_cli --features flock-lock-prototype" >&2
  exit 1
fi

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/yana-flock-proto.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT

PASS_COUNT=0
FAIL_COUNT=0
pass() { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

now_ns() { date +%s%N; }

# ── helpers to invoke each holder shape ──────────────────────────────────────
# All three converge on the identical on-disk path for the same raw
# `resource` string, via the identical lock_name_for() derivation — Rust
# and bash each derive it internally (their real production call shape);
# Python's flock_run.py is naming-scheme-agnostic by design, so this
# harness derives the name itself the same way flock_lock_with does,
# rather than assuming a raw string is already the right filename (an
# earlier version of this harness made exactly that assumption and got a
# false "no overlap... wait, overlap detected" result because Rust and
# bash were, at the time, silently locking two different files — see
# flock_lock_prototype_cli.rs's own header for the full account).
resolved_lock_file() {
  local resource="$1" derived
  derived=$(_yana_flock_proto_name_for "$resource")
  echo "$TMP_ROOT/.claude/state/locks/${derived}.lock"
}
run_python() { # resource timeout -- cmd...
  local resource="$1" timeout="$2"; shift 2; [[ "${1:-}" == "--" ]] && shift
  local lock_file; lock_file=$(resolved_lock_file "$resource")
  mkdir -p "$(dirname "$lock_file")"
  python3 "$PY_HELPER" --lock-file "$lock_file" --timeout "$timeout" -- "$@"
}
run_rust() { # resource timeout -- cmd...
  local resource="$1" timeout="$2"; shift 2; [[ "${1:-}" == "--" ]] && shift
  CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUST_CLI" --resource "$resource" --timeout "$timeout" -- "$@"
}
run_bash_helper() { # resource timeout -- cmd...
  local resource="$1" timeout="$2"; shift 2; [[ "${1:-}" == "--" ]] && shift
  CLAUDE_PROJECT_DIR="$TMP_ROOT" flock_lock_with "$resource" "$timeout" -- "$@"
}

# ── 1/2/3/4: no-overlap tests, same shape for every pair ────────────────────
# Holder: writes ENTER, sleeps HOLD_SECS, writes EXIT.
# Contender: launched ~0.15s after holder (so it reliably contends, not races
# to acquire first), writes ENTER once it actually gets the lock.
# Pass condition: contender's ENTER timestamp is strictly after holder's EXIT.
no_overlap_test() {
  local label="$1" holder_runner="$2" contender_runner="$3" lock_name="$4"
  local log="$TMP_ROOT/${lock_name}.log"
  : > "$log"
  local hold_secs=1

  ( "$holder_runner" "$lock_name" 5 -- bash -c "
      echo \"HOLDER_ENTER \$(date +%s%N)\" >> '$log'
      sleep $hold_secs
      echo \"HOLDER_EXIT \$(date +%s%N)\" >> '$log'
    " ) &
  local holder_pid=$!
  sleep 0.15
  ( "$contender_runner" "$lock_name" 5 -- bash -c "
      echo \"CONTENDER_ENTER \$(date +%s%N)\" >> '$log'
    " ) &
  local contender_pid=$!
  wait "$holder_pid"
  wait "$contender_pid"

  local holder_exit contender_enter
  holder_exit=$(grep '^HOLDER_EXIT' "$log" | awk '{print $2}')
  contender_enter=$(grep '^CONTENDER_ENTER' "$log" | awk '{print $2}')

  if [[ -z "$holder_exit" || -z "$contender_enter" ]]; then
    fail "$label — missing log lines (holder_exit='$holder_exit' contender_enter='$contender_enter')"
    return
  fi
  if (( contender_enter > holder_exit )); then
    pass "$label — no overlap (contender entered $(( (contender_enter - holder_exit) / 1000000 ))ms after holder exited)"
  else
    fail "$label — OVERLAP DETECTED: contender entered before holder exited"
  fi
}

echo "=== 1. Python holder vs Python contender ==="
no_overlap_test "python-vs-python" run_python run_python "test1-$$"

echo "=== 2. Rust holder vs Rust contender ==="
no_overlap_test "rust-vs-rust" run_rust run_rust "test2-$$"

echo "=== 3. Python holder vs Rust contender (both directions) ==="
no_overlap_test "python-holder-rust-contender" run_python run_rust "test3a-$$"
no_overlap_test "rust-holder-python-contender" run_rust run_python "test3b-$$"

echo "=== 4. Bash-helper holder vs Rust/Python contender ==="
no_overlap_test "bash-holder-rust-contender" run_bash_helper run_rust "test4a-$$"
no_overlap_test "bash-holder-python-contender" run_bash_helper run_python "test4b-$$"

# ── 5. Crash recovery — no stale-timeout wait ────────────────────────────────
echo "=== 5. Crash recovery ==="
CRASH_LOCK="test5-$$"
CRASH_LOG="$TMP_ROOT/crash.log"
: > "$CRASH_LOG"
# Job control (set -m) makes this background job a process-group leader —
# without it, a non-interactive script's background jobs share the
# script's own process group, and killing only $! (the subshell's own
# PID) does not reach the actual python3 flock_run.py grandchild that
# subshell forks into (run_python itself does an extra `python3 -c ...`
# name-derivation call before the real holder process even starts). A
# single-PID kill left that grandchild running as an orphan, holding the
# flock for its full intended duration and making the contender below
# genuinely time out — caught by this test itself (exit=2 at ~5s), not
# assumed away.
set -m
( run_python "$CRASH_LOCK" 30 -- sleep 30 ) &
holder_pgid=$!
set +m
sleep 0.3 # let it actually acquire
kill -KILL -- "-$holder_pgid" 2>/dev/null
wait "$holder_pgid" 2>/dev/null

started_ns=$(now_ns)
run_rust "$CRASH_LOCK" 5 -- bash -c "echo done" >/dev/null 2>&1
crash_exit=$?
elapsed_ms=$(( ($(now_ns) - started_ns) / 1000000 ))

if [[ "$crash_exit" -eq 0 && "$elapsed_ms" -lt 2000 ]]; then
  pass "crash recovery — contender acquired in ${elapsed_ms}ms after SIGKILL (no stale-timeout wait; old design's 5s heuristic would have forced this to be >=5000ms)"
else
  fail "crash recovery — exit=$crash_exit elapsed=${elapsed_ms}ms"
fi

# ── 6. Stable inode ───────────────────────────────────────────────────────
echo "=== 6. Stable inode ==="
INODE_LOCK="test6-$$"
run_rust "$INODE_LOCK" 5 -- true
inode_path=$(resolved_lock_file "$INODE_LOCK")
inode_before=$(stat -f '%i' "$inode_path" 2>/dev/null || stat -c '%i' "$inode_path" 2>/dev/null)
for _i in 1 2 3 4 5 6 7 8 9 10; do
  run_rust "$INODE_LOCK" 5 -- true >/dev/null 2>&1
  run_python "$INODE_LOCK" 5 -- true >/dev/null 2>&1
done
inode_after=$(stat -f '%i' "$inode_path" 2>/dev/null || stat -c '%i' "$inode_path" 2>/dev/null)
if [[ -n "$inode_before" && "$inode_before" == "$inode_after" ]]; then
  pass "stable inode — unchanged across 20 mixed Rust/Python acquisitions (inode $inode_before)"
else
  fail "stable inode — before='$inode_before' after='$inode_after'"
fi

# ── 7. Exit propagation ─────────────────────────────────────────────────────
echo "=== 7. Exit propagation ==="
run_rust "test7a-$$" 5 -- bash -c "exit 0"; [[ $? -eq 0 ]] && pass "rust: child exit 0 propagates" || fail "rust: child exit 0 did not propagate"
run_rust "test7b-$$" 5 -- bash -c "exit 7"; [[ $? -eq 7 ]] && pass "rust: child exit 7 propagates" || fail "rust: child exit 7 did not propagate (got $?)"
run_python "test7c-$$" 5 -- bash -c "exit 0"; [[ $? -eq 0 ]] && pass "python: child exit 0 propagates" || fail "python: child exit 0 did not propagate"
run_python "test7d-$$" 5 -- bash -c "exit 7"; [[ $? -eq 7 ]] && pass "python: child exit 7 propagates" || fail "python: child exit 7 did not propagate (got $?)"
run_python "test7e-$$" 5 -- bash -c 'kill -TERM $$; sleep 5'
py_sig_exit=$?
[[ "$py_sig_exit" -eq 143 ]] && pass "python: self-SIGTERM child reported as exit 143 (128+15)" || fail "python: self-SIGTERM child reported as $py_sig_exit, expected 143"
run_rust "test7f-$$" 5 -- bash -c 'kill -TERM $$; sleep 5'
rust_sig_exit=$?
[[ "$rust_sig_exit" -eq 143 ]] && pass "rust: self-SIGTERM child reported as exit 143 (128+15)" || fail "rust: self-SIGTERM child reported as $rust_sig_exit, expected 143"

# ── 8. Timeout ────────────────────────────────────────────────────────────
echo "=== 8. Timeout ==="
TIMEOUT_LOCK="test8-$$"
TIMEOUT_LOG="$TMP_ROOT/timeout.log"
: > "$TIMEOUT_LOG"
( run_python "$TIMEOUT_LOCK" 10 -- sleep 3 ) &
holder_pid=$!
# Give the Python holder's interpreter startup + acquisition time to
# actually land before the contender races in — 0.2s proved too tight
# under real process-spawn variance (contender occasionally won the
# acquisition race outright instead of contending), verified live.
sleep 0.6
started_ns=$(now_ns)
run_rust "$TIMEOUT_LOCK" 1 -- bash -c "echo ENTERED >> '$TIMEOUT_LOG'"
timeout_exit=$?
elapsed_ms=$(( ($(now_ns) - started_ns) / 1000000 ))
wait "$holder_pid"

if [[ "$timeout_exit" -eq 2 && ! -s "$TIMEOUT_LOG" && "$elapsed_ms" -ge 900 && "$elapsed_ms" -lt 2500 ]]; then
  pass "timeout — contender failed closed after ${elapsed_ms}ms (~1s requested), never entered critical section"
else
  fail "timeout — exit=$timeout_exit elapsed=${elapsed_ms}ms log_nonempty=$( [[ -s "$TIMEOUT_LOG" ]] && echo yes || echo no )"
fi

echo ""
echo "=== SUMMARY ==="
echo "Passed: $PASS_COUNT"
echo "Failed: $FAIL_COUNT"
[[ "$FAIL_COUNT" -eq 0 ]] && echo "Result: PASS" || echo "Result: FAIL"
exit $(( FAIL_COUNT > 0 ? 1 : 0 ))
