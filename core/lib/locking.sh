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
  # YANA_LOCK_STALE_AFTER_SECS mirrors core/lib/py/file_lock.py's own
  # _stale_after_secs() override — same env var name, same purpose (a
  # legitimately longer critical section, or a fast regression test that
  # doesn't want to sleep past a real 5s window). Previously hardcoded
  # here with no override, unlike the Python side which already had one.
  local resolved_stale_after="${YANA_LOCK_STALE_AFTER_SECS:-5}"
  [[ "$resolved_stale_after" =~ ^[0-9]+$ ]] || resolved_stale_after=5
  local lock_name lock_dir stale_after="$resolved_stale_after"
  lock_name=$(_yana_lock_name_for "$resource")
  if [[ -z "$lock_name" ]]; then
    echo "with_lock: could not derive lock name for '$resource' (python3 unavailable?) — refusing to proceed unlocked" >&2
    return 1
  fi
  lock_dir=".claude/state/locks/${lock_name}.lock"
  mkdir -p "$(dirname "$lock_dir")"

  # Staleness must be re-checked on EVERY failed mkdir attempt, not once
  # before the loop starts. A one-time pre-loop check only catches a lock
  # that was ALREADY stale the instant this process began acquiring —
  # under real contention (many processes queued on the same lock name,
  # each holding it briefly in turn), a later-queued process's first
  # mkdir attempt can easily land more than stale_after seconds after
  # whichever holder is CURRENTLY active started, even though that holder
  # is not stale relative to its own acquisition time and is still alive.
  # Repro: reproduced live 2026-08-06 racing 10x risk-scorer.sh (Python)
  # against 10x token-budget-guard.sh (this fallback) on the same file —
  # a holder starting at t=0 and a waiter whose first check lands at t=6
  # (past stale_after=5) rmdir'd the still-active holder's lock mid-use,
  # producing two simultaneous holders and lost writes (CI's
  # "token-budget.json: real concurrent cross-language race (ADR-008)"
  # test). Matches the loop-per-iteration pattern
  # core/lib/py/file_lock.py's FileLock already uses correctly (its
  # _try_reclaim_stale() runs inside the retry loop, not before it) —
  # this brings the bash fallback in line with that, not a new design.
  # GNU coreutils' `stat -f` (filesystem-status mode) is a DIFFERENT
  # flag from BSD/macOS's `stat -f FORMAT` (custom format string) —
  # same letter, unrelated meaning. On Linux `stat -f '%m' "$dir"`
  # doesn't fail (so the original `||`-fallback chain never reaches
  # `-c '%Y'`); it succeeds while printing filesystem-level output that
  # is not a timestamp, so `mtime` silently ends up non-numeric. Under
  # `set -u` (this script's own header), the `$(( ... - mtime ))`
  # arithmetic below then tries to expand that non-numeric string as a
  # bash variable NAME (arithmetic context auto-expands bare
  # identifiers) and dies with "<value>: unbound variable" instead of
  # quietly producing a wrong number — found live via CI (ubuntu-latest)
  # on the very regression test this reclaim logic exists for; never
  # surfaced locally on macOS, where the BSD form is correct on the
  # first try. Fix: try GNU `-c` first (the common CI/Linux case) and
  # validate the result is purely numeric before trusting either branch,
  # rather than relying on exit-code-only fallback ordering.
  _yana_lock_reclaim_if_stale() {
    local dir="$1" mtime age
    [[ -d "$dir" ]] || return 0
    mtime=$(stat -c '%Y' "$dir" 2>/dev/null)
    [[ "$mtime" =~ ^[0-9]+$ ]] || mtime=$(stat -f '%m' "$dir" 2>/dev/null)
    [[ "$mtime" =~ ^[0-9]+$ ]] || return 0
    age=$(( $(date +%s) - mtime ))
    if (( age >= stale_after )); then rmdir "$dir" 2>/dev/null || true; fi
  }

  _yana_lock_reclaim_if_stale "$lock_dir"

  local tries=0 max_tries=$(( timeout_secs * 20 )) # 50ms poll interval
  while ! mkdir "$lock_dir" 2>/dev/null; do
    tries=$((tries + 1))
    if (( tries >= max_tries )); then
      echo "with_lock: timed out acquiring lock for '$resource' after ${timeout_secs}s" >&2
      return 1
    fi
    _yana_lock_reclaim_if_stale "$lock_dir"
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
