#!/usr/bin/env bash
# Yana AI Script
# Version: 1.6.0 | Status: active
# Description: Evidence Freshness — recompute each L1 fact's evidence_hash against
#   its current evidence_file content, report FRESH/STALE/SKIPPED.
# Last Reviewed: 2026-08-11
# Usage: bash verify-fact-freshness.sh [--fact <id>] [--stale-only]
#
# Advisory tool, same pattern as memory-provenance.sh and
# resolve-memory-conflict.sh — a manually-run report, not a hook that blocks
# a stale fact from being read. See memory/L1_atomic/SCHEMA.md's "Evidence
# Freshness" section for what evidence_file/evidence_hash mean and why this
# exists: `source`/`evidence` are self-reported and never checked against
# anything on their own — this is the one mechanism that actually verifies
# a fact's cited file hasn't silently changed underneath it.

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
L1_DIR="$PROJECT_DIR/memory/L1_atomic"

FACT_FILTER=""
STALE_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fact)       shift; FACT_FILTER="$1" ;;
    --stale-only) STALE_ONLY=true ;;
    *) ;;
  esac
  shift
done

command -v python3 >/dev/null 2>&1 || { echo "[verify-fact-freshness] python3 required"; exit 1; }

python3 - "$PROJECT_DIR" "$L1_DIR" "$FACT_FILTER" "$STALE_ONLY" << 'PYEOF'
import sys, re, hashlib
from pathlib import Path

project_dir, l1_dir, fact_filter, stale_only = sys.argv[1:]
stale_only = stale_only == 'true'

project_path = Path(project_dir)
l1_path = Path(l1_dir)

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

if not l1_path.exists():
    print(f"L1 directory not found: {l1_dir}")
    sys.exit(1)

facts = []
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
print('  ║       Yana AI EVIDENCE FRESHNESS CHECK        ║')
print('  ╚══════════════════════════════════════════════╝')
print()

fresh = stale = skipped = 0
stale_rows = []

for fm in facts:
    fid = fm.get('_file', '?')
    ev_file = fm.get('evidence_file', '')
    ev_hash = fm.get('evidence_hash', '')

    if not ev_file or not ev_hash:
        skipped += 1
        continue

    target = project_path / ev_file
    if not target.exists():
        stale += 1
        stale_rows.append((fid, ev_file, 'FILE DELETED'))
        continue

    try:
        actual_hash = hashlib.sha256(target.read_bytes()).hexdigest()
    except Exception as e:
        stale += 1
        stale_rows.append((fid, ev_file, f'unreadable: {e}'))
        continue

    if actual_hash == ev_hash:
        fresh += 1
        if not stale_only:
            print(f'  ✅ FRESH    {fid:<35} {ev_file}')
    else:
        stale += 1
        stale_rows.append((fid, ev_file, f'{ev_hash[:12]}... -> {actual_hash[:12]}...'))

if stale_rows:
    print()
    print('  ⚠️  STALE facts (cited file has changed since this fact was written):')
    print()
    for fid, ev_file, detail in stale_rows:
        print(f'  🔴 STALE    {fid:<35} {ev_file}')
        print(f'              {detail}')

print()
print(f'  Fresh   : {fresh}')
print(f'  Stale   : {stale}')
print(f'  Skipped : {skipped}  (no evidence_file/evidence_hash set)')
print()
if stale:
    print('  Re-verify STALE facts\' statements against the current file content,')
    print('  then re-run add-fact.sh\'s fingerprinting (or edit evidence_hash by hand)')
    print('  once the fact is confirmed still accurate — or demote confidence /')
    print('  deprecate it if it no longer is.')
    print()
PYEOF
