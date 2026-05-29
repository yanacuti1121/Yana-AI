#!/usr/bin/env python3
"""import_book_rules.py — Import ciembor/agent-rules-books as YAMTAM skills.

Each book → 3 skills: full, mini, nano
Usage: python3 core/scripts/import_book_rules.py /tmp/book-rules
"""
import json, os, re, sys
from pathlib import Path

REPO_ROOT  = Path(__file__).parent.parent.parent
SKILLS_DIR = REPO_ROOT / "core" / "skills"

BOOKS = {
    "clean-code":                         ("Clean Code",                  "Robert C. Martin"),
    "clean-architecture":                 ("Clean Architecture",          "Robert C. Martin"),
    "a-philosophy-of-software-design":    ("Philosophy of Software Design","John Ousterhout"),
    "code-complete":                      ("Code Complete",               "Steve McConnell"),
    "designing-data-intensive-applications": ("DDIA",                    "Martin Kleppmann"),
    "domain-driven-design":               ("Domain-Driven Design",        "Eric Evans"),
    "domain-driven-design-distilled":     ("DDD Distilled",               "Vaughn Vernon"),
    "implementing-domain-driven-design":  ("Implementing DDD",            "Vaughn Vernon"),
    "patterns-of-enterprise-application-architecture": ("PoEAA",         "Martin Fowler"),
    "refactoring":                        ("Refactoring",                 "Martin Fowler"),
    "refactoring-guru":                   ("Refactoring Guru",            "Refactoring.Guru"),
    "release-it":                         ("Release It!",                 "Michael Nygard"),
    "the-pragmatic-programmer":           ("The Pragmatic Programmer",    "Hunt & Thomas"),
    "working-effectively-with-legacy-code":("Working with Legacy Code",   "Michael Feathers"),
}

VARIANTS = [
    ("full",  "{book_dir}/{slug}.md",      "Full rules — comprehensive mandatory coding standards"),
    ("mini",  "{book_dir}/{slug}.mini.md", "Condensed rules — key principles distilled"),
    ("nano",  "{book_dir}/{slug}.nano.md", "Minimal rules — essential one-liners only"),
]

GREEN = "\033[32m"; CYAN = "\033[36m"; DIM = "\033[2m"; BOLD = "\033[1m"; RESET = "\033[0m"

def c(code, t): return t if not sys.stdout.isatty() else f"{code}{t}{RESET}"

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 import_book_rules.py <path-to-book-rules>"); sys.exit(1)
    source = Path(sys.argv[1])
    print(f"\n  {c(BOLD,'import book rules')} → yamtam core/skills/book--*\n")

    imported = 0
    for slug, (title, author) in BOOKS.items():
        book_dir = source / slug
        if not book_dir.is_dir():
            continue

        for variant, tmpl, var_desc in VARIANTS:
            file_path = source / tmpl.format(book_dir=slug, slug=slug)
            if not file_path.exists():
                continue

            content = file_path.read_text(errors="replace")
            skill_name = f"book--{slug}--{variant}"
            desc = f'{title} ({author}) — {var_desc}. Use when asked to apply {title} principles or review code against {title} standards.'

            fm = f"""---
name: {skill_name}
description: >-
  {desc}
origin: "github.com/ciembor/agent-rules-books (MIT)"
license: MIT
version: "1.0.0"
compatibility: "yamtam-engine >= 0.14.0"
---

"""
            dest = SKILLS_DIR / skill_name
            dest.mkdir(parents=True, exist_ok=True)
            (dest / "SKILL.md").write_text(fm + content)
            imported += 1

        print(f"  {c(GREEN,'✓')} {title:<45} {c(DIM,'3 variants')}")

    # Update counts
    total = sum(1 for _ in SKILLS_DIR.glob("*/SKILL.md"))
    for path in ["MANIFEST.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]:
        p = REPO_ROOT / path
        if not p.exists(): continue
        d = json.loads(p.read_text())
        for sec in [d, d.get("stats",{}), d.get("contents",{}), d.get("components",{}).get("skills",{})]:
            if isinstance(sec, dict) and "skills" in sec and isinstance(sec["skills"], int):
                sec["skills"] = total
        if "components" in d and "skills" in d["components"] and isinstance(d["components"]["skills"], dict):
            d["components"]["skills"]["count"] = total
        p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n")

    print(f"\n  {c(CYAN, f'✓ {imported} book skill variants imported')}")
    print(f"  Total skills now: {c(BOLD, str(total))}\n")

if __name__ == "__main__":
    main()
