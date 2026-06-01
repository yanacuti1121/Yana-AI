#!/usr/bin/env python3
"""Weekly summary generator for YAMTAM assistant."""

import subprocess
import json
import re
from datetime import datetime, timedelta
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent.parent
MEMORY_FILE = Path(__file__).parent.parent / "memory.md"
MANIFEST_FILE = REPO_ROOT / "MANIFEST.json"


def git(args):
    r = subprocess.run(["git"] + args, capture_output=True, text=True, cwd=REPO_ROOT)
    return r.stdout.strip()


def get_commits_last_7_days():
    log = git(["log", "--oneline", "--since=7 days ago", "--format=%s"])
    return [l for l in log.splitlines() if l]


def parse_commit_types(commits):
    counts = defaultdict(int)
    for c in commits:
        m = re.match(r'^(\w+)[\(:]', c)
        t = m.group(1) if m else "other"
        counts[t] += 1
    return dict(counts)


def get_skill_count_from_commits(commits):
    for c in commits:
        m = re.search(r'(\d{3,4})\s*skills', c)
        if m:
            return int(m.group(1))
    return None


def get_version():
    try:
        with open(MANIFEST_FILE) as f:
            d = json.load(f)
        return d.get("version", "?")
    except Exception:
        return "?"


def get_last_memory_entry():
    try:
        text = MEMORY_FILE.read_text()
        entries = re.findall(r'## \d{4}-\d{2}-\d{2}.*?(?=## \d{4}|\Z)', text, re.DOTALL)
        if entries:
            return entries[-1].strip()[:300]
    except Exception:
        pass
    return ""


def get_week_range():
    today = datetime.now()
    start = today - timedelta(days=6)
    return f"{start.strftime('%d/%m')} – {today.strftime('%d/%m/%Y')}"


def highlight_commits(commits):
    feat = [c for c in commits if c.startswith("feat")]
    fix  = [c for c in commits if c.startswith("fix")]
    return feat[:2] + fix[:1]


def run():
    commits = get_commits_last_7_days()
    types   = parse_commit_types(commits)
    version = get_version()
    week    = get_week_range()
    total   = len(commits)
    highlights = highlight_commits(commits)

    # Build type summary line
    type_lines = []
    for t in ["feat", "fix", "chore", "docs", "refactor", "perf"]:
        n = types.get(t, 0)
        if n:
            type_lines.append(f"  {t:<10} {n}")

    print("━" * 42)
    print(f"  WEEKLY SUMMARY  •  {week}")
    print(f"  YAMTAM v{version}")
    print("━" * 42)
    print()
    print(f"COMMITS: {total}")
    for l in type_lines:
        print(l)
    print()

    if highlights:
        print("HIGHLIGHTS")
        for h in highlights:
            short = h[:72]
            print(f"  • {short}")
        print()

    print(f"VERSION: v{version}")
    print()

    # Suggest next based on commit pattern
    if types.get("feat", 0) > types.get("test", 0) + types.get("fix", 0):
        print("GỢI Ý TUẦN TỚI")
        print("  • Nhiều feat — nên có thêm fix/test để ổn định")
    elif total == 0:
        print("GỢI Ý TUẦN TỚI")
        print("  • Tuần yên tĩnh — review roadmap, chốt milestone tiếp?")

    print()
    print("━" * 42)


if __name__ == "__main__":
    run()
