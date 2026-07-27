#!/usr/bin/env bash
# Yana AI Hook
# Description: Block write/delete-class shell commands whose real blast
# radius (file count, or a hit on a protected path) is too large —
# regardless of which tool name is used. Complements guard-destructive.sh,
# which matches command *text* against a fixed pattern list and therefore
# structurally misses bypasses like `find . -delete` or `git push origin
# +main`. See src/guard/blast_radius.rs for the full design rationale.
#
# Rust-only — there is no bash fallback. The actual check requires a real
# filesystem walk + glob expansion + shell tokenization; reimplementing
# that safely in bash/jq risks reintroducing the exact bypass classes this
# guard exists to close. If yana-rt isn't built/installed, this hook
# passes the command through (exit 0) with a stderr note rather than
# blocking every Bash call for anyone who hasn't built it yet —
# guard-destructive.sh's regex checks still run regardless.
#
# Bypass: set YANA_BLAST_BYPASS=1 to skip this hook for one session.
#
# Exit behaviour:
#   exit 0          — allow the command (or yana-rt unavailable — see above)
#   JSON + exit 2   — block the command and show the reason to Claude

set -euo pipefail

if [[ "${YANA_BLAST_BYPASS:-0}" == "1" ]]; then
  exit 0
fi

if command -v yana-rt >/dev/null 2>&1; then
  exec yana-rt guard blast-radius
fi

echo "[guard-blast-radius] yana-rt not found on PATH — blast-radius protection skipped for this call. Build it with 'cargo build --release' for the full guard (see src/guard/blast_radius.rs)." >&2
exit 0
