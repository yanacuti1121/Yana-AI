#!/usr/bin/env bash
# YAMTAM ENGINE Script
# Version: 1.6.0 | Status: active
# Description: Memory Conflict Resolution — detect contradicting L1 facts and resolve by confidence/recency
# Last Reviewed: 2026-05-23
# Usage: bash resolve-memory-conflict.sh [--dry-run] [--fact <id>]

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
L1_DIR="$PROJECT_DIR/memory/L1_atomic"
ARCHIVE_DIR="$L1_DIR/archived"
AUDIT_LOG="${YAMTAM_LOG:-/tmp/yamtam-audit.log}"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

DRY_RUN=false
FACT_FILTER=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --fact)    shift; FACT_FILTER="$1" ;;
    *) ;;
  esac
  shift
done

command -v python3 >/dev/null 2>&1 || { echo "[resolve-memory-conflict] python3 required"; exit 1; }

python3 - "$L1_DIR" "$ARCHIVE_DIR" "$AUDIT_LOG" "$NOW" "$DRY_RUN" "$FACT_FILTER" << 'PYEOF'
import sys, re, os, json
from pathlib import Path
from datetime import datetime

l1_dir, archive_dir, audit_log, now, dry_run, fact_filter = sys.argv[1:]
dry_run = dry_run == 'true'

l1_path = Path(l1_dir)
arch_path = Path(archive_dir)

CONF_RANK = {'high': 3, 'medium': 2, 'low': 1}

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

facts = {}
for f in l1_path.glob('*.md'):
    if f.name in ('INDEX.md', 'SCHEMA.md'):
        continue
    if fact_filter and fact_filter not in f.stem:
        continue
    try:
        content = f.read_text()
        fm = parse_frontmatter(content)
        fm['_file'] = f
        fm['_stem'] = f.stem
        fm['_content'] = content
        facts[f.stem] = fm
    except Exception:
        pass

print()
print('  ╔══════════════════════════════════════════════╗')
print('  ║      YAMTAM MEMORY CONFLICT RESOLUTION       ║')
print('  ╚══════════════════════════════════════════════╝')
print()

# Group by scope+statement similarity (same tag set = potential conflict)
def tags(fm):
    raw = fm.get('tags', '[]')
    return set(re.findall(r'[\w-]+', raw))

# Detect pairs with overlapping tags and contradictory scope
conflicts = []
fact_list = list(facts.values())
for i in range(len(fact_list)):
    for j in range(i+1, len(fact_list)):
        a, b = fact_list[i], fact_list[j]
        shared = tags(a) & tags(b)
        if len(shared) >= 2:
            stmt_a = a.get('statement', '').lower()
        stmt_b = b.get('statement', '').lower()
        # Look for direct negation indicators
        negation_pairs = [
            ('always', 'never'), ('must', 'must not'), ('required', 'forbidden'),
            ('enable', 'disable'), ('allow', 'block'), ('safe', 'unsafe')
        ]
        contradicts = False
        for pos, neg in negation_pairs:
            if (pos in stmt_a and neg in stmt_b) or (neg in stmt_a and pos in stmt_b):
                contradicts = True
                break
        if contradicts:
            conflicts.append((a, b, shared))

if not conflicts:
    print(f'  ✅ No conflicts detected among {len(fact_list)} facts')
    print()
    sys.exit(0)

print(f'  Found {len(conflicts)} conflict pair(s):\n')
resolved = 0

for a, b, shared in conflicts:
    print(f'  CONFLICT:')
    print(f'    Fact A: {a["_stem"]}')
    print(f'      Statement : {a.get("statement","?")[:60]}')
    print(f'      Confidence: {a.get("confidence","?")}  Source: {a.get("source","?")}')
    print(f'    Fact B: {b["_stem"]}')
    print(f'      Statement : {b.get("statement","?")[:60]}')
    print(f'      Confidence: {b.get("confidence","?")}  Source: {b.get("source","?")}')
    print(f'    Shared tags : {", ".join(sorted(shared))}')

    # Resolve: keep higher confidence; if equal, keep more recent
    rank_a = CONF_RANK.get(a.get('confidence', 'medium'), 2)
    rank_b = CONF_RANK.get(b.get('confidence', 'medium'), 2)

    if rank_a > rank_b:
        winner, loser = a, b
        reason = f'higher confidence ({a.get("confidence")} > {b.get("confidence")})'
    elif rank_b > rank_a:
        winner, loser = b, a
        reason = f'higher confidence ({b.get("confidence")} > {a.get("confidence")})'
    else:
        # Same confidence — keep more recent by source timestamp
        src_a = a.get('source', '')
        src_b = b.get('source', '')
        winner, loser = (a, b) if src_a >= src_b else (b, a)
        reason = 'same confidence, kept more recent source'

    print(f'    Resolution  : keep {winner["_stem"]} ({reason})')
    print(f'    Deprecate   : {loser["_stem"]}')

    if dry_run:
        print(f'    [DRY RUN] No changes applied')
    else:
        arch_path.mkdir(parents=True, exist_ok=True)
        dest = arch_path / loser['_file'].name
        loser['_file'].rename(dest)
        entry = {
            'ts': now, 'action': 'conflict-resolved',
            'winner': winner['_stem'], 'loser': loser['_stem'],
            'reason': reason
        }
        with open(audit_log, 'a') as f:
            f.write(json.dumps(entry) + '\n')
        print(f'    ✓ Deprecated {loser["_stem"]} → archived/')
        resolved += 1
    print()

if dry_run:
    print(f'  [DRY RUN] {len(conflicts)} conflict(s) found. Remove --dry-run to resolve.')
else:
    print(f'  {resolved} conflict(s) resolved')
print()
PYEOF
