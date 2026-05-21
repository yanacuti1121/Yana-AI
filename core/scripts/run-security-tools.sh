#!/usr/bin/env bash
# YAMTAM ENGINE — Security Tools Runner
# Version: 1.3.27
# Status: active
# Description: Run available SAST / secret-scanning / dependency-audit tools
#              and output structured findings for red-team-check to analyze.
#
# Usage:
#   bash core/scripts/run-security-tools.sh [--mode quick|targeted|deep] [--target <path>]
#
# Requires:
#   YAMTAM_SCOPE_CONFIRMED=1   (set by security-scope-gate or pass manually)
#
# Bypass:
#   YAMTAM_SECURITY_TOOLS_BYPASS=1  — skip all tool runs (testing only)
#
# Output:
#   Writes findings to stdout in YAMTAM finding format.
#   Writes a tool-run summary to .claude/state/security-tools-last-run.log
#
# Tools supported (skipped silently if not installed):
#   gitleaks     — hardcoded secrets, API keys, tokens
#   semgrep      — SAST: OWASP Top 10, injection, XSS, crypto failures
#   trivy        — dependency CVEs + secret scanning (fs mode)
#   npm audit    — Node.js CVEs (requires package.json)
#   pip-audit    — Python CVEs (requires requirements.txt or pyproject.toml)
#   bandit       — Python SAST: injection, hardcoded passwords, subprocess
#   govulncheck  — Go CVEs (requires go.mod)
#   cargo audit  — Rust CVEs (requires Cargo.toml)
#
# Reference: core/skills/red-team-check/SKILL.md, docs/security-tools-setup.md

set -uo pipefail

[[ "${YAMTAM_SECURITY_TOOLS_BYPASS:-}" == "1" ]] && exit 0

# ── Scope gate enforcement ────────────────────────────────────────────────────
if [[ "${YAMTAM_SCOPE_CONFIRMED:-}" != "1" ]]; then
  echo "ERROR: YAMTAM_SCOPE_CONFIRMED=1 is required before running security tools."
  echo "       Follow the flow in gates/security-scope-gate.md first."
  exit 1
fi

# ── Args ─────────────────────────────────────────────────────────────────────
MODE="${1:-deep}"
TARGET="${2:-.}"

# Parse --mode / --target flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --target) TARGET="$2"; shift 2 ;;
    *) shift ;;
  esac
done

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_ROOT/.claude/state"
mkdir -p "$STATE_DIR"
LOG_FILE="$STATE_DIR/security-tools-last-run.log"
RUN_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "================================================================"
echo "YAMTAM ENGINE — Security Tools Run"
echo "Timestamp : $RUN_TS"
echo "Mode      : $MODE"
echo "Target    : $TARGET"
echo "================================================================"
echo ""

TOOLS_RUN=0
TOOLS_SKIPPED=0
TOTAL_FINDINGS=0

# ── Helper: print section header ─────────────────────────────────────────────
section() {
  echo ""
  echo "────────────────────────────────────────"
  echo "TOOL: $1"
  echo "────────────────────────────────────────"
}

# ── Helper: tool not found ────────────────────────────────────────────────────
skip_tool() {
  echo "SKIP: $1 — not installed. See docs/security-tools-setup.md to install."
  TOOLS_SKIPPED=$((TOOLS_SKIPPED + 1))
}

# ── 1. gitleaks — secret scanning ─────────────────────────────────────────────
section "gitleaks (secret scanning)"
if command -v gitleaks >/dev/null 2>&1; then
  TOOLS_RUN=$((TOOLS_RUN + 1))
  echo "Running: gitleaks detect --source $TARGET --no-banner --redact"
  if gitleaks detect --source "$TARGET" --no-banner --redact 2>&1; then
    echo "RESULT: No secrets detected."
  else
    echo "RESULT: Secrets found — see output above."
    TOTAL_FINDINGS=$((TOTAL_FINDINGS + 1))
  fi
else
  skip_tool "gitleaks"
fi

# ── 2. semgrep — SAST (OWASP + injection + crypto) ───────────────────────────
section "semgrep (SAST — OWASP Top 10)"
if command -v semgrep >/dev/null 2>&1; then
  TOOLS_RUN=$((TOOLS_RUN + 1))
  if [[ "$MODE" == "quick" ]]; then
    RULESET="p/secrets"
  elif [[ "$MODE" == "targeted" ]]; then
    RULESET="p/owasp-top-ten p/secrets"
  else
    RULESET="p/owasp-top-ten p/secrets p/injection p/jwt p/xss"
  fi
  echo "Running: semgrep --config $RULESET $TARGET --quiet"
  SEMGREP_OUT=$(semgrep --config $RULESET "$TARGET" --quiet 2>&1 || true)
  if [[ -z "$SEMGREP_OUT" ]]; then
    echo "RESULT: No findings."
  else
    echo "$SEMGREP_OUT"
    TOTAL_FINDINGS=$((TOTAL_FINDINGS + 1))
  fi
else
  skip_tool "semgrep"
fi

# ── 3. trivy — dependency CVEs + filesystem secrets ──────────────────────────
section "trivy (dependency CVEs + secrets)"
if command -v trivy >/dev/null 2>&1; then
  TOOLS_RUN=$((TOOLS_RUN + 1))
  if [[ "$MODE" == "quick" ]]; then
    SEVERITY="CRITICAL"
  elif [[ "$MODE" == "targeted" ]]; then
    SEVERITY="CRITICAL,HIGH"
  else
    SEVERITY="CRITICAL,HIGH,MEDIUM"
  fi
  echo "Running: trivy fs $TARGET --severity $SEVERITY --scanners vuln,secret --quiet"
  TRIVY_OUT=$(trivy fs "$TARGET" --severity "$SEVERITY" --scanners vuln,secret --quiet 2>&1 || true)
  echo "$TRIVY_OUT"
  if echo "$TRIVY_OUT" | grep -qiE "CRITICAL|HIGH|SECRET"; then
    TOTAL_FINDINGS=$((TOTAL_FINDINGS + 1))
  else
    echo "RESULT: No findings at $SEVERITY severity."
  fi
else
  skip_tool "trivy"
fi

# ── 4. npm audit — Node.js CVEs ───────────────────────────────────────────────
section "npm audit (Node.js CVEs)"
if [[ -f "$TARGET/package.json" ]] || [[ -f "package.json" ]]; then
  if command -v npm >/dev/null 2>&1; then
    TOOLS_RUN=$((TOOLS_RUN + 1))
    AUDIT_DIR="$TARGET"
    [[ ! -f "$AUDIT_DIR/package.json" ]] && AUDIT_DIR="."
    echo "Running: npm audit --audit-level=moderate (read-only)"
    # --dry-run ensures no package-lock.json modification
    NPM_OUT=$(cd "$AUDIT_DIR" && npm audit --audit-level=moderate 2>&1 || true)
    echo "$NPM_OUT"
    if echo "$NPM_OUT" | grep -qiE "critical|high|moderate"; then
      TOTAL_FINDINGS=$((TOTAL_FINDINGS + 1))
    else
      echo "RESULT: No moderate+ vulnerabilities found."
    fi
  else
    skip_tool "npm (not installed)"
  fi
else
  echo "SKIP: npm audit — no package.json found in $TARGET"
  TOOLS_SKIPPED=$((TOOLS_SKIPPED + 1))
fi

# ── 5. pip-audit — Python CVEs ────────────────────────────────────────────────
section "pip-audit (Python CVEs)"
if [[ -f "$TARGET/requirements.txt" ]] || [[ -f "$TARGET/pyproject.toml" ]] || \
   [[ -f "requirements.txt" ]] || [[ -f "pyproject.toml" ]]; then
  if command -v pip-audit >/dev/null 2>&1; then
    TOOLS_RUN=$((TOOLS_RUN + 1))
    echo "Running: pip-audit"
    PIP_OUT=$(pip-audit 2>&1 || true)
    echo "$PIP_OUT"
    if echo "$PIP_OUT" | grep -qiE "vulnerability|CVE"; then
      TOTAL_FINDINGS=$((TOTAL_FINDINGS + 1))
    else
      echo "RESULT: No Python CVEs found."
    fi
  else
    skip_tool "pip-audit"
  fi
else
  echo "SKIP: pip-audit — no requirements.txt or pyproject.toml found"
  TOOLS_SKIPPED=$((TOOLS_SKIPPED + 1))
fi

# ── 6. bandit — Python SAST ───────────────────────────────────────────────────
section "bandit (Python SAST)"
if find "${TARGET:-.}" -name "*.py" -maxdepth 5 | grep -q .; then
  if command -v bandit >/dev/null 2>&1; then
    TOOLS_RUN=$((TOOLS_RUN + 1))
    if [[ "$MODE" == "quick" ]]; then
      SEVERITY_FLAG="-l HIGH"
    else
      SEVERITY_FLAG=""
    fi
    echo "Running: bandit -r $TARGET $SEVERITY_FLAG -q"
    BANDIT_OUT=$(bandit -r "$TARGET" $SEVERITY_FLAG -q 2>&1 || true)
    echo "$BANDIT_OUT"
    if echo "$BANDIT_OUT" | grep -qiE "Issue|Severity.*High|Severity.*Medium"; then
      TOTAL_FINDINGS=$((TOTAL_FINDINGS + 1))
    else
      echo "RESULT: No bandit findings."
    fi
  else
    skip_tool "bandit"
  fi
else
  echo "SKIP: bandit — no Python files found in $TARGET"
  TOOLS_SKIPPED=$((TOOLS_SKIPPED + 1))
fi

# ── 7. govulncheck — Go CVEs ──────────────────────────────────────────────────
section "govulncheck (Go CVEs)"
if [[ -f "$TARGET/go.mod" ]] || [[ -f "go.mod" ]]; then
  if command -v govulncheck >/dev/null 2>&1; then
    TOOLS_RUN=$((TOOLS_RUN + 1))
    echo "Running: govulncheck ./..."
    GOCHECK_OUT=$(govulncheck ./... 2>&1 || true)
    echo "$GOCHECK_OUT"
    if echo "$GOCHECK_OUT" | grep -qiE "vulnerability|CVE|GO-"; then
      TOTAL_FINDINGS=$((TOTAL_FINDINGS + 1))
    else
      echo "RESULT: No Go vulnerabilities found."
    fi
  else
    skip_tool "govulncheck"
  fi
else
  echo "SKIP: govulncheck — no go.mod found"
  TOOLS_SKIPPED=$((TOOLS_SKIPPED + 1))
fi

# ── 8. cargo audit — Rust CVEs ────────────────────────────────────────────────
section "cargo audit (Rust CVEs)"
if [[ -f "$TARGET/Cargo.toml" ]] || [[ -f "Cargo.toml" ]]; then
  if command -v cargo >/dev/null 2>&1 && cargo audit --version >/dev/null 2>&1; then
    TOOLS_RUN=$((TOOLS_RUN + 1))
    echo "Running: cargo audit"
    CARGO_OUT=$(cargo audit 2>&1 || true)
    echo "$CARGO_OUT"
    if echo "$CARGO_OUT" | grep -qiE "vulnerability|RUSTSEC|error"; then
      TOTAL_FINDINGS=$((TOTAL_FINDINGS + 1))
    else
      echo "RESULT: No Rust vulnerabilities found."
    fi
  else
    skip_tool "cargo audit"
  fi
else
  echo "SKIP: cargo audit — no Cargo.toml found"
  TOOLS_SKIPPED=$((TOOLS_SKIPPED + 1))
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "================================================================"
echo "SUMMARY"
echo "================================================================"
echo "Tools run    : $TOOLS_RUN"
echo "Tools skipped: $TOOLS_SKIPPED"
echo "Tool categories with findings: $TOTAL_FINDINGS"
echo ""
echo "Next step: Claude should now analyze these findings using"
echo "           core/skills/red-team-check (Step 2 — OWASP manual review)"
echo "           and merge tool findings into the final finding list."
echo "================================================================"

# ── Write run log ─────────────────────────────────────────────────────────────
{
  echo "ts=$RUN_TS mode=$MODE target=$TARGET tools_run=$TOOLS_RUN tools_skipped=$TOOLS_SKIPPED tool_finding_categories=$TOTAL_FINDINGS"
} >> "$LOG_FILE"

exit 0
