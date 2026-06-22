#!/usr/bin/env bash
# sandbox-exec.sh — Execute a command inside an isolated sandbox
# Sits between tool-proxy.sh and the actual command execution.
#
# Pipeline:  Agent → tool-proxy.sh (sanitize/mutate) → sandbox-exec.sh → [isolated exec]
#
# Sandbox modes (auto-detected, override with --mode):
#   docker   — ephemeral Alpine container, --network=none, read-only root (default if available)
#   nsjail   — Linux namespace jail (no container daemon needed, ~1ms overhead)
#   ulimit   — ulimit-only fallback (no filesystem isolation, dev/CI use only)
#
# Usage: bash core/scripts/sandbox-exec.sh [--mode docker|nsjail|ulimit] <command> [args...]
#
# Exit codes:
#   0  — command executed successfully
#   1  — sandbox setup or teardown failed
#   2  — command failed inside sandbox (propagated exit code)
#   3  — resource limit exceeded (OOM, timeout, disk cap)
#   4  — requested sandbox mode not available on this host
#   7  — REJECTED: ulimit fallback is forbidden when YANA_ENV=prod
#
# Env overrides:
#   YANA_SANDBOX_MODE     — docker | nsjail | ulimit
#   YANA_SANDBOX_IMAGE    — Docker image (default: yana-ai-sandbox:latest)
#   YANA_SANDBOX_TIMEOUT  — seconds (default: 30)
#   YANA_SANDBOX_MEM_MB   — container memory cap in MB (default: 128)
#   YANA_SANDBOX_CPU      — Docker --cpus value (default: 0.5)
#   YANA_SANDBOX_LOG      — audit log path (default: releases/logs/sandbox.log)
#   YANA_ENV              — prod | dev | ci (default: dev)
#                            prod HARD-REJECTS the ulimit fallback (CORE_AUDIT
#                            2026-06-08, gap #6) — ulimit gives no filesystem
#                            or network isolation, only resource caps. A repo
#                            running in prod without docker/nsjail available
#                            must fail loudly, not silently downgrade.
#   YANA_SANDBOX_PROD_OVERRIDE=1 — explicit, logged escape hatch for prod boxes
#                            that genuinely cannot install docker/nsjail.
#                            Requires identity-gate verification, same as the
#                            safe-run.sh BYPASS contract.
#
# Gate: L3 (runtime isolation)
# Sources: moby/moby, google/nsjail, firecracker-microvm/firecracker
set -uo pipefail

YANA_ENV="${YANA_ENV:-dev}"

# ─── Config ──────────────────────────────────────────────────────────────────
MODE="${YANA_SANDBOX_MODE:-auto}"
IMAGE="${YANA_SANDBOX_IMAGE:-yana-ai-sandbox:latest}"
TIMEOUT="${YANA_SANDBOX_TIMEOUT:-30}"
MEM_MB="${YANA_SANDBOX_MEM_MB:-128}"
CPU="${YANA_SANDBOX_CPU:-0.5}"
LOG_FILE="${YANA_SANDBOX_LOG:-releases/logs/sandbox.log}"
SESSION_ID="${YANA_SESSION_ID:-unknown}"

# Portable short ID — `date +%N` (nanoseconds) and `md5sum` are both GNU-only;
# macOS `date` ignores %N literally and ships `md5`/`shasum`, not `md5sum`.
_seed="$$-${RANDOM:-0}-$(date +%s)"
if command -v sha256sum >/dev/null 2>&1; then
  SANDBOX_ID="sb-$(printf '%s' "$_seed" | sha256sum | head -c 8)"
elif command -v shasum >/dev/null 2>&1; then
  SANDBOX_ID="sb-$(printf '%s' "$_seed" | shasum -a 256 | head -c 8)"
elif command -v md5 >/dev/null 2>&1; then
  SANDBOX_ID="sb-$(printf '%s' "$_seed" | md5 | head -c 8)"
elif command -v md5sum >/dev/null 2>&1; then
  SANDBOX_ID="sb-$(printf '%s' "$_seed" | md5sum | head -c 8)"
else
  SANDBOX_ID="sb-$(printf '%s' "$_seed" | tr -dc 'a-z0-9' | head -c 8)"
fi

# ─── Helpers ─────────────────────────────────────────────────────────────────
log_sandbox() {
  local level="$1" msg="$2" extra="${3:-}"
  local ts; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local entry="{\"ts\":\"${ts}\",\"level\":\"${level}\",\"sandbox\":\"${SANDBOX_ID}\",\"mode\":\"${RESOLVED_MODE:-${MODE}}\",\"session\":\"${SESSION_ID}\",\"msg\":\"${msg}\"${extra:+,${extra}}}"
  mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
  echo "$entry" >> "$LOG_FILE" 2>/dev/null || echo "$entry" >&2
}

die() { echo "[sandbox-exec] ERROR: $1" >&2; log_sandbox "ERROR" "$1"; exit "${2:-1}"; }

# ─── Parse --mode flag ────────────────────────────────────────────────────────
if [[ "${1:-}" == "--mode" ]]; then
  MODE="$2"; shift 2
fi

if [[ $# -eq 0 ]]; then
  die "no command provided" 1
fi

COMMAND=("$@")

# ─── Auto-detect available sandbox mode ──────────────────────────────────────
RESOLVED_MODE="$MODE"
if [[ "$MODE" == "auto" ]]; then
  if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    RESOLVED_MODE="docker"
  elif command -v nsjail &>/dev/null; then
    RESOLVED_MODE="nsjail"
  else
    RESOLVED_MODE="ulimit"
    if [[ "$YANA_ENV" == "prod" && "${YANA_SANDBOX_PROD_OVERRIDE:-0}" != "1" ]]; then
      log_sandbox "BLOCK" "ulimit fallback rejected — YANA_ENV=prod requires docker or nsjail"
      echo "[sandbox-exec] REJECT: no docker/nsjail found and YANA_ENV=prod." >&2
      echo "  ulimit gives resource caps only — no filesystem/network isolation." >&2
      echo "  Install docker or nsjail, or set YANA_SANDBOX_PROD_OVERRIDE=1 to" >&2
      echo "  acknowledge the reduced isolation (logged, requires identity-gate)." >&2
      exit 7
    fi
    echo "[sandbox-exec] WARN: no container runtime — using ulimit fallback (no filesystem isolation)" >&2
    [[ "$YANA_ENV" == "prod" ]] && log_sandbox "WARN" "prod override active — ulimit fallback (reduced isolation)"
  fi
fi

log_sandbox "INFO" "starting" "\"cmd\":\"${COMMAND[*]:0:80}\",\"timeout\":${TIMEOUT}"

# ─── MODE: DOCKER ─────────────────────────────────────────────────────────────
if [[ "$RESOLVED_MODE" == "docker" ]]; then
  if ! command -v docker &>/dev/null; then
    die "docker mode requested but docker not found" 4
  fi

  # Ephemeral container: --rm removes it immediately on exit
  DOCKER_ARGS=(
    run --rm
    --name  "yana-ai-${SANDBOX_ID}"
    --network  none                              # no network
    --read-only                                  # immutable root FS
    --tmpfs    /workspace:rw,size=64m,noexec     # writable workspace (memory-only)
    --tmpfs    /tmp:rw,size=32m,noexec
    --memory   "${MEM_MB}m"                      # RAM cap
    --memory-swap "${MEM_MB}m"                   # disable swap
    --cpus     "${CPU}"                          # CPU cap
    --pids-limit 64                              # prevent fork bomb
    --cap-drop ALL                               # drop ALL Linux capabilities
    --security-opt no-new-privileges             # prevent privilege escalation
    --user     nobody
  )

  # Mount current directory read-only if it's a git repo (for read operations)
  if git rev-parse --git-dir &>/dev/null 2>&1; then
    DOCKER_ARGS+=(--volume "$(git rev-parse --show-toplevel):/repo:ro")
  fi

  log_sandbox "INFO" "docker-launch" "\"image\":\"${IMAGE}\""

  EXIT_CODE=0
  timeout "$TIMEOUT" docker "${DOCKER_ARGS[@]}" "$IMAGE" "${COMMAND[@]}" || EXIT_CODE=$?

  if [[ $EXIT_CODE -eq 124 ]]; then
    log_sandbox "BLOCK" "timeout exceeded" "\"seconds\":${TIMEOUT}"
    echo "[sandbox-exec] BLOCKED: command exceeded ${TIMEOUT}s timeout" >&2
    exit 3
  fi

  log_sandbox "INFO" "docker-exit" "\"code\":${EXIT_CODE}"
  exit $EXIT_CODE
fi

# ─── MODE: NSJAIL ─────────────────────────────────────────────────────────────
if [[ "$RESOLVED_MODE" == "nsjail" ]]; then
  if ! command -v nsjail &>/dev/null; then
    die "nsjail mode requested but nsjail not found" 4
  fi

  NSJAIL_ARGS=(
    --mode o                    # one-shot (execute once and exit)
    --time_limit "$TIMEOUT"
    --rlimit_as "$((MEM_MB * 1024))"  # virtual address space limit (KB)
    --rlimit_cpu "$TIMEOUT"
    --rlimit_fsize 65536         # max file size: 64MB
    --rlimit_nofile 32
    --disable_proc               # no /proc (blocks /proc/self/mem attacks)
    --iface_no_lo                # no loopback
    --log_fd 3
    --user nobody
    --group nobody
    --chroot /                   # chroot to / (with bind mounts below)
    --bindmount_ro /usr
    --bindmount_ro /bin
    --bindmount_ro /lib
    --tmpfsmount /tmp
    --cwd /tmp
    --
  )

  log_sandbox "INFO" "nsjail-launch"

  EXIT_CODE=0
  nsjail "${NSJAIL_ARGS[@]}" "${COMMAND[@]}" 3>/dev/null || EXIT_CODE=$?

  [[ $EXIT_CODE -eq 124 ]] && { log_sandbox "BLOCK" "nsjail timeout"; exit 3; }
  log_sandbox "INFO" "nsjail-exit" "\"code\":${EXIT_CODE}"
  exit $EXIT_CODE
fi

# ─── MODE: ULIMIT FALLBACK ────────────────────────────────────────────────────
if [[ "$RESOLVED_MODE" == "ulimit" ]]; then
  if [[ "$YANA_ENV" == "prod" && "${YANA_SANDBOX_PROD_OVERRIDE:-0}" != "1" ]]; then
    log_sandbox "BLOCK" "ulimit fallback rejected — YANA_ENV=prod requires docker or nsjail"
    echo "[sandbox-exec] REJECT: --mode ulimit requested but YANA_ENV=prod." >&2
    echo "  Set YANA_SANDBOX_PROD_OVERRIDE=1 to override (logged, reduced isolation)." >&2
    exit 7
  fi
  log_sandbox "WARN" "ulimit-fallback — no filesystem isolation"

  MEM_KB=$(( MEM_MB * 1024 ))
  ulimit -v "$MEM_KB"   2>/dev/null || true  # virtual memory
  ulimit -t "$TIMEOUT"  2>/dev/null || true  # CPU seconds
  ulimit -f 65536       2>/dev/null || true  # file size (512B blocks)
  ulimit -n 32          2>/dev/null || true  # open file descriptors

  EXIT_CODE=0
  timeout "$TIMEOUT" "${COMMAND[@]}" || EXIT_CODE=$?

  [[ $EXIT_CODE -eq 124 ]] && { log_sandbox "BLOCK" "ulimit timeout"; exit 3; }
  log_sandbox "INFO" "ulimit-exit" "\"code\":${EXIT_CODE}"
  exit $EXIT_CODE
fi

die "unknown sandbox mode: ${RESOLVED_MODE}" 1
