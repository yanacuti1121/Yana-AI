#!/usr/bin/env bash
# Start the VieNeu-TTS sidecar server (127.0.0.1:7861 by default).
# First run: create the venv + install pinned-compatible deps.
#   python3.13 -m venv .venv  # or any Python 3.10-3.13
#   .venv/bin/python -m pip install -r requirements.txt
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -x .venv/bin/python ]]; then
  echo "VieNeu sidecar is not installed." >&2
  echo "Run with Python 3.10-3.13: python3.13 -m venv .venv" >&2
  echo "Then: .venv/bin/python -m pip install -r requirements.txt" >&2
  exit 1
fi
exec .venv/bin/python server.py
