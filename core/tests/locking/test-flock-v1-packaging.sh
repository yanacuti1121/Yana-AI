#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
RUNTIME="$REPO_ROOT/target/debug/yana-rt"
RELEASE_RUNTIME="$REPO_ROOT/target/release/yana-rt"
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/yana-flock-packaging.XXXXXX")
PASS_COUNT=0
trap 'rm -rf "$TMP_ROOT"' EXIT
export npm_config_cache="$TMP_ROOT/npm-cache"

pass() { PASS_COUNT=$((PASS_COUNT + 1)); printf 'PASS %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1" >&2; exit 1; }

cd "$REPO_ROOT"
[[ -x "$RUNTIME" ]] || fail "debug yana-rt missing; build it before packaging tests"

npm pack --dry-run --json --ignore-scripts > "$TMP_ROOT/npm-pack.json"
python3 - "$TMP_ROOT/npm-pack.json" <<'PY'
import json, sys
payload = json.load(open(sys.argv[1], encoding="utf-8"))
paths = {item["path"] for item in payload[0]["files"]}
required = {
    "core/lib/locking.sh",
    "core/lib/py/file_lock.py",
    "core/lib/py/flock_v1.py",
    "core/scripts/migrate-locking-protocol-v1.py",
}
missing = sorted(required - paths)
if missing:
    raise SystemExit(f"npm package missing: {missing}")
PY
pass "npm tarball ships flock runtime and migration surfaces"

INSTALL_ROOT="$TMP_ROOT/npm-install"
mkdir -p "$INSTALL_ROOT"
INIT_CWD="$INSTALL_ROOT" node "$REPO_ROOT/scripts/npm-install.js" --auto >/dev/null
[[ -f "$INSTALL_ROOT/.claude/lib/locking.sh" ]] || fail "npm installer omitted locking.sh"
[[ -f "$INSTALL_ROOT/.claude/lib/py/flock_v1.py" ]] || fail "npm installer omitted flock_v1.py"
pass "npm installer copies core/lib into installed project"

mkdir -p "$INSTALL_ROOT/.claude/state"
printf 'flock-v1\n' > "$INSTALL_ROOT/.claude/state/locking-protocol-version"
TARGET_MARKER="$TMP_ROOT/npm-target-ran"
CLAUDE_PROJECT_DIR="$INSTALL_ROOT" YANA_RT_BIN="$RUNTIME" bash -c \
  'source "$1/.claude/lib/locking.sh"; with_lock "key:test/npm-runtime" 1 -- touch "$2"' \
  bash "$INSTALL_ROOT" "$TARGET_MARKER"
[[ -f "$TARGET_MARKER" ]] || fail "npm-installed Bash bridge did not execute target"
pass "npm-installed bridge resolves an explicit real yana-rt"

INVALID_RUNTIME="$TMP_ROOT/yana-rt-shim"
printf '#!/bin/sh\nexit 0\n' > "$INVALID_RUNTIME"
chmod +x "$INVALID_RUNTIME"
rm -f "$TARGET_MARKER"
if CLAUDE_PROJECT_DIR="$INSTALL_ROOT" YANA_RT_BIN="$INVALID_RUNTIME" bash -c \
  'source "$1/.claude/lib/locking.sh"; with_lock "key:test/npm-fail-closed" 1 -- touch "$2"' \
  bash "$INSTALL_ROOT" "$TARGET_MARKER"; then
  fail "npm-installed bridge accepted a script shim"
fi
[[ ! -e "$TARGET_MARKER" ]] || fail "target ran after npm runtime resolution failure"
pass "npm-installed bridge fails closed without a compiled runtime"

PYTHONPATH="$REPO_ROOT/src" YANA_RT_BIN="$RUNTIME" python3 - <<'PY'
import os
from yana_ai import rt
resolved = rt._find_binary()
if os.path.realpath(resolved or "") != os.path.realpath(os.environ["YANA_RT_BIN"]):
    raise SystemExit(f"PyPI resolver mismatch: {resolved}")
PY
python3 - "$REPO_ROOT/pyproject.toml" <<'PY'
import sys, tomllib
data = tomllib.load(open(sys.argv[1], "rb"))
wheel = data["tool"]["hatch"]["build"]["targets"]["wheel"]["force-include"]
sdist = data["tool"]["hatch"]["build"]["targets"]["sdist"]["include"]
assert wheel.get("core") == "yana_ai/core"
assert "core/" in sdist
PY
pass "PyPI resolver and wheel/sdist core surfaces remain available"

[[ -x "$RELEASE_RUNTIME" ]] || fail "release yana-rt missing; build it before desktop staging test"
[[ -x "$REPO_ROOT/target/release/pty_bridge" ]] || fail "release pty_bridge missing"
node "$REPO_ROOT/tools/yana-desktop/scripts/stage-runtime.js" >/dev/null
node "$REPO_ROOT/tools/yana-desktop/_test_runtime_paths.js" >/dev/null
[[ -x "$REPO_ROOT/target/desktop-runtime/bin/yana-rt" ]] || fail "desktop stage omitted yana-rt"
pass "desktop staging contains compiled yana-rt"

printf 'flock-v1 packaging regression: %s passed\n' "$PASS_COUNT"
