#!/usr/bin/env bash
# Yana AI Hook
# Status: active
# Description: Risk Scorer — score every AI action 0–100 before execution
# Hook type: PreToolUse
# Last Reviewed: 2026-05-23
# Bypass: YANA_RISK_BYPASS=1 (logged)
# Requires: python3

set -uo pipefail

if [[ "${YANA_RISK_BYPASS:-0}" == "1" ]]; then
  echo "[risk-scorer] BYPASS active — sovereign override"
  exit 0
fi

command -v python3 >/dev/null 2>&1 || exit 0

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$PROJECT_DIR/.claude/state"
RISK_LOG="$STATE_DIR/risk-scores.jsonl"
BUDGET_FILE="${YANA_TOKEN_BUDGET:-$STATE_DIR/token-budget.json}"

mkdir -p "$STATE_DIR"

# Save stdin to tmpfile (heredoc consumes stdin otherwise)
TMP_INPUT=$(mktemp)
cat > "$TMP_INPUT"
trap 'rm -f "$TMP_INPUT"' EXIT

# Parse + score via python3 (reads from file, not stdin)
RESULT=$(python3 - "$TMP_INPUT" << 'PYEOF'
import json, sys, re

input_file = sys.argv[1] if len(sys.argv) > 1 else None
try:
    with open(input_file) as f:
        data = json.load(f)
    ti      = data.get('tool_input', {})
    tool    = data.get('tool_name', '')
    cmd     = str(ti.get('command', ''))
    path    = str(ti.get('file_path', ti.get('path', '')))
    url     = str(ti.get('url', ''))
    content = str(ti.get('content', ''))[:300]
except Exception:
    print("unknown||none|0|LOW")
    sys.exit(0)

all_text = (tool + ' ' + cmd + ' ' + path + ' ' + content + ' ' + url).lower()
cmd_l    = cmd.lower()
path_l   = path.lower()

score = 0; reasons = []

# +40 destructive verbs
if re.search(r'\b(rm|remove|delete|drop|truncate|destroy|purge|wipe|nuke)\b', cmd_l) or \
   re.search(r'(--force|-f\b|force-delete|force-push)', cmd_l):
    score += 40; reasons.append("destructive_verb:+40")

# +30 production target
if re.search(r'\b(prod|production|main|master|release|live)\b', all_text) or \
   re.search(r'(node_env=production|env=prod)', all_text):
    score += 30; reasons.append("production_target:+30")

# +20 database operations
if re.search(r'\b(alter|migrate|migration|schema|drop\s+table|create\s+table|truncate)\b', cmd_l) or \
   re.search(r'(migration|migrate|schema\.)', path_l):
    score += 20; reasons.append("database_operation:+20")

# +20 secret/credential
if re.search(r'(\.env|\.pem|\.key|secret|password|api[_.]key|private[_.]key|bearer|credential|token)', all_text):
    score += 20; reasons.append("secret_access:+20")

# +15 deploy operations
if re.search(r'\b(deploy|kubectl|helm|fly|heroku|gcloud|terraform\s+apply|ansible)\b', cmd_l) or \
   re.search(r'git\s+push.*--force', cmd_l):
    score += 15; reasons.append("deploy_operation:+15")

# +15 bulk/wildcard with destructive
if re.search(r'(\*\.\*|\*\*/\*|--all\b|--recursive\b|-r\s)', all_text) and \
   re.search(r'\b(rm|delete|drop|update|chmod)\b', cmd_l):
    score += 15; reasons.append("bulk_wildcard:+15")

# +10 external network
if url and not re.search(r'(localhost|127\.0\.0\.1|::1|\.local)', url):
    score += 10; reasons.append("external_network:+10")
elif re.search(r'\b(curl|wget|fetch)\b', cmd_l) and \
     not re.search(r'(localhost|127\.0\.0\.1)', cmd_l):
    score += 10; reasons.append("external_network:+10")

# -10 read-only commands
if re.match(r'^\s*(cat|ls|find|grep|head|tail|wc|echo|printf|diff|git\s+(log|status|diff))\b', cmd_l):
    score -= 10; reasons.append("read_only:-10")

# -10 dry-run flag
if re.search(r'(--dry-run|--no-op|--check|--what-if|dryrun)', cmd_l):
    score -= 10; reasons.append("dry_run_flag:-10")

# -5 test scope
if re.search(r'(test/|spec/|__tests__|\.test\.|\.spec\.|tests/)', path_l + ' ' + cmd_l):
    score -= 5; reasons.append("test_scope:-5")

score = max(0, min(100, score))

if   score < 30: band = "LOW"
elif score < 60: band = "MEDIUM"
elif score < 85: band = "HIGH"
else:            band = "CRITICAL"

reasons_str = ','.join(reasons) if reasons else 'none'
# Escape pipes in fields
tool_safe = tool.replace('|','_')
cmd_safe  = cmd[:80].replace('|','_')
path_safe = path[:100].replace('|','_')
print(f"{tool_safe}|{cmd_safe}|{path_safe}|{score}|{band}|{reasons_str}")
PYEOF
)

TOOL_NAME=$(echo "$RESULT" | cut -d'|' -f1)
CMD=$(echo "$RESULT"       | cut -d'|' -f2)
FILE_PATH=$(echo "$RESULT" | cut -d'|' -f3)
SCORE=$(echo "$RESULT"     | cut -d'|' -f4)
BAND=$(echo "$RESULT"      | cut -d'|' -f5)
REASONS=$(echo "$RESULT"   | cut -d'|' -f6)

# -- Log to JSONL
python3 -c "
import json
entry = {
  'ts':'$TIMESTAMP','tool':'$TOOL_NAME','score':$SCORE,
  'band':'$BAND','reasons':'$REASONS',
  'cmd':'${CMD:0:80}','file':'${FILE_PATH:0:100}'
}
open('$RISK_LOG','a').write(json.dumps(entry)+'\n')
" 2>/dev/null || true

# -- Inject into token-budget file
if [[ -f "$BUDGET_FILE" ]]; then
  python3 -c "
import json
try:
    d=json.load(open('$BUDGET_FILE'))
    d['last_risk_score']=$SCORE; d['last_risk_band']='$BAND'
    json.dump(d,open('$BUDGET_FILE','w'),indent=2)
except: pass
" 2>/dev/null || true
fi

# -- Respond by band
case "$BAND" in
  LOW) exit 0 ;;
  MEDIUM)
    echo "[risk-scorer] MEDIUM risk (score=${SCORE}/100) — ${TOOL_NAME}"
    echo "  Factors: ${REASONS}"
    echo "  Proceed carefully. Verify scope before continuing."
    exit 0 ;;
  HIGH)
    echo "[risk-scorer] HIGH risk (score=${SCORE}/100) — ${TOOL_NAME}"
    echo "  Factors: ${REASONS}"
    echo "  State which files will change and why. Consider --dry-run first."
    exit 0 ;;
  CRITICAL)
    python3 -c "
import json,sys
d={
  'decision':'block',
  'reason':'[risk-scorer] CRITICAL risk: ${SCORE}/100 for tool: $TOOL_NAME',
  'score':$SCORE,'band':'CRITICAL','factors':'$REASONS',
  'required_action':'State (1) what you will do (2) files affected (3) rollback plan. Sovereign sets YANA_RISK_BYPASS=1 to override.'
}
print(json.dumps(d))
sys.exit(2)
" ;;
esac
