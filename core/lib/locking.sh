#!/usr/bin/env bash
# flock-v1 acquire→exec bridge for Bash callers.
# Usage: with_lock <key-or-resource> <timeout-seconds> -- <command...>

_yana_lock_is_real_binary() {
  local candidate="$1" magic
  [[ -n "$candidate" && -f "$candidate" && -x "$candidate" ]] || return 1
  magic=$(od -An -tx1 -N4 "$candidate" 2>/dev/null | tr -d '[:space:]') || return 1
  case "$magic" in
    7f454c46|cffaedfe|feedfacf|cafebabe|bebafeca) return 0 ;;
    *) return 1 ;;
  esac
}

_yana_lock_platform_binary() {
  local project_root="$1" platform arch
  case "$(uname -s)" in
    Darwin) platform="darwin" ;;
    Linux) platform="linux" ;;
    *) return 1 ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) arch="x86_64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) return 1 ;;
  esac
  printf '%s/bin/yana-rt-%s-%s\n' "$project_root" "$platform" "$arch"
}

_yana_lock_runtime() {
  local project_root="$1" candidate
  if [[ -n "${YANA_RT_BIN:-}" ]]; then
    candidate="$YANA_RT_BIN"
    if _yana_lock_is_real_binary "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
    echo "with_lock: YANA_RT_BIN is not a compiled yana-rt binary: $candidate" >&2
    return 1
  fi

  candidate=$(_yana_lock_platform_binary "$project_root" 2>/dev/null || true)
  if _yana_lock_is_real_binary "$candidate"; then
    printf '%s\n' "$candidate"
    return 0
  fi

  candidate="$project_root/target/release/yana-rt"
  if _yana_lock_is_real_binary "$candidate"; then
    printf '%s\n' "$candidate"
    return 0
  fi

  candidate="$project_root/target/debug/yana-rt"
  if _yana_lock_is_real_binary "$candidate"; then
    printf '%s\n' "$candidate"
    return 0
  fi

  candidate=$(command -v yana-rt 2>/dev/null || true)
  if _yana_lock_is_real_binary "$candidate"; then
    printf '%s\n' "$candidate"
    return 0
  fi

  echo "with_lock: compiled yana-rt not found; set YANA_RT_BIN or install a platform binary" >&2
  return 1
}

# Opt-in bootstrap for the flock-v1 protocol marker on a fresh checkout.
#
# `.claude/state/` is gitignored, so a new clone has no
# `.claude/state/locking-protocol-version`. `yana-rt guard lock-with` then
# refuses every call ("protocol marker missing"), and because the hooks that
# use with_lock run on every tool call, nothing could create the marker from
# inside a session either.
#
# The marker is the operator-controlled gate of the mkdir-v1 -> flock-v1
# cutover (docs/adr/ADR-008-shared-locking-infrastructure.md), and an idle
# mkdir-v1 install looks exactly like a fresh clone (mkdir-v1 removes its lock
# directory on release), so this NEVER activates on its own. It writes the
# marker only when the caller sets YANA_LOCK_AUTO_ACTIVATE=1, for example in
# the environment of a disposable cloud session, and then only if:
#   - there is no maintenance gate     (an operator cutover is in progress)
#   - there is no marker of any content (never rewritten, a mismatch stays one)
#   - nothing but regular files is under locks/ (mkdir-v1 residue: use the migration helper)
#   - .claude and .claude/state are real directories, and writable
# Without the opt-in it only prints how to activate. Returns 0 always; the
# caller's lock attempt reports any remaining problem.
_yana_lock_bootstrap_marker() {
  local project_root="$1" state_dir marker temporary
  # Test mode skips the marker check in the runtime, so there is nothing to activate.
  [[ "${YANA_LOCKING_PROTOCOL_MODE:-}" == "test" ]] && return 0
  [[ -n "$project_root" && "$project_root" == /* ]] || return 0
  state_dir="$project_root/.claude/state"
  marker="$state_dir/locking-protocol-version"
  [[ -e "$marker" || -L "$marker" ]] && return 0
  [[ -e "$state_dir/locking-maintenance" || -L "$state_dir/locking-maintenance" ]] && return 0
  if [[ "${YANA_LOCK_AUTO_ACTIVATE:-}" != "1" ]]; then
    echo "with_lock: flock-v1 is not activated here ($marker is missing). On a fresh checkout set YANA_LOCK_AUTO_ACTIVATE=1 (or write 'flock-v1' to that file); on an existing mkdir-v1 install use core/scripts/migrate-locking-protocol-v1.py." >&2
    return 0
  fi
  [[ -L "$project_root/.claude" || -L "$state_dir" ]] && return 0
  if [[ -e "$state_dir/locks" || -L "$state_dir/locks" ]]; then
    [[ -L "$state_dir/locks" || ! -d "$state_dir/locks" ]] && return 0
    # flock-v1 lock files are regular files; anything else is not ours to judge.
    # find (not a glob) so odd names such as "..x" are covered and failglob cannot trip it.
    [[ -z "$(find "$state_dir/locks" -mindepth 1 ! -type f -print -quit 2>/dev/null)" ]] || return 0
  fi
  mkdir -p "$state_dir" 2>/dev/null || return 0
  [[ -L "$project_root/.claude" || -L "$state_dir" ]] && return 0
  temporary=$(mktemp "$state_dir/locking-protocol-version.tmp.XXXXXX" 2>/dev/null) || return 0
  if printf 'flock-v1\n' > "$temporary" 2>/dev/null \
    && ln "$temporary" "$marker" 2>/dev/null; then
    # ln fails if the marker appeared meanwhile, so a concurrent caller or an
    # operator's own write is never overwritten.
    echo "with_lock: YANA_LOCK_AUTO_ACTIVATE=1, activated flock-v1 (wrote $marker)" >&2
  elif [[ ! -e "$marker" ]]; then
    echo "with_lock: could not write $marker (no hard links or no write access?); create it by hand" >&2
  fi
  rm -f "$temporary" 2>/dev/null || true
  return 0
}

with_lock() {
  local resource="${1:-}" timeout_secs="${2:-}" project_root runtime
  [[ -n "$resource" && -n "$timeout_secs" ]] || {
    echo "with_lock: usage: with_lock <key-or-resource> <timeout-seconds> -- <command...>" >&2
    return 2
  }
  shift 2
  [[ "${1:-}" == "--" ]] && shift
  [[ $# -gt 0 ]] || { echo "with_lock: no command given" >&2; return 2; }
  [[ "$timeout_secs" =~ ^[0-9]+$ ]] || {
    echo "with_lock: timeout must be a non-negative integer" >&2
    return 2
  }
  project_root="${CLAUDE_PROJECT_DIR:-${YANA_PROJECT_ROOT:-}}"
  [[ -n "$project_root" && "$project_root" == /* ]] || {
    echo "with_lock: explicit absolute CLAUDE_PROJECT_DIR or YANA_PROJECT_ROOT is required" >&2
    return 1
  }
  case "$(uname -s)" in
    Darwin|Linux) ;;
    *) echo "with_lock: flock-v1 is supported only on macOS and Linux" >&2; return 1 ;;
  esac
  runtime=$(_yana_lock_runtime "$project_root") || return $?
  _yana_lock_bootstrap_marker "$project_root"
  "$runtime" guard lock-with --resource "$resource" --timeout "$timeout_secs" -- "$@"
}
