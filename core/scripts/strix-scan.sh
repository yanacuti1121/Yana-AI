#!/usr/bin/env bash
# strix-scan.sh — Chunked security audit: L1-L5 rule check + OpenHack expert mode
#
# Usage:
#   bash core/scripts/strix-scan.sh [--target <path>] [--layer <L1|L2|L3|L4|L5|all>]
#                                   [--mode <rules|experts|full>]
#                                   [--expert <injection|bac|...>]
#                                   [--semgrep]
#
# Modes:
#   rules   (default) — L1-L5 YAMTAM rule compliance check
#   experts            — 12 OWASP expert families, recon → scenario → findings
#   full               — rules + experts
#
# Output:
#   releases/logs/strix/strix-YYYYMMDD_HHMMSS.md

set -uo pipefail

# ── Args ─────────────────────────────────────────────────────────────────────
TARGET="."
LAYER="all"
MODE="rules"
EXPERT_FILTER=""
USE_SEMGREP=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --layer)  LAYER="$2";  shift 2 ;;
    --mode)   MODE="$2";   shift 2 ;;
    --expert) EXPERT_FILTER="$2"; shift 2 ;;
    --semgrep) USE_SEMGREP=1; shift ;;
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
echo "STRIX SCAN"
echo "Target    : $TARGET"
echo "Mode      : $MODE"
[[ "$MODE" == "rules" || "$MODE" == "full" ]] && echo "Layer     : $LAYER"
[[ "$MODE" == "experts" || "$MODE" == "full" ]] && echo "Experts   : ${EXPERT_FILTER:-all 12}"
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

# ── Rules mode (L1-L5) ────────────────────────────────────────────────────────
should_run() { [[ "$LAYER" == "all" || "$LAYER" == "$1" ]]; }

if [[ "$MODE" == "rules" || "$MODE" == "full" ]]; then

# ── L1: Command execution safety ─────────────────────────────────────────────
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
fi  # end MODE=rules block

# ═══════════════════════════════════════════════════════════════════════════════
# EXPERT MODE — OpenHack 12 OWASP Expert Families
# Adapted from: github.com/hadriansecurity/openhack (MIT)
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "$MODE" == "experts" || "$MODE" == "full" ]]; then

# ── Recon phase ───────────────────────────────────────────────────────────────
run_recon() {
  echo ""
  echo "▶ RECON — Surface discovery ..."

  local out="$PARTIAL_DIR/RECON.md"
  local src_files
  src_files=$(find "$TARGET" \( -name '*.ts' -o -name '*.js' -o -name '*.py' -o -name '*.go' \
    -o -name '*.rs' -o -name '*.java' -o -name '*.rb' -o -name '*.php' \) \
    ! -path '*/node_modules/*' ! -path '*/.git/*' ! -path '*/target/*' \
    2>/dev/null | head -50)

  local semgrep_hints=""
  if [[ $USE_SEMGREP -eq 1 ]] && command -v semgrep &>/dev/null; then
    echo "  + Running semgrep for pattern hints ..."
    semgrep_hints=$(semgrep --config=auto --json "$TARGET" 2>/dev/null | \
      python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for r in d.get('results', [])[:30]:
        print(f\"{r['path']}:{r['start']['line']} [{r['check_id']}]: {r['extra']['message'][:80]}\")
except: pass
" 2>/dev/null || true)
  fi

  local prompt
  prompt="You are performing security recon on a codebase. Discover all attack surfaces.

TARGET: $TARGET

For each surface found, output one line:
  SURFACE | category | file:line | description

Categories: ROUTE, INPUT, SINK, AUTH_BOUNDARY, EXPOSURE, REQUEST_BOUNDARY

Focus on:
- ROUTE: HTTP endpoints, route declarations, path parameters
- INPUT: request body parsers, file upload handlers, query params, form data
- SINK: SQL/NoSQL queries, shell exec, file ops, template renders, outbound HTTP
- AUTH_BOUNDARY: auth middleware, permission checks, session validation
- EXPOSURE: admin/debug/metrics paths, default credentials, deploy configs
- REQUEST_BOUNDARY: externally reachable endpoints from framework config

Source files:
$(echo "$src_files" | while read -r f; do [[ -f "$f" ]] && echo "--- $f ---" && head -100 "$f"; done | head -400)
${semgrep_hints:+
Semgrep hints:
$semgrep_hints}"

  echo "$prompt" | claude -p --output-format text 2>/dev/null > "$out"
  echo "  ✓ Recon done — $(wc -l < "$out") surfaces found"
}

# ── Expert scan function ──────────────────────────────────────────────────────
run_expert() {
  local expert_id="$1"
  local expert_label="$2"
  local routing_signals="$3"
  local techniques="$4"

  [[ -n "$EXPERT_FILTER" && "$EXPERT_FILTER" != "$expert_id" ]] && return

  echo ""
  echo "▶ EXPERT $expert_id — $expert_label ..."

  local out="$PARTIAL_DIR/EXPERT-${expert_id}.md"

  # Find files relevant to this expert's routing signals
  local relevant_files
  relevant_files=$(grep -rl "$routing_signals" "$TARGET" \
    --include='*.ts' --include='*.js' --include='*.py' --include='*.go' \
    --include='*.rs' --include='*.java' --include='*.rb' --include='*.php' \
    2>/dev/null | grep -v node_modules | grep -v '.git' | head -20)

  local recon_context=""
  [[ -f "$PARTIAL_DIR/RECON.md" ]] && \
    recon_context="Recon surfaces (filter for $expert_id relevance):
$(grep -i "$routing_signals" "$PARTIAL_DIR/RECON.md" | head -20)"

  local prompt
  prompt="You are the $expert_label security expert performing whitebox vulnerability research.

EXPERT FAMILY: $expert_id ($expert_label)
TARGET: $TARGET
TECHNIQUES: $techniques

EVIDENCE BAR — A finding is ONLY valid when ALL 5 are demonstrated:
  1. REACHABLE ENTRYPOINT — attacker can reach this code path
  2. ATTACKER-CONTROLLED INPUT — dangerous value is attacker-supplied
  3. SENSITIVE SINK — value reaches a dangerous operation
  4. MISSING/WRONG GUARD — no sanitization, or guard is bypassable
  5. CONCRETE IMPACT — what can attacker actually do?

$recon_context

Source files to review:
$(echo "$relevant_files" | while read -r f; do [[ -f "$f" ]] && echo "--- $f ---" && cat "$f" 2>/dev/null | head -150; done | head -500)

For each CONFIRMED vulnerability, output:
  FINDING | severity(CRITICAL/HIGH/MEDIUM/LOW) | file:line | title | attack_chain | fix

For each REJECTED hypothesis, output:
  REJECTED | <reason: not reachable / guard present / not attacker-controlled>

End with: CONFIRMED: N  REJECTED: N"

  echo "$prompt" | claude -p --output-format text 2>/dev/null > "$out"

  if [[ -s "$out" ]]; then
    local confirmed rejected
    confirmed=$(grep -c "^FINDING" "$out" 2>/dev/null || echo 0)
    rejected=$(grep -c "^REJECTED" "$out" 2>/dev/null || echo 0)
    echo "  ✓ $expert_id done — $confirmed confirmed, $rejected rejected"
  else
    echo "  ✗ $expert_id — no output"
    echo "EXPERT $expert_id: ERROR — no output" > "$out"
  fi
}

run_recon

# 12 OWASP 2025-aligned expert families (OpenHack methodology)
run_expert "bac"    "Broken Access Control (A01:2025)" \
  "user_id\|owner\|resource\|authorization\|role\|admin\|fetch\|request" \
  "BOLA, SSRF, privilege escalation, cross-tenant access, workflow bypass"

run_expert "misconfig" "Security Misconfiguration (A02:2025)" \
  "debug\|cors\|headers\|config\|settings\|admin\|credentials\|default" \
  "Default creds, exposed admin paths, missing security headers, debug=True, CORS wildcard"

run_expert "supply-chain" "Supply Chain Failures (A03:2025)" \
  "package\|install\|import\|require\|dependency\|lockfile" \
  "Unpinned deps, postinstall scripts, typosquatting, missing integrity hashes"

run_expert "crypto"  "Cryptographic Failures (A04:2025)" \
  "crypto\|hash\|sign\|jwt\|token\|random\|secret\|key\|ssl\|tls\|md5\|sha1" \
  "Weak algorithms, hardcoded keys, Math.random() for security, verify=False, JWT none-alg"

run_expert "injection" "Injection (A05:2025)" \
  "query\|exec\|eval\|template\|render\|sql\|shell\|format\|innerHTML\|mongo\|xpath" \
  "SQL/NoSQL/OS cmd/SSTI/XSS/prototype pollution — trace attacker input to dangerous sink"

run_expert "memory"  "Memory & Buffer Errors (CWE-119)" \
  "unsafe\|memcpy\|malloc\|free\|ctypes\|ffi\|ptr\|buffer\|overflow" \
  "Buffer overflows, off-by-one, use-after-free, unsafe Rust blocks, C FFI"

run_expert "design"  "Insecure Design (A06:2025)" \
  "rate_limit\|retry\|price\|quantity\|step\|workflow\|state\|limit\|captcha" \
  "Missing rate limits, business logic flaws, multi-step state bypass, IDOR in design"

run_expert "authn"   "Authentication Failures (A07:2025)" \
  "login\|password\|session\|token\|auth\|mfa\|reset\|logout\|credential" \
  "Weak password policy, predictable tokens, session not rotated, MFA bypass, account enum"

run_expert "integrity" "Data Integrity Failures (A08:2025)" \
  "pickle\|yaml.load\|deserializ\|eval\|update\|download\|unpack\|marshal" \
  "Unsafe deserialization, missing signature verify on updates, auto-update without hash check"

run_expert "exposure" "Sensitive Information Exposure (CWE-200)" \
  "log\|error\|exception\|response\|debug\|print\|stack\|trace\|verbose" \
  "Secrets in logs, PII in URLs, overly verbose errors, sensitive fields not masked"

run_expert "path-traversal" "Path Traversal & Unrestricted Upload (CWE-22/434)" \
  "file\|path\|upload\|extract\|zip\|tar\|open\|read\|write\|dirname\|basename" \
  "../ normalization bypass, extension-only checks, zip slip, symlink following"

run_expert "resource"  "Unrestricted Resource Consumption (CWE-770)" \
  "size\|limit\|timeout\|regex\|loop\|recursive\|pagination\|query\|request" \
  "No upload size limit, ReDoS regex, unbounded DB queries, missing HTTP timeouts"

fi  # end MODE=experts/full block

# ── Aggregate report ──────────────────────────────────────────────────────────
{
  echo "# STRIX SECURITY AUDIT REPORT"
  echo ""
  echo "**Date:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "**Target:** $TARGET"
  echo "**Mode:** $MODE"
  echo ""
  echo "---"

  # Rule layers (L1-L5)
  if [[ "$MODE" == "rules" || "$MODE" == "full" ]]; then
    echo ""
    echo "## Rule Compliance (L1-L5)"
    echo ""
    for layer in L1 L2 L3 L4 L5; do
      local_f="$PARTIAL_DIR/$layer.md"
      [[ -f "$local_f" ]] || continue
      echo "### $layer"
      cat "$local_f"
      echo ""
      echo "---"
    done
  fi

  # Expert findings (OpenHack families)
  if [[ "$MODE" == "experts" || "$MODE" == "full" ]]; then
    echo ""
    echo "## Expert Vulnerability Research (OpenHack 12 Families)"
    echo ""

    if [[ -f "$PARTIAL_DIR/RECON.md" ]]; then
      echo "### Recon Surfaces"
      cat "$PARTIAL_DIR/RECON.md"
      echo ""
      echo "---"
    fi

    for expert_file in "$PARTIAL_DIR"/EXPERT-*.md; do
      [[ -f "$expert_file" ]] || continue
      expert_name=$(basename "$expert_file" .md | sed 's/EXPERT-//')
      echo "### Expert: $expert_name"
      cat "$expert_file"
      echo ""
      echo "---"
    done
  fi

  # Summary table
  echo ""
  echo "## Summary"
  echo ""
  echo "| Source | CRITICAL | HIGH | MEDIUM | LOW |"
  echo "|--------|----------|------|--------|-----|"

  for layer in L1 L2 L3 L4 L5; do
    local_f="$PARTIAL_DIR/$layer.md"
    [[ -f "$local_f" ]] || continue
    c=$(grep -oi "CRITICAL" "$local_f" | wc -l)
    h=$(grep -oi "\bHIGH\b" "$local_f" | wc -l)
    m=$(grep -oi "\bMEDIUM\b" "$local_f" | wc -l)
    l=$(grep -oi "\bLOW\b" "$local_f" | wc -l)
    echo "| $layer | $c | $h | $m | $l |"
  done

  for expert_file in "$PARTIAL_DIR"/EXPERT-*.md; do
    [[ -f "$expert_file" ]] || continue
    expert_name=$(basename "$expert_file" .md | sed 's/EXPERT-//')
    c=$(grep -oi "CRITICAL" "$expert_file" | wc -l)
    h=$(grep -oi "\bHIGH\b" "$expert_file" | wc -l)
    m=$(grep -oi "\bMEDIUM\b" "$expert_file" | wc -l)
    l=$(grep -oi "\bLOW\b" "$expert_file" | wc -l)
    confirmed=$(grep -c "^FINDING" "$expert_file" 2>/dev/null || echo 0)
    echo "| expert:$expert_name ($confirmed findings) | $c | $h | $m | $l |"
  done

} > "$REPORT"

echo ""
echo "================================================================"
echo "DONE — Report: $REPORT"
echo "================================================================"

# Cleanup partials
rm -rf "$PARTIAL_DIR"
