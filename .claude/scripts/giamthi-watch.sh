#!/usr/bin/env bash
# Source-checkout bridge to the canonical Giám Thị watcher.
# Installed targets receive a full copy of core/scripts/giamthi-watch.sh via
# install_project.py, so they do not depend on the source-only core/ tree.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CANONICAL="$PROJECT_ROOT/core/scripts/giamthi-watch.sh"
LOCK_FILE="$PROJECT_ROOT/.claude/state/GIAMTHI_HALT.lock"

if [[ ! -f "$CANONICAL" || -L "$CANONICAL" ]]; then
  mkdir -p "$(dirname "$LOCK_FILE")" 2>/dev/null || true
  if [[ ! -e "$LOCK_FILE" && ! -L "$LOCK_FILE" ]]; then
    umask 077
    printf '%s\n' \
      "GIAM THI HALT: canonical watcher is missing or unsafe: $CANONICAL" \
      "Only a human may clear this lock after review." > "$LOCK_FILE" 2>/dev/null || true
  fi
  echo "Giám Thị refused to run: canonical watcher is missing or unsafe: $CANONICAL" >&2
  exit 2
fi

exec bash "$CANONICAL" "$@"
