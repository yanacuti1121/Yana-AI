#!/usr/bin/env bash
# #9 — Cross-session learning: scan L2 session facts for repeating error patterns,
# auto-promote patterns seen ≥3 times to L1 atomic facts.
#
# Usage: bash promote-session-patterns.sh [--dry-run] [--min-count N]

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
L1_DIR="$PROJECT_ROOT/memory/L1_atomic"
L2_DIR="$PROJECT_ROOT/core/memory/L2_session"
SESSION_FACTS_DIR="$PROJECT_ROOT/memory/L2_session"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TODAY=$(date -u +%Y-%m-%d)

DRY_RUN=false
MIN_COUNT=3

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)    DRY_RUN=true ;;
    --min-count)  shift; MIN_COUNT="$1" ;;
  esac
  shift
done

# Check L2 audit log for repeated error patterns
AUDIT_LOG="${YAMTAM_LOG:-/tmp/yamtam-audit.log}"
RISK_LOG="$L2_DIR/risk-log.jsonl"

command -v python3 >/dev/null 2>&1 || { echo "python3 required" >&2; exit 1; }

python3 - "$AUDIT_LOG" "$RISK_LOG" "$L1_DIR" "$NOW" "$TODAY" "$MIN_COUNT" "$DRY_RUN" <<'PYEOF'
import json, sys, re, os
from pathlib import Path
from collections import Counter

audit_log, risk_log, l1_dir, now, today, min_count, dry_run = sys.argv[1:]
min_count = int(min_count)
dry_run = dry_run == 'true'

patterns = Counter()
sources = {}

# Scan audit log for blocked/warned patterns
if os.path.exists(audit_log):
    with open(audit_log) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            # Parse structured log lines
            for keyword in ['BLOCKED', 'HARD-BLOCKED', 'CIRCUIT-TRIGGERED', 'RISK-HIGH', 'ARBITRATION-CONFLICT']:
                if keyword in line:
                    # Extract tool or pattern
                    m = re.search(r"tool='([^']+)'", line)
                    pattern_key = f"{keyword}:{m.group(1) if m else 'unknown'}"
                    patterns[pattern_key] += 1
                    sources.setdefault(pattern_key, []).append(line[:120])

# Scan risk log for high-risk tools
if os.path.exists(risk_log):
    with open(risk_log) as f:
        for line in f:
            try:
                entry = json.loads(line.strip())
                if entry.get('level') == 'high':
                    key = f"HIGH-RISK:{entry['tool']}"
                    patterns[key] += 1
                    sources.setdefault(key, []).append(f"score={entry['score']} {entry.get('reasons','')}")
            except Exception:
                pass

# Find patterns that exceed threshold
to_promote = [(key, count) for key, count in patterns.items() if count >= min_count]

if not to_promote:
    print(f"No patterns found meeting threshold (min={min_count} occurrences).")
    sys.exit(0)

print(f"Found {len(to_promote)} promotable pattern(s) (≥{min_count} occurrences):\n")

promoted = 0
for key, count in sorted(to_promote, key=lambda x: -x[1]):
    keyword, tool = key.split(':', 1)
    fact_id = f"learned-{keyword.lower()}-{tool.lower().replace('/', '-')[:20]}"
    fact_id = re.sub(r'[^a-z0-9-]', '-', fact_id)[:50].strip('-')
    fact_file = Path(l1_dir) / f"{fact_id}.md"

    statement = f"{tool} triggers {keyword} repeatedly ({count}x) — review and adjust approach or add explicit bypass."
    evidence_sample = sources.get(key, ['(no sample'])[0]

    print(f"  [{count}x] {key}")
    print(f"    → {fact_id}")
    if dry_run:
        print(f"    [dry-run] would create: {fact_file}")
        continue

    if fact_file.exists():
        print(f"    [skip] fact already exists")
        continue

    content = f"""---
id: {fact_id}
type: observation
statement: {statement}
source: auto-promoted:{now}
confidence: medium
scope: YAMTAM
tags: [learned, pattern, {keyword.lower()}, {tool.lower()[:15]}]
expires_at: {today[:7]}-01  # re-verify next month
evidence: "{evidence_sample[:100]}"
---

Auto-promoted from session pattern analysis.
Observed {count} times. Pattern: {key}
"""
    fact_file.write_text(content)
    print(f"    ✓ promoted to L1")
    promoted += 1

if not dry_run:
    print(f"\n{promoted} pattern(s) promoted to L1 memory.")
else:
    print(f"\n[dry-run] {len(to_promote)} pattern(s) would be promoted. Remove --dry-run to execute.")
PYEOF
