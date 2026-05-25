#!/usr/bin/env bash
# YAMTAM ENGINE Hook
# Version: 1.7.0
# Status: active
# Description: L4.5 Supply Chain Guard — block unsafe package installs, pipe-to-shell, typosquatting
# Last Reviewed: 2026-05-24
# PreToolUse hook — fires before Bash tool calls involving package management.
#
# Enforces supply chain security at runtime:
#   - Blocks pipe-to-shell patterns (curl | bash, wget | sh, etc.)
#   - Blocks installs from non-registry sources (git+http, tarball URLs without checksum)
#   - Detects typosquatting-like package names (known lookalike patterns)
#   - Warns when lock file is missing before install
#   - Blocks install of packages with --ignore-scripts skipped on unsigned sources
#
# Exit behaviour:
#   exit 0          — allow
#   JSON + exit 2   — block
#   additionalContext + exit 0 — warn
#
# Bypass: YAMTAM_SUPPLY_OK=1
# Test seam: SUPPLY_CHAIN_TEST_CMD="<command>"

set -uo pipefail

[[ "${YAMTAM_SUPPLY_OK:-}" == "1" ]] && exit 0

command -v jq >/dev/null 2>&1 || exit 0

# ── Read input ────────────────────────────────────────────────────────────────

if [[ -n "${SUPPLY_CHAIN_TEST_CMD:-}" ]]; then
  CMD="$SUPPLY_CHAIN_TEST_CMD"
else
  INPUT=$(cat)
  TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""' 2>/dev/null || true)
  [[ "$TOOL_NAME" != "Bash" ]] && exit 0
  CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || true)
fi

[[ -z "$CMD" ]] && exit 0

# Quick exit: only process if the command involves a package manager or curl/wget
if ! printf '%s' "$CMD" | grep -qE \
  '(npm|yarn|pnpm|pip|pip3|pipx|poetry|uv|cargo|gem|go get|go install|composer|apk|apt|apt-get|brew|curl|wget)'; then
  exit 0
fi

deny() {
  local reason="$1"
  jq -n \
    --arg reason "$reason" \
    '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: $reason
      }
    }'
  exit 2
}

warn() {
  local msg="$1"
  jq -n --arg msg "$msg" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: $msg
    }
  }'
  exit 0
}

# ── Hard block: pipe-to-shell ─────────────────────────────────────────────────
# curl/wget piped directly to bash/sh/zsh — classic supply chain attack vector
if printf '%s' "$CMD" | grep -qE \
  '(curl|wget)\s+[^|]+\|\s*(bash|sh|zsh|fish|dash|ksh|python[23]?|node|ruby|perl)'; then
  deny "Blocked [L4.5 Supply Chain]: pipe-to-shell detected ('curl ... | bash' or 'wget ... | sh'). This pattern executes untrusted remote code without review. Download the script first, inspect it, then run it. Rule: core/rules/44-supply-chain-vetting.md | Bypass: YAMTAM_SUPPLY_OK=1"
fi

# ── Hard block: install from non-registry URL ─────────────────────────────────
# npm/yarn install from raw git, tarball, or HTTP without integrity hash
if printf '%s' "$CMD" | grep -qE \
  '(npm|yarn|pnpm)\s+(install|add|i)\s+(https?://|git\+https?://|github:|gitlab:|bitbucket:)'; then
  deny "Blocked [L4.5 Supply Chain]: installing npm package from direct URL/git source. URL-based installs bypass registry integrity checks. Use the published registry version or pin a specific commit hash with integrity verification. Bypass: YAMTAM_SUPPLY_OK=1"
fi

# pip install from git or direct URL without hash
if printf '%s' "$CMD" | grep -qE \
  '(pip|pip3|pipx|uv pip)\s+install\s+[^-][^ ]*(git\+https?://|https?://[^/]+/[^#]+\.tar\.gz)' \
  && ! printf '%s' "$CMD" | grep -qE '#(sha256|md5|sha512):'; then
  deny "Blocked [L4.5 Supply Chain]: installing Python package from git/URL without integrity hash. Add '#sha256:<hash>' anchor or use a registry-published version. Bypass: YAMTAM_SUPPLY_OK=1"
fi

# ── Hard block: --ignore-scripts disabled check bypass ───────────────────────
# Some attacks rely on lifecycle scripts; only block if also from suspicious source
if printf '%s' "$CMD" | grep -qE '(npm|yarn|pnpm).*(--ignore-scripts=false|--unsafe-perm)'; then
  deny "Blocked [L4.5 Supply Chain]: '--ignore-scripts=false' or '--unsafe-perm' re-enables package lifecycle scripts that may have been disabled for safety. Review why this flag is needed. Bypass: YAMTAM_SUPPLY_OK=1"
fi

# ── Warn: typosquatting lookalike package names ───────────────────────────────
# Known high-value targets and their common lookalikes
declare -A TYPOSQUATS
TYPOSQUATS=(
  ["lodahs"]="lodash"        ["reqeust"]="request"      ["expres"]="express"
  ["reacts"]="react"         ["angualr"]="angular"       ["vues"]="vue"
  ["axois"]="axios"          ["moemnt"]="moment"         ["webapck"]="webpack"
  ["babbel"]="babel"         ["eslitn"]="eslint"         ["pretiier"]="prettier"
  ["typescirpt"]="typescript" ["jset"]="jest"            ["nodemon0"]="nodemon"
  ["corors"]="cors"          ["dotevn"]="dotenv"         ["crossenv"]="cross-env"
  ["cooke-parser"]="cookie-parser" ["body-parse"]="body-parser"
)

for fake in "${!TYPOSQUATS[@]}"; do
  real="${TYPOSQUATS[$fake]}"
  if printf '%s' "$CMD" | grep -qE "(npm|yarn|pnpm|pip)\s+(install|add|i)\s+.*\b${fake}\b"; then
    deny "Blocked [L4.5 Supply Chain]: possible typosquatting detected — '${fake}' looks like '${real}'. Verify the package name before installing. Rule: core/rules/44-supply-chain-vetting.md | Bypass: YAMTAM_SUPPLY_OK=1"
  fi
done

# ── Warn: missing lock file before install (advisory — does not block) ────────
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
if printf '%s' "$CMD" | grep -qE '(npm|yarn|pnpm)\s+(install|i)\b' \
  && ! printf '%s' "$CMD" | grep -qE '\s+(add|remove|uninstall|update|audit|list|run)\b'; then
  HAS_LOCK=0
  for lockfile in "$PROJECT_ROOT/package-lock.json" "$PROJECT_ROOT/yarn.lock" "$PROJECT_ROOT/pnpm-lock.yaml"; do
    [[ -f "$lockfile" ]] && HAS_LOCK=1 && break
  done
  if [[ "$HAS_LOCK" == "0" ]]; then
    warn "⚠️  Supply Chain Guard [L4.5]: No lock file found (package-lock.json / yarn.lock / pnpm-lock.yaml) before running install. Lock files pin dependency versions and integrity hashes. Consider committing a lock file first. Reference: core/rules/44-supply-chain-vetting.md | Bypass: YAMTAM_SUPPLY_OK=1"
  fi
fi

exit 0
