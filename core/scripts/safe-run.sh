#!/usr/bin/env bash
# Command safety wrapper — blocks destructive patterns before execution
# Usage: safe-run.sh [--engine <cursor|aider|copilot|claude>] <command and args>
# All agents should route terminal commands through this wrapper.
#
# Enforcement modes:
#   ADVISORY (Claude, default) — WARN_PATTERNS prompt for confirmation
#   HARD     (Cursor, Aider)   — WARN_PATTERNS are blocked without prompting
#
# Bypass: YANA_SAFE_RUN_BYPASS=1 skips all checks (sovereign use only)
set -euo pipefail

ENGINE="claude"
if [[ "${1:-}" == "--engine" ]]; then
  ENGINE="${2:-claude}"
  shift 2
fi

COMMAND="$*"
LOG_FILE="${YANA_LOG:-/tmp/yana-ai-audit.log}"

# Hard enforcement for non-Claude engines (no interactive prompt available)
HARD_MODE=false
case "$ENGINE" in
  cursor|aider|copilot) HARD_MODE=true ;;
esac

# Bypass — sovereign override only (requires identity verification)
if [[ "${YANA_SAFE_RUN_BYPASS:-0}" == "1" ]]; then
  IDENTITY_GATE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/gates/identity-gate.sh"
  if [[ -f "$IDENTITY_GATE" ]]; then
    if ! bash "$IDENTITY_GATE" --verify sovereign 2>/dev/null; then
      echo "[yana-ai/safe-run] BYPASS denied — identity verification failed" >&2
      echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] BYPASS-DENIED engine='$ENGINE' cmd='$COMMAND'" >> "$LOG_FILE" 2>/dev/null || true
      exit 1
    fi
  else
    echo "[yana-ai/safe-run] BYPASS denied — identity-gate.sh not found" >&2
    exit 1
  fi
  echo "[yana-ai/safe-run] BYPASS active (engine=$ENGINE, identity verified)" >> "$LOG_FILE" 2>/dev/null || true
  eval "$COMMAND"
  exit $?
fi

# ── Destructive pattern blacklist ─────────────────────────────────────────────
BLOCKED_PATTERNS=(
  "rm -rf"
  "rm -r "
  "rm -fr"
  "git push --force"
  "git push -f "
  "git push -f$"
  "git reset --hard"
  "git clean -f"
  "git clean -fd"
  "git branch -D"
  "chmod -R 777"
  "chmod 777"
  "chown -R"
  "dd if="
  "mkfs\."
  "fdisk"
  "> /dev/"
  "DROP TABLE"
  "DROP DATABASE"
  "TRUNCATE TABLE"
  "DELETE FROM.*WHERE.*1=1"
  "npm publish"
  "pip install --user.*--upgrade"
  "curl.*| bash"
  "wget.*| bash"
  "eval.*curl"
  # ── Anti-evasion patterns (anti-evasion-law.md) ───────────────────────────
  "\| bash"
  "\| sh "
  "\| sh$"
  "\| python"
  "\| python3"
  "\| node "
  "\| node$"
  "\| perl"
  "base64 -d.*\|"
  "base64 --decode.*\|"
  "openssl.*enc.*-d.*\|"
  "openssl.*base64.*-d"
  "source <("
  "bash <("
  "\. <("
  # ── chmod on protected dirs (execution-environment.md) ────────────────────
  "chmod.*777.*core/"
  "chmod.*-x.*safe-run"
  "chown.*root.*core/"
  "chmod.*-R.*memory/L1"
  # ── LD_PRELOAD / PATH hijack (env-integrity-policy.md) ────────────────────
  "LD_PRELOAD="
  "LD_LIBRARY_PATH="
  "DYLD_INSERT_LIBRARIES="
  "NODE_OPTIONS=.*--require"
)

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qiE "$pattern"; then
    echo -e "${RED}[yana-ai/safe-run] BLOCKED: dangerous pattern detected${NC}"
    echo -e "  Engine  : $ENGINE"
    echo -e "  Command : $COMMAND"
    echo -e "  Pattern : $pattern"
    echo -e "  Action  : Command was NOT executed."
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] BLOCKED engine='$ENGINE' pattern='$pattern' cmd='$COMMAND'" >> "$LOG_FILE" 2>/dev/null || true
    exit 1
  fi
done

# ── Elevated-risk commands ────────────────────────────────────────────────────
# ADVISORY mode (Claude): prompt for confirmation
# HARD mode    (Cursor/Aider/Copilot): block immediately — no interactive TTY
WARN_PATTERNS=(
  "git push"
  "npm install"
  "pip install"
  "apt-get install"
  "brew install"
  "docker run"
  "kubectl apply"
  "terraform apply"
)

for pattern in "${WARN_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qiE "$pattern"; then
    if [[ "$HARD_MODE" == "true" ]]; then
      echo -e "${RED}[yana-ai/safe-run] HARD BLOCK: elevated-risk command from $ENGINE${NC}"
      echo -e "  Engine  : $ENGINE (non-interactive — no TTY confirm available)"
      echo -e "  Command : $COMMAND"
      echo -e "  Pattern : $pattern"
      echo -e "  Action  : BLOCKED. Run via Claude Code with explicit authorization."
      echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] HARD-BLOCKED engine='$ENGINE' pattern='$pattern' cmd='$COMMAND'" >> "$LOG_FILE" 2>/dev/null || true
      exit 1
    else
      echo -e "${YELLOW}[yana-ai/safe-run] WARNING: elevated-risk command${NC}"
      echo -e "  Command : $COMMAND"
      echo -e "  Pattern : $pattern"
      printf "  Proceed? (y/N): " >&2
      read -r answer < /dev/tty 2>/dev/null || answer="N"
      if [[ ! "$answer" =~ ^[Yy]$ ]]; then
        echo -e "${RED}Aborted by user.${NC}"
        exit 1
      fi
      break
    fi
  fi
done

# ── Audit log all commands ─────────────────────────────────────────────────────
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] EXEC engine='$ENGINE' cmd='$COMMAND'" >> "$LOG_FILE" 2>/dev/null || true

# ── Execute ───────────────────────────────────────────────────────────────────
eval "$COMMAND"
