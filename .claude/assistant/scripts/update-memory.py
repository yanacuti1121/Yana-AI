#!/usr/bin/env python3
"""Auto-generate and append a session memory entry to memory.md + update context.md."""

import subprocess
import re
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT    = Path(__file__).parent.parent.parent.parent
MEMORY_FILE  = Path(__file__).parent.parent / "memory.md"
CONTEXT_FILE = Path(__file__).parent.parent / "context.md"
MANIFEST     = REPO_ROOT / "MANIFEST.json"


def git(args):
    r = subprocess.run(["git"] + args, capture_output=True, text=True, cwd=REPO_ROOT)
    return r.stdout.strip()


def get_session_commits():
    """Commits since the last memory.md write (or last 4 hours as fallback)."""
    try:
        last_mod = MEMORY_FILE.stat().st_mtime
        since = datetime.fromtimestamp(last_mod).strftime("%Y-%m-%dT%H:%M:%S")
    except Exception:
        since = "4 hours ago"
    log = git(["log", "--oneline", f"--since={since}", "--format=%s"])
    return [l for l in log.splitlines() if l]


def summarize(commits):
    feat  = [c for c in commits if c.startswith("feat")]
    fix   = [c for c in commits if c.startswith("fix")]
    chore = [c for c in commits if c.startswith("chore")]
    lines = []
    if feat:  lines.append(f"feat: {'; '.join(c[5:50] for c in feat[:3])}")
    if fix:   lines.append(f"fix: {'; '.join(c[4:50] for c in fix[:2])}")
    if chore: lines.append(f"chore: {'; '.join(c[6:50] for c in chore[:1])}")
    return lines


def get_version():
    try:
        import json
        with open(MANIFEST) as f:
            return json.load(f).get("version", "?")
    except Exception:
        return "?"


def get_git_state():
    status = git(["status", "--short"])
    branch = git(["branch", "--show-current"])
    last   = git(["log", "--oneline", "-1"])
    clean  = "clean" if not status else f"{len(status.splitlines())} modified"
    return f"branch={branch}, {clean}, last={last[:60]}"


def one_line_title(commits):
    if not commits:
        return "session — no commits"
    first = commits[0]
    # strip type prefix
    m = re.match(r'^\w+[\(:]\s*', first)
    short = first[m.end():] if m else first
    return short[:60]


def append_memory(date_str, title, done_lines, state, version):
    entry = f"""
## {date_str} — {title}

**Đã làm:**
{chr(10).join(f'- {l}' for l in done_lines) or '- (không có commit mới)'}

**Trạng thái cuối:** v{version} · {state}

---
"""
    with open(MEMORY_FILE, "a") as f:
        f.write(entry)
    print(f"[update-memory] appended entry: {date_str} — {title}")


def update_context(version, state):
    """Update 'Cập nhật lần cuối' line in context.md."""
    try:
        text = CONTEXT_FILE.read_text()
        today = datetime.now().strftime("%Y-%m-%d")
        text = re.sub(r'\*\*Cập nhật lần cuối:\*\*.*', f'**Cập nhật lần cuối:** {today}', text)
        CONTEXT_FILE.write_text(text)
        print(f"[update-memory] context.md updated: {today}")
    except Exception as e:
        print(f"[update-memory] WARN: could not update context.md: {e}")


def run():
    commits = get_session_commits()
    date_str = datetime.now().strftime("%Y-%m-%d")
    title    = one_line_title(commits)
    done     = summarize(commits)
    version  = get_version()
    state    = get_git_state()

    if not commits:
        print("[update-memory] no new commits since last memory update — skipping")
        sys.exit(0)

    append_memory(date_str, title, done, state, version)
    update_context(version, state)


if __name__ == "__main__":
    run()
