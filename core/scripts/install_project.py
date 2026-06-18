#!/usr/bin/env python3
"""yana-ai install [target] — one-command project setup."""

import argparse
import json
import os
import shutil
import subprocess
import sys

REPO_ROOT     = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEMPLATES_DIR = os.path.join(REPO_ROOT, "policy", "templates")
SCANNER_PY    = os.path.join(REPO_ROOT, "core/scripts/audit_scanner.py")
GUARD_PY      = os.path.join(REPO_ROOT, "core/scripts/guard_installer.py")

BOLD  = "\033[1m"; GREEN = "\033[32m"; YELLOW = "\033[33m"
RED   = "\033[31m"; CYAN  = "\033[36m"; DIM   = "\033[2m"; RESET = "\033[0m"

def no_color():
    return os.environ.get("YANA_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"

def step(n, total, label):
    print(f"  {c(CYAN, f'[{n}/{total}]')} {label}")


YANA_AI_IGNORE_DEFAULT = """\
# .yana-aiignore — suppress known-safe findings
# Format: RULE_ID:path/to/file   or   path/glob/**
#
# Examples:
#   CI003:.github/workflows/deploy.yml   # accepted risk
#   SH008:scripts/legacy.sh              # false positive
"""

GITIGNORE_ADDITIONS = """\

# Yana AI
.yana-ai/
yana-ai-audit.sarif
yana-ai-audit-report.md
"""


def write_if_missing(path: str, content: str, label: str, dry_run: bool) -> bool:
    if os.path.exists(path):
        print(f"     {c(DIM, 'skip')} {label} (already exists)")
        return False
    if dry_run:
        print(f"     {c(YELLOW, 'would write')} {label}")
        return True
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    print(f"     {c(GREEN, '✓')} {label}")
    return True


def append_if_missing(path: str, content: str, marker: str, label: str, dry_run: bool):
    existing = ""
    if os.path.exists(path):
        with open(path) as f:
            existing = f.read()
    if marker in existing:
        print(f"     {c(DIM, 'skip')} {label} (already present)")
        return
    if dry_run:
        print(f"     {c(YELLOW, 'would append')} {label}")
        return
    with open(path, "a") as f:
        f.write(content)
    print(f"     {c(GREEN, '✓')} {label}")


def copy_template(src_name: str, dest: str, label: str, dry_run: bool):
    src = os.path.join(TEMPLATES_DIR, src_name)
    if os.path.exists(dest):
        print(f"     {c(DIM, 'skip')} {label} (already exists)")
        return
    if not os.path.exists(src):
        print(f"     {c(RED, 'missing')} template {src_name}")
        return
    if dry_run:
        print(f"     {c(YELLOW, 'would write')} {label}")
        return
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    shutil.copy2(src, dest)
    print(f"     {c(GREEN, '✓')} {label}")


def run_audit(target: str) -> dict | None:
    cmd = [sys.executable, SCANNER_PY, target, "--json", "--quiet"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser(
        prog="yana-ai install",
        description="One-command yana-ai setup for a project",
    )
    parser.add_argument("target", nargs="?", default=".",
                        help="Project directory (default: .)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be created without writing")
    parser.add_argument("--no-audit", action="store_true",
                        help="Skip initial audit scan")
    parser.add_argument("--guards", action="store_true",
                        help="Also install runtime guards (yana-ai guard install all)")
    args = parser.parse_args()

    target = os.path.abspath(args.target)
    total  = 5 + (1 if args.guards else 0)

    print()
    print(c(BOLD, "  yana-ai install") + c(DIM, f" — {target}"))
    if args.dry_run:
        print(c(YELLOW, "  [dry-run mode — no files will be written]"))
    print()

    # 1. .yana-aiignore
    step(1, total, ".yana-aiignore")
    write_if_missing(
        os.path.join(target, ".yana-aiignore"),
        YANA_AI_IGNORE_DEFAULT, ".yana-aiignore", args.dry_run
    )

    # 2. .gitignore additions
    step(2, total, ".gitignore — add Yana AI entries")
    append_if_missing(
        os.path.join(target, ".gitignore"),
        GITIGNORE_ADDITIONS, "# Yana AI", ".gitignore additions", args.dry_run
    )

    # 3. Claude settings template
    step(3, total, ".claude/settings.recommended.json")
    copy_template(
        "claude-settings.json",
        os.path.join(target, ".claude", "settings.recommended.json"),
        ".claude/settings.recommended.json", args.dry_run
    )

    # 4. MCP template
    step(4, total, ".mcp.recommended.json")
    copy_template(
        "mcp-minimal.json",
        os.path.join(target, ".mcp.recommended.json"),
        ".mcp.recommended.json", args.dry_run
    )

    # 5. CI workflow example
    step(5, total, ".github/workflows/yana-ai-audit.yml")
    wf_src  = os.path.join(REPO_ROOT, ".github", "workflows", "yana-ai-audit.yml")
    wf_dest = os.path.join(target, ".github", "workflows", "yana-ai-audit.yml")
    if os.path.exists(wf_src) and not os.path.exists(wf_dest):
        if args.dry_run:
            print(f"     {c(YELLOW, 'would write')} yana-ai-audit.yml workflow")
        else:
            os.makedirs(os.path.dirname(wf_dest), exist_ok=True)
            shutil.copy2(wf_src, wf_dest)
            print(f"     {c(GREEN, '✓')} .github/workflows/yana-ai-audit.yml")
    elif os.path.exists(wf_dest):
        print(f"     {c(DIM, 'skip')} yana-ai-audit.yml (already exists)")

    # 6. Guards (optional)
    if args.guards:
        step(6, total, "runtime guards (yana-ai guard install all)")
        if args.dry_run:
            print(f"     {c(YELLOW, 'would run')} yana-ai guard install all --target {target}")
        else:
            r = subprocess.run(
                [sys.executable, GUARD_PY, "install", "all", "--target", target],
                capture_output=True, text=True
            )
            if r.returncode == 0:
                print(f"     {c(GREEN, '✓')} guards installed")
            else:
                print(f"     {c(YELLOW, '!')} guard install had warnings")

    print()

    # Initial audit
    if not args.no_audit and not args.dry_run:
        print(c(BOLD, "  Running initial audit…"))
        data = run_audit(target)
        if data:
            score = data.get("score", 0)
            risk  = data.get("risk_level", "?")
            rc    = {"CRITICAL": RED, "HIGH": RED, "MEDIUM": YELLOW, "LOW": GREEN}.get(risk, "")
            print(f"  Initial score: {c(BOLD + rc, f'{score}/100 {risk}')}")
            findings = data.get("findings", [])
            if findings:
                top = findings[:3]
                print(f"  Top findings:")
                for f in top:
                    print(f"    {c(rc, f['severity'])} {f['id']}  {f.get('file','')}")
                print(f"  Run: yana-ai audit {target}  for full report")
        print()

    print(c(GREEN, "  ✓ Setup complete."))
    print()
    print("  Next steps:")
    print(f"    1. Review .claude/settings.recommended.json → rename to settings.json")
    print(f"    2. Review .mcp.recommended.json → rename to .mcp.json")
    print(f"    3. Run: yana-ai audit {target if target != os.getcwd() else '.'}")
    if args.guards:
        print(f"    4. Guards active — check: yana-ai guard status")
    print()


if __name__ == "__main__":
    main()
