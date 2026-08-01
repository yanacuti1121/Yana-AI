#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$REPO_ROOT"

echo "=== Yana AI Codex support tests ==="

TARGET=$(mktemp -d "${TMPDIR:-/tmp}/yana-codex-test.XXXXXX")
git -C "$TARGET" init -q
INIT_CWD="$TARGET" node scripts/npm-install.js >/dev/null

node core/scripts/sync-codex.js --check --target "$TARGET"
echo "PASS: agent and skill inventory"

node core/scripts/check-engine-parity.js --target "$TARGET"
echo "PASS: Claude and Codex capability parity"

TARGET="$TARGET" node -e "JSON.parse(require('fs').readFileSync(process.env.TARGET + '/.codex/hooks.json', 'utf8'))"
echo "PASS: hooks.json syntax"

python3 - "$TARGET" <<'PY'
import pathlib
import sys
import tomllib

root = pathlib.Path(sys.argv[1])
with (root / ".codex/config.toml").open("rb") as handle:
    config = tomllib.load(handle)
assert config["features"]["hooks"] is True
assert config["agents"]["enabled"] is True

agent_files = sorted((root / ".codex/agents").glob("*.toml"))
assert agent_files, "no Codex agents found"
for agent_file in agent_files:
    with agent_file.open("rb") as handle:
        agent = tomllib.load(handle)
    for field in ("name", "description", "developer_instructions"):
        assert agent.get(field), f"{agent_file.name}: missing {field}"
PY
echo "PASS: config and agent TOML syntax"

if rg -n '/Users/|\.claude/hooks' "$TARGET/.codex/hooks.json" >/dev/null; then
  echo "FAIL: hooks.json contains machine-specific or Claude-only paths"
  exit 1
fi
echo "PASS: portable hook paths"

HOOK_COMMAND=$(TARGET="$TARGET" node -e "const h=require(process.env.TARGET + '/.codex/hooks.json'); process.stdout.write(h.hooks.PreToolUse[0].hooks[0].command)")
set +e
SUBDIR_OUTPUT=$(
  cd "$TARGET/.claude"
  printf '%s' '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' \
    | bash -c "$HOOK_COMMAND" 2>/dev/null
)
SUBDIR_EXIT=$?
set -e
if [[ "$SUBDIR_EXIT" -ne 2 || "$SUBDIR_OUTPUT" != *"permissionDecision"* ]]; then
  echo "FAIL: destructive-command hook did not block from a nested working directory"
  exit 1
fi
echo "PASS: nested-directory hook enforcement"

DRY_RUN_OUTPUT=$(bash core/scripts/switch-engine.sh codex --dry-run)
if [[ "$DRY_RUN_OUTPUT" != *"Would synchronize core/agents"* ]]; then
  echo "FAIL: Codex engine switch dry-run did not report agent synchronization"
  exit 1
fi
echo "PASS: Codex engine switch"

node <<'NODE'
const pkg = require('./package.json');
const required = [
  'core/skills/',
  '.codex/config.toml',
  '.codex/hooks.json',
  'adapters/codex.md',
  'core/config/engine-capabilities.json',
];
for (const entry of required) {
  if (!pkg.files.includes(entry)) throw new Error(`package.json missing ${entry}`);
}
NODE
echo "PASS: npm package surfaces"

echo "Result: PASS"
