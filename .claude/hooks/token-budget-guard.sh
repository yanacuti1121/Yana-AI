#!/usr/bin/env bash
# Status: active
# Description: Token Budget Guard — Circuit Breaker + fast-tier auto-routing
# Hook type: PreToolUse (runs before each tool call)
# Last Reviewed: 2026-09-05
# Install: add to settings.json hooks.PreToolUse
#
# Circuit Breaker states:
#   CLOSED   — normal operation
#   OPEN     — tool called ≥5 consecutive times without success → HARD BLOCK
#   HALF-OPEN — after cooldown, 1 probe allowed
#
# Bypass: YANA_BUDGET_BYPASS=1 (sovereign only)
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
export CLAUDE_PROJECT_DIR="$PROJECT_DIR"

# ── Native Rust fast path (audit 2026-06-21) ─────────────────────────────────
# If yana-rt is installed and on PATH, delegate to the in-process Rust port.
# Stdin has not been touched yet at this point, so exec inherits it intact.
if command -v yana-rt >/dev/null 2>&1; then
  exec yana-rt guard token-budget
fi

BUDGET_FILE="${YANA_TOKEN_BUDGET:-$PROJECT_DIR/core/memory/L2_session/token-budget.json}"
CIRCUIT_FILE="${YANA_CIRCUIT_STATE:-$PROJECT_DIR/core/memory/L2_session/circuit-state.json}"
MAX_LOOP_TOKENS="${YANA_MAX_LOOP_TOKENS:-50000}"
MAX_ATTEMPTS="${YANA_MAX_FIX_ATTEMPTS:-5}"
COOLDOWN_SECONDS="${YANA_CIRCUIT_COOLDOWN:-60}"
LOG_FILE="${YANA_LOG:-/tmp/yana-ai-audit.log}"
FAST_TIER_MODEL="${YANA_FAST_TIER_MODEL:-claude-haiku-4-5-20251001}"

# Env-var fallback only — real source of truth is stdin JSON below.
# Some non-Claude-Code adapters (Cursor/Codex translators) may still set
# this instead of a stdin payload.
TOOL_NAME_ENV_FALLBACK="${CLAUDE_TOOL_NAME:-}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
NOW_EPOCH=$(date +%s)

# Bypass — sovereign override only
if [[ "${YANA_BUDGET_BYPASS:-0}" == "1" ]]; then
  echo "[token-budget-guard] BYPASS active"
  exit 0
fi

LOCKING_LIB="$PROJECT_DIR/core/lib/locking.sh"
[[ -f "$LOCKING_LIB" ]] || LOCKING_LIB="$PROJECT_DIR/.claude/lib/locking.sh"
source "$LOCKING_LIB"

TMP_DIR=$(mktemp -d /tmp/yana-token-budget-XXXXXX)
TMP_SCRIPT="$TMP_DIR/run.js"
HOOK_PAYLOAD_FILE="$TMP_DIR/payload.json"
trap 'rm -f "$TMP_SCRIPT" "$HOOK_PAYLOAD_FILE"; rmdir "$TMP_DIR" 2>/dev/null || true' EXIT

# BUG FIX (2026-09-05): Claude Code's PreToolUse hook contract passes the
# tool_name on stdin as JSON — {"tool_name": "...", "tool_input": {...}, ...}
# — not via an env var. CLAUDE_TOOL_NAME was never set by the harness, so
# every call fell through to the 'unknown' bucket, meaning every tool
# (Bash, Read, Skill, ...) shared ONE circuit-breaker counter instead of
# one each. That collapsed "5 consecutive failures of the same tool" into
# "any 5 tool calls total in the session" — a false-positive lockout that
# blocked the whole session, confirmed live: Bash and Read both tripped
# the same 'unknown' circuit after a single Skill call.
#
# Capture stdin to a file (not a pipe into node) so the big Node script
# below can read it directly, keeping ADR-008's "one process, one lock"
# property intact instead of spawning a second interpreter just to parse
# the payload.
cat > "$HOOK_PAYLOAD_FILE"

cat > "$TMP_SCRIPT" << 'NODEEOF'
const fs = require('fs');
const path = require('path');

const [, , budgetPath, circuitPath, hookPayloadPath, toolNameEnvFallback,
       maxLoopTokensStr, maxAttemptsStr, cooldownSecondsStr, logFile,
       fastTierModel, timestamp, nowEpochStr] = process.argv;
const maxLoopTokens = parseInt(maxLoopTokensStr, 10);
const maxAttempts = parseInt(maxAttemptsStr, 10);
const cooldownSeconds = parseInt(cooldownSecondsStr, 10);
const nowEpoch = parseInt(nowEpochStr, 10);

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJson(p, d) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmpPath = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(d, null, 2));
  fs.renameSync(tmpPath, p);
}
function appendLog(line) {
  try { fs.appendFileSync(logFile, line + '\n'); } catch {}
}

// Resolve real tool name: stdin JSON payload first, env var fallback second.
let toolName = 'unknown';
try {
  const raw = fs.readFileSync(hookPayloadPath, 'utf8').trim();
  if (raw) {
    const payload = JSON.parse(raw);
    if (payload && typeof payload.tool_name === 'string' && payload.tool_name) {
      toolName = payload.tool_name;
    }
  }
} catch {}
if (toolName === 'unknown' && toolNameEnvFallback) {
  toolName = toolNameEnvFallback;
}

let budget = readJson(budgetPath, {
  session_start: timestamp, total_tokens_used: 0, actions: [],
  loop_attempts: {}, fast_tier_triggered: false,
});
let circuits = readJson(circuitPath, { circuits: {} });

const info = (circuits.circuits || {})[toolName] || { state: 'closed' };
let status;
if (info.state === 'open') {
  const elapsed = nowEpoch - (info.opened_at_epoch || 0);
  status = elapsed >= cooldownSeconds ? 'half-open' : 'open:' + (cooldownSeconds - elapsed);
} else if (info.state === 'half-open') {
  status = 'half-open';
} else {
  status = 'closed';
}

if (status.startsWith('open:')) {
  const remaining = status.slice(5);
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  [token-budget-guard] CIRCUIT BREAKER — OPEN         ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Tool     : ${toolName}`);
  console.log(`  State    : OPEN (cooldown: ${remaining}s remaining)`);
  console.log(`  Action   : HARD BLOCKED — loop detected, circuit is open`);
  console.log(`  Fix      : Wait for cooldown, then retry with a different strategy`);
  console.log(`  Fast tier: Switch model to ${fastTierModel} to reduce cost`);
  appendLog(`[${timestamp}] CIRCUIT-OPEN tool='${toolName}' cooldown_remaining=${remaining}s`);
  process.exit(1);
}

const totalTokens = budget.total_tokens_used || 0;
const loopCount = (budget.loop_attempts || {})[toolName] || 0;

if (loopCount >= maxAttempts) {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  [token-budget-guard] CIRCUIT BREAKER TRIGGERED      ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Tool       : ${toolName}`);
  console.log(`  Loop count : ${loopCount} / ${maxAttempts} (threshold exceeded)`);
  console.log(`  Tokens used: ${totalTokens}`);
  console.log(`  Action     : Circuit OPENED — tool BLOCKED for ${cooldownSeconds}s`);
  console.log("");
  console.log("  ── Fast-Tier Recommendation ──────────────────────────");
  console.log(`  Switch model to: ${fastTierModel}`);
  console.log(`  Reason: Sonnet costs accumulating on a stuck loop.`);
  console.log(`  Command: Set ANTHROPIC_MODEL=${fastTierModel} in your env`);
  console.log("");
  console.log("  ── Recovery Options ──────────────────────────────────");
  console.log("  1. Stop the loop — pick a completely different approach");
  console.log("  2. Use /tree-of-thoughts to re-plan from scratch");
  console.log("  3. Escalate to human: too complex for auto-fix");
  console.log("");

  circuits.circuits = circuits.circuits || {};
  const prevOpenCount = (circuits.circuits[toolName] || {}).open_count || 0;
  const openCount = prevOpenCount + 1;
  const cooldownMap = { 1: 60, 2: 300 };
  const storedCooldown = cooldownMap[openCount] || 1800;
  circuits.circuits[toolName] = {
    state: 'open', opened_at: timestamp, opened_at_epoch: nowEpoch,
    open_count: openCount, cooldown_seconds: storedCooldown,
    reason: `Loop: ${toolName} called >=${maxAttempts} times without success`,
  };
  writeJson(circuitPath, circuits);

  budget.fast_tier_triggered = true;
  budget.fast_tier_tool = toolName;
  writeJson(budgetPath, budget);

  appendLog(`[${timestamp}] CIRCUIT-TRIGGERED tool='${toolName}' loop_count=${loopCount} tokens=${totalTokens}`);
  process.exit(1); // HARD BLOCK
}

if (totalTokens > maxLoopTokens) {
  console.log(`[token-budget-guard] BUDGET WARNING: ${totalTokens} tokens used (limit: ${maxLoopTokens})`);
  console.log(`[token-budget-guard] Run /cost-report to review ROI before continuing`);
}

if (status === 'half-open') {
  circuits.circuits = circuits.circuits || {};
  if (circuits.circuits[toolName]) {
    circuits.circuits[toolName].state = 'closed';
    circuits.circuits[toolName].closed_at = new Date().toISOString();
  }
  writeJson(circuitPath, circuits);
  console.log(`[token-budget-guard] Circuit CLOSED for ${toolName} — probe succeeded`);
}

budget.loop_attempts = budget.loop_attempts || {};
budget.loop_attempts[toolName] = (budget.loop_attempts[toolName] || 0) + 1;
writeJson(budgetPath, budget);

console.log(`[token-budget-guard] OK — ${toolName} (attempt ${loopCount + 1} / ${maxAttempts})`);
process.exit(0);
NODEEOF

with_lock "key:state/token-budget.json" 10 -- node "$TMP_SCRIPT" \
  "$BUDGET_FILE" "$CIRCUIT_FILE" "$HOOK_PAYLOAD_FILE" "$TOOL_NAME_ENV_FALLBACK" \
  "$MAX_LOOP_TOKENS" "$MAX_ATTEMPTS" "$COOLDOWN_SECONDS" "$LOG_FILE" \
  "$FAST_TIER_MODEL" "$TIMESTAMP" "$NOW_EPOCH"
exit $?