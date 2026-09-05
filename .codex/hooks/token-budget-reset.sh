#!/usr/bin/env bash
# Status: active
# Description: Token Budget Guard — resets per-tool loop counter on completion
# Hook type: PostToolUse (runs after each tool call completes)
# Companion to: core/hooks/token-budget-guard.sh
#
# Fixes the root design gap in token-budget-guard.sh: that PreToolUse hook
# increments loop_attempts[tool] on every call but never resets it anywhere,
# so once any tool hits MAX_ATTEMPTS the circuit re-trips forever, every
# cooldown cycle, permanently. A PostToolUse firing means the tool actually
# completed (PreToolUse didn't block it) — that's the real "not stuck"
# signal, so this is where the counter should clear.
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
BUDGET_FILE="${YANA_TOKEN_BUDGET:-$PROJECT_DIR/core/memory/L2_session/token-budget.json}"
CIRCUIT_FILE="${YANA_CIRCUIT_STATE:-$PROJECT_DIR/core/memory/L2_session/circuit-state.json}"

LOCKING_LIB="$PROJECT_DIR/core/lib/locking.sh"
[[ -f "$LOCKING_LIB" ]] || LOCKING_LIB="$PROJECT_DIR/.claude/lib/locking.sh"
source "$LOCKING_LIB"

TMP_DIR=$(mktemp -d /tmp/yana-token-reset-XXXXXX)
PAYLOAD_FILE="$TMP_DIR/payload.json"
TMP_SCRIPT="$TMP_DIR/run.js"
trap 'rm -f "$PAYLOAD_FILE" "$TMP_SCRIPT"; rmdir "$TMP_DIR" 2>/dev/null || true' EXIT

cat > "$PAYLOAD_FILE"

cat > "$TMP_SCRIPT" << 'NODEEOF'
const fs = require('fs');
const path = require('path');
const [, , budgetPath, circuitPath, payloadPath] = process.argv;

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } }
function writeJson(p, d) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, p);
}

let toolName = 'unknown';
try {
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  if (payload && typeof payload.tool_name === 'string' && payload.tool_name) {
    toolName = payload.tool_name;
  }
} catch {}

const budget = readJson(budgetPath, { loop_attempts: {} });
if (budget.loop_attempts && budget.loop_attempts[toolName]) {
  budget.loop_attempts[toolName] = 0;
  writeJson(budgetPath, budget);
}

const circuits = readJson(circuitPath, { circuits: {} });
if (circuits.circuits && circuits.circuits[toolName] && circuits.circuits[toolName].state !== 'closed') {
  circuits.circuits[toolName] = { state: 'closed', closed_at: new Date().toISOString() };
  writeJson(circuitPath, circuits);
}
NODEEOF

with_lock "key:state/token-budget.json" 10 -- node "$TMP_SCRIPT" "$BUDGET_FILE" "$CIRCUIT_FILE" "$PAYLOAD_FILE"
exit 0
