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
  "$runtime" guard lock-with --resource "$resource" --timeout "$timeout_secs" -- "$@"
}
