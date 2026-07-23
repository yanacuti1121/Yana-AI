#!/usr/bin/env bash
# Status: active
# Description: Token Budget Guard — Circuit Breaker + fast-tier auto-routing
# Hook type: PreToolUse (runs before each tool call)
# Last Reviewed: 2026-05-23
# Install: add to settings.json hooks.PreToolUse
#
# Circuit Breaker states:
#   CLOSED   — normal operation
#   OPEN     — tool called ≥5 consecutive times without success → HARD BLOCK
#   HALF-OPEN — after cooldown, 1 probe allowed
#
# Bypass: YANA_BUDGET_BYPASS=1 (sovereign only)
set -euo pipefail

# ── Native Rust fast path (audit 2026-06-21) ─────────────────────────────────
# If yana-rt is installed and on PATH, delegate to the in-process Rust port:
# no Node.js subprocess spawn (this script previously shelled out to `node
# -e` up to 5 times per call just to read/write the two JSON state files
# below). Same file paths, same field names, same circuit-breaker thresholds
# — tested cross-compatible: a session can call this bash hook on some tool
# calls and the Rust one on others without the state ever diverging (see
# src/guard/token_budget.rs). Falls through unchanged if yana-rt isn't found.
if command -v yana-rt >/dev/null 2>&1; then
  exec yana-rt guard token-budget
fi

BUDGET_FILE="${YANA_TOKEN_BUDGET:-core/memory/L2_session/token-budget.json}"
CIRCUIT_FILE="${YANA_CIRCUIT_STATE:-core/memory/L2_session/circuit-state.json}"
MAX_LOOP_TOKENS="${YANA_MAX_LOOP_TOKENS:-50000}"
MAX_ATTEMPTS="${YANA_MAX_FIX_ATTEMPTS:-5}"
COOLDOWN_SECONDS="${YANA_CIRCUIT_COOLDOWN:-60}"
LOG_FILE="${YANA_LOG:-/tmp/yana-ai-audit.log}"
FAST_TIER_MODEL="${YANA_FAST_TIER_MODEL:-claude-haiku-4-5-20251001}"

TOOL_NAME="${CLAUDE_TOOL_NAME:-unknown}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
NOW_EPOCH=$(date +%s)

# Bypass — sovereign override only
if [[ "${YANA_BUDGET_BYPASS:-0}" == "1" ]]; then
  echo "[token-budget-guard] BYPASS active"
  exit 0
fi

# ── Initialize budget file ────────────────────────────────────────────────────
if [[ ! -f "$BUDGET_FILE" ]]; then
  mkdir -p "$(dirname "$BUDGET_FILE")"
  printf '{"session_start":"%s","total_tokens_used":0,"actions":[],"loop_attempts":{},"fast_tier_triggered":false}\n' \
    "$TIMESTAMP" > "$BUDGET_FILE"
fi

# ── Initialize circuit state file ────────────────────────────────────────────
if [[ ! -f "$CIRCUIT_FILE" ]]; then
  mkdir -p "$(dirname "$CIRCUIT_FILE")"
  printf '{"circuits":{}}\n' > "$CIRCUIT_FILE"
fi

# ── ADR-008: entire read(budget+circuit) -> decide -> write unit runs as ONE
# Node process under ONE lock, keyed on BUDGET_FILE (the file
# core/hooks/risk-scorer.sh's Python side also writes on the same
# PreToolUse event). Previously this ran the same 5 decisions as 5 separate
# `node -e` subprocesses interleaved with bash control flow — each its own
# unlocked read-modify-write, and locking only the write half of any one of
# them would still have left the read-then-decide window open. Consolidating
# into a single script is what makes "hold one lock for the whole thing"
# possible at all. See src/guard/token_budget.rs::run_critical_section for
# the same logic in Rust (that path is preferred whenever yana-rt is on
# PATH — see the `exec` above — so this bash/Node path is the fallback,
# used only when it isn't).
source "$(dirname "${BASH_SOURCE[0]}")/../lib/locking.sh"

# BSD mktemp (macOS default) does NOT support a suffix after the X's in a
# template — "yana-token-budget-XXXXXX.js" is returned byte-for-byte
# unmodified instead of randomized (confirmed live on this exact host: the
# trailing 'X's must be the literal end of the template — see `man
# mktemp`). GNU mktemp's --suffix flag isn't a portable fix either (BSD
# mktemp has no --suffix). mktemp -d has no such restriction on either
# platform, so create a unique directory and put the fixed-name script
# inside it instead of relying on suffix-preserving randomization.
TMP_DIR=$(mktemp -d /tmp/yana-token-budget-XXXXXX)
TMP_SCRIPT="$TMP_DIR/run.js"
trap 'rm -f "$TMP_SCRIPT"; rmdir "$TMP_DIR" 2>/dev/null || true' EXIT

cat > "$TMP_SCRIPT" << 'NODEEOF'
const fs = require('fs');
const path = require('path');

const [, , budgetPath, circuitPath, toolName, maxLoopTokensStr, maxAttemptsStr,
       cooldownSecondsStr, logFile, fastTierModel, timestamp, nowEpochStr] = process.argv;
const maxLoopTokens = parseInt(maxLoopTokensStr, 10);
const maxAttempts = parseInt(maxAttemptsStr, 10);
const cooldownSeconds = parseInt(cooldownSecondsStr, 10);
const nowEpoch = parseInt(nowEpochStr, 10);

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
// Atomic write (temp file + rename), not a direct writeFileSync — same
// fix as src/mission/mod.rs::save() / src/guard/token_budget.rs::write_json,
// for the same reason: writeFileSync truncates before writing, so an
// UNLOCKED reader of this file (core/scripts/session-checkpoint.sh reads
// token-budget.json this way on purpose) can occasionally see a
// torn/partial write. The lock this runs under only serializes against
// other locked writers, not an unlocked reader that was never part of it.
function writeJson(p, d) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmpPath = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmpPath, JSON.stringify(d, null, 2));
  fs.renameSync(tmpPath, p);
}
function appendLog(line) {
  try { fs.appendFileSync(logFile, line + '\n'); } catch {}
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

with_lock "$BUDGET_FILE" 10 -- node "$TMP_SCRIPT" \
  "$BUDGET_FILE" "$CIRCUIT_FILE" "$TOOL_NAME" "$MAX_LOOP_TOKENS" "$MAX_ATTEMPTS" \
  "$COOLDOWN_SECONDS" "$LOG_FILE" "$FAST_TIER_MODEL" "$TIMESTAMP" "$NOW_EPOCH"
exit $?
