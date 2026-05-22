#!/usr/bin/env bash
# Pre-commit validation: function length, SKILL.md structure, rule file headers
set -euo pipefail

PASS=0
FAIL=0
ERRORS=()

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

log_pass() { echo -e "${GREEN}  PASS${NC}  $1"; PASS=$((PASS+1)); }
log_fail() { echo -e "${RED}  FAIL${NC}  $1"; FAIL=$((FAIL+1)); ERRORS+=("$1"); }
log_warn() { echo -e "${YELLOW}  WARN${NC}  $1"; }

echo "================================================"
echo " YAMTAM verify-rules.sh — pre-commit gate"
echo "================================================"

# ── Gate 1: function length ≤ 50 lines ──────────────────────────────────────
echo ""
echo "Gate 1: Function length (hard limit: 50 lines)"

check_function_length() {
  local file="$1"
  local max_lines=50
  local in_func=0
  local func_start=0
  local func_name=""
  local line_num=0
  local brace_depth=0

  while IFS= read -r line; do
    line_num=$((line_num+1))
    if [[ "$line" =~ ^[[:space:]]*(function[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)|([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*\(\))[[:space:]]*\{? ]]; then
      in_func=1
      func_start=$line_num
      func_name="${BASH_REMATCH[2]:-${BASH_REMATCH[3]}}"
      brace_depth=0
    fi
    if [[ $in_func -eq 1 ]]; then
      brace_depth=$((brace_depth + $(grep -o '{' <<< "$line" | wc -l) - $(grep -o '}' <<< "$line" | wc -l)))
      if [[ $brace_depth -le 0 && $line_num -gt $func_start ]]; then
        local length=$((line_num - func_start + 1))
        if [[ $length -gt $max_lines ]]; then
          log_fail "$file: function '$func_name' is $length lines (limit: $max_lines)"
        fi
        in_func=0
      fi
    fi
  done < "$file"
}

# Check staged .sh, .ts, .js, .py files
STAGED_CODE=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.(sh|ts|js|py)$' || true)
if [[ -z "$STAGED_CODE" ]]; then
  log_pass "No code files staged — skipping function length check"
else
  while IFS= read -r f; do
    [[ -f "$f" ]] && check_function_length "$f"
  done <<< "$STAGED_CODE"
  [[ $FAIL -eq 0 ]] && log_pass "All staged functions within 50-line limit"
fi

# ── Gate 2: SKILL.md structure ───────────────────────────────────────────────
echo ""
echo "Gate 2: SKILL.md structure (8 required sections)"

REQUIRED_SECTIONS=(
  "## When to Use"
  "## Do NOT use for"
  "origin:"
  "description:"
  "## Anti-Fake-Pass"
)

STAGED_SKILLS=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep 'SKILL\.md$' || true)
if [[ -z "$STAGED_SKILLS" ]]; then
  log_pass "No SKILL.md files staged"
else
  while IFS= read -r skill_file; do
    if [[ -f "$skill_file" ]]; then
      missing=()
      for section in "${REQUIRED_SECTIONS[@]}"; do
        grep -q "$section" "$skill_file" || missing+=("$section")
      done
      line_count=$(wc -l < "$skill_file")
      if [[ $line_count -gt 220 ]]; then
        log_fail "$skill_file: $line_count lines (limit: 220) — split the skill"
      fi
      if [[ ${#missing[@]} -gt 0 ]]; then
        log_fail "$skill_file: missing sections: ${missing[*]}"
      else
        log_pass "$skill_file: structure OK ($line_count lines)"
      fi
    fi
  done <<< "$STAGED_SKILLS"
fi

# ── Gate 3: rule files have Status header ───────────────────────────────────
echo ""
echo "Gate 3: Rule file headers"

STAGED_RULES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep 'core/rules/.*\.md$' || true)
if [[ -z "$STAGED_RULES" ]]; then
  log_pass "No rule files staged"
else
  while IFS= read -r rule_file; do
    if [[ -f "$rule_file" ]]; then
      if ! grep -q "^\*\*Status:\*\*" "$rule_file"; then
        log_fail "$rule_file: missing **Status:** header"
      else
        log_pass "$rule_file: header OK"
      fi
    fi
  done <<< "$STAGED_RULES"
fi

# ── Gate 4: manifest drift check ────────────────────────────────────────────
echo ""
echo "Gate 4: Manifest drift (validate-manifest.sh)"

MANIFEST_SCRIPT="$(dirname "$0")/validate-manifest.sh"
if [[ ! -f "$MANIFEST_SCRIPT" ]]; then
  log_warn "validate-manifest.sh not found — skipping drift check"
else
  if bash "$MANIFEST_SCRIPT" 2>&1 | grep -q "DRIFT DETECTED"; then
    log_fail "MANIFEST.json is out of sync — run: bash core/scripts/validate-manifest.sh --fix"
  else
    log_pass "MANIFEST.json counts match actual file counts"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "================================================"
echo " PASS: $PASS   FAIL: $FAIL"
echo "================================================"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo -e "${RED}Pre-commit BLOCKED. Fix violations before committing:${NC}"
  for err in "${ERRORS[@]}"; do
    echo "  • $err"
  done
  exit 1
fi

echo -e "${GREEN}All checks passed — commit allowed.${NC}"
exit 0
