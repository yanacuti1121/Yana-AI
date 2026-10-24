#!/usr/bin/env bash
# Yana AI — Audit Chain Test Suite
# Tests audit-log.sh (hash-chain writing) and verify-audit-chain.sh (verification).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_DIR="$(cd "$SCRIPT_DIR/../../hooks" && pwd)"
SCRIPTS_DIR="$(cd "$SCRIPT_DIR/../../scripts" && pwd)"

PASS=0
FAIL=0
TMPDIR_TEST=$(mktemp -d)
trap 'rm -rf "$TMPDIR_TEST"' EXIT

run_hook() {
  local input="$1"
  CLAUDE_PROJECT_DIR="$TMPDIR_TEST" bash "$HOOKS_DIR/audit-log.sh" <<< "$input" 2>/dev/null
}

check() {
  local name="$1" result="$2" expect="$3"
  if [[ "$result" == "$expect" ]]; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name"
    echo "  expected: $expect"
    echo "  got:      $result"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Audit Chain Test Suite ==="
echo ""

# ── Test 1: entry is written ──────────────────────────────────────────────────
rm -f "$TMPDIR_TEST/.claude/state/audit-chain.log"
run_hook '{"tool_name":"Read","tool_input":{"file_path":"README.md"}}'
LOG="$TMPDIR_TEST/.claude/state/audit-chain.log"
ENTRY_COUNT=$(wc -l < "$LOG" 2>/dev/null || echo 0)
check "entry is written to log" "$ENTRY_COUNT" "1"

# ── Test 2: entry has required fields ─────────────────────────────────────────
ENTRY=$(cat "$LOG")
HAS_TS=$(printf '%s' "$ENTRY" | jq -r 'has("ts")' 2>/dev/null)
HAS_HASH=$(printf '%s' "$ENTRY" | jq -r 'has("hash")' 2>/dev/null)
HAS_PREV=$(printf '%s' "$ENTRY" | jq -r 'has("prev_hash")' 2>/dev/null)
check "entry has ts field"        "$HAS_TS"   "true"
check "entry has hash field"      "$HAS_HASH" "true"
check "entry has prev_hash field" "$HAS_PREV" "true"

# ── Test 3: first entry uses genesis hash as prev_hash ────────────────────────
GENESIS=$(printf 'YANA_GENESIS' | sha256sum | awk '{print $1}')
STORED_PREV=$(printf '%s' "$ENTRY" | jq -r '.prev_hash' 2>/dev/null)
check "first entry prev_hash = genesis" "$STORED_PREV" "$GENESIS"

# ── Test 4: second entry chains from first ────────────────────────────────────
FIRST_HASH=$(printf '%s' "$ENTRY" | jq -r '.hash' 2>/dev/null)
run_hook '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}'
SECOND_ENTRY=$(tail -1 "$LOG")
SECOND_PREV=$(printf '%s' "$SECOND_ENTRY" | jq -r '.prev_hash' 2>/dev/null)
check "second entry prev_hash = first hash" "$SECOND_PREV" "$FIRST_HASH"

# ── Test 5: .env file read is masked ─────────────────────────────────────────
rm -f "$LOG"
run_hook '{"tool_name":"Read","tool_input":{"file_path":".env.production"}}'
INPUT_FIELD=$(tail -1 "$LOG" | jq -r '.input' 2>/dev/null)
check ".env read masked as [REDACTED]" "$INPUT_FIELD" "[REDACTED]"

# ── Test 6: secret keyword in input is masked ─────────────────────────────────
rm -f "$LOG"
run_hook '{"tool_name":"Bash","tool_input":{"command":"echo $SECRET_KEY"}}'
INPUT_FIELD=$(tail -1 "$LOG" | jq -r '.input' 2>/dev/null)
check "SECRET keyword masked as [REDACTED]" "$INPUT_FIELD" "[REDACTED]"

# ── Test 7: verify-audit-chain exits 0 on intact log ─────────────────────────
rm -f "$LOG"
run_hook '{"tool_name":"Read","tool_input":{"file_path":"README.md"}}'
run_hook '{"tool_name":"Bash","tool_input":{"command":"ls"}}'
run_hook '{"tool_name":"Edit","tool_input":{"file_path":"foo.ts"}}'
VERIFY_OUT=$(CLAUDE_PROJECT_DIR="$TMPDIR_TEST" bash "$SCRIPTS_DIR/verify-audit-chain.sh" 2>/dev/null)
VERIFY_EXIT=$?
check "verify exits 0 on intact chain" "$VERIFY_EXIT" "0"

# ── Test 8: verify reports correct count ──────────────────────────────────────
REPORTED_COUNT=$(printf '%s' "$VERIFY_OUT" | grep -oE '[0-9]+ entries' | grep -oE '[0-9]+')
check "verify reports 3 entries" "$REPORTED_COUNT" "3"

# ── Test 9: verify exits 1 on tampered entry ─────────────────────────────────
rm -f "$LOG"
run_hook '{"tool_name":"Read","tool_input":{"file_path":"a.md"}}'
run_hook '{"tool_name":"Read","tool_input":{"file_path":"b.md"}}'
# Tamper: replace second entry with modified tool name (compact JSON — single line)
FIRST_LINE=$(head -1 "$LOG")
TAMPERED=$(tail -1 "$LOG" | jq -c '.tool = "TAMPERED"' 2>/dev/null)
printf '%s\n%s\n' "$FIRST_LINE" "$TAMPERED" > "$LOG"
CLAUDE_PROJECT_DIR="$TMPDIR_TEST" bash "$SCRIPTS_DIR/verify-audit-chain.sh" >/dev/null 2>&1
VERIFY_EXIT_TAMPERED=$?
check "verify exits 1 on tampered entry" "$VERIFY_EXIT_TAMPERED" "1"

# ── Test 10: empty log is OK ──────────────────────────────────────────────────
rm -f "$LOG"
CLAUDE_PROJECT_DIR="$TMPDIR_TEST" bash "$SCRIPTS_DIR/verify-audit-chain.sh" >/dev/null 2>&1
EMPTY_EXIT=$?
check "verify exits 0 on missing log" "$EMPTY_EXIT" "0"

# ── Tests 11-14: the python fast path and the shell loop must agree ──────────
# The shell loop spawns ~11 processes per entry; the python helper walks the
# chain in one process. They must give the same exit code and the same text.
PY_VERIFIER="$SCRIPTS_DIR/verify_audit_chain.py"
if command -v python3 >/dev/null 2>&1 && [[ -f "$PY_VERIFIER" ]]; then
  compare_verifiers() {
    local label="$1" sh_out sh_exit py_out py_exit
    sh_out=$(CLAUDE_PROJECT_DIR="$TMPDIR_TEST" YANA_AUDIT_VERIFY_BASH=1 bash "$SCRIPTS_DIR/verify-audit-chain.sh" 2>&1)
    sh_exit=$?
    py_out=$(CLAUDE_PROJECT_DIR="$TMPDIR_TEST" bash "$SCRIPTS_DIR/verify-audit-chain.sh" 2>&1)
    py_exit=$?
    check "$label" "$py_exit:$py_out" "$sh_exit:$sh_out"
    PY_LAST_EXIT="$py_exit"
  }

  rm -f "$LOG"
  run_hook '{"tool_name":"Read","tool_input":{"file_path":"a.md"}}'
  run_hook '{"tool_name":"Bash","tool_input":{"command":"ls"}}'
  compare_verifiers "python and shell verifiers agree on an intact chain"
  check "python verifier exits 0 on an intact chain" "$PY_LAST_EXIT" "0"

  FIRST_LINE=$(head -1 "$LOG")
  TAMPERED=$(tail -1 "$LOG" | jq -c '.tool = "TAMPERED"' 2>/dev/null)
  printf '%s\n%s\n' "$FIRST_LINE" "$TAMPERED" > "$LOG"
  compare_verifiers "python and shell verifiers agree on a tampered entry"
  check "python verifier exits 1 on a tampered entry" "$PY_LAST_EXIT" "1"

  # A chain that has lost its first entry must fail in both, not resume silently.
  rm -f "$LOG"
  run_hook '{"tool_name":"Read","tool_input":{"file_path":"a.md"}}'
  run_hook '{"tool_name":"Read","tool_input":{"file_path":"b.md"}}'
  tail -1 "$LOG" > "$LOG.tail" && mv "$LOG.tail" "$LOG"
  compare_verifiers "python and shell verifiers agree when an entry is deleted"
  check "python verifier exits 1 when an entry is deleted" "$PY_LAST_EXIT" "1"

  # Known-breaks allowlist: a fork is accepted only when ts, hash AND the really
  # computed expected_prev all match (the 2026-07-16 replay bypass). Build a
  # 3-entry chain, then a 4th entry that chains from entry 1 instead of entry 3.
  rm -f "$LOG"
  for name in a b c; do run_hook '{"tool_name":"Read","tool_input":{"file_path":"'"$name"'.md"}}'; done
  FORK_PREV=$(head -1 "$LOG" | jq -r '.hash')
  GOOD_PREV=$(tail -1 "$LOG" | jq -r '.hash')
  FORK_TS="2026-10-24T00:00:00Z"
  FORK_HASH=$(printf '%s|%s' "${FORK_TS}|audit-log|Read|manual|f|allow" "$FORK_PREV" | shasum -a 256 | awk '{print $1}')
  jq -cn --arg ts "$FORK_TS" --arg prev "$FORK_PREV" --arg hash "$FORK_HASH" \
    '{ts:$ts,hook:"audit-log",tool:"Read",agent:"manual",input:"f",decision:"allow",prev_hash:$prev,hash:$hash}' >> "$LOG"
  mkdir -p "$TMPDIR_TEST/core/config"
  ALLOW="$TMPDIR_TEST/core/config/audit-chain-known-breaks.json"
  jq -n --arg ts "$FORK_TS" --arg hash "$FORK_HASH" --arg prev "$GOOD_PREV" \
    '{known_breaks:[{ts:$ts,hash:$hash,expected_prev:$prev}]}' > "$ALLOW"
  compare_verifiers "python and shell verifiers agree on an allowlisted fork"
  check "python verifier accepts a fork listed with the right expected_prev" "$PY_LAST_EXIT" "0"
  jq -n --arg ts "$FORK_TS" --arg hash "$FORK_HASH" \
    '{known_breaks:[{ts:$ts,hash:$hash,expected_prev:"0000000000000000000000000000000000000000000000000000000000000000"}]}' > "$ALLOW"
  compare_verifiers "python and shell verifiers agree on a replayed allowlist entry"
  check "python verifier rejects a replayed entry (wrong expected_prev)" "$PY_LAST_EXIT" "1"
  printf '%s\n' '{"known_breaks":[{"ts":["x"],"hash":["y"],"expected_prev":["z"]}]}' > "$ALLOW"
  compare_verifiers "python and shell verifiers agree on an allowlist with non-string values"
  check "python verifier does not crash on a list-valued allowlist entry" "$PY_LAST_EXIT" "1"
  rm -f "$ALLOW"

  # Blank lines are skipped and an unterminated last line is ignored, in both.
  rm -f "$LOG"
  run_hook '{"tool_name":"Read","tool_input":{"file_path":"a.md"}}'
  run_hook '{"tool_name":"Read","tool_input":{"file_path":"b.md"}}'
  { head -1 "$LOG"; printf '\n\n'; tail -1 "$LOG"; } > "$LOG.mixed" && mv "$LOG.mixed" "$LOG"
  compare_verifiers "python and shell verifiers agree on blank lines"
  check "blank lines do not break an intact chain" "$PY_LAST_EXIT" "0"
  printf '%s' '{"partial":' >> "$LOG"
  compare_verifiers "python and shell verifiers agree on an unterminated last line"

  # An unreadable log is a failure for the python verifier, never "OK (0 entries)".
  PERM_OUT=$(CLAUDE_PROJECT_DIR="$TMPDIR_TEST" bash -c 'chmod 000 "$1"; bash "$2" "$1"; code=$?; chmod 644 "$1"; exit $code' _ "$LOG" "$SCRIPTS_DIR/verify-audit-chain.sh" 2>&1)
  PERM_EXIT=$?
  check "python verifier fails (not OK) on an unreadable log" "$([[ $PERM_EXIT -ne 0 ]] && echo failed || echo "passed: $PERM_OUT")" "failed"

  # Speed guard: 2,000 entries took about a minute with the shell loop
  # (~27 ms each) and take well under a second with the helper.
  python3 -I -c '
import hashlib, json, sys
prev = hashlib.sha256(b"YANA_GENESIS").hexdigest()
with open(sys.argv[1], "w") as out:
    for n in range(2000):
        ts = "2026-01-01T00:%02d:%02dZ" % (n // 60 % 60, n % 60)
        digest = hashlib.sha256(("|".join((ts, "audit-log", "Read", "manual", "x", "allow")) + "|" + prev).encode()).hexdigest()
        entry = {"ts": ts, "hook": "audit-log", "tool": "Read", "agent": "manual", "input": "x", "decision": "allow", "prev_hash": prev, "hash": digest}
        out.write(json.dumps(entry, separators=(",", ":")) + "\n")
        prev = digest
' "$LOG"
  SECONDS=0
  BIG_OUT=$(CLAUDE_PROJECT_DIR="$TMPDIR_TEST" bash "$SCRIPTS_DIR/verify-audit-chain.sh" 2>&1)
  BIG_EXIT=$?
  check "python verifier reads a 2000-entry chain" "$BIG_EXIT:$BIG_OUT" "0:OK: audit chain intact (2000 entries verified)"
  FAST=$([[ $SECONDS -lt 10 ]] && echo fast || echo "slow (${SECONDS}s)")
  check "2000 entries verify in under 10 seconds" "$FAST" "fast"
else
  echo "SKIP: python3 or verify_audit_chain.py not available — shell loop only"
fi

echo ""
echo "=== Summary: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
