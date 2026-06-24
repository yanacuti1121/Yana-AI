#!/usr/bin/env python3
"""gen_skills_page.py — Generate docs/skills.html from core/skills/*/SKILL.md"""

import json
import os
import re
import sys
from pathlib import Path

REPO_ROOT  = Path(__file__).parent.parent.parent
SKILLS_DIR = REPO_ROOT / "core" / "skills"
OUT_HTML   = REPO_ROOT / "docs" / "skills.html"
OUT_JSON   = REPO_ROOT / "docs" / "skills-data.json"

# ── Namespace metadata ────────────────────────────────────────────────────────
NS_META = {
    "openai":    {"label": "OpenAI Plugins",     "color": "#10a37f", "icon": "🔌"},
    "terminal":  {"label": "TerminalSkills",      "color": "#6366f1", "icon": "⚡"},
    "venice":    {"label": "Venice AI",           "color": "#f59e0b", "icon": "🎨"},
    "sports":    {"label": "Sports / Markets",    "color": "#22c55e", "icon": "🏆"},
    "yana-ai":    {"label": "Yana AI Core",         "color": "#3b82f6", "icon": "🛡️"},
}

def parse_frontmatter(content: str) -> dict:
    if not content.startswith("---"):
        return {}
    end = content.find("\n---", 3)
    if end == -1:
        return {}
    block = content[3:end]
    fm: dict = {}
    current_key = None
    for line in block.splitlines():
        # multiline value (indented)
        if current_key and line.startswith("  "):
            fm[current_key] = (fm.get(current_key, "") + " " + line.strip()).strip()
            continue
        m = re.match(r'^([\w-]+):\s*(.*)', line.strip())
        if m:
            current_key = m.group(1)
            val = m.group(2).strip().strip('"').strip("'").strip(">-").strip()
            fm[current_key] = val
    return fm


def ns_from_name(skill_name: str) -> str:
    if skill_name.startswith("openai--"):    return "openai"
    if skill_name.startswith("terminal--"):  return "terminal"
    if skill_name.startswith("venice--"):    return "venice"
    if skill_name.startswith("sports--"):    return "sports"
    return "yana-ai"


def short_name(skill_name: str, ns: str) -> str:
    if ns == "yana-ai":
        return skill_name
    prefix = ns + "--"
    stripped = skill_name[len(prefix):]
    # For openai: openai--github--gh-fix-ci → github / gh-fix-ci
    if ns == "openai":
        parts = stripped.split("--", 1)
        return f"{parts[0]} / {parts[1]}" if len(parts) == 2 else stripped
    return stripped


def collect_skills() -> list[dict]:
    skills = []
    for skill_dir in sorted(SKILLS_DIR.iterdir()):
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.exists():
            continue
        content = skill_md.read_text(errors="replace")
        fm = parse_frontmatter(content)
        name = fm.get("name", skill_dir.name)
        desc = fm.get("description", "")
        # Clean up description
        desc = re.sub(r'\s+', ' ', desc).strip()[:200]

        ns = ns_from_name(skill_dir.name)
        has_scripts = (skill_dir / "scripts").is_dir()

        skills.append({
            "id":      skill_dir.name,
            "name":    name,
            "short":   short_name(skill_dir.name, ns),
            "desc":    desc,
            "ns":      ns,
            "scripts": has_scripts,
            "origin":  fm.get("origin", ""),
            "license": fm.get("license", ""),
        })
    return skills


def build_json(skills: list[dict]) -> str:
    return json.dumps(skills, ensure_ascii=False, separators=(",", ":"))


def build_html(skills: list[dict]) -> str:
    data_json = "null"  # loaded async from skills-data.json
    total = len(skills)
    counts = {}
    for s in skills:
        counts[s["ns"]] = counts.get(s["ns"], 0) + 1

    tab_buttons = '<button class="tab active" data-ns="all">All <span class="tab-count">{}</span></button>'.format(total)
    for ns_id, meta in NS_META.items():
        n = counts.get(ns_id, 0)
        if n:
            tab_buttons += f'<button class="tab" data-ns="{ns_id}" style="--ns-color:{meta["color"]}">{meta["icon"]} {meta["label"]} <span class="tab-count">{n}</span></button>'

    ns_colors_css = "\n".join(
        f'[data-ns="{ns}"] {{ border-color: {m["color"]}; }}'
        for ns, m in NS_META.items()
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Yana AI Skill Library — {total} skills</title>
<meta name="description" content="Browse {total} AI agent skills for Claude Code, Codex, Cursor and more.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{{margin:0;padding:0;box-sizing:border-box}}
:root{{
  --bg:#0d1117;--bg2:#161b22;--bg3:#21262d;
  --border:#30363d;--text:#e6edf3;--muted:#8b949e;
  --blue:#58a6ff;--green:#3fb950;--orange:#d29922;--purple:#bc8cff;
  --radius:8px;--transition:.15s ease;
}}
body{{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}}
a{{color:var(--blue);text-decoration:none}}
a:hover{{text-decoration:underline}}

/* NAV */
.nav{{display:flex;align-items:center;justify-content:space-between;padding:1rem 2rem;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg);z-index:100}}
.nav-logo{{font-weight:800;font-size:1.1rem;display:flex;align-items:center;gap:.5rem}}
.nav-logo span{{color:var(--orange)}}
.nav-links{{display:flex;gap:1.5rem;font-size:.9rem;color:var(--muted)}}
.nav-links a{{color:var(--muted)}}
.nav-links a:hover{{color:var(--text)}}

/* HERO */
.hero{{padding:3rem 2rem 2rem;max-width:1200px;margin:0 auto;text-align:center}}
.hero h1{{font-size:2.5rem;font-weight:800;margin-bottom:.75rem}}
.hero h1 span{{color:var(--orange)}}
.hero p{{color:var(--muted);font-size:1.1rem;max-width:600px;margin:0 auto 2rem}}
.stat-chips{{display:flex;flex-wrap:wrap;gap:.75rem;justify-content:center;margin-bottom:2rem}}
.chip{{background:var(--bg2);border:1px solid var(--border);border-radius:20px;padding:.35rem .9rem;font-size:.85rem;font-weight:600}}
.chip span{{color:var(--orange);margin-right:.35rem}}

/* SEARCH */
.search-wrap{{max-width:600px;margin:0 auto 1.5rem;position:relative}}
.search-input{{width:100%;padding:.75rem 1rem .75rem 2.75rem;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:1rem;font-family:inherit;outline:none;transition:var(--transition)}}
.search-input:focus{{border-color:var(--blue);box-shadow:0 0 0 3px rgba(88,166,255,.15)}}
.search-icon{{position:absolute;left:.85rem;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}}
.search-count{{position:absolute;right:.85rem;top:50%;transform:translateY(-50%);color:var(--muted);font-size:.8rem;font-variant-numeric:tabular-nums}}

/* TABS */
.tabs{{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:center;padding:0 2rem 1.5rem;max-width:1200px;margin:0 auto}}
.tab{{background:var(--bg2);border:1px solid var(--border);border-radius:20px;padding:.4rem .9rem;font-size:.85rem;font-weight:500;cursor:pointer;color:var(--muted);transition:var(--transition);font-family:inherit}}
.tab:hover{{color:var(--text);border-color:var(--muted)}}
.tab.active{{color:var(--text);background:var(--bg3);border-color:var(--ns-color,var(--orange));color:var(--ns-color,var(--orange))}}
.tab-count{{opacity:.6;margin-left:.3rem}}

/* GRID */
.grid-wrap{{max-width:1200px;margin:0 auto;padding:0 2rem 4rem}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem}}

/* CARD */
.card{{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.2rem;cursor:default;transition:var(--transition);border-left:3px solid transparent}}
.card:hover{{border-color:var(--border);background:var(--bg3);transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.3)}}
{ns_colors_css}
.card-top{{display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;margin-bottom:.5rem}}
.card-name{{font-weight:600;font-size:.95rem;font-family:'JetBrains Mono',monospace;word-break:break-word;line-height:1.4}}
.card-badges{{display:flex;gap:.3rem;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}}
.badge{{font-size:.7rem;padding:.15rem .5rem;border-radius:4px;font-weight:600;white-space:nowrap}}
.badge-scripts{{background:rgba(88,166,255,.15);color:var(--blue)}}
.badge-license{{background:rgba(63,185,80,.1);color:var(--green)}}
.card-desc{{color:var(--muted);font-size:.82rem;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}}
.card-ns{{margin-top:.6rem;font-size:.75rem;color:var(--muted);display:flex;align-items:center;gap:.4rem}}
.ns-dot{{width:7px;height:7px;border-radius:50%;flex-shrink:0}}

/* EMPTY */
.empty{{text-align:center;padding:4rem;color:var(--muted)}}
.empty h3{{font-size:1.2rem;margin-bottom:.5rem}}

/* FOOTER */
footer{{text-align:center;padding:2rem;color:var(--muted);font-size:.85rem;border-top:1px solid var(--border)}}
footer a{{color:var(--muted)}}
footer a:hover{{color:var(--text)}}
</style>
</head>
<body>

<nav class="nav">
  <div class="nav-logo">🛡️ Yana AI <span>Skill Library</span></div>
  <div class="nav-links">
    <a href="https://github.com/yanacuti1121/yana-ai">GitHub</a>
    <a href="./">Home</a>
    <a href="yana-ai-system-map.html">System Map</a>
  </div>
</nav>

<div class="hero">
  <h1>Browse <span id="total-count">{total}</span> Agent Skills</h1>
  <p>Compatible with Claude Code, Codex, Cursor, Gemini CLI and more.</p>
  <div class="stat-chips">
    <div class="chip"><span>🛡️</span>{counts.get("yana-ai",0)} Yana AI Core</div>
    <div class="chip"><span>🔌</span>{counts.get("openai",0)} OpenAI Plugins</div>
    <div class="chip"><span>⚡</span>{counts.get("terminal",0)} TerminalSkills</div>
    <div class="chip"><span>🎨</span>{counts.get("venice",0)} Venice AI</div>
    <div class="chip"><span>🏆</span>{counts.get("sports",0)} Sports</div>
  </div>
</div>

<div class="search-wrap" style="max-width:600px;margin:0 auto 1.5rem;padding:0 2rem">
  <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zm-5.242 1.656a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z"/>
  </svg>
  <input class="search-input" id="search" type="search" placeholder="Search skills — name, description, tags..." autocomplete="off" spellcheck="false">
  <span class="search-count" id="search-count"></span>
</div>

<div class="tabs" id="tabs">
  {tab_buttons}
</div>

<div class="grid-wrap">
  <div class="grid" id="grid"></div>
  <div class="empty" id="empty" style="display:none">
    <h3>No skills found</h3>
    <p>Try a different search term or filter</p>
  </div>
</div>

<footer>
  <p>
    <a href="https://github.com/yanacuti1121/yana-ai">Yana AI</a>
    · v0.14.2 · Apache 2.0 · {total} skills from 5 open-source collections
  </p>
</footer>

<script>
let SKILLS = [];

const NS_COLORS = {{
  openai:   "#10a37f",
  terminal: "#6366f1",
  venice:   "#f59e0b",
  sports:   "#22c55e",
  yana-ai:   "#3b82f6",
}};
const NS_ICONS = {{
  openai:"🔌", terminal:"⚡", venice:"🎨", sports:"🏆", yana-ai:"🛡️"
}};

let currentNs  = "all";
let currentQ   = "";
let rendered   = false;

const grid       = document.getElementById("grid");
const emptyMsg   = document.getElementById("empty");
const searchEl   = document.getElementById("search");
const searchCount= document.getElementById("search-count");
const tabs       = document.getElementById("tabs");

function makeCard(s) {{
  const color = NS_COLORS[s.ns] || "#8b949e";
  const icon  = NS_ICONS[s.ns]  || "•";
  const lic   = s.license ? `<span class="badge badge-license">${{s.license}}</span>` : "";
  const scr   = s.scripts  ? `<span class="badge badge-scripts">scripts</span>` : "";
  return `<div class="card" data-ns="${{s.ns}}" style="border-left-color:${{color}}">
    <div class="card-top">
      <div class="card-name">${{esc(s.short)}}</div>
      <div class="card-badges">${{scr}}${{lic}}</div>
    </div>
    <div class="card-desc">${{esc(s.desc)}}</div>
    <div class="card-ns">
      <div class="ns-dot" style="background:${{color}}"></div>
      ${{icon}} ${{NS_LABELS[s.ns] || s.ns}}
    </div>
  </div>`;
}}

const NS_LABELS = {{
  openai:"OpenAI Plugins", terminal:"TerminalSkills",
  venice:"Venice AI", sports:"Sports", yana-ai:"Yana AI Core"
}};

function esc(s) {{
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}}

function filter() {{
  const q = currentQ.toLowerCase();
  let shown = 0;
  let html = "";
  for (const s of SKILLS) {{
    if (currentNs !== "all" && s.ns !== currentNs) continue;
    if (q && !s.name.toLowerCase().includes(q) && !s.short.toLowerCase().includes(q) && !s.desc.toLowerCase().includes(q)) continue;
    html += makeCard(s);
    shown++;
    if (shown >= 500) break; // cap at 500 for perf
  }}
  grid.innerHTML = html;
  emptyMsg.style.display = shown ? "none" : "block";
  const total_ns = currentNs === "all" ? SKILLS.length
    : SKILLS.filter(s => s.ns === currentNs).length;
  searchCount.textContent = q || currentNs !== "all"
    ? `${{shown}} / ${{total_ns}}`
    : "";
}}

searchEl.addEventListener("input", e => {{
  currentQ = e.target.value;
  filter();
}});

tabs.addEventListener("click", e => {{
  const btn = e.target.closest(".tab");
  if (!btn) return;
  tabs.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  currentNs = btn.dataset.ns;
  filter();
}});

// Load data async
fetch("skills-data.json")
  .then(r => r.json())
  .then(data => {{
    SKILLS = data;
    document.getElementById("total-count").textContent = SKILLS.length.toLocaleString();
    filter();
  }})
  .catch(() => {{
    emptyMsg.innerHTML = "<h3>Could not load skills data</h3><p>Open from a server, not file://</p>";
    emptyMsg.style.display = "block";
  }});
</script>
</body>
</html>"""


def main():
    print("  Collecting skills…", end="", flush=True)
    skills = collect_skills()
    print(f" {len(skills)} found")

    print("  Writing JSON…", end="", flush=True)
    OUT_JSON.write_text(build_json(skills), encoding="utf-8")
    print(f" {OUT_JSON.name}")

    print("  Building HTML…", end="", flush=True)
    OUT_HTML.write_text(build_html(skills), encoding="utf-8")
    size_kb = OUT_HTML.stat().st_size // 1024
    print(f" {OUT_HTML.name} ({size_kb}KB)")

    print(f"\n  ✓ docs/skills.html → yanacuti1121.github.io/Yana-AI/skills.html")


if __name__ == "__main__":
    main()
