#!/usr/bin/env bash
# core/lib/locking.sh — ADR-008 shared locking primitive, bash call site.
# docs/adr/ADR-008-shared-locking-infrastructure.md
#
# Usage:
#   source core/lib/locking.sh
#   with_lock <resource> <timeout_secs> -- <command...>
#
# <resource> is the thing being protected — usually the target file path a
# read-decide-write critical section is about to touch (e.g.
# "core/memory/L2_session/token-budget.json"). The lock name is derived
# from it the same way on every call site (bash/Python/Node/Rust), so two
# different-language processes touching the same resource contend for the
# same lock — this is what closes the cross-language race between
# risk-scorer.sh (Python) and token-budget-guard.sh (Node), which target
# the identical JSON file and previously had no shared serialization point.
#
# Per ADR-008: the lock must wrap the ENTIRE read-decide-write unit, not
# just a final write call. <command...> should be one process that does
# the full read -> decide -> write itself (a single `python3 script.py`
# invocation, not several separate calls interleaved with shell logic) —
# wrapping only a write leaves the TOCTOU gap this primitive exists to
# close.
#
# Delegates to the canonical Rust implementation (src/guard/lock.rs, real
# fencing-token stale-lock reclaim) via `yana-rt guard lock-with` when a
# fresh-enough binary is on PATH — same present-else-fallback pattern this
# repo already uses in guard-destructive.sh/token-budget-guard.sh. Falls
# back to a minimal native mkdir-based lock otherwise: correctness-
# degraded relative to the Rust path (unconditional-rmdir stale reclaim,
# same as core/hooks/audit-log.sh's original — NOT the fencing-token
# version, so a slow-but-alive holder in the fallback path could in theory
# be reclaimed early under heavy contention). Accepted per ADR-008's
# explicit tradeoff note: this only activates when yana-rt itself is
# unavailable, a degraded mode every sibling hook already tolerates.

YANA_LOCK_MIN_VERSION="1.3.3" # first version with `guard lock-with` (ADR-008)

# True if $1 >= $2, both dotted-numeric versions. Same implementation as
# guard-destructive.sh's version_ge — kept as a separate copy (not sourced
# from there) since this file is meant to be sourced standalone by any hook
# without pulling in guard-destructive.sh's unrelated logic.
_yana_lock_version_ge() {
  local IFS=.
  local -a v1=($1) v2=($2)
  local i a b
  for ((i = 0; i < 3; i++)); do
    a="${v1[i]:-0}"; b="${v2[i]:-0}"
    [[ "$a" =~ ^[0-9]+$ ]] || a=0
    [[ "$b" =~ ^[0-9]+$ ]] || b=0
    if ((10#$a > 10#$b)); then return 0; fi
    if ((10#$a < 10#$b)); then return 1; fi
  done
  return 0
}

# Derive the lock directory name the SAME way src/guard/lock.rs and
# core/lib/py/file_lock.py do (SHA-256-first-4-bytes-hex + sanitized
# prefix) by calling the Python implementation directly, rather than
# re-deriving it a third time by hand in bash.
#
# FOUND LIVE (2026-07-23, independent security-auditor + code-auditor
# review, both converged on this same bug): this function used to compute
# its own hash via `cksum`, a completely different algorithm/value-space
# than the canonical SHA-256 scheme — for the same resource string, the
# two derivations point at DIFFERENT lock directories. In the exact
# "yana-rt absent" scenario this fallback exists for, that meant
# token-budget-guard.sh's bash fallback and risk-scorer.sh/
# budget-sentinel.sh's Python FileLock (which always use the SHA-256
# scheme, no yana-rt delegation at all) stopped contending for the same
# lock entirely — reproduced live by code-auditor: 20% lost-update rate
# racing 10x risk-scorer.sh against 10x token-budget-guard.sh with
# yana-rt off PATH. Calling the Python function directly (rather than
# hand-porting SHA-256 into bash as a third independent implementation)
# is deliberate: the parity bug happened specifically because the bash
# version was authored separately from the two implementations that DO
# have a golden parity test — this makes bash text-identical instead of
# giving it a 4th thing to drift.
_yana_lock_name_for() {
  local resource="$1"
  python3 -c "
import sys, os
sys.path.insert(0, os.environ.get('CLAUDE_PROJECT_DIR', os.getcwd()))
from core.lib.py.file_lock import lock_name_for
print(lock_name_for(sys.argv[1]))
" "$resource"
}

# Minimal native fallback — mkdir mutex, unconditional-rmdir stale reclaim.
# See file header for why this is intentionally simpler (and correctness-
# degraded) relative to src/guard/lock.rs.
_yana_lock_native_fallback() {
  local resource="$1" timeout_secs="$2"; shift 2
  local lock_name lock_dir stale_after=5
  lock_name=$(_yana_lock_name_for "$resource")
  if [[ -z "$lock_name" ]]; then
    echo "with_lock: could not derive lock name for '$resource' (python3 unavailable?) — refusing to proceed unlocked" >&2
    return 1
  fi
  lock_dir=".claude/state/locks/${lock_name}.lock"
  mkdir -p "$(dirname "$lock_dir")"

  if [[ -d "$lock_dir" ]]; then
    local mtime age
    mtime=$(stat -f '%m' "$lock_dir" 2>/dev/null || stat -c '%Y' "$lock_dir" 2>/dev/null || echo "")
    if [[ -n "$mtime" ]]; then
      age=$(( $(date +%s) - mtime ))
      if (( age >= stale_after )); then rmdir "$lock_dir" 2>/dev/null || true; fi
    fi
  fi

  local tries=0 max_tries=$(( timeout_secs * 20 )) # 50ms poll interval
  while ! mkdir "$lock_dir" 2>/dev/null; do
    tries=$((tries + 1))
    if (( tries >= max_tries )); then
      echo "with_lock: timed out acquiring lock for '$resource' after ${timeout_secs}s" >&2
      return 1
    fi
    sleep 0.05
  done

  local exit_code=0
  "$@" || exit_code=$?
  rmdir "$lock_dir" 2>/dev/null || true
  return "$exit_code"
}

with_lock() {
  local resource="$1" timeout_secs="$2"
  shift 2
  [[ "${1:-}" == "--" ]] && shift

  if command -v yana-rt >/dev/null 2>&1; then
    local ver
    ver=$(yana-rt --version 2>/dev/null | awk '{print $2}')
    if [[ -n "$ver" ]] && _yana_lock_version_ge "$ver" "$YANA_LOCK_MIN_VERSION"; then
      yana-rt guard lock-with --resource "$resource" --timeout "$timeout_secs" -- "$@"
      return $?
    fi
    # Stale/unversioned binary: fall through rather than invoke a build
    # that predates `guard lock-with` (same reasoning as
    # guard-destructive.sh's own version gate).
  fi

  _yana_lock_native_fallback "$resource" "$timeout_secs" "$@"
}
