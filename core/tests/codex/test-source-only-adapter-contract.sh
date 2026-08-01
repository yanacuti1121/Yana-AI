#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$REPO_ROOT"

echo "=== Codex source-only adapter contract ==="

STATUS_BEFORE="$(git status --short -- .agents .codex)"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/yana-codex-contract.XXXXXX")"
cleanup() {
  if [[ -n "${TEMP_ROOT:-}" && -d "$TEMP_ROOT" && "$TEMP_ROOT" == "${TMPDIR:-/tmp}"/yana-codex-contract.* ]]; then
    rm -rf "$TEMP_ROOT"
  fi
}
trap cleanup EXIT

TARGET_A="$TEMP_ROOT/target-a"
TARGET_B="$TEMP_ROOT/target-b"
MISSING_TARGET="$TEMP_ROOT/missing-target"
PATH_SOURCE="$TEMP_ROOT/path-source"
PATH_TARGET="$TEMP_ROOT/path-sandbox/target"
COLLISION_SOURCE="$TEMP_ROOT/collision-source"
COLLISION_TARGET="$TEMP_ROOT/collision-target"

node core/scripts/sync-codex.js --target "$TARGET_A"
test -f "$TARGET_A/.codex/agents/mail-reader.toml"
test -f "$TARGET_A/.agents/skills/yana-command-verify/SKILL.md"
echo "PASS: fresh target generated"

node core/scripts/sync-codex.js --check --target "$TARGET_A"
echo "PASS: generated target validates"

node core/scripts/sync-codex.js --target "$TARGET_B"
diff -qr "$TARGET_A" "$TARGET_B"
echo "PASS: independent targets are deterministic"

printf '\n' >> "$TARGET_A/.codex/agents/mail-reader.toml"
if node core/scripts/sync-codex.js --check --target "$TARGET_A" >"$TEMP_ROOT/stale.out" 2>&1; then
  echo "FAIL: stale generated output passed validation"
  exit 1
fi
grep -Fq 'Stale Codex agents: mail-reader' "$TEMP_ROOT/stale.out"
echo "PASS: stale generated output is identified"

if node core/scripts/sync-codex.js --check --target "$MISSING_TARGET" >"$TEMP_ROOT/missing.out" 2>&1; then
  echo "FAIL: missing target passed validation"
  exit 1
fi
grep -Fq 'Codex target missing:' "$TEMP_ROOT/missing.out"
echo "PASS: missing target reports an actionable error"

mkdir -p "$PATH_SOURCE/core/agents"
ln -s "$REPO_ROOT/core/skills" "$PATH_SOURCE/core/skills"
ln -s "$REPO_ROOT/core/commands" "$PATH_SOURCE/core/commands"
ln -s "$REPO_ROOT/core/hooks" "$PATH_SOURCE/core/hooks"
ln -s "$REPO_ROOT/.codex" "$PATH_SOURCE/.codex"
ln -s "$REPO_ROOT/adapters" "$PATH_SOURCE/adapters"
cat > "$PATH_SOURCE/core/agents/path-agent.md" <<'EOF'
---
name: ../../../../etc/evil
---

Path safety fixture.
EOF
FIXTURE_SOURCE="$PATH_SOURCE" FIXTURE_TARGET="$PATH_TARGET" node - <<'NODE'
const { syncCodex } = require('./core/scripts/sync-codex.js');
syncCodex(process.env.FIXTURE_SOURCE, process.env.FIXTURE_TARGET);
NODE
test -f "$PATH_TARGET/.codex/agents/etc-evil.toml"
REAL_TARGET="$(cd "$PATH_TARGET" && pwd -P)"
REAL_AGENT_DIR="$(cd "$PATH_TARGET/.codex/agents" && pwd -P)"
[[ "$REAL_AGENT_DIR" == "$REAL_TARGET/.codex/agents" ]]
if find "$TEMP_ROOT/path-sandbox" -mindepth 1 ! -path "$PATH_TARGET" ! -path "$PATH_TARGET/*" -print -quit | grep -q .; then
  echo "FAIL: unsafe agent name created an unexpected path"
  exit 1
fi
echo "PASS: unsafe agent name stays inside the generated target"

mkdir -p "$COLLISION_SOURCE/core/agents"
ln -s "$REPO_ROOT/core/skills" "$COLLISION_SOURCE/core/skills"
ln -s "$REPO_ROOT/core/commands" "$COLLISION_SOURCE/core/commands"
ln -s "$REPO_ROOT/core/hooks" "$COLLISION_SOURCE/core/hooks"
ln -s "$REPO_ROOT/.codex" "$COLLISION_SOURCE/.codex"
ln -s "$REPO_ROOT/adapters" "$COLLISION_SOURCE/adapters"
cat > "$COLLISION_SOURCE/core/agents/upper.md" <<'EOF'
---
name: Yana
---

Uppercase collision fixture.
EOF
cat > "$COLLISION_SOURCE/core/agents/lower.md" <<'EOF'
---
name: yana
---

Lowercase collision fixture.
EOF
if FIXTURE_SOURCE="$COLLISION_SOURCE" FIXTURE_TARGET="$COLLISION_TARGET" node - <<'NODE' >"$TEMP_ROOT/collision.out" 2>&1
const { syncCodex } = require('./core/scripts/sync-codex.js');
syncCodex(process.env.FIXTURE_SOURCE, process.env.FIXTURE_TARGET);
NODE
then
  echo "FAIL: case-insensitive agent collision passed generation"
  exit 1
fi
grep -Fqi 'collision' "$TEMP_ROOT/collision.out"
grep -Fq 'core/agents/upper.md' "$TEMP_ROOT/collision.out"
grep -Fq 'core/agents/lower.md' "$TEMP_ROOT/collision.out"
if [[ -e "$COLLISION_TARGET/.codex/agents/yana.toml" ]]; then
  echo "FAIL: collision left a silently generated yana.toml"
  exit 1
fi
echo "PASS: case-insensitive agent collision fails safely"

STATUS_AFTER="$(git status --short -- .agents .codex)"
if [[ "$STATUS_BEFORE" != "$STATUS_AFTER" ]]; then
  echo "FAIL: temporary generation modified repository adapter paths"
  exit 1
fi
echo "PASS: repository adapter paths unchanged"
