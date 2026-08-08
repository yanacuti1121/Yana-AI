#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
RUNTIME="$REPO_ROOT/target/debug/yana-rt"
HELPER="$REPO_ROOT/core/tests/locking/flock_test_helper.py"
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/yana-flock-v1.XXXXXX")
RESOURCE="key:state/token-budget.json"
PASS_COUNT=0
CHILD_PIDS=()

cleanup() {
  local child_pid
  for child_pid in "${CHILD_PIDS[@]:-}"; do
    [[ -n "$child_pid" ]] && kill "$child_pid" 2>/dev/null || true
  done
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

pass() { PASS_COUNT=$((PASS_COUNT + 1)); printf 'PASS %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1" >&2; exit 1; }

now_ns() {
  python3 -c 'import time; print(time.clock_gettime_ns(time.CLOCK_MONOTONIC))'
}

identity_pair() {
  local resource="$1" rust_value python_value
  rust_value=$(CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-identity --resource "$resource")
  python_value=$(python3 - "$TMP_ROOT" "$resource" <<'PY'
import sys
from core.lib.py.file_lock import canonical_identity, lock_path
root, resource = sys.argv[1:]
identity = canonical_identity(resource, root)
print(f"{identity}\t{lock_path(root, identity)}")
PY
)
  [[ "$rust_value" == "$python_value" ]] || fail "Rust/Python identity mismatch for $resource"
  printf '%s\n' "$rust_value"
}

wait_file() {
  local path="$1" attempts=0
  while [[ ! -f "$path" ]]; do
    attempts=$((attempts + 1))
    (( attempts < 500 )) || fail "timed out waiting for $path"
    sleep 0.01
  done
}

new_paths() {
  local label="$1"
  READY="$TMP_ROOT/$label.ready"
  RELEASE="$TMP_ROOT/$label.release"
  MARKER="$TMP_ROOT/$label.entered"
}

start_python_holder() {
  python3 "$HELPER" python-holder "$TMP_ROOT" "$RESOURCE" "$READY" "$RELEASE" &
  HOLDER_PID=$!
  CHILD_PIDS+=("$HOLDER_PID")
  wait_file "$READY"
}

start_rust_holder() {
  CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with \
    --resource "$RESOURCE" --timeout 2 -- \
    python3 "$HELPER" critical-target "$READY" "$RELEASE" &
  HOLDER_PID=$!
  CHILD_PIDS+=("$HOLDER_PID")
  wait_file "$READY"
}

release_holder() {
  touch "$RELEASE"
  wait "$HOLDER_PID"
}

cargo build --quiet --manifest-path "$REPO_ROOT/Cargo.toml"
[[ -x "$RUNTIME" ]] || fail "compiled yana-rt missing"
mkdir -p "$TMP_ROOT/.claude/state"
printf 'flock-v1\n' > "$TMP_ROOT/.claude/state/locking-protocol-version"
export PYTHONPATH="$REPO_ROOT"

RUST_IDENTITY=$(CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-identity --resource "$RESOURCE")
PYTHON_IDENTITY=$(python3 - "$TMP_ROOT" "$RESOURCE" <<'PY'
import sys
from core.lib.py.file_lock import canonical_identity, lock_path
root, resource = sys.argv[1:]
identity = canonical_identity(resource, root)
print(f"{identity}\t{lock_path(root, identity)}")
PY
)
[[ "$RUST_IDENTITY" == "$PYTHON_IDENTITY" ]] || fail "Rust/Python identity mismatch"
pass "Rust and Python use identical identity/path"

for identity_fixture in \
  "key:state/./nested/../missing.json" \
  "core/memory/./L2_session/../L2_session/missing.json" \
  "key:state/nhật-ký.json" \
  "key:state/NHẬT-KÝ.json"; do
  identity_pair "$identity_fixture" >/dev/null
done
RELATIVE_IDENTITY=$(identity_pair "core/memory/L2_session/missing.json")
ABSOLUTE_IDENTITY=$(identity_pair "$TMP_ROOT/core/memory/L2_session/missing.json")
[[ "$RELATIVE_IDENTITY" == "$ABSOLUTE_IDENTITY" ]] || fail "relative/absolute identity drift"
COLLISION_A=$(identity_pair "key:a/b_c")
COLLISION_B=$(identity_pair "key:a_b/c")
[[ "${COLLISION_A#*$'\t'}" != "${COLLISION_B#*$'\t'}" ]] || fail "sanitized-name collision"
if CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-identity --resource ../outside >/dev/null 2>&1; then
  fail "Rust accepted path escape"
fi
if python3 - "$TMP_ROOT" 2>/dev/null <<'PY'
import sys
from core.lib.py.file_lock import canonical_identity
canonical_identity("../outside", sys.argv[1])
PY
then
  fail "Python accepted path escape"
fi
pass "identity fixtures cover missing paths normalization Unicode case collisions and escapes"

new_paths python-rust
start_python_holder
if CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with --resource "$RESOURCE" --timeout 0 -- touch "$MARKER"; then
  fail "Rust entered Python critical section"
fi
[[ ! -e "$MARKER" ]] || fail "Rust target executed after timeout"
release_holder
pass "Python holder excludes Rust contender"

new_paths bounded-timeout
start_python_holder
TIMEOUT_START_NS=$(now_ns)
if CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with --resource "$RESOURCE" --timeout 1 -- touch "$MARKER"; then
  fail "bounded contender entered held critical section"
fi
TIMEOUT_END_NS=$(now_ns)
TIMEOUT_ELAPSED_MS=$(( (TIMEOUT_END_NS - TIMEOUT_START_NS) / 1000000 ))
[[ ! -e "$MARKER" ]] || fail "bounded timeout executed target"
(( TIMEOUT_ELAPSED_MS >= 900 && TIMEOUT_ELAPSED_MS < 3000 )) || \
  fail "bounded timeout elapsed ${TIMEOUT_ELAPSED_MS}ms outside expected range"
release_holder
pass "bounded timeout waits without entering critical section (${TIMEOUT_ELAPSED_MS}ms)"

new_paths rust-python
start_rust_holder
if python3 "$HELPER" python-enter "$TMP_ROOT" "$RESOURCE" "$MARKER" 0; then
  fail "Python entered Rust critical section"
fi
[[ ! -e "$MARKER" ]] || fail "Python target executed after timeout"
release_holder
pass "Rust holder excludes Python contender"

new_paths rust-rust
start_rust_holder
if CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with --resource "$RESOURCE" --timeout 0 -- touch "$MARKER"; then
  fail "Rust contender overlapped Rust holder"
fi
release_holder
pass "Rust holder excludes Rust contender"

new_paths python-python
start_python_holder
if python3 "$HELPER" python-enter "$TMP_ROOT" "$RESOURCE" "$MARKER" 0; then
  fail "Python contender overlapped Python holder"
fi
release_holder
pass "Python holder excludes Python contender"

new_paths rust-bash
start_rust_holder
if CLAUDE_PROJECT_DIR="$TMP_ROOT" YANA_RT_BIN="$RUNTIME" bash -c \
  'source "$1/core/lib/locking.sh"; with_lock "$2" 0 -- touch "$3"' \
  bash "$REPO_ROOT" "$RESOURCE" "$MARKER"; then
  fail "Bash contender overlapped Rust holder"
fi
release_holder
pass "Rust holder excludes Bash contender"

new_paths bash-python
CLAUDE_PROJECT_DIR="$TMP_ROOT" YANA_RT_BIN="$RUNTIME" bash -c \
  'source "$1/core/lib/locking.sh"; with_lock "$2" 2 -- python3 "$3" critical-target "$4" "$5"' \
  bash "$REPO_ROOT" "$RESOURCE" "$HELPER" "$READY" "$RELEASE" &
HOLDER_PID=$!
CHILD_PIDS+=("$HOLDER_PID")
wait_file "$READY"
if python3 "$HELPER" python-enter "$TMP_ROOT" "$RESOURCE" "$MARKER" 0; then
  fail "Python contender overlapped Bash holder"
fi
release_holder
pass "Bash holder excludes Python contender"

new_paths sigterm
start_rust_holder
TARGET_PID=$(cat "$READY")
[[ "$TARGET_PID" == "$HOLDER_PID" ]] || fail "acquire-then-exec changed PID"
kill -TERM "$HOLDER_PID"
wait "$HOLDER_PID" 2>/dev/null || true
CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with --resource "$RESOURCE" --timeout 1 -- touch "$MARKER"
[[ -f "$MARKER" ]] || fail "lock not released after SIGTERM"
pass "SIGTERM targets exec process and releases lock"

new_paths sigkill
start_rust_holder
kill -KILL "$HOLDER_PID"
wait "$HOLDER_PID" 2>/dev/null || true
CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with --resource "$RESOURCE" --timeout 1 -- touch "$MARKER"
[[ -f "$MARKER" ]] || fail "lock not released after SIGKILL"
pass "SIGKILL releases kernel lock"

if CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with --resource "$RESOURCE" --timeout 1 -- "$TMP_ROOT/does-not-exist"; then
  fail "exec failure returned success"
fi
new_paths exec-failure
CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with --resource "$RESOURCE" --timeout 1 -- touch "$MARKER"
pass "exec failure releases lock"

ARGV_FILE="$TMP_ROOT/argv.json"
CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with --resource "$RESOURCE" --timeout 1 -- \
  python3 "$HELPER" argv-roundtrip "$ARGV_FILE" "space value" 'quote"value' "" "Tiếng Việt" "-leading"
python3 - "$ARGV_FILE" <<'PY'
import json, sys
actual = json.load(open(sys.argv[1], encoding="utf-8"))
expected = ["space value", 'quote"value', "", "Tiếng Việt", "-leading"]
raise SystemExit(0 if actual == expected else 1)
PY
pass "argv preserved exactly"

CONTEXT_FILE="$TMP_ROOT/context.json"
(cd "$TMP_ROOT" && YANA_FLOCK_TEST_ENV="preserved" CLAUDE_PROJECT_DIR="$TMP_ROOT" \
  "$RUNTIME" guard lock-with --resource "$RESOURCE" --timeout 1 -- \
  python3 "$HELPER" capture-context "$CONTEXT_FILE")
python3 - "$CONTEXT_FILE" "$TMP_ROOT" <<'PY'
import json, os, sys
actual = json.load(open(sys.argv[1], encoding="utf-8"))
assert os.path.realpath(actual["cwd"]) == os.path.realpath(sys.argv[2])
assert actual["env"] == "preserved"
assert actual["path"]
PY
pass "environment cwd and PATH preserved"

STABLE_IDENTITY=${RUST_IDENTITY#*$'\t'}
CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with --resource "$RESOURCE" --timeout 1 -- true
INODE_BEFORE=$(python3 -c 'import os,sys; print(os.stat(sys.argv[1]).st_ino)' "$STABLE_IDENTITY")
CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with --resource "$RESOURCE" --timeout 1 -- true
INODE_AFTER=$(python3 -c 'import os,sys; print(os.stat(sys.argv[1]).st_ino)' "$STABLE_IDENTITY")
[[ "$INODE_BEFORE" == "$INODE_AFTER" ]] || fail "lock inode changed"
pass "canonical lock inode remains stable"

NONREGULAR_INFO=$(CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-identity --resource key:state/nonregular.json)
NONREGULAR_PATH=${NONREGULAR_INFO#*$'\t'}
mkdir -p "$NONREGULAR_PATH"
if CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with --resource key:state/nonregular.json --timeout 0 -- true; then
  fail "directory lock path accepted"
fi
rmdir "$NONREGULAR_PATH"
mkfifo "$NONREGULAR_PATH"
if CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with --resource key:state/nonregular.json --timeout 0 -- true; then
  fail "FIFO lock path accepted"
fi
pass "directory and FIFO lock paths fail loud"

for inheritance_mode in fork-holder fork-exec-holder; do
  new_paths "$inheritance_mode"
  CHILD_PID_FILE="$TMP_ROOT/$inheritance_mode.child-pid"
  CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with --resource "$RESOURCE" --timeout 1 -- \
    python3 "$HELPER" "$inheritance_mode" "$READY" "$RELEASE" "$CHILD_PID_FILE"
  wait_file "$READY"
  wait_file "$CHILD_PID_FILE"
  INHERITED_PID=$(cat "$CHILD_PID_FILE")
  CHILD_PIDS+=("$INHERITED_PID")
  if CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with --resource "$RESOURCE" --timeout 0 -- true; then
    fail "$inheritance_mode descendant did not retain inherited lock"
  fi
  touch "$RELEASE"
  attempts=0
  while kill -0 "$INHERITED_PID" 2>/dev/null; do
    attempts=$((attempts + 1))
    (( attempts < 500 )) || fail "$inheritance_mode descendant did not exit"
    sleep 0.01
  done
done
printf 'OBSERVED LIMITATION descendant FD survives fork and fork+exec\n'
pass "descendant FD inheritance documented by live evidence"

printf 'flock-v1 production matrix: %s passed\n' "$PASS_COUNT"
