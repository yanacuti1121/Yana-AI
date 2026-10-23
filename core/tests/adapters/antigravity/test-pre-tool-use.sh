#!/usr/bin/env bash
# Test suite for core/adapters/antigravity/pre-tool-use.js — the Antigravity
# PreToolUse bridge to the Giám thị halt lock and guard-destructive.sh.
#
# Each case pipes the documented Antigravity PreToolUse input shape
# (antigravity.google/docs/hooks) into a real copy of the adapter and checks
# the real stdout decision and exit code, running the real
# guard-destructive.sh subprocess. Live-Antigravity behaviour (how the IDE
# renders a deny reason) is outside what this file can test.
#
# Run: bash core/tests/adapters/antigravity/test-pre-tool-use.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
HOOK="$REPO_ROOT/core/adapters/antigravity/pre-tool-use.js"
GUARD="$REPO_ROOT/core/hooks/guard-destructive.sh"

TESTS_PASSED=0
TESTS_FAILED=0
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/yana-agy-test.XXXXXX")"
trap 'rm -r -- "$SCRATCH"' EXIT

# run_with <hook> <name> <stdin> <expected decision> [extra env assignment]
run_with() {
  local hook="$1" name="$2" input="$3" expected="$4" extra_env="${5:-}"
  local out code=0
  if [[ -n "$extra_env" ]]; then
    out="$(printf '%s' "$input" | env "$extra_env" node "$hook" 2>/dev/null)" || code=$?
  else
    out="$(printf '%s' "$input" | node "$hook" 2>/dev/null)" || code=$?
  fi
  if [[ "$code" -eq 0 ]] && printf '%s' "$out" | grep -q "\"decision\":\"$expected\""; then
    echo -e "${GREEN}PASS${NC} $name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}FAIL${NC} $name (expected $expected exit 0, got exit $code: $out)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}
run_case() { run_with "$HOOK" "$@"; }

# install_copy <project> [with-guard]: copy the adapter (and guard) into <project>/.agents/hooks
install_copy() {
  mkdir -p "$1/.agents/hooks"
  cp "$HOOK" "$1/.agents/hooks/yana-pre-tool-use.js"
  if [[ "${2:-}" == "with-guard" ]]; then cp "$GUARD" "$1/.agents/hooks/"; fi
}

clean="$SCRATCH/clean"
mkdir -p "$clean"
ws="\"workspacePaths\":[\"$clean\"]"
cmd() { printf '{%s,"toolCall":{"name":"run_command","args":{"CommandLine":%s}}}' "$ws" "$1"; }
call() { printf '{%s,"toolCall":{"name":"%s","args":%s}}' "$ws" "$1" "$2"; }

echo "=== core/adapters/antigravity/pre-tool-use.js ==="
run_case "safe command is allowed"             "$(cmd '"ls -la"')"                          allow
run_case "rm -rf / is denied"                  "$(cmd '"rm -rf /"')"                        deny
run_case "git push --force is denied"          "$(cmd '"git push --force origin main"')"    deny
run_case "nameless args with rm -rf denied"    "{$ws,\"toolCall\":{\"args\":{\"CommandLine\":\"rm -rf ~\"}}}" deny
run_case "non-shell tool is allowed"           "$(call view_file '{"AbsolutePath":"/tmp/x"}')" allow
run_case "run_command without a command"       "$(call run_command '{}')"                   deny
run_case "command key on unknown tool denied"  "$(call execute_shell '{"command":"rm -rf /"}')" deny
run_case "shell-named tool, other arg key"     "$(call terminal_send '{"input":"rm -rf ~"}')" deny
run_case "command key on non-shell tool"       "$(call view_file '{"command":"rm -rf /"}')" deny
run_case "malformed JSON fails closed"         "{not json"                                  deny
run_case "empty input fails closed"            ""                                           deny
run_case "non-object JSON fails closed"        "42"                                         deny

# A repo opened in Antigravity cannot replace the guard with its own copy.
fake="$SCRATCH/fake"
mkdir -p "$fake/core/hooks"
printf '#!/usr/bin/env bash\nexit 0\n' > "$fake/core/hooks/guard-destructive.sh"
run_case "workspace guard stub is ignored"     "{\"workspacePaths\":[\"$fake\"],\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"rm -rf /\"}}}" deny

# A yana-rt planted earlier in PATH cannot answer for the guard.
planted="$SCRATCH/planted-bin"
mkdir -p "$planted"
printf '#!/usr/bin/env bash\n[[ "${1:-}" == "--version" ]] && echo "yana-rt 9.9.9"\nexit 0\n' > "$planted/yana-rt"
chmod +x "$planted/yana-rt"
run_case "planted yana-rt in PATH is ignored"  "$(cmd '"rm -rf /"')" deny "PATH=$planted:$PATH"

# Installed layout: adapter and guard copied into <project>/.agents/hooks.
installed="$SCRATCH/installed"
install_copy "$installed" with-guard
run_with "$installed/.agents/hooks/yana-pre-tool-use.js" "installed copy allows safe" \
  "{\"workspacePaths\":[\"$installed\"],\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"git status\"}}}" allow
run_with "$installed/.agents/hooks/yana-pre-tool-use.js" "installed copy denies rm -rf" \
  "{\"workspacePaths\":[\"$installed\"],\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"rm -rf .\"}}}" deny

# Installed adapter whose guard is missing: shell fails closed, reads pass.
bare="$SCRATCH/bare"
install_copy "$bare"
run_with "$bare/.agents/hooks/yana-pre-tool-use.js" "missing guard denies shell" \
  "{\"workspacePaths\":[\"$bare\"],\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"ls\"}}}" deny
run_with "$bare/.agents/hooks/yana-pre-tool-use.js" "missing guard still allows reads" \
  "{\"workspacePaths\":[\"$bare\"],\"toolCall\":{\"name\":\"view_file\",\"args\":{}}}" allow

# Giám thị halt lock blocks every tool, including reads.
halted="$SCRATCH/halted"
mkdir -p "$halted/.claude/state"
printf 'drift in core/rules\n' > "$halted/.claude/state/GIAMTHI_HALT.lock"
run_case "halt lock blocks reads"              "{\"workspacePaths\":[\"$halted\"],\"toolCall\":{\"name\":\"view_file\",\"args\":{}}}" deny
run_case "halt lock blocks shell"              "{\"workspacePaths\":[\"$halted\"],\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"ls\"}}}" deny
run_case "halt in any workspace root blocks"   "{\"workspacePaths\":[\"$clean\",\"$halted\"],\"toolCall\":{\"name\":\"view_file\",\"args\":{}}}" deny

# No workspacePaths: the adapter's own project is still checked.
haltproj="$SCRATCH/haltproj"
install_copy "$haltproj" with-guard
mkdir -p "$haltproj/.claude/state"
printf 'halted\n' > "$haltproj/.claude/state/GIAMTHI_HALT.lock"
run_with "$haltproj/.agents/hooks/yana-pre-tool-use.js" "halt checked without workspacePaths" \
  '{"toolCall":{"name":"view_file","args":{}}}' deny

# A symlinked lock or a directory in its place is invalid and still blocks.
linked="$SCRATCH/linked"
mkdir -p "$linked/.claude/state"
ln -s /etc/hosts "$linked/.claude/state/GIAMTHI_HALT.lock"
run_case "symlinked halt lock blocks"          "{\"workspacePaths\":[\"$linked\"],\"toolCall\":{\"name\":\"view_file\",\"args\":{}}}" deny
dirlock="$SCRATCH/dirlock"
mkdir -p "$dirlock/.claude/state/GIAMTHI_HALT.lock"
run_case "directory halt lock blocks"          "{\"workspacePaths\":[\"$dirlock\"],\"toolCall\":{\"name\":\"view_file\",\"args\":{}}}" deny

# Quarantine record (valid or unreadable) blocks every tool.
quar="$SCRATCH/quar"
mkdir -p "$quar/.claude/state"
printf '{"mode":"no-shell"}' > "$quar/.claude/state/GIAMTHI_QUARANTINE.json"
run_case "quarantine blocks reads"             "{\"workspacePaths\":[\"$quar\"],\"toolCall\":{\"name\":\"view_file\",\"args\":{}}}" deny
badquar="$SCRATCH/badquar"
mkdir -p "$badquar/.claude/state"
printf '{not json' > "$badquar/.claude/state/GIAMTHI_QUARANTINE.json"
run_case "unreadable quarantine blocks"        "{\"workspacePaths\":[\"$badquar\"],\"toolCall\":{\"name\":\"view_file\",\"args\":{}}}" deny

echo ""
echo "=== Summary ==="
echo "Total tests: $((TESTS_PASSED + TESTS_FAILED))"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
[[ "$TESTS_FAILED" -eq 0 ]] && echo "Result: PASS" || { echo "Result: FAIL"; exit 1; }
