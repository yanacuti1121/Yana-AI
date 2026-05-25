#!/usr/bin/env bash
# YAMTAM ENGINE Hook
# Version: 1.3.26
# Status: active
# Description: UserPromptSubmit — inject relevant L1 facts + session trust into Claude context
# Last Reviewed: 2026-05-19
#
# Fires before every prompt Claude receives.
# Stdout is injected as additional context Claude can read.
# Keep this fast — it blocks model processing until complete.
#
# What it injects:
#   1. L1 facts matching keywords from the user prompt (max 5)
#   2. Session trust score (if below 80)
#   3. Budget Mode status (if ON)
#   4. Active L2 session facts count (reminder to use /memory --l2)
#
# Hook event:   UserPromptSubmit
# Blocking:     yes (stdout goes into Claude context — keep under 500 chars)
# Bypass:       YAMTAM_BOOTSTRAP_BYPASS=1
# Requires:     jq

set -uo pipefail

[[ "${YAMTAM_BOOTSTRAP_BYPASS:-}" == "1" ]] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // ""' 2>/dev/null || true)
[[ -z "$PROMPT" ]] && exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
L1_DIR="$PROJECT_DIR/memory/L1_atomic"
L2_DIR="$PROJECT_DIR/memory/L2_session"

OUTPUT_PARTS=()

# ── 1. L1 facts matching prompt keywords ─────────────────────────────────────
if [[ -d "$L1_DIR" ]]; then
  # Extract significant words from prompt (4+ chars, skip common words)
  KEYWORDS=$(printf '%s' "$PROMPT" \
    | tr '[:upper:]' '[:lower:]' \
    | grep -oE '[a-z]{4,}' \
    | grep -vE '^(this|that|with|from|have|will|what|when|where|then|also|just|only|make|does|here|they|them|some|into|your|our|can|could|should|would|about|after|before|there|these|those|which|been|being|were|their|more|such|like|well|very|over|even|both|each|most|much|many|back|take|need|want|give|know|think|look|come|work|call|seem|feel|keep|show|let|put|say|try|use|see|ask|may|might|must|shall|upon|plus|next|last|first|long|high|good|great|best|new|old|own|same|part|done|used)' \
    | head -5 || true)

  MATCHED_FACTS=""
  FACT_COUNT=0

  while IFS= read -r -d '' fact_file; do
    [[ "$(basename "$fact_file")" == "INDEX.md" ]] && continue
    [[ "$(basename "$fact_file")" == "SCHEMA.md" ]] && continue

    FACT_CONTENT=$(cat "$fact_file" 2>/dev/null || true)
    MATCHED=false

    for kw in $KEYWORDS; do
      if echo "$FACT_CONTENT" | grep -qi "$kw" 2>/dev/null; then
        MATCHED=true
        break
      fi
    done

    if [[ "$MATCHED" == true && $FACT_COUNT -lt 5 ]]; then
      FACT_NAME=$(grep -m1 '^name:' "$fact_file" 2>/dev/null | sed 's/name:\s*//' | tr -d '"' || basename "$fact_file" .md)
      FACT_BODY=$(grep -A2 '^value:' "$fact_file" 2>/dev/null | tail -1 | sed 's/^\s*//' || true)
      [[ -n "$FACT_BODY" ]] && MATCHED_FACTS="${MATCHED_FACTS}[L1:${FACT_NAME}] ${FACT_BODY} | "
      FACT_COUNT=$((FACT_COUNT + 1))
    fi
  done < <(find "$L1_DIR" -maxdepth 1 -name "*.md" -print0 2>/dev/null)

  [[ -n "$MATCHED_FACTS" ]] && OUTPUT_PARTS+=("L1 facts: ${MATCHED_FACTS%| }")
fi

# ── 2. Session trust score ────────────────────────────────────────────────────
TRUST_FILE="$STATE_DIR/session-trust.json"
if [[ -f "$TRUST_FILE" ]]; then
  SCORE=$(jq -r '.score // 100' "$TRUST_FILE" 2>/dev/null || echo 100)
  if [[ "$SCORE" =~ ^[0-9]+$ ]] && [[ "$SCORE" -lt 80 ]]; then
    OUTPUT_PARTS+=("Trust score: ${SCORE}/100 — double-evidence required for claims")
  fi
fi

# ── 3. Budget Mode ────────────────────────────────────────────────────────────
if [[ -f "$STATE_DIR/BUDGET_MODE" ]]; then
  MODE=$(tr -d '[:space:]' < "$STATE_DIR/BUDGET_MODE" 2>/dev/null || echo off)
  [[ "$MODE" == "on" ]] && OUTPUT_PARTS+=("Budget Mode: ON — restrict heavy commands")
fi

# ── 4. L2 session facts reminder ─────────────────────────────────────────────
if [[ -d "$L2_DIR" ]]; then
  L2_COUNT=$(find "$L2_DIR" -maxdepth 1 -name "*.md" 2>/dev/null | grep -v "SCHEMA\|INDEX" | wc -l || echo 0)
  L2_COUNT=$(echo "$L2_COUNT" | tr -d '[:space:]')
  [[ "$L2_COUNT" =~ ^[0-9]+$ ]] && [[ "$L2_COUNT" -gt 0 ]] && \
    OUTPUT_PARTS+=("${L2_COUNT} L2 session facts active — /memory --l2 to view")
fi

# ── Output ────────────────────────────────────────────────────────────────────
if [[ ${#OUTPUT_PARTS[@]} -gt 0 ]]; then
  JOINED=$(printf '%s | ' "${OUTPUT_PARTS[@]}")
  printf '[YAMTAM] %s\n' "${JOINED% | }"
fi

exit 0
