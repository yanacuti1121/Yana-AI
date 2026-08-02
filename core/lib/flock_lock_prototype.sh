#!/usr/bin/env bash
# core/lib/flock_lock_prototype.sh — PROTOTYPE bash call site for the
# kernel-flock locking design. Not wired into any production hook.
#
# Usage:
#   source core/lib/flock_lock_prototype.sh
#   flock_lock_with <resource> <timeout_secs> -- <command...>
#
# This file does nothing on its own — it derives the same canonical lock
# path core/lib/py/file_lock.py already computes (lock_name_for, unchanged
# — only the *shape* of what's at that path changes, directory to file)
# and hands off entirely to core/lib/py/flock_run.py, which is the only
# place that actually opens/flocks and then execs the target. No mkdir, no flock(1)
# binary (not preinstalled on macOS), no owner token, no stale-reclaim
# logic of any kind lives in this file or its target — see the ABA-safety
# audit that motivated this design for why the mkdir + rename-reclaim
# approach this replaces cannot be made safe with portable primitives.
#
# If python3 is unavailable, this prototype fails closed. Running an
# unlocked command would violate the locking contract; a future production
# migration must make Python an explicit runtime prerequisite or use a
# separately reviewed non-Python implementation.

# This script's own directory — where core/lib/py/{file_lock,flock_run}.py
# actually live, always, regardless of which project's resource is being
# locked. Deliberately NOT derived from $CLAUDE_PROJECT_DIR: that variable
# names the project whose *resource* is being protected (legitimately
# variable — e.g. a test harness pointing it at an isolated scratch dir so
# lock files land outside the real repo), which is a different thing from
# "where is this helper script installed." Conflating the two was a real
# bug found while building this prototype's own cross-language test
# harness: pointing CLAUDE_PROJECT_DIR at a scratch directory (to keep
# lock *files* isolated, correctly) made this script go looking for
# flock_run.py *inside that scratch directory* too, where it obviously
# doesn't exist. BASH_SOURCE-relative resolution fixes it for good,
# matching core/lib/locking.sh's own documented lesson from the same
# mistake (see that file's header on why it moved off a BASH_SOURCE-
# relative *source* path for a *different* reason — mirrored copies. This
# file has no mirrored-copy problem since core/lib/ is never mirrored, so
# BASH_SOURCE-relative resolution is safe here, not just convenient).
_yana_flock_proto_lib_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
}

# core/lib/py/file_lock.py is importable as core.lib.py.file_lock only
# with the repo root (three levels above core/lib/) on sys.path — derived
# from this script's own location, same reasoning as
# _yana_flock_proto_lib_dir above, not from $CLAUDE_PROJECT_DIR.
_yana_flock_proto_repo_root() {
  local lib_dir
  lib_dir=$(_yana_flock_proto_lib_dir)
  cd "$lib_dir/../.." && pwd
}

_yana_flock_proto_name_for() {
  local resource="$1" repo_root
  repo_root=$(_yana_flock_proto_repo_root)
  python3 -c "
import sys
sys.path.insert(0, '$repo_root')
from core.lib.py.file_lock import lock_name_for
print(lock_name_for(sys.argv[1]))
" "$resource"
}

flock_lock_with() {
  local resource="$1" timeout_secs="$2"
  shift 2
  [[ "${1:-}" == "--" ]] && shift

  if ! command -v python3 >/dev/null 2>&1; then
    echo "flock_lock_with: python3 not found — refusing to run without the required lock helper" >&2
    return 2
  fi

  local project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
  local lib_dir
  lib_dir=$(_yana_flock_proto_lib_dir)
  local lock_name
  lock_name=$(_yana_flock_proto_name_for "$resource") || {
    echo "flock_lock_with: could not derive lock name for '$resource'" >&2
    return 2
  }
  if [[ -z "$lock_name" ]]; then
    echo "flock_lock_with: empty lock name derived for '$resource'" >&2
    return 2
  fi

  local lock_file="$project_dir/.claude/state/locks/${lock_name}.lock"
  mkdir -p "$(dirname "$lock_file")"

  # Direct argv exec — no eval, no command-string concatenation. "$@" at
  # this point is exactly the caller's <command...>, passed through
  # unmodified as separate argv entries to flock_run.py, which itself
  # execs them directly (os.execvp, no shell). flock_run.py's own path is BASH_SOURCE-relative
  # (see _yana_flock_proto_lib_dir) — the lock *file* path above is the
  # only thing derived from $CLAUDE_PROJECT_DIR.
  python3 "$lib_dir/py/flock_run.py" \
    --lock-file "$lock_file" \
    --timeout "$timeout_secs" \
    -- "$@"
}
