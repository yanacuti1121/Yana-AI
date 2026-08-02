#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$REPO_ROOT"

PYTHON_BIN=""
for candidate in "${PYTHON:-}" python3 python3.14 python3.13 python3.12 python3.11; do
  [[ -n "$candidate" ]] || continue
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import tomllib' >/dev/null 2>&1; then
    PYTHON_BIN="$candidate"
    break
  fi
done
if [[ -z "$PYTHON_BIN" ]]; then
  echo "FAIL: Codex support tests require Python 3.11+ with tomllib"
  exit 1
fi

echo "=== Yana AI Codex support tests ==="
EXPECTED_AGENT_COUNT=$($PYTHON_BIN -c 'import json; print(json.load(open("MANIFEST.json"))["agents_count"])')

TARGET=$(mktemp -d "${TMPDIR:-/tmp}/yana-codex-test.XXXXXX")
git -C "$TARGET" init -q
printf '# Existing project guidance\n' > "$TARGET/AGENTS.md"
$PYTHON_BIN core/scripts/install_project.py "$TARGET" --engine all --no-audit >/dev/null

if [[ "$(cat "$TARGET/AGENTS.md")" != "# Existing project guidance" ]]; then
  echo "FAIL: installer overwrote existing AGENTS.md"
  exit 1
fi
echo "PASS: existing AGENTS.md preserved"

$PYTHON_BIN core/scripts/sync_codex.py --check --target "$TARGET"
echo "PASS: agent and skill inventory"

$PYTHON_BIN core/scripts/check_engine_parity.py --target "$TARGET"
echo "PASS: Claude and Codex capability parity"

$PYTHON_BIN -m json.tool "$TARGET/.codex/hooks.json" >/dev/null
echo "PASS: hooks.json syntax"

$PYTHON_BIN - "$TARGET" <<'PY'
import pathlib
import json
import sys
import tomllib

sys.path.insert(0, str(pathlib.Path.cwd() / "core/scripts"))
from sync_codex import agent_name, parse_frontmatter

root = pathlib.Path(sys.argv[1])
repo = pathlib.Path.cwd()
with (root / ".codex/config.toml").open("rb") as handle:
    config = tomllib.load(handle)
assert config["features"]["hooks"] is True
assert config["agents"]["enabled"] is True

source_agents = [
    path for path in (repo / "core/agents").rglob("*.md")
    if path.name != "README.md" and not path.name[0].isupper()
]
source_agent_bodies = {
    agent_name(path): parse_frontmatter(path.read_text())[1]
    for path in source_agents
}
manifest = json.loads((repo / "MANIFEST.json").read_text())
expected_agents = manifest["agents_count"]
assert len(source_agents) == expected_agents, (
    f"manifest expects {expected_agents} canonical agents, found {len(source_agents)}"
)

claude_agents = [
    path for path in (root / ".claude/agents").rglob("*.md")
    if path.name != "README.md" and not path.name[0].isupper()
]
assert len(claude_agents) == len(source_agents), (
    f"Claude agent parity: expected {len(source_agents)}, found {len(claude_agents)}"
)

agent_files = sorted((root / ".codex/agents").glob("*.toml"))
assert len(agent_files) == len(source_agents), (
    f"Codex agent parity: expected {len(source_agents)}, found {len(agent_files)}"
)
agent_names = set()
for agent_file in agent_files:
    with agent_file.open("rb") as handle:
        agent = tomllib.load(handle)
    for field in ("name", "description", "developer_instructions"):
        assert agent.get(field), f"{agent_file.name}: missing {field}"
    assert agent["name"] not in agent_names, f"duplicate Codex agent name: {agent['name']}"
    assert agent["developer_instructions"] == source_agent_bodies[agent["name"]], (
        f"{agent_file.name}: developer instructions changed during TOML rendering"
    )
    agent_names.add(agent["name"])
assert "yana" in agent_names
assert "yana-web-assistant" in agent_names
PY
echo "PASS: 101-agent parity and TOML syntax"

if grep -En '/Users/|\.claude/hooks' "$TARGET/.codex/hooks.json" >/dev/null; then
  echo "FAIL: hooks.json contains machine-specific or Claude-only paths"
  exit 1
fi
echo "PASS: portable hook paths"

HOOK_COMMAND=$($PYTHON_BIN - "$TARGET/.codex/hooks.json" <<'PY'
import json
import pathlib
import sys

config = json.loads(pathlib.Path(sys.argv[1]).read_text())
print(config["hooks"]["PreToolUse"][0]["hooks"][0]["command"], end="")
PY
)
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

CODEX_ONLY_TARGET=$(mktemp -d "${TMPDIR:-/tmp}/yana-codex-only-test.XXXXXX")
git -C "$CODEX_ONLY_TARGET" init -q
$PYTHON_BIN core/scripts/install_project.py "$CODEX_ONLY_TARGET" --engine codex --no-audit >/dev/null
if [[ -d "$CODEX_ONLY_TARGET/.claude/agents" ]]; then
  echo "FAIL: --engine codex installed Claude agent surfaces"
  exit 1
fi
CODEX_ONLY_COUNT=$(find "$CODEX_ONLY_TARGET/.codex/agents" -maxdepth 1 -type f -name '*.toml' | wc -l | tr -d ' ')
if [[ "$CODEX_ONLY_COUNT" -ne "$EXPECTED_AGENT_COUNT" ]]; then
  echo "FAIL: --engine codex installed $CODEX_ONLY_COUNT agents instead of $EXPECTED_AGENT_COUNT"
  exit 1
fi
echo "PASS: Codex-only Python install"

$PYTHON_BIN - <<'PY'
import tomllib

with open("pyproject.toml", "rb") as handle:
    project = tomllib.load(handle)
force_include = project["tool"]["hatch"]["build"]["targets"]["wheel"]["force-include"]
for entry in ("adapters", ".codex/config.toml", ".codex/hooks.json"):
    assert entry in force_include, f"wheel missing {entry}"
PY
echo "PASS: PyPI package surfaces"

echo "Result: PASS"
