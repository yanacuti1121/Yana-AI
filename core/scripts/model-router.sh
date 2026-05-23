#!/usr/bin/env bash
# model-router.sh — Token-aware model tier routing for agent prompts
# Analyzes prompt length/complexity and assigns --tier flag (fast | power)
#
# Usage:  bash core/scripts/model-router.sh [prompt_file_or_stdin]
# Output: exports YAMTAM_MODEL_TIER (fast|power) and YAMTAM_TOKEN_ESTIMATE
# Env:    YAMTAM_POWER_THRESHOLD  — token count above which → power tier (default: 800)
#         YAMTAM_FAST_PATTERNS    — comma-list of low-complexity keywords
#
# Exit codes:
#   0  — routing decision made, YAMTAM_MODEL_TIER set
#   1  — cannot read input
#
# Tier definitions:
#   fast  → claude-haiku-4-5  (format, scan, simple transforms)
#   power → claude-sonnet-4-6 (analysis, code gen, multi-step reasoning)
#
# Source: berriai/litellm (cost tracking), dqbd/tiktoken (token counting)
set -uo pipefail

POWER_THRESHOLD="${YAMTAM_POWER_THRESHOLD:-800}"
FAST_PATTERNS="${YAMTAM_FAST_PATTERNS:-format,lint,count,list,echo,rename,grep,sort,trim}"
LOG_FILE="${YAMTAM_PROXY_LOG:-releases/logs/tool-proxy.log}"

# ─── Read input ──────────────────────────────────────────────────────────────
INPUT=""
if [[ $# -gt 0 && -f "$1" ]]; then
  INPUT="$(cat "$1")"
elif [[ $# -gt 0 ]]; then
  INPUT="$1"
elif [[ ! -t 0 ]]; then
  INPUT="$(cat)"
else
  echo "[model-router] ERROR: no input (provide file, argument, or pipe)" >&2
  exit 1
fi

# ─── Token estimation (4 chars ≈ 1 token) ────────────────────────────────────
CHAR_COUNT="${#INPUT}"
TOKEN_ESTIMATE=$(( CHAR_COUNT / 4 ))
export YAMTAM_TOKEN_ESTIMATE="$TOKEN_ESTIMATE"

# ─── Complexity signals ───────────────────────────────────────────────────────
LOWER_INPUT="${INPUT,,}"   # lowercase for pattern matching

# Signal 1: token count threshold
if [[ "$TOKEN_ESTIMATE" -ge "$POWER_THRESHOLD" ]]; then
  COMPLEXITY_SCORE=3
else
  COMPLEXITY_SCORE=0
fi

# Signal 2: code/structure keywords → power tier
CODE_KEYWORDS="implement|refactor|architect|design|analyze|debug|optimize|generate|create|build|migrate|test|review"
if echo "$LOWER_INPUT" | grep -qiE "$CODE_KEYWORDS"; then
  COMPLEXITY_SCORE=$(( COMPLEXITY_SCORE + 2 ))
fi

# Signal 3: multi-step indicators → power tier
MULTISTEP_KEYWORDS="step by step|first.*then|multiple|complex|compare|evaluate|explain why|reason"
if echo "$LOWER_INPUT" | grep -qiE "$MULTISTEP_KEYWORDS"; then
  COMPLEXITY_SCORE=$(( COMPLEXITY_SCORE + 2 ))
fi

# Signal 4: fast patterns → override to fast if all match
IFS=',' read -ra FAST_LIST <<< "$FAST_PATTERNS"
FAST_MATCH=0
for pattern in "${FAST_LIST[@]}"; do
  if echo "$LOWER_INPUT" | grep -qi "^$pattern\|${pattern}[[:space:]]"; then
    FAST_MATCH=$(( FAST_MATCH + 1 ))
    break
  fi
done

# ─── Routing decision ─────────────────────────────────────────────────────────
if [[ "$FAST_MATCH" -gt 0 && "$TOKEN_ESTIMATE" -lt 200 ]]; then
  TIER="fast"
elif [[ "$COMPLEXITY_SCORE" -ge 3 ]]; then
  TIER="power"
else
  TIER="fast"
fi

export YAMTAM_MODEL_TIER="$TIER"

# ─── Logging ─────────────────────────────────────────────────────────────────
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LOG_ENTRY="{\"ts\":\"${TS}\",\"component\":\"model-router\",\"tier\":\"${TIER}\",\"tokens\":${TOKEN_ESTIMATE},\"score\":${COMPLEXITY_SCORE}}"
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
echo "$LOG_ENTRY" >> "$LOG_FILE" 2>/dev/null || true

# ─── Output ───────────────────────────────────────────────────────────────────
echo "--tier ${TIER}"
echo "[model-router] tier=${TIER} tokens≈${TOKEN_ESTIMATE} score=${COMPLEXITY_SCORE}" >&2
