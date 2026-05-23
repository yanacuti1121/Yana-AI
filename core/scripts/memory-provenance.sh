#!/usr/bin/env bash
# YAMTAM ENGINE Script
# Version: 1.6.0 | Status: active
# Description: Memory Provenance — show source, age, confidence, and expiry for each L1 fact
# Last Reviewed: 2026-05-23
# Usage: bash memory-provenance.sh [--fact <id>] [--expired] [--low-confidence]

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
L1_DIR="$PROJECT_DIR/memory/L1_atomic"

FACT_FILTER=""
SHOW_EXPIRED=false
SHOW_LOW_CONF=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fact)           shift; FACT_FILTER="$1" ;;
    --expired)        SHOW_EXPIRED=true ;;
    --low-confidence) SHOW_LOW_CONF=true ;;
    *) ;;
  esac
  shift
done

command -v python3 >/dev/null 2>&1 || { echo "[memory-provenance] python3 required"; exit 1; }

python3 - "$L1_DIR" "$FACT_FILTER" "$SHOW_EXPIRED" "$SHOW_LOW_CONF" << 'PYEOF'
import sys, os, re, json
from pathlib import Path
from datetime import datetime, timezone

l1_dir, fact_filter, show_expired, show_low_conf = sys.argv[1:]
show_expired   = show_expired   == 'true'
show_low_conf  = show_low_conf  == 'true'

l1_path = Path(l1_dir)
today   = datetime.now(timezone.utc).date()

def parse_frontmatter(content):
    parts = content.split('---', 2)
    if len(parts) < 3:
        return {}
    fm = {}
    for line in parts[1].splitlines():
        m = re.match(r'^(\w[\w_-]*):\s*(.+)', line.strip())
        if m:
            fm[m.group(1)] = m.group(2).strip().strip('"\'')
    return fm

facts = []
if not l1_path.exists():
    print(f"L1 directory not found: {l1_dir}")
    sys.exit(1)

for f in sorted(l1_path.glob('*.md')):
    if f.name in ('INDEX.md', 'SCHEMA.md'):
        continue
    if fact_filter and fact_filter not in f.stem:
        continue
    try:
        content = f.read_text()
        fm = parse_frontmatter(content)
        fm['_file'] = f.stem
        facts.append(fm)
    except Exception:
        pass

print()
print('  ╔══════════════════════════════════════════════╗')
print('  ║         YAMTAM MEMORY PROVENANCE             ║')
print('  ╚══════════════════════════════════════════════╝')
print()

filtered = facts
if show_expired:
    def is_expired(fm):
        exp = fm.get('expires_at', '')
        if not exp:
            return False
        try:
            return datetime.strptime(exp[:10], '%Y-%m-%d').date() < today
        except Exception:
            return False
    filtered = [f for f in facts if is_expired(f)]

if show_low_conf:
    filtered = [f for f in filtered if f.get('confidence', 'high') in ('low', 'medium')]

if not filtered:
    print(f'  No facts match filters (total: {len(facts)})')
    print()
    sys.exit(0)

print(f'  Showing {len(filtered)} / {len(facts)} facts')
print()
print(f'  {"FACT ID":<35} {"CONF":<8} {"SOURCE":<25} {"EXPIRES":<12} STATUS')
print(f'  {"─"*35} {"─"*8} {"─"*25} {"─"*12} {"─"*10}')

for fm in filtered:
    fid    = fm.get('_file', '?')[:34]
    conf   = fm.get('confidence', '?')[:7]
    source = fm.get('source', '?')[:24]
    exp    = fm.get('expires_at', 'never')[:10]
    depr   = fm.get('deprecated', 'false')

    status = '✅ OK'
    if depr == 'true':
        status = '❌ DEPR'
    else:
        try:
            if exp != 'never' and datetime.strptime(exp[:10], '%Y-%m-%d').date() < today:
                status = '⏰ EXPIRED'
        except Exception:
            pass
        if conf in ('low',):
            status = '⚠️  LOW-CONF'

    conf_icon = {'high': '✅', 'medium': '🟡', 'low': '🔴'}.get(conf, '?')
    print(f'  {fid:<35} {conf_icon} {conf:<6} {source:<25} {exp:<12} {status}')

print()
expired_count  = sum(1 for f in facts if f.get('deprecated') != 'true' and f.get('expires_at', 'never') != 'never' and
                     (lambda e: e != 'never' and __import__('datetime').datetime.strptime(e[:10],'%Y-%m-%d').date() < today)(f.get('expires_at','never')))
depr_count     = sum(1 for f in facts if f.get('deprecated') == 'true')
low_conf_count = sum(1 for f in facts if f.get('confidence', 'high') == 'low')

print(f'  Total L1 facts   : {len(facts)}')
print(f'  Expired          : {expired_count}')
print(f'  Deprecated       : {depr_count}')
print(f'  Low confidence   : {low_conf_count}')
print()
PYEOF
