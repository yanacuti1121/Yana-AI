#!/usr/bin/env bash
# Start the VieNeu-TTS sidecar server (127.0.0.1:7861 by default).
# First run: create the venv + install deps.
#   python3 -m venv .venv && source .venv/bin/activate && pip install vieneu fastapi "uvicorn[standard]"
set -euo pipefail
cd "$(dirname "$0")"
source .venv/bin/activate
exec python3 server.py
