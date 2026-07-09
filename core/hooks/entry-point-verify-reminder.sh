#!/usr/bin/env bash
# Yana AI Hook
# Description: Advisory reminder to dispatch an independent verify-agent
# real-exec() pass after editing a registered fragile entry-point file
# (see core/rules/71-entry-point-verify-law.md).
#
# PostToolUse(Write|Edit|MultiEdit) — the write has already happened by the
# time this runs, so it can only advise (additionalContext), never deny.
# Mirrors guard-blast-radius.sh: Rust-only, no bash reimplementation of the
# path-matching logic (src/guard/blast_paths.rs::entry_point_hit), so this
# guard can't drift out of sync with the compiled matcher. If yana-rt isn't
# built/installed, this hook passes through silently rather than blocking
# every Write/Edit for anyone who hasn't built it yet.
#
# Bypass: set YANA_ENTRY_POINT_BYPASS=1 to skip this hook for one session.
#
# Exit behaviour: always exit 0 (advisory-only — see rule doc for why a
# PostToolUse hook cannot deny the write that already happened).
#
# Reference: core/rules/71-entry-point-verify-law.md

set -uo pipefail

if [[ "${YANA_ENTRY_POINT_BYPASS:-0}" == "1" ]]; then
  exit 0
fi

if command -v yana-rt >/dev/null 2>&1; then
  # Do NOT `exec` here (that would propagate yana-rt's own exit code). An
  # older yana-rt on PATH that predates this subcommand exits non-zero with
  # a clap "unrecognized subcommand" error — observed directly in dev while
  # wiring this hook. This is advisory-only and must never fail the tool
  # call just because the installed binary is stale, so its exit code is
  # discarded and this script always exits 0 regardless of the outcome.
  yana-rt guard entry-point-check || \
    echo "[entry-point-verify-reminder] yana-rt on PATH rejected 'guard entry-point-check' (likely a stale build predating this subcommand) — reminder skipped for this call. Rebuild with 'cargo build --release'." >&2
  exit 0
fi

echo "[entry-point-verify-reminder] yana-rt not found on PATH — entry-point verify reminder skipped for this call. Build it with 'cargo build --release' (see src/guard/entry_point_check.rs)." >&2
exit 0
