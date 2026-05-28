#!/usr/bin/env bash
# strix-scan.sh — Chunked L1-L5 security audit
# Splits scan into 5 phases so each fits within 200K context (Claude Pro CLI)
#
# Usage:
#   bash core/scripts/strix-scan.sh [--target <path>] [--layer <L1|L2|L3|L4|L5|all>]
#
# Output:
#   releases/logs/strix/strix-YYYYMMDD_HHMMSS.md

set -uo pipefail

# ── Args ─────────────────────────────────────────────────────────────────────
TARGET="."
LAYER="all"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --layer)  LAYER="$2";  shift 2 ;;
    *) shift ;;
  esac
done

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RULES_DIR="$PROJECT_ROOT/core/rules"
SCRIPTS_DIR="$PROJECT_ROOT/core/scripts"
REPORT_DIR="$PROJECT_ROOT/releases/logs/strix"
mkdir -p "$REPORT_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT="$REPORT_DIR/strix-$TIMESTAMP.md"
PARTIAL_DIR="$REPORT_DIR/partial-$TIMESTAMP"
mkdir -p "$PARTIAL_DIR"

echo "================================================================"
echo "STRIX SCAN — Chunked L1-L5 Security Audit"
echo "Target    : $TARGET"
echo "Layer     : $LAYER"
echo "Report    : $REPORT"
echo "================================================================"

# ── Layer definitions ─────────────────────────────────────────────────────────
# Each layer: relevant rule files + source file patterns to audit

run_layer() {
  local layer="$1"
  local label="$2"
  local rule_files="$3"     # space-separated rule filenames
  local source_patterns="$4" # find patterns for source files

  echo ""
  echo "▶ Scanning $layer — $label ..."

  local out="$PARTIAL_DIR/$layer.md"
  local context_file="$PARTIAL_DIR/$layer-context.txt"

  # Build context: rules
  echo "# STRIX $layer AUDIT CONTEXT" > "$context_file"
  echo "## Gate Rules" >> "$context_file"
  for rule in $rule_files; do
    local rpath="$RULES_DIR/$rule"
    if [[ -f "$rpath" ]]; then
      echo "" >> "$context_file"
      echo "### $rule" >> "$context_file"
      cat "$rpath" >> "$context_file"
    fi
  done

  # Build context: source files (limit to 60 files to stay in context)
  echo "" >> "$context_file"
  echo "## Source Files to Audit" >> "$context_file"
  local count=0
  while IFS= read -r f; do
    [[ $count -ge 60 ]] && break
    echo "" >> "$context_file"
    echo "### $f" >> "$context_file"
    head -200 "$f" >> "$context_file"  # first 200 lines per file
    count=$((count + 1))
  done < <(eval "find $TARGET $source_patterns 2>/dev/null" | head -60)

  # Build prompt
  local prompt
  prompt="You are running a YAMTAM security audit for gate layer $layer ($label).

The rules below define what violations to look for.
The source files below are the code to audit.

Your task:
1. Check each source file against the $layer rules
2. Report ONLY real violations with: severity (CRITICAL/HIGH/MEDIUM/LOW), file:line, rule violated, fix recommendation
3. If no violations found, say \"PASS — no violations\"
4. End with a summary count: CRITICAL: N, HIGH: N, MEDIUM: N, LOW: N

$(cat "$context_file")"

  # Run via claude -p
  echo "$prompt" | claude -p --output-format text 2>/dev/null > "$out"

  if [[ -s "$out" ]]; then
    echo "  ✓ $layer done — $(wc -l < "$out") lines"
  else
    echo "  ✗ $layer — no output (claude CLI error?)"
    echo "LAYER $layer ($label): ERROR — no output from claude" > "$out"
  fi
}

# ── L1: Command execution safety ─────────────────────────────────────────────
should_run() { [[ "$LAYER" == "all" || "$LAYER" == "$1" ]]; }

if should_run "L1"; then
  run_layer "L1" "Command Execution Safety" \
    "02-terminal-validator.md anti-evasion-law.md shell-sanitize-law.md" \
    "-name '*.sh' -o -name '*.bash'"
fi

# ── L2: Environment & privilege ───────────────────────────────────────────────
if should_run "L2"; then
  run_layer "L2" "Environment & Privilege Isolation" \
    "env-integrity-policy.md 03-privilege-isolation.md owasp-llm-output-law.md agent-excessive-agency-law.md" \
    "-name '*.ts' -o -name '*.js' -o -name '*.py'"
fi

# ── L3: Network & external boundary ──────────────────────────────────────────
if should_run "L3"; then
  run_layer "L3" "Network Egress & API Security" \
    "network-egress-law.md 53-network-egress-whitelist-law.md api-security-gate.md agent-tool-poisoning-guard.md" \
    "-name '*.ts' -o -name '*.py' -o -name '*.js'"
fi

# ── L4: Supply chain ─────────────────────────────────────────────────────────
if should_run "L4"; then
  run_layer "L4" "Supply Chain & Dependency Vetting" \
    "44-supply-chain-vetting.md slsa-artifact-law.md dependency-vetting-law.md 58-dependency-sandbox-law.md" \
    "-name 'package*.json' -o -name 'requirements*.txt' -o -name 'Cargo.toml' -o -name '*.lock'"
fi

# ── L5: Runtime isolation ─────────────────────────────────────────────────────
if should_run "L5"; then
  run_layer "L5" "Runtime Isolation & Agent Hierarchy" \
    "04-sandbox-isolation-law.md resource-quota-law.md agent-hierarchy-law.md 49-immutable-infrastructure-law.md 51-sovereign-runtime-law.md" \
    "-name 'Dockerfile' -o -name 'docker-compose*.yml' -o -name '*.yaml'"
fi

# ── Aggregate report ──────────────────────────────────────────────────────────
{
  echo "# STRIX SECURITY AUDIT REPORT"
  echo ""
  echo "**Date:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "**Target:** $TARGET"
  echo "**Layers:** $LAYER"
  echo ""
  echo "---"

  for layer in L1 L2 L3 L4 L5; do
    local_f="$PARTIAL_DIR/$layer.md"
    [[ -f "$local_f" ]] || continue
    echo ""
    echo "## $layer"
    echo ""
    cat "$local_f"
    echo ""
    echo "---"
  done

  echo ""
  echo "## Summary"
  echo ""
  echo "| Layer | CRITICAL | HIGH | MEDIUM | LOW |"
  echo "|-------|----------|------|--------|-----|"
  for layer in L1 L2 L3 L4 L5; do
    local_f="$PARTIAL_DIR/$layer.md"
    [[ -f "$local_f" ]] || continue
    c=$(grep -oi "CRITICAL" "$local_f" | wc -l)
    h=$(grep -oi "\bHIGH\b" "$local_f" | wc -l)
    m=$(grep -oi "\bMEDIUM\b" "$local_f" | wc -l)
    l=$(grep -oi "\bLOW\b" "$local_f" | wc -l)
    echo "| $layer | $c | $h | $m | $l |"
  done
} > "$REPORT"

echo ""
echo "================================================================"
echo "DONE — Report: $REPORT"
echo "================================================================"

# Cleanup partials
rm -rf "$PARTIAL_DIR"
