#!/usr/bin/env bash
# Yana AI — quick installer, served at https://yanacuti1121.github.io/yana-ai/install.sh
# Usage: curl -sSL https://yanacuti1121.github.io/yana-ai/install.sh | bash
#
# Installs the yana-ai Python CLI (pip) and wires hooks into the current
# directory. Not distributed via npm — see VERSIONING.md's "Why product
# has no registry" section for why.
set -euo pipefail

err() { echo "Error: $*" >&2; }
info() { echo "-> $*"; }

PIP_BIN=""
if command -v pip3 >/dev/null 2>&1; then
  PIP_BIN="pip3"
elif command -v pip >/dev/null 2>&1; then
  PIP_BIN="pip"
fi

if [[ -z "$PIP_BIN" ]]; then
  err "No pip/pip3 found on PATH. Install Python 3.11+ first, or use one of:"
  err "  cargo install yana-rt   (Rust runtime only, no Python required)"
  exit 1
fi

info "Installing yana-ai via $PIP_BIN ..."
"$PIP_BIN" install --upgrade yana-ai

if ! command -v yana-ai >/dev/null 2>&1; then
  err "yana-ai installed but not found on PATH."
  err "Your Python user-scripts directory is probably not on PATH — check:"
  err "  $PIP_BIN show -f yana-ai | grep Location"
  exit 1
fi

info "Wiring hooks into the current directory ..."
yana-ai install .

info "Done. Run 'yana-ai doctor .' to verify."
