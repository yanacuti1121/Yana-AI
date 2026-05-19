#!/usr/bin/env bash
# YAMTAM ENGINE v1.3.25 — Smoke test for /hook-review command file
# Không chạy command thật — chỉ verify file tồn tại và đúng format.

set -uo pipefail
PASS=0; FAIL=0

check() {
  local label="$1"; local result="$2"
  if [[ "$result" == "ok" ]]; then
    echo "PASS: $label"; PASS=$((PASS+1))
  else
    echo "FAIL: $label — $result"; FAIL=$((FAIL+1))
  fi
}

CMD_FILE="core/commands/hook-review.md"

check "file exists" "$([ -f "$CMD_FILE" ] && echo ok || echo 'not found')"
check "has description frontmatter" "$(head -5 "$CMD_FILE" | grep -q 'description:' && echo ok || echo 'missing')"
check "has /hook-review in description" "$(head -5 "$CMD_FILE" | grep -q 'hook-review' && echo ok || echo 'missing')"
check "has Step 1" "$(grep -q 'Step 1' "$CMD_FILE" && echo ok || echo 'missing')"
check "has report format" "$(grep -q 'KEEP\|UPDATE\|DEPRECATE\|REMOVE' "$CMD_FILE" && echo ok || echo 'missing')"
check "says READ and REPORT only" "$(grep -qi 'READ.*REPORT\|chỉ READ' "$CMD_FILE" && echo ok || echo 'missing')"

echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
