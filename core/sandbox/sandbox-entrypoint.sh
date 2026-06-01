#!/usr/bin/env bash
# sandbox-entrypoint.sh — Container entrypoint for yamtam-sandbox
# Runs as nobody inside read-only Alpine container.
# Security enforced by Docker flags: --cap-drop ALL, --network=none, --read-only
set -uo pipefail

if [[ $# -eq 0 ]]; then
  echo "[sandbox] no command provided" >&2
  exit 1
fi

exec "$@"
