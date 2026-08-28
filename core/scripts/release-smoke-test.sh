#!/usr/bin/env bash
# Authority Hardening item #11 (Release artifact assurance).
#
# Before this script, release.yml's own smoke test was `<binary> --version`
# only -- confirmed by reading the file directly, not assumed. That proves
# the binary isn't dead on arrival, and nothing more: argument parsing far
# enough to print a version string is a much lower bar than "the runtime
# actually works." A binary that compiles, links, and answers --version but
# panics on its very first real subcommand would still have shipped.
#
# This is a golden smoke test for the EXACT artifact about to ship -- it
# takes the built binary's path as $1 and execs that file directly, never
# building a separate copy to test (the specific anti-pattern item #11
# warned against: "test the artifact that is actually shipped, do not
# build a separate binary to test and then upload an untested one").
#
# Deliberately offline: no network call, no cloud provider API key, no
# `chat` invocation (the only subcommand that talks to a model). Every
# check below exercises real runtime code paths -- clap dispatch, the
# capability sandbox, the Giam Thi HALT primitive, Capability Lease --
# using only local filesystem state in a throwaway temp directory.
#
# Honest scope limit (documented, not hidden): this does not exercise
# RuntimeAuthority::capability_decision's Allow/Deny/HumanApprovalRequired
# branches directly -- there is no scriptable CLI entry point that invokes
# TurnEngine's tool-authorization path without a live chat session (which
# needs a model provider). What this DOES verify is the state
# capability_decision's HALT check reads (`os supervisor halt`/`status`)
# and the state a matched lease consumes (`lease grant`/`list`/`revoke`),
# which is the actual authority-relevant surface reachable offline.
# Exercising capability_decision itself end-to-end is a real gap, noted
# for a future pass, not silently skipped here.
set -euo pipefail

BINARY="${1:?usage: release-smoke-test.sh <path-to-yana-rt-binary>}"
if [[ ! -x "$BINARY" ]]; then
  echo "[release-smoke-test] FAIL: '$BINARY' is not an executable file"
  exit 1
fi
BINARY="$(cd "$(dirname "$BINARY")" && pwd)/$(basename "$BINARY")"

WORKDIR="$(mktemp -d)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

STEP=0
FAILED=0
check() {
  STEP=$((STEP + 1))
  local desc="$1"
  shift
  echo "--- [$STEP] $desc ---"
  if "$@"; then
    echo "    PASS"
  else
    echo "    FAIL: $desc"
    FAILED=1
  fi
}

cd "$WORKDIR"
git init -q .
export YANA_LOCKING_PROTOCOL_MODE=test

# 1. Runtime starts.
check "runtime starts (--version)" bash -c "'$BINARY' --version >/dev/null"

# 2. Dispatch table works: a real, harmless read command through the full
#    clap Commands enum -> capability::lease dispatch path, on an empty
#    lease store (no leases granted yet).
check "dispatch table works (lease list on empty store)" bash -c "'$BINARY' lease list >/dev/null"

# 3. Temp workspace works, safe canonical read/validation works: the same
#    bounded-tree capability MCP's repo_tree tool and Desktop's argv path
#    both use -- Gate L5 path handling, generated-dir skip, entry cap.
check "capability sandbox read (capability tree)" bash -c "'$BINARY' capability tree --root '$WORKDIR' --depth 1 >/dev/null"

# 4. HALT works: create the shared halt lock, confirm status reports it
#    active, then run the human-only unlock ceremony and confirm it
#    clears. This is the exact primitive
#    YanaAuthorityChain::preflight_turn reads via crate::os::halt_is_active
#    before any capability decision is made.
check "HALT lock can be created" bash -c "'$BINARY' os supervisor halt --reason 'release smoke test' --actor 'release-smoke-test' >/dev/null"
check "HALT status reports mode=halted" bash -c "'$BINARY' os supervisor status --json | python3 -c 'import json,sys; d=json.load(sys.stdin); exit(0 if d[\"mode\"] == \"halted\" else 1)'"
check "HALT can be unlocked" bash -c "'$BINARY' os supervisor unlock --approve --reason 'release smoke test cleanup' --actor 'release-smoke-test' >/dev/null"

# 5. Capability Lease grant/list/revoke round-trips.
check "lease grant" bash -c "'$BINARY' lease grant --subject agent:release-smoke-test --capability command.execute --allow 'echo' --expires-in-minutes 5 --invocation-budget 1 >/dev/null"
check "lease list shows the granted lease" bash -c "'$BINARY' lease list --json | grep -q 'agent:release-smoke-test'"
LEASE_ID="$("$BINARY" lease list --json | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])')"
check "lease revoke" bash -c "'$BINARY' lease revoke '$LEASE_ID' >/dev/null"
check "revoked lease shows as revoked" bash -c "'$BINARY' lease list --json | python3 -c 'import json,sys; d=json.load(sys.stdin); exit(0 if d[0][\"revoked\"] else 1)'"

# 6. Authority decision receipts CLI (Authority Hardening item #3) works
#    on an empty log -- the reader side of the same evidence trail these
#    checks would populate if run through a real authorized capability
#    call.
check "authority receipts CLI works" bash -c "'$BINARY' authority receipts --json >/dev/null"

echo ""
if [[ "$FAILED" -eq 1 ]]; then
  echo "[release-smoke-test] FAIL — one or more checks failed against $BINARY"
  exit 1
fi
echo "[release-smoke-test] PASS — $STEP checks passed against $BINARY"
