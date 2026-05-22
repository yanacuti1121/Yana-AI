#!/usr/bin/env bash
# Command safety wrapper — blocks destructive patterns before execution
# Usage: safe-run.sh <command and args>
# All agents should route terminal commands through this wrapper.
set -euo pipefail

COMMAND="$*"
LOG_FILE="${YAMTAM_LOG:-/tmp/yamtam-audit.log}"

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

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qiE "$pattern"; then
    echo -e "${RED}[yamtam/safe-run] BLOCKED: dangerous pattern detected${NC}"
    echo -e "  Command : $COMMAND"
    echo -e "  Pattern : $pattern"
    echo -e "  Action  : Command was NOT executed."
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] BLOCKED pattern='$pattern' cmd='$COMMAND'" >> "$LOG_FILE" 2>/dev/null || true
    exit 1
  fi
done

# ── Warn-and-confirm for elevated-risk commands ───────────────────────────────
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
    echo -e "${YELLOW}[yamtam/safe-run] WARNING: elevated-risk command${NC}"
    echo -e "  Command : $COMMAND"
    echo -e "  Pattern : $pattern"
    echo -e "  Proceed? (y/N): " >&2
    read -r answer < /dev/tty 2>/dev/null || answer="N"
    if [[ ! "$answer" =~ ^[Yy]$ ]]; then
      echo -e "${RED}Aborted by user.${NC}"
      exit 1
    fi
    break
  fi
done

# ── Audit log all commands ─────────────────────────────────────────────────────
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] EXEC cmd='$COMMAND'" >> "$LOG_FILE" 2>/dev/null || true

# ── Execute ───────────────────────────────────────────────────────────────────
eval "$COMMAND"
