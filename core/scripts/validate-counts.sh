#!/usr/bin/env bash
# validate-counts.sh — kiểm tra MANIFEST counts khớp với thực tế
# Dùng làm pre-commit hook hoặc chạy tay: bash core/scripts/validate-counts.sh
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MANIFEST="$ROOT/MANIFEST.json"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
errors=0

check() {
  local label="$1" manifest_val="$2" actual="$3"
  if [ "$manifest_val" = "$actual" ]; then
    echo -e "  ${GREEN}OK${NC}  $label: $actual"
  else
    echo -e "  ${RED}FAIL${NC} $label: MANIFEST=$manifest_val  actual=$actual"
    ((errors++))
  fi
}

echo "=== Yana AI count validation ==="

# Đọc MANIFEST (dùng grep thô để tránh phụ thuộc jq)
skills_manifest=$(grep '"skills_count"' "$MANIFEST" | grep -o '[0-9]*' | head -1)
agents_manifest=$(grep '"agents_count"' "$MANIFEST" | grep -o '[0-9]*' | head -1)
hooks_manifest=$(grep '"hooks_count"' "$MANIFEST" | grep -o '[0-9]*' | head -1)
scripts_manifest=$(grep '"scripts_count"' "$MANIFEST" | grep -o '[0-9]*' | head -1)
commands_manifest=$(grep '"commands_count"' "$MANIFEST" | grep -o '[0-9]*' | head -1)
rules_manifest=$(grep '"rules_count"' "$MANIFEST" | grep -o '[0-9]*' | head -1)

# Đếm thực tế — các pattern find PHẢI khớp hệt drift-check.sh (script duy nhất
# chạy CI thật), không được tự sáng tác pattern riêng. 3 script từng đếm
# core/scripts khác nhau (thiếu .js) và core/agents khác nhau (không loại
# README.md/file viết hoa) — phát hiện thật ngày 2026-07-13, không phải giả thuyết.
skills_actual=$(find "$ROOT/core/skills" -name 'SKILL.md' 2>/dev/null | wc -l | tr -d ' ')
agents_actual=$(find "$ROOT/core/agents" -type f -name '*.md' ! -name 'README.md' ! -name '[A-Z]*' 2>/dev/null | wc -l | tr -d ' ')
hooks_actual=$(find "$ROOT/core/hooks" -maxdepth 1 -type f ! -name 'CLAUDE.md' ! -name '.*' 2>/dev/null | wc -l | tr -d ' ')
scripts_actual=$(find "$ROOT/core/scripts" -maxdepth 1 -type f ! -name '.*' 2>/dev/null | wc -l | tr -d ' ')
commands_actual=$(find "$ROOT/core/commands" -type f -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
rules_actual=$(find "$ROOT/core/rules" -type f -name '*.md' 2>/dev/null | wc -l | tr -d ' ')

check "skills"   "$skills_manifest"   "$skills_actual"
check "agents"   "$agents_manifest"   "$agents_actual"
check "hooks"    "$hooks_manifest"    "$hooks_actual"
check "scripts"  "$scripts_manifest"  "$scripts_actual"
check "commands" "$commands_manifest" "$commands_actual"
check "rules"    "$rules_manifest"    "$rules_actual"

echo ""
echo "=== Marketing-copy drift check (README/marketplace/SKILL.md/docs) ==="
# 2026-07-16: MANIFEST.json/README.md were already internally consistent, but
# marketplace.json, skills/yana-ai/SKILL.md, and docs/{index,desktop}.html
# (+ their .claude/docs/ mirrors) had drifted to stale hardcoded numbers
# (45/51/59 hooks, 1989/3440/4200 skills, 68 rules, 90/95/204 agents) that
# never got updated when MANIFEST.json's real counts changed. This section
# catches that specific class going forward: for each file, pull every
# "<number> <keyword>" mention (English copy only — the dominant phrasing)
# and flag any that doesn't match this file's own canonical count above.
# Known limit: numbers split across separate HTML elements (e.g. a
# <div class="stat-num">) aren't adjacent text and won't match — this is a
# best-effort heuristic, not exhaustive coverage. "checks" is intentionally
# not checked here: no canonical count for it exists in MANIFEST.json.
check_doc_stat() {
  local file="$1" keyword="$2" canonical="$3"
  [ -f "$ROOT/$file" ] || return 0
  local found
  found=$(grep -oE "[0-9][0-9,]*[[:space:]]+$keyword" "$ROOT/$file" 2>/dev/null \
          | grep -oE "^[0-9,]+" | tr -d ',' | sort -u)
  local bad=""
  for n in $found; do
    [ "$n" = "$canonical" ] || bad="$bad $n"
  done
  if [ -n "$bad" ]; then
    echo -e "  ${RED}FAIL${NC} $file: stale '$keyword' number(s):$bad (should be $canonical)"
    ((errors++))
  fi
}

for f in .claude-plugin/marketplace.json skills/yana-ai/SKILL.md \
         docs/index.html docs/desktop.html \
         .claude/docs/index.html .claude/docs/desktop.html; do
  check_doc_stat "$f" "hooks"    "$hooks_manifest"
  check_doc_stat "$f" "skills"   "$skills_manifest"
  check_doc_stat "$f" "rules"    "$rules_manifest"
  check_doc_stat "$f" "agents"   "$agents_manifest"
  check_doc_stat "$f" "commands" "$commands_manifest"
done

echo ""
if [ $errors -eq 0 ]; then
  echo -e "${GREEN}All counts match.${NC}"
  exit 0
else
  echo -e "${RED}$errors count(s) mismatch — update MANIFEST.json trước khi commit.${NC}"
  exit 1
fi
