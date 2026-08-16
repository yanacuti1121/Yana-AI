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
export CLAUDE_PROJECT_DIR="$PROJECT_DIR"
export YANA_PYTHON_ROOT="$PROJECT_DIR"
[[ -d "$PROJECT_DIR/core/lib" ]] || export YANA_PYTHON_ROOT="$PROJECT_DIR/.claude"
STATE_DIR="$PROJECT_DIR/.claude/state"
RISK_LOG="$STATE_DIR/risk-scores.jsonl"
# core/memory/L2_session/, not $STATE_DIR — this must match the path
# token-budget-guard.sh / src/guard/token_budget.rs / core/mcp/
# yana-ai-mcp-server.js actually read and write, or this file's
# last_risk_score injection below silently no-ops forever (as it always
# has: $STATE_DIR/token-budget.json has never existed on disk).
BUDGET_FILE="${YANA_TOKEN_BUDGET:-$PROJECT_DIR/core/memory/L2_session/token-budget.json}"

mkdir -p "$STATE_DIR"

# Save stdin to tmpfile (heredoc consumes stdin otherwise)
TMP_INPUT=$(mktemp)
cat > "$TMP_INPUT"
trap 'rm -f "$TMP_INPUT"' EXIT

# Parse + score via python3 (reads from file, not stdin). TIMESTAMP and
# RISK_LOG are script-controlled (never attacker-influenced), so passing
# them as argv is fine — cmd/path/tool (attacker-influenced via
# tool_input) never leave this Python process as bash string
# interpolation targets; the JSONL write below happens entirely inside
# Python via json.dumps(), closing a real code-injection path a prior
# version of this script had (a later `python3 -c "...'$CMD'..."` call —
# found + fixed by independent code review, 2026-08-15: a crafted
# tool_input.command containing an unescaped `'` could close that string
# literal early and inject arbitrary Python, confirmed by execution).
RESULT=$(python3 - "$TMP_INPUT" "$RISK_LOG" "$TIMESTAMP" << 'PYEOF'
import json, sys, re

input_file, risk_log, ts = sys.argv[1], sys.argv[2], sys.argv[3]
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
    print("unknown|0|LOW|none")
    sys.exit(0)

all_text = (tool + ' ' + cmd + ' ' + path + ' ' + content + ' ' + url).lower()
cmd_l    = cmd.lower()
path_l   = path.lower()

score = 0; reasons = []

# +40 destructive verbs. Deliberately does NOT also match a bare
# --force/-f flag on its own (e.g. `kubectl apply --force`, a normal
# idiom for resolving immutable-field conflicts, is not destructive) --
# force-push is already scored separately under deploy_operation below.
if re.search(r'\b(rm|remove|delete|drop|truncate|destroy|purge|wipe|nuke)\b', cmd_l):
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
tool_safe = tool.replace('|','_')

# Secret redaction before persisting cmd/path to disk — matches
# audit-log.sh's own pattern (52-secrets-vault-law.md): a secret-shaped
# path suffix or a secret-keyword match in the (truncated) content
# replaces the whole field, it is not partially masked. score/band/
# reasons never carry raw command content (only fixed-vocabulary tags),
# so nothing else here needs redaction.
_SECRET_KW = re.compile(r'(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|BEARER)', re.IGNORECASE)
# Unanchored (no trailing $) to match audit-log.sh's own pattern exactly
# — a `$`-anchored version would miss e.g. "secrets/staging.pem.backup",
# which audit-log.sh's substring match still catches (found by independent
# review, 2026-08-15: this file's anchored version was narrower than the
# "same as audit-log.sh" claim in its original comment).
_SECRET_PATH = re.compile(r'\.(env|pem|key|secret|cred)', re.IGNORECASE)

def _redacted(text, is_path=False):
    if _SECRET_KW.search(text) or (is_path and _SECRET_PATH.search(text)):
        return '[REDACTED]'
    return text

log_cmd = _redacted(cmd[:80])
log_path = _redacted(path[:100], is_path=True)

# JSON-encoded via json.dumps — no bash string interpolation of
# attacker-influenced content anywhere in this write.
entry = {
    'ts': ts, 'tool': tool_safe, 'score': score, 'band': band,
    'reasons': reasons_str, 'cmd': log_cmd, 'file': log_path,
}
try:
    with open(risk_log, 'a') as f:
        f.write(json.dumps(entry) + '\n')
except Exception:
    pass

# Only fixed-vocabulary/numeric fields cross back into bash below.
print(f"{tool_safe}|{score}|{band}|{reasons_str}")
PYEOF
)

TOOL_NAME=$(echo "$RESULT" | cut -d'|' -f1)
SCORE=$(echo "$RESULT"     | cut -d'|' -f2)
BAND=$(echo "$RESULT"      | cut -d'|' -f3)
REASONS=$(echo "$RESULT"   | cut -d'|' -f4)

# -- Inject into token-budget file
# BUDGET_FILE (derived from the externally-settable YANA_TOKEN_BUDGET env
# var) is passed via os.environ, not string-interpolated into the Python
# source — see core/rules/shell-sanitize-law.md and
# env-integrity-policy.md. SCORE/BAND stay interpolated: SCORE is always
# bash-arithmetic-computed and BAND is always one of 4 hardcoded literals
# ("LOW"/"MEDIUM"/"HIGH"/"CRITICAL", see the scoring block above), neither
# is externally controllable.
#
# ADR-008: wrapped with FileLock spanning the ENTIRE read-mutate-write —
# not just the json.dump() — because token-budget-guard.sh (Node) writes
# this identical file on the same PreToolUse event with no coordination.
# Lock name is derived from BUDGET_FILE's path, matching
# src/guard/lock.rs's/token-budget-guard.sh's derivation exactly, so this
# Python process and that Node process contend for the same lock.
if [[ -f "$BUDGET_FILE" ]]; then
  YANA_RISK_BUDGET_FILE="$BUDGET_FILE" YANA_RISK_LOG_FILE="${YANA_LOG:-/tmp/yana-ai-audit.log}" python3 -c "
import json, os, sys
from datetime import datetime, timezone
sys.path.insert(0, os.environ.get('YANA_PYTHON_ROOT', os.environ['CLAUDE_PROJECT_DIR']))
from core.lib.py.file_lock import FileLock, LockTimeoutError

# core/hooks/CLAUDE.md: 'Hooks must fail loudly or warn loudly. A hook
# that does nothing without explanation is worse than no hook.' A bare
# 'except: pass' here would silently drop last_risk_score/last_risk_band
# updates on lock contention with no trace anywhere — logging to
# YANA_LOG (not stderr, which this call already redirects to /dev/null
# below) is what actually survives to be inspectable.
def _warn(msg):
    ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    try:
        with open(os.environ['YANA_RISK_LOG_FILE'], 'a') as f:
            f.write(f'[{ts}] risk-scorer: {msg}\n')
    except Exception:
        pass  # logging itself is best-effort — must never crash the hook

try:
    path = os.environ['YANA_RISK_BUDGET_FILE']
    with FileLock('key:state/token-budget.json', timeout=5.0,
                  project_root=os.environ['CLAUDE_PROJECT_DIR']):
        d = json.load(open(path))
        d['last_risk_score'] = $SCORE
        d['last_risk_band'] = '$BAND'
        # Atomic write — an unlocked reader (session-checkpoint.sh) must
        # never observe a torn write, even though other LOCKED writers
        # (token-budget-guard.sh) are already correctly serialized above.
        _tmp_path = f'{path}.tmp.{os.getpid()}'
        json.dump(d, open(_tmp_path, 'w'), indent=2)
        os.replace(_tmp_path, path)
except LockTimeoutError:
    # non-fatal: this hook's own risk-scoring/blocking decision (below)
    # does not depend on this write succeeding — but a timeout means
    # last_risk_score/last_risk_band silently went stale, worth knowing.
    _warn(f'lock timeout writing last_risk_score to {os.environ[\"YANA_RISK_BUDGET_FILE\"]}')
except Exception as e:
    _warn(f'failed to write last_risk_score: {e}')
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
    # TOOL_NAME/REASONS pass via os.environ, not bash string interpolation
    # into the Python source — tool_safe's own sanitization (line ~131)
    # only strips '|', not "'", so an interpolated $TOOL_NAME could in
    # principle still break out of a Python string literal if a tool name
    # ever contained one (e.g. a poisoned/malicious MCP tool registration
    # — see agent-tool-poisoning-guard.md). REASONS is already
    # fixed-vocabulary-only (every reasons.append() call above uses a
    # hardcoded "label:+N" string, never raw input), but routed the same
    # way here for consistency and to close the class entirely, not just
    # the cmd/path instance of it (found by independent review, 2026-08-15).
    YANA_RISK_TOOL_NAME="$TOOL_NAME" YANA_RISK_REASONS="$REASONS" python3 -c "
import json, os, sys
d={
  'decision':'block',
  'reason':f'[risk-scorer] CRITICAL risk: $SCORE/100 for tool: {os.environ[\"YANA_RISK_TOOL_NAME\"]}',
  'score':$SCORE,'band':'CRITICAL','factors':os.environ['YANA_RISK_REASONS'],
  'required_action':'State (1) what you will do (2) files affected (3) rollback plan. Sovereign sets YANA_RISK_BYPASS=1 to override.'
}
print(json.dumps(d))
sys.exit(2)
" ;;
esac
