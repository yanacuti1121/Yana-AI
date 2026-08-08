#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
MIGRATE="$REPO_ROOT/core/scripts/migrate-locking-protocol-v1.py"
RUNTIME="$REPO_ROOT/target/debug/yana-rt"
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/yana-flock-cutover.XXXXXX")
BLOCKED_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/yana-flock-cutover-blocked.XXXXXX")
NONREGULAR_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/yana-flock-cutover-nonregular.XXXXXX")
ROLLBACK_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/yana-flock-rollback.XXXXXX")
PASS_COUNT=0
trap 'rm -rf "$TMP_ROOT" "$BLOCKED_ROOT" "$NONREGULAR_ROOT" "$ROLLBACK_ROOT"' EXIT

pass() { PASS_COUNT=$((PASS_COUNT + 1)); printf 'PASS %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1" >&2; exit 1; }

[[ -x "$RUNTIME" ]] || fail "compiled yana-rt missing"

GATE_MARKER="$TMP_ROOT/target-ran"
if CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with \
  --resource key:test/gate --timeout 0 -- touch "$GATE_MARKER"; then
  fail "runtime accepted missing protocol marker"
fi
[[ ! -e "$GATE_MARKER" ]] || fail "target ran without protocol marker"
mkdir -p "$TMP_ROOT/.claude/state"
printf 'mkdir-v1\n' > "$TMP_ROOT/.claude/state/locking-protocol-version"
if CLAUDE_PROJECT_DIR="$TMP_ROOT" "$RUNTIME" guard lock-with \
  --resource key:test/gate --timeout 0 -- touch "$GATE_MARKER"; then
  fail "runtime accepted mismatched protocol marker"
fi
[[ ! -e "$GATE_MARKER" ]] || fail "target ran with mismatched marker"
rm -f "$TMP_ROOT/.claude/state/locking-protocol-version"
pass "production marker mismatch fails closed before target execution"

if python3 "$MIGRATE" --project-root "$TMP_ROOT" --activate; then
  fail "activation ran without maintenance"
fi
pass "activation requires maintenance gate"

python3 "$MIGRATE" --project-root "$TMP_ROOT" --enter-maintenance
mkdir -p "$TMP_ROOT/.claude/state/locks/legacy-empty.lock"
python3 "$MIGRATE" --project-root "$TMP_ROOT" --activate
[[ "$(cat "$TMP_ROOT/.claude/state/locking-protocol-version")" == "flock-v1" ]] || fail "protocol marker missing"
[[ ! -d "$TMP_ROOT/.claude/state/locks/legacy-empty.lock" ]] || fail "empty legacy directory remained"
[[ -f "$TMP_ROOT/.claude/state/locking-maintenance" ]] || fail "maintenance opened too early"
pass "activation removes only empty legacy directories"
python3 "$MIGRATE" --project-root "$TMP_ROOT" --leave-maintenance
pass "reopen is explicit"

python3 "$MIGRATE" --project-root "$BLOCKED_ROOT" --enter-maintenance
if python3 "$MIGRATE" --project-root "$BLOCKED_ROOT" --enter-maintenance; then
  fail "second operator replaced maintenance gate"
fi
mkdir -p "$BLOCKED_ROOT/.claude/state/locks/legacy-active.lock"
printf 'owner\n' > "$BLOCKED_ROOT/.claude/state/locks/legacy-active.lock/owner"
if python3 "$MIGRATE" --project-root "$BLOCKED_ROOT" --activate; then
  fail "activation removed non-empty legacy directory"
fi
[[ -f "$BLOCKED_ROOT/.claude/state/locks/legacy-active.lock/owner" ]] || fail "legacy residue changed"
pass "non-empty legacy residue aborts unchanged"

python3 "$MIGRATE" --project-root "$NONREGULAR_ROOT" --enter-maintenance
mkdir -p "$NONREGULAR_ROOT/.claude/state/locks/a-empty.lock"
mkfifo "$NONREGULAR_ROOT/.claude/state/locks/z-fifo.lock"
if python3 "$MIGRATE" --project-root "$NONREGULAR_ROOT" --activate; then
  fail "activation accepted non-regular residue"
fi
[[ -d "$NONREGULAR_ROOT/.claude/state/locks/a-empty.lock" ]] || fail "preflight partially removed empty directory"
[[ -p "$NONREGULAR_ROOT/.claude/state/locks/z-fifo.lock" ]] || fail "preflight changed FIFO residue"
pass "activation preflight aborts without partial mutation"

python3 "$MIGRATE" --project-root "$ROLLBACK_ROOT" --enter-maintenance
mkdir -p "$ROLLBACK_ROOT/.claude/state/locks"
printf 'flock-v1\n' > "$ROLLBACK_ROOT/.claude/state/locking-protocol-version"
printf '' > "$ROLLBACK_ROOT/.claude/state/locks/stable.lock"
if python3 "$MIGRATE" --project-root "$ROLLBACK_ROOT" --prepare-rollback; then
  fail "rollback removed a stable lock file without external FD proof"
fi
[[ -f "$ROLLBACK_ROOT/.claude/state/locks/stable.lock" ]] || fail "rollback changed stable inode"
[[ -f "$ROLLBACK_ROOT/.claude/state/locking-protocol-version" ]] || fail "rollback removed marker early"
rm "$ROLLBACK_ROOT/.claude/state/locks/stable.lock"
python3 "$MIGRATE" --project-root "$ROLLBACK_ROOT" --prepare-rollback
[[ ! -e "$ROLLBACK_ROOT/.claude/state/locking-protocol-version" ]] || fail "rollback marker remained"
[[ -f "$ROLLBACK_ROOT/.claude/state/locking-maintenance" ]] || fail "rollback reopened launches"
pass "rollback requires external FD proof and keeps maintenance closed"

printf 'flock-v1 cutover regression: %s passed\n' "$PASS_COUNT"
