#!/usr/bin/env python3
"""Generate docs/changelog.html from git log."""

import subprocess, re, json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

REPO_ROOT  = Path(__file__).parent.parent.parent.parent
OUTPUT     = REPO_ROOT / "docs" / "changelog.html"
DAYS_BACK  = 90

TYPE_ICON  = {
    "feat":     ("✨", "feature"),
    "fix":      ("🐛", "fix"),
    "chore":    ("🔧", "chore"),
    "docs":     ("📝", "docs"),
    "refactor": ("♻️",  "refactor"),
    "perf":     ("⚡", "perf"),
    "test":     ("🧪", "test"),
    "ci":       ("🤖", "ci"),
    "security": ("🔒", "security"),
}

def git(args):
    return subprocess.run(["git"] + args, capture_output=True, text=True, cwd=REPO_ROOT).stdout.strip()

def get_commits():
    raw = git(["log", "--format=%H|%ai|%s", f"--since={DAYS_BACK} days ago"])
    commits = []
    for line in raw.splitlines():
        parts = line.split("|", 2)
        if len(parts) < 3: continue
        sha, date, msg = parts
        commits.append({"sha": sha[:7], "date": date[:10], "msg": msg.strip()})
    return commits

def group_by_version(commits):
    groups = defaultdict(list)
    current = "unreleased"
    for c in commits:
        m = re.search(r'bump.*?(\d+\.\d+\.\d+)|(?:^|\s)v?(\d+\.\d+\.\d+)', c["msg"], re.I)
        if m:
            current = m.group(1) or m.group(2)
        # skip pure chore/sync unless notable
        groups[current].append(c)
    return dict(groups)

def parse_type(msg):
    m = re.match(r'^(\w+)[\(:]', msg)
    t = m.group(1).lower() if m else "other"
    return TYPE_ICON.get(t, ("•", t))

def render_commit(c):
    icon, label = parse_type(c["msg"])
    # strip type prefix for display
    msg = re.sub(r'^\w+[\(:][^)]*\)?\s*:?\s*', '', c["msg"])
    return f'<li class="commit {label}"><span class="icon">{icon}</span><code class="sha">{c["sha"]}</code><span class="msg">{msg[:90]}</span><span class="date">{c["date"]}</span></li>'

def render():
    commits = get_commits()
    groups  = group_by_version(commits)
    today   = datetime.now().strftime("%d/%m/%Y")
    version = git(["describe", "--tags", "--abbrev=0"]) or "v0.17.0"

    sections = ""
    for v, cms in groups.items():
        notable = [c for c in cms if not re.match(r'^(chore|docs)\b', c["msg"])][:20]
        if not notable: continue
        date_range = f'{cms[-1]["date"]} – {cms[0]["date"]}' if len(cms) > 1 else cms[0]["date"]
        items = "\n".join(render_commit(c) for c in notable)
        tag = "current" if v == "unreleased" else ""
        sections += f"""
        <section class="version-block {tag}">
          <h2><span class="v-badge">{"🔵 HEAD" if v == "unreleased" else f"v{v}"}</span>
              <span class="v-date">{date_range}</span>
              <span class="v-count">{len(notable)} changes</span></h2>
          <ul>{items}</ul>
        </section>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Changelog — YAMTAM ENGINE</title>
  <style>
    :root {{
      --bg: #0f0e0d; --bg2: #1a1917; --border: #2e2c28;
      --text: #e8e2d9; --muted: #8a8070; --orange: #e8923a;
      --green: #4ade80; --blue: #60a5fa; --red: #f87171;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0 }}
    body {{ background: var(--bg); color: var(--text); font-family: ui-sans-serif,system-ui,sans-serif; }}
    .nav {{ display:flex; align-items:center; justify-content:space-between; padding:0 2rem; height:56px; border-bottom:1px solid var(--border); }}
    .nav-logo {{ font-weight:800; font-size:1.1rem }} .nav-logo span {{ color:var(--orange) }}
    .nav-links {{ display:flex; gap:1.5rem; font-size:.9rem; color:var(--muted) }}
    .nav-links a {{ color:var(--muted); text-decoration:none }} .nav-links a:hover {{ color:var(--text) }}
    main {{ max-width:800px; margin:0 auto; padding:3rem 2rem }}
    h1 {{ font-size:2rem; font-weight:700; margin-bottom:.5rem }}
    .subtitle {{ color:var(--muted); margin-bottom:3rem; font-size:.95rem }}
    .version-block {{ margin-bottom:2.5rem; border:1px solid var(--border); border-radius:12px; overflow:hidden }}
    .version-block.current {{ border-color: var(--orange) }}
    h2 {{ display:flex; align-items:center; gap:1rem; padding:1rem 1.5rem; background:var(--bg2); font-size:1rem; font-weight:600 }}
    .v-badge {{ background:var(--orange); color:#000; padding:.2rem .6rem; border-radius:6px; font-size:.8rem }}
    .current .v-badge {{ background:var(--blue) }}
    .v-date {{ color:var(--muted); font-size:.85rem; font-weight:400 }}
    .v-count {{ color:var(--muted); font-size:.8rem; font-weight:400; margin-left:auto }}
    ul {{ list-style:none; padding:.5rem 0 }}
    .commit {{ display:flex; align-items:baseline; gap:.75rem; padding:.5rem 1.5rem; font-size:.875rem; border-top:1px solid var(--border) }}
    .commit:first-child {{ border-top:none }}
    .icon {{ flex-shrink:0; width:1.2rem; text-align:center }}
    .sha {{ font-family:ui-monospace,monospace; font-size:.75rem; color:var(--muted); flex-shrink:0 }}
    .msg {{ flex:1; color:var(--text) }}
    .date {{ color:var(--muted); font-size:.75rem; flex-shrink:0 }}
    footer {{ text-align:center; color:var(--muted); font-size:.85rem; padding:3rem 0 2rem }}
  </style>
</head>
<body>
  <nav class="nav">
    <div class="nav-logo">YAMTAM <span>ENGINE</span></div>
    <div class="nav-links">
      <a href="index.html">Home</a>
      <a href="skills.html">Skills</a>
      <a href="marketplace.html">Marketplace</a>
      <a href="changelog.html">Changelog</a>
      <a href="https://github.com/phamlongh230-lgtm/yamtam-engine" target="_blank">GitHub</a>
    </div>
  </nav>
  <main>
    <h1>Changelog</h1>
    <p class="subtitle">Last {DAYS_BACK} days · generated {today} · {version}</p>
    {sections}
  </main>
  <footer>YAMTAM ENGINE · <a href="https://github.com/phamlongh230-lgtm/yamtam-engine" style="color:var(--muted)">GitHub</a></footer>
</body>
</html>"""

    OUTPUT.write_text(html)
    print(f"[generate-changelog] written to {OUTPUT}")
    print(f"[generate-changelog] {len(groups)} version groups, {len(commits)} commits")

if __name__ == "__main__":
    render()
