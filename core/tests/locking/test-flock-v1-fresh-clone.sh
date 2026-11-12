#!/usr/bin/env bash
# A new clone has no .claude/state/locking-protocol-version (.claude/state/ is
# gitignored). Before the bootstrap in core/lib/locking.sh, every with_lock
# caller failed closed there, and the hooks that use it run on every tool call,
# so a session could not even create the marker.
#
# The bootstrap is opt-in (YANA_LOCK_AUTO_ACTIVATE=1): absence of the marker
# cannot tell a fresh clone from an idle mkdir-v1 install, so without the
# opt-in it must change nothing. These tests pin both halves: it activates only
# on the opt-in, and even then changes nothing in every state the cutover
# procedure (ADR-008) relies on.
#
# Run: bash core/tests/locking/test-flock-v1-fresh-clone.sh
set -uo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
RUNTIME="$REPO_ROOT/target/debug/yana-rt"
[[ -x "$RUNTIME" ]] || RUNTIME="$REPO_ROOT/target/release/yana-rt"
MARKER_REL=".claude/state/locking-protocol-version"
PASS_COUNT=0
# new_root runs in a command substitution (a subshell), so it cannot register
# roots in the parent; every root is created under this one directory instead.
TMP_PARENT=$(mktemp -d "${TMPDIR:-/tmp}/yana-flock-fresh.XXXXXX")
trap 'rm -rf "$TMP_PARENT"' EXIT

# The production path is under test, so the runtime's test bypass must be off.
unset YANA_LOCKING_PROTOCOL_MODE YANA_LOCK_AUTO_ACTIVATE

pass() { PASS_COUNT=$((PASS_COUNT + 1)); printf 'PASS %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1" >&2; exit 1; }

[[ -x "$RUNTIME" ]] || fail "compiled yana-rt missing (cargo build --bin yana-rt)"

new_root() {
  local root
  root=$(mktemp -d "$TMP_PARENT/root.XXXXXX")
  (cd "$root" && pwd -P)
}

# Runs `with_lock ... touch <root>/target-ran` the way a hook does.
locked_touch() {
  local root="$1"
  (
    export CLAUDE_PROJECT_DIR="$root" YANA_RT_BIN="$RUNTIME"
    # AUTO=0 runs without the opt-in; every other case opts in.
    if [[ "${AUTO:-1}" == "1" ]]; then export YANA_LOCK_AUTO_ACTIVATE=1; fi
    # shellcheck source=/dev/null
    source "$REPO_ROOT/core/lib/locking.sh"
    with_lock "key:test/fresh-clone" 1 -- touch "$root/target-ran"
  ) 2>"$root/stderr.log"
}

# 0. No opt-in: nothing is written, the hint says how to activate, the target does not run.
#    This is also the idle mkdir-v1 install (empty locks/ plus other old state files),
#    which is indistinguishable from a fresh clone and must never be activated implicitly.
ROOT=$(new_root)
AUTO=0 locked_touch "$ROOT" && fail "with_lock succeeded without the opt-in"
[[ ! -e "$ROOT/$MARKER_REL" ]] || fail "marker written without the opt-in"
[[ ! -e "$ROOT/target-ran" ]] || fail "target ran without the opt-in"
grep -q "YANA_LOCK_AUTO_ACTIVATE=1" "$ROOT/stderr.log" || fail "no activation hint: $(cat "$ROOT/stderr.log")"
pass "no opt-in: no marker, target not run, hint printed"

ROOT=$(new_root)
mkdir -p "$ROOT/.claude/state/locks" "$ROOT/core/memory/L2_session"
printf '{}' > "$ROOT/.claude/state/token-budget.json"
printf '{}' > "$ROOT/core/memory/L2_session/token-budget.json"
AUTO=0 locked_touch "$ROOT" && fail "with_lock succeeded on an idle mkdir-v1-shaped install"
[[ ! -e "$ROOT/$MARKER_REL" ]] || fail "idle mkdir-v1-shaped install was activated implicitly"
pass "idle mkdir-v1-shaped install (empty locks/, old state files): never activated implicitly"

# 1. With the opt-in on a new checkout: the marker is written and the locked command runs.

ROOT=$(new_root)
locked_touch "$ROOT" || fail "with_lock failed on a new checkout: $(cat "$ROOT/stderr.log")"
[[ -e "$ROOT/target-ran" ]] || fail "target did not run on a new checkout"
[[ "$(cat "$ROOT/$MARKER_REL")" == "flock-v1" ]] || fail "marker not written on a new checkout"
grep -q "activated flock-v1" "$ROOT/stderr.log" || fail "activation was not announced on stderr"
[[ -z "$(find "$ROOT/.claude/state" -name 'locking-protocol-version.tmp.*')" ]] || fail "temporary marker left behind"
pass "new checkout: marker written, target ran, activation announced"

# 2. Second call: nothing is rewritten and nothing is announced.
rm -f "$ROOT/target-ran"
BEFORE=$(ls -li "$ROOT/$MARKER_REL")
locked_touch "$ROOT" || fail "second with_lock failed"
[[ "$(ls -li "$ROOT/$MARKER_REL")" == "$BEFORE" ]] || fail "existing marker was rewritten"
grep -q "activated flock-v1" "$ROOT/stderr.log" && fail "activation announced twice"
pass "existing marker is left alone"

# 3. Maintenance gate: an operator cutover is in progress, so stay closed.
ROOT=$(new_root)
mkdir -p "$ROOT/.claude/state"
printf 'flock-v1 migration in progress\n' > "$ROOT/.claude/state/locking-maintenance"
locked_touch "$ROOT" && fail "with_lock succeeded under the maintenance gate"
[[ ! -e "$ROOT/$MARKER_REL" ]] || fail "marker written under the maintenance gate"
[[ ! -e "$ROOT/target-ran" ]] || fail "target ran under the maintenance gate"
pass "maintenance gate: no marker, target not run"

# 4. Legacy mkdir-v1 residue: a directory under locks/ means there is something to cut over.
ROOT=$(new_root)
mkdir -p "$ROOT/.claude/state/locks/legacy.lock"
locked_touch "$ROOT" && fail "with_lock succeeded with a legacy lock directory"
[[ ! -e "$ROOT/$MARKER_REL" ]] || fail "marker written next to a legacy lock directory"
[[ ! -e "$ROOT/target-ran" ]] || fail "target ran next to a legacy lock directory"
[[ -d "$ROOT/.claude/state/locks/legacy.lock" ]] || fail "legacy lock directory was removed"
pass "legacy lock directory: no marker, target not run, residue untouched"

# 5. Regular lock files only (what flock-v1 itself leaves): still a clean state.
ROOT=$(new_root)
mkdir -p "$ROOT/.claude/state/locks"
: > "$ROOT/.claude/state/locks/key_state_token-budget.json-0a1b2c3d.lock"
locked_touch "$ROOT" || fail "with_lock failed with only regular lock files: $(cat "$ROOT/stderr.log")"
[[ "$(cat "$ROOT/$MARKER_REL")" == "flock-v1" ]] || fail "marker not written with only regular lock files"
pass "regular lock files only: marker written"

# 6. A marker naming another protocol is never replaced.
ROOT=$(new_root)
mkdir -p "$ROOT/.claude/state"
printf 'mkdir-v1\n' > "$ROOT/$MARKER_REL"
locked_touch "$ROOT" && fail "with_lock succeeded with a mismatched marker"
[[ "$(cat "$ROOT/$MARKER_REL")" == "mkdir-v1" ]] || fail "mismatched marker was replaced"
[[ ! -e "$ROOT/target-ran" ]] || fail "target ran with a mismatched marker"
pass "mismatched marker: unchanged, target not run"

# 7. Symlinked state directory: never write through it.
ROOT=$(new_root)
OUTSIDE=$(new_root)
mkdir -p "$ROOT/.claude"
ln -s "$OUTSIDE" "$ROOT/.claude/state"
locked_touch "$ROOT" && fail "with_lock succeeded through a symlinked state directory"
[[ ! -e "$OUTSIDE/locking-protocol-version" ]] || fail "marker written through a symlink"
pass "symlinked state directory: nothing written through it"

# 8. The runtime itself still fails closed without a marker (the cutover
#    regression pins this too; repeated here so this file fails if the
#    bootstrap ever moves into the runtime).
ROOT=$(new_root)
if CLAUDE_PROJECT_DIR="$ROOT" "$RUNTIME" guard lock-with \
  --resource key:test/fresh-clone --timeout 0 -- touch "$ROOT/target-ran" 2>/dev/null; then
  fail "runtime accepted a missing marker"
fi
[[ ! -e "$ROOT/target-ran" && ! -e "$ROOT/$MARKER_REL" ]] || fail "runtime ran or wrote without a marker"
pass "yana-rt guard lock-with alone still fails closed without a marker"

# 9. The hook end to end, Node fallback (yana-rt not on PATH): the first tool
#    call on a new checkout is allowed instead of being blocked with exit 2.
if command -v node >/dev/null 2>&1; then
  ROOT=$(new_root)
  mkdir -p "$ROOT/core/lib"
  cp "$REPO_ROOT/core/lib/locking.sh" "$ROOT/core/lib/locking.sh"
  HOOK_PATH="$(dirname "$(command -v node)"):/usr/bin:/bin:/usr/sbin:/sbin"
  PATH="$HOOK_PATH" command -v yana-rt >/dev/null 2>&1 && fail "yana-rt is on the scrubbed PATH; the fallback would not run"
  CODE=0
  printf '{"tool_name":"Bash","tool_input":{"command":"true"}}' | PATH="$HOOK_PATH" CLAUDE_PROJECT_DIR="$ROOT" \
    YANA_LOCK_AUTO_ACTIVATE=1 YANA_RT_BIN="$RUNTIME" YANA_LOG="$ROOT/audit.log" \
    bash "$REPO_ROOT/core/hooks/token-budget-guard.sh" >"$ROOT/stdout.log" 2>"$ROOT/stderr.log" || CODE=$?
  [[ "$CODE" -eq 0 ]] || fail "hook exited $CODE on a new checkout: $(cat "$ROOT/stderr.log")"
  [[ "$(cat "$ROOT/$MARKER_REL")" == "flock-v1" ]] || fail "hook did not activate the marker"
  grep -q "OK — Bash (attempt 1 / 5)" "$ROOT/stdout.log" || fail "hook did not run its budget check: $(cat "$ROOT/stdout.log")"
  pass "token-budget-guard.sh (Node fallback) allows the first call on a new checkout"
else
  printf 'SKIP hook Node fallback (node not installed)\n'
fi

# 9b. A locking.sh that predates the bootstrap must not turn the hook into an exit-127 error.
ROOT=$(new_root)
mkdir -p "$ROOT/core/lib" "$ROOT/bin"
printf 'with_lock() { :; }\n' > "$ROOT/core/lib/locking.sh"
ln -s "$RUNTIME" "$ROOT/bin/yana-rt"
CODE=0
printf '{"tool_name":"Bash"}' | PATH="$ROOT/bin:/usr/bin:/bin:/usr/sbin:/sbin" CLAUDE_PROJECT_DIR="$ROOT" YANA_LOCK_AUTO_ACTIVATE=1 \
  bash "$REPO_ROOT/core/hooks/token-budget-guard.sh" >/dev/null 2>"$ROOT/stderr.log" || CODE=$?
[[ "$CODE" -ne 127 ]] || fail "hook aborted with 127 on a lib without the bootstrap: $(cat "$ROOT/stderr.log")"
grep -q "command not found" "$ROOT/stderr.log" && fail "hook called a missing function"
pass "hook tolerates a locking.sh without the bootstrap function"

# 9c. An odd-named legacy entry (\"..x.lock\") still counts as residue.
ROOT=$(new_root)
mkdir -p "$ROOT/.claude/state/locks/..x.lock"
locked_touch "$ROOT" && fail "with_lock succeeded next to ..x.lock"
[[ ! -e "$ROOT/$MARKER_REL" ]] || fail "marker written next to ..x.lock"
pass "dot-dot legacy lock directory: no marker"

# 10. The hook end to end, Rust fast path (yana-rt on PATH).
ROOT=$(new_root)
mkdir -p "$ROOT/core/lib" "$ROOT/bin"
cp "$REPO_ROOT/core/lib/locking.sh" "$ROOT/core/lib/locking.sh"
ln -s "$RUNTIME" "$ROOT/bin/yana-rt"
CODE=0
printf '{"tool_name":"Bash","tool_input":{"command":"true"}}' | PATH="$ROOT/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  CLAUDE_PROJECT_DIR="$ROOT" YANA_LOCK_AUTO_ACTIVATE=1 YANA_LOG="$ROOT/audit.log" \
  bash "$REPO_ROOT/core/hooks/token-budget-guard.sh" >"$ROOT/stdout.log" 2>"$ROOT/stderr.log" || CODE=$?
[[ "$CODE" -eq 0 ]] || fail "hook (Rust path) exited $CODE on a new checkout: $(cat "$ROOT/stderr.log")"
[[ "$(cat "$ROOT/$MARKER_REL")" == "flock-v1" ]] || fail "hook (Rust path) did not activate the marker"
pass "token-budget-guard.sh (Rust path) allows the first call on a new checkout"

printf 'flock-v1 fresh-clone: %d passed\n' "$PASS_COUNT"
