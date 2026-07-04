#!/usr/bin/env bash
# require-tier.sh — Assert minimum tier before executing a command
#
# Usage:
#   bash core/gates/require-tier.sh sovereign "git push origin main"
#   bash core/gates/require-tier.sh operator  "git commit ..."
#   bash core/gates/require-tier.sh guest     "ls core/skills"
#
# If YANA_TIER not set, runs identity-gate.sh first automatically.

set -uo pipefail

REQUIRED="$1"; shift
CMD="${*:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# BUG FIX (2026-07-04): was `TIER_LEVELS=([guest]=0 ...)`, an associative
# array with no `declare -A`. Without that, bash treats it as an indexed
# array and evaluates `[guest]` as an arithmetic subscript — under `set -u`
# that's an "unbound variable" error on the literal word `guest`, aborting
# the script before it ever reached the tier comparison, yet still exiting
# 0 (silent false-pass on every invocation — confirmed via direct testing).
# `declare -A` alone does NOT fix this on macOS: the default /bin/bash
# shipped by Apple is 3.2.57 (2007) for GPLv3-licensing reasons and has no
# associative-array support at all (`declare -A` errors "invalid option").
# CI runs modern bash and would have masked this — the bug only surfaces
# for anyone invoking this script under a stock-macOS bash, which is most
# local dev machines. Rewritten below without associative arrays so it
# works identically on bash 3.2 and bash 4+.
# SECURITY FIX (2026-07-04, caught by security-auditor review of the bug
# fix above): a single tier_level() with one shared "unknown -> 99"
# fallback is itself a fail-open hole — it was symmetric where the
# original (broken) array code was deliberately asymmetric:
#   CURRENT_LEVEL  used unknown -> 0   (fail closed: treat as guest)
#   REQUIRED_LEVEL used unknown -> 99  (fail closed: nothing satisfies it)
# Collapsing both into one function with one fallback meant an
# unrecognized or mistyped YANA_TIER value (e.g. "Guest" wrong-case, or
# garbage from a caller that pre-sets the env var) resolved to level 99 —
# HIGHER than sovereign — granting full bypass instead of denial.
# Reproduced directly: YANA_TIER=nonsense bash require-tier.sh sovereign
# "cmd" ran the command with exit 0 before this fix. Two functions restore
# the original asymmetry so unknown values fail closed on both sides.
current_tier_level() {
  case "$1" in
    guest)     echo 0 ;;
    operator)  echo 1 ;;
    sovereign) echo 2 ;;
    *)         echo 0 ;;   # unrecognized YANA_TIER -> treat as guest, never higher
  esac
}

required_tier_level() {
  case "$1" in
    guest)     echo 0 ;;
    operator)  echo 1 ;;
    sovereign) echo 2 ;;
    *)         echo 99 ;;  # unrecognized required tier -> impossible to satisfy
  esac
}

# Auto-auth if not yet identified
if [[ -z "${YANA_TIER:-}" ]]; then
  source "$SCRIPT_DIR/identity-gate.sh"
fi

CURRENT_LEVEL="$(current_tier_level "${YANA_TIER:-guest}")"
REQUIRED_LEVEL="$(required_tier_level "$REQUIRED")"

if [[ "$CURRENT_LEVEL" -lt "$REQUIRED_LEVEL" ]]; then
  # ${x^^} (bash 4+ case conversion) also doesn't exist on bash 3.2 —
  # tr is the portable equivalent.
  REQUIRED_UPPER="$(printf '%s' "$REQUIRED" | tr '[:lower:]' '[:upper:]')"
  CURRENT_UPPER="$(printf '%s' "${YANA_TIER:-guest}" | tr '[:lower:]' '[:upper:]')"
  echo "" >&2
  echo "  ╔═══════════════════════════════════════════╗" >&2
  echo "  ║  [ACCESS DENIED]                          ║" >&2
  echo "  ║  Cần: Tier ${REQUIRED_LEVEL} (${REQUIRED_UPPER})              ║" >&2
  echo "  ║  Hiện: Tier ${CURRENT_LEVEL} (${CURRENT_UPPER})             ║" >&2
  echo "  ║  Lệnh bị khóa.                            ║" >&2
  echo "  ╚═══════════════════════════════════════════╝" >&2
  exit 8
fi

# Tier met — execute command if provided
# COMPLIANCE-EXCEPTION (shell-sanitize-law.md eval rules): $CMD is not
# external/untrusted input — it's the multi-word command string the
# caller of this script deliberately constructed (a human at a terminal,
# or an agent following core/skills/sovereign-overlord-gate/SKILL.md's
# documented usage), the same trust level as any other command a caller
# would otherwise type directly. eval is required here (not a safer
# array-exec) because $CMD is a single string that may itself contain
# pipes/redirects/&&-chains the caller intended as shell syntax, not
# literal arguments to a single binary.
if [[ -n "$CMD" ]]; then
  eval "$CMD"
fi
