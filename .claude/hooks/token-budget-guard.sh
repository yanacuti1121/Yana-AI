#!/usr/bin/env bash
# Version: 1.4.20 | Status: active
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

# ── Circuit Breaker: check if tool is currently OPEN ─────────────────────────
CIRCUIT_STATUS=$(node -e "
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('$CIRCUIT_FILE','utf8'));
const info=(d.circuits||{})['$TOOL_NAME']||{state:'closed'};
const state=info.state||'closed';
if(state==='open'){
  const elapsed=$NOW_EPOCH-(info.opened_at_epoch||0);
  const cooldown=$COOLDOWN_SECONDS;
  if(elapsed>=cooldown){process.stdout.write('half-open');}
  else{process.stdout.write('open:'+(cooldown-elapsed));}
}else if(state==='half-open'){process.stdout.write('half-open');}
else{process.stdout.write('closed');}
" 2>/dev/null || echo "closed")

if [[ "$CIRCUIT_STATUS" == open:* ]]; then
  REMAINING="${CIRCUIT_STATUS#open:}"
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  [token-budget-guard] CIRCUIT BREAKER — OPEN         ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo "  Tool     : $TOOL_NAME"
  echo "  State    : OPEN (cooldown: ${REMAINING}s remaining)"
  echo "  Action   : HARD BLOCKED — loop detected, circuit is open"
  echo "  Fix      : Wait for cooldown, then retry with a different strategy"
  echo "  Fast tier: Switch model to $FAST_TIER_MODEL to reduce cost"
  echo "[${TIMESTAMP}] CIRCUIT-OPEN tool='$TOOL_NAME' cooldown_remaining=${REMAINING}s" >> "$LOG_FILE" 2>/dev/null || true
  exit 1
fi

# ── Read budget state ─────────────────────────────────────────────────────────
TOTAL_TOKENS=$(node -e "
const d=JSON.parse(require('fs').readFileSync('$BUDGET_FILE','utf8'));
process.stdout.write(String(d.total_tokens_used||0));
" 2>/dev/null || echo "0")

LOOP_COUNT=$(node -e "
const d=JSON.parse(require('fs').readFileSync('$BUDGET_FILE','utf8'));
process.stdout.write(String((d.loop_attempts||{})['$TOOL_NAME']||0));
" 2>/dev/null || echo "0")

# ── Loop threshold reached → OPEN circuit + hard block ───────────────────────
if [[ $LOOP_COUNT -ge $MAX_ATTEMPTS ]]; then
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  [token-budget-guard] CIRCUIT BREAKER TRIGGERED      ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo "  Tool       : $TOOL_NAME"
  echo "  Loop count : $LOOP_COUNT / $MAX_ATTEMPTS (threshold exceeded)"
  echo "  Tokens used: $TOTAL_TOKENS"
  echo "  Action     : Circuit OPENED — tool BLOCKED for ${COOLDOWN_SECONDS}s"
  echo ""
  echo "  ── Fast-Tier Recommendation ──────────────────────────"
  echo "  Switch model to: $FAST_TIER_MODEL"
  echo "  Reason: Sonnet costs accumulating on a stuck loop."
  echo "  Command: Set ANTHROPIC_MODEL=$FAST_TIER_MODEL in your env"
  echo ""
  echo "  ── Recovery Options ──────────────────────────────────"
  echo "  1. Stop the loop — pick a completely different approach"
  echo "  2. Use /tree-of-thoughts to re-plan from scratch"
  echo "  3. Escalate to human: too complex for auto-fix"
  echo ""

  # Open the circuit
  node -e "
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('$CIRCUIT_FILE','utf8'));
const circuits=d.circuits||(d.circuits={});
const prev=circuits['$TOOL_NAME']||{};
const openCount=(prev.open_count||0)+1;
const cooldownMap={1:60,2:300};
const cooldown=cooldownMap[openCount]||1800;
circuits['$TOOL_NAME']={state:'open',opened_at:'$TIMESTAMP',opened_at_epoch:$NOW_EPOCH,
  open_count:openCount,cooldown_seconds:cooldown,
  reason:'Loop: \$TOOL_NAME called >=$MAX_ATTEMPTS times without success'};
fs.writeFileSync('$CIRCUIT_FILE',JSON.stringify(d,null,2));
" 2>/dev/null || true

  # Mark fast-tier in budget file
  node -e "
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('$BUDGET_FILE','utf8'));
d.fast_tier_triggered=true; d.fast_tier_tool='$TOOL_NAME';
fs.writeFileSync('$BUDGET_FILE',JSON.stringify(d,null,2));
" 2>/dev/null || true

  echo "[${TIMESTAMP}] CIRCUIT-TRIGGERED tool='$TOOL_NAME' loop_count=$LOOP_COUNT tokens=$TOTAL_TOKENS" >> "$LOG_FILE" 2>/dev/null || true
  exit 1  # HARD BLOCK
fi

# ── Budget ceiling warning ────────────────────────────────────────────────────
if [[ $TOTAL_TOKENS -gt $MAX_LOOP_TOKENS ]]; then
  echo "[token-budget-guard] BUDGET WARNING: $TOTAL_TOKENS tokens used (limit: $MAX_LOOP_TOKENS)"
  echo "[token-budget-guard] Run /cost-report to review ROI before continuing"
fi

# ── Half-open: reset circuit on successful probe ──────────────────────────────
if [[ "$CIRCUIT_STATUS" == "half-open" ]]; then
  node -e "
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('$CIRCUIT_FILE','utf8'));
const circuits=d.circuits||{};
if(circuits['$TOOL_NAME']){circuits['$TOOL_NAME'].state='closed';
  circuits['$TOOL_NAME'].closed_at=new Date().toISOString();}
fs.writeFileSync('$CIRCUIT_FILE',JSON.stringify(d,null,2));
" 2>/dev/null || true
  echo "[token-budget-guard] Circuit CLOSED for $TOOL_NAME — probe succeeded"
fi

# ── Update loop counter ───────────────────────────────────────────────────────
node -e "
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('$BUDGET_FILE','utf8'));
const loops=d.loop_attempts||(d.loop_attempts={});
loops['$TOOL_NAME']=(loops['$TOOL_NAME']||0)+1;
fs.writeFileSync('$BUDGET_FILE',JSON.stringify(d,null,2));
" 2>/dev/null || true

echo "[token-budget-guard] OK — $TOOL_NAME (attempt $((LOOP_COUNT + 1)) / $MAX_ATTEMPTS)"
exit 0
