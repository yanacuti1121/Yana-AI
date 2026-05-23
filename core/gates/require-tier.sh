#!/usr/bin/env bash
# require-tier.sh — Assert minimum tier before executing a command
#
# Usage:
#   bash core/gates/require-tier.sh sovereign "node swarm-router.js FREEZE"
#   bash core/gates/require-tier.sh operator  "git commit ..."
#   bash core/gates/require-tier.sh guest     "ls core/skills"
#
# If YAMTAM_TIER not set, runs identity-gate.sh first automatically.

set -uo pipefail

REQUIRED="$1"; shift
CMD="${*:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TIER_LEVELS=([guest]=0 [operator]=1 [sovereign]=2)

# Auto-auth if not yet identified
if [[ -z "${YAMTAM_TIER:-}" ]]; then
  source "$SCRIPT_DIR/identity-gate.sh"
fi

CURRENT_LEVEL="${TIER_LEVELS[${YAMTAM_TIER:-guest}]:-0}"
REQUIRED_LEVEL="${TIER_LEVELS[$REQUIRED]:-99}"

if [[ "$CURRENT_LEVEL" -lt "$REQUIRED_LEVEL" ]]; then
  echo "" >&2
  echo "  ╔═══════════════════════════════════════════╗" >&2
  echo "  ║  [ACCESS DENIED]                          ║" >&2
  echo "  ║  Cần: Tier ${REQUIRED_LEVEL} (${REQUIRED^^})              ║" >&2
  echo "  ║  Hiện: Tier ${CURRENT_LEVEL} (${YAMTAM_TIER^^})             ║" >&2
  echo "  ║  Lệnh bị khóa.                            ║" >&2
  echo "  ╚═══════════════════════════════════════════╝" >&2
  exit 8
fi

# Tier met — execute command if provided
if [[ -n "$CMD" ]]; then
  eval "$CMD"
fi
