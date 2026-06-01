#!/usr/bin/env python3
"""Morning health check — disk, CI, git, context freshness, milestones."""

import subprocess
import shutil
import sys
from datetime import datetime, date
from pathlib import Path

REPO_ROOT    = Path(__file__).parent.parent.parent.parent
CONTEXT_FILE = Path(__file__).parent.parent / "context.md"
MEMORY_FILE  = Path(__file__).parent.parent / "memory.md"


def git(args):
    r = subprocess.run(["git"] + args, capture_output=True, text=True, cwd=REPO_ROOT)
    return r.stdout.strip()


def check_disk():
    usage = shutil.disk_usage(Path.home())
    pct   = usage.used / usage.total * 100
    free  = usage.free / (1024**3)
    icon  = "⛔" if pct > 95 else ("⚠️" if pct > 85 else "✅")
    return icon, f"Disk {pct:.0f}% used ({free:.1f}GB free)"


def check_git():
    status = git(["status", "--short"])
    count  = len(status.splitlines()) if status else 0
    branch = git(["branch", "--show-current"])
    ahead  = git(["rev-list", "--count", "HEAD@{u}..HEAD"]) if git(["rev-parse", "--abbrev-ref", "@{u}"]) else "?"
    icon   = "⚠️" if count > 5 else "✅"
    return icon, f"Git: {count} modified · branch={branch} · {ahead} ahead"


def check_context_freshness():
    try:
        mtime = CONTEXT_FILE.stat().st_mtime
        age   = (datetime.now().timestamp() - mtime) / 3600
        icon  = "⚠️" if age > 48 else "✅"
        return icon, f"context.md: last updated {age:.0f}h ago"
    except Exception:
        return "⚠️", "context.md: not found"


def check_milestones():
    script = Path(__file__).parent / "check-milestones.py"
    r = subprocess.run(["python3", str(script)], capture_output=True, text=True)
    output = r.stdout.strip()
    if output:
        return "🔔", output.replace("MILESTONE_ALERT:\n", "Milestones:\n")
    return None, None


def check_ci():
    r = subprocess.run(
        ["gh", "run", "list", "--limit", "3", "--json", "status,conclusion,name"],
        capture_output=True, text=True, cwd=REPO_ROOT
    )
    if r.returncode != 0:
        return "❓", "CI: gh not available"
    import json
    try:
        runs = json.loads(r.stdout)
        failed = [x for x in runs if x.get("conclusion") == "failure"]
        if failed:
            names = ", ".join(x["name"] for x in failed[:2])
            return "⛔", f"CI: FAIL — {names}"
        return "✅", f"CI: {len(runs)} recent runs OK"
    except Exception:
        return "❓", "CI: parse error"


def run():
    checks = [
        check_disk(),
        check_git(),
        check_context_freshness(),
        check_ci(),
    ]

    ms_icon, ms_msg = check_milestones()

    print("━" * 48)
    print(f"  HEALTH CHECK  •  {datetime.now().strftime('%H:%M — %d/%m/%Y')}")
    print("━" * 48)
    for icon, msg in checks:
        print(f"  {icon}  {msg}")
    if ms_icon:
        print(f"\n  {ms_icon}  {ms_msg}")
    print("━" * 48)

    # Exit 1 nếu có vấn đề để CI/hooks detect được
    has_issue = any(icon in ("⛔", "⚠️") for icon, _ in checks)
    if has_issue:
        sys.exit(1)


if __name__ == "__main__":
    run()
