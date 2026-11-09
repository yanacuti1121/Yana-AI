#!/usr/bin/env bash
# Compatibility entrypoint for the canonical filesystem-derived metadata gate.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
exec python3 "$ROOT/core/scripts/check_counts.py" "$@"
