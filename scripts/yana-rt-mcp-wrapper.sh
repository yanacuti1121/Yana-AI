#!/usr/bin/env bash
# Wrapper for Buzz's BUZZ_ACP_MCP_COMMAND, which invokes its target with
# zero arguments (crates/buzz-acp/src/lib.rs's build_mcp_servers():
# args: vec![]) -- yana-rt itself requires the `mcp` subcommand, so this
# thin wrapper supplies it. See docs/programs/buzz-mcp-integration.md.
#
# Resolution: $YANA_RT_BIN if set, else target/release/yana-rt relative
# to this script's repo, else target/debug/yana-rt. Deliberately does NOT
# fall back to a bare `yana-rt` PATH lookup -- this repo has already been
# bitten once by that exact self-recursion class of bug (see
# scripts/yana-rt-wrapper.js's header comment), and this wrapper has no
# analogous need for a PATH fallback, so it simply isn't offered.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -n "${YANA_RT_BIN:-}" ]]; then
  BIN="$YANA_RT_BIN"
elif [[ -x "$REPO_ROOT/target/release/yana-rt" ]]; then
  BIN="$REPO_ROOT/target/release/yana-rt"
elif [[ -x "$REPO_ROOT/target/debug/yana-rt" ]]; then
  BIN="$REPO_ROOT/target/debug/yana-rt"
else
  echo "yana-rt-mcp-wrapper: no yana-rt binary found. Set YANA_RT_BIN, or run 'cargo build --release --features mcp' in $REPO_ROOT." >&2
  exit 1
fi

exec "$BIN" mcp
