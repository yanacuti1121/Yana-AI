#!/usr/bin/env python3
"""yana-ai install [target] — one-command project setup."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from sync_codex import sync_codex

REPO_ROOT     = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEMPLATES_DIR = os.path.join(REPO_ROOT, "policy", "templates")
SCANNER_PY    = os.path.join(REPO_ROOT, "core/scripts/audit_scanner.py")
GUARD_PY      = os.path.join(REPO_ROOT, "core/scripts/guard_installer.py")
GIAMTHI_PY    = os.path.join(REPO_ROOT, "core/scripts/giamthi_service.py")

CLAUDE_COPY_DIRS = (
    ("core/hooks", ".claude/hooks"),
    ("core/commands", ".claude/commands"),
    ("core/agents", ".claude/agents"),
    ("core/skills", ".claude/skills"),
    ("core/rules", ".claude/rules"),
    ("core/scripts", ".claude/scripts"),
    ("core/gates", ".claude/gates"),
    ("gates", ".claude/gates"),
)

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
.claude/state/
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


def copy_tree(source: Path, destination: Path, dry_run: bool) -> int:
    if not source.exists():
        return 0
    written = 0
    for source_path in sorted(path for path in source.rglob("*") if path.is_file()):
        relative_path = source_path.relative_to(source)
        destination_path = destination / relative_path
        if destination_path.exists() and source_path.read_bytes() == destination_path.read_bytes():
            continue
        written += 1
        if dry_run:
            continue
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, destination_path)
    return written


def sync_claude(target: Path, dry_run: bool) -> int:
    source_root = Path(REPO_ROOT)
    written = 0
    for source_rel, destination_rel in CLAUDE_COPY_DIRS:
        written += copy_tree(
            source_root / source_rel,
            target / destination_rel,
            dry_run,
        )
    written += copy_tree(
        source_root / ".claude-plugin",
        target / ".claude-plugin",
        dry_run,
    )
    return written


def run_audit(target: str) -> dict | None:
    cmd = [sys.executable, SCANNER_PY, target, "--json", "--quiet"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except Exception:
        return None


def should_install_supervisor(mode: str) -> bool:
    if mode == "install":
        return True
    if mode == "skip" or not sys.stdin.isatty():
        return False
    answer = input("  Install the OS-level Giám thị supervisor for this project? (y/N) ")
    return answer.strip().lower() in {"y", "yes"}


def install_supervisor_assets(target: Path, dry_run: bool) -> int:
    assets = ("giamthi-watch.sh", "verify-audit-chain.sh")
    written = 0
    for name in assets:
        source = Path(REPO_ROOT) / "core/scripts" / name
        destination = target / ".claude/scripts" / name
        if destination.exists() and destination.read_bytes() == source.read_bytes():
            continue
        written += 1
        if not dry_run:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
    return written


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
    parser.add_argument(
        "--engine",
        choices=("all", "claude", "codex"),
        default="all",
        help="Capability surfaces to install (default: all)",
    )
    parser.add_argument(
        "--supervisor",
        choices=("ask", "install", "skip"),
        default="ask",
        help="OS-level Giám thị setup: ask interactively, install explicitly, or skip (default: ask)",
    )
    args = parser.parse_args()

    target = os.path.abspath(args.target)
    install_claude = args.engine in ("all", "claude")
    install_codex = args.engine in ("all", "codex")
    total = 4 + (2 if install_claude else 0) + (1 if install_codex else 0)
    total += 1 if args.guards else 0
    install_supervisor = should_install_supervisor(args.supervisor)
    total += 1 if install_supervisor else 0
    current_step = 0

    def next_step(label: str):
        nonlocal current_step
        current_step += 1
        step(current_step, total, label)

    print()
    print(c(BOLD, "  yana-ai install") + c(DIM, f" — {target}"))
    if args.dry_run:
        print(c(YELLOW, "  [dry-run mode — no files will be written]"))
    print()

    # 1. .yana-aiignore
    next_step(".yana-aiignore")
    write_if_missing(
        os.path.join(target, ".yana-aiignore"),
        YANA_AI_IGNORE_DEFAULT, ".yana-aiignore", args.dry_run
    )

    # 2. .gitignore additions
    next_step(".gitignore — add Yana AI entries")
    append_if_missing(
        os.path.join(target, ".gitignore"),
        GITIGNORE_ADDITIONS, "# Yana AI", ".gitignore additions", args.dry_run
    )

    # 3. MCP template
    next_step(".mcp.recommended.json")
    copy_template(
        "mcp-minimal.json",
        os.path.join(target, ".mcp.recommended.json"),
        ".mcp.recommended.json", args.dry_run
    )

    # 4. CI workflow example
    next_step(".github/workflows/yana-ai-audit.yml")
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

    if install_claude:
        next_step(".claude/settings.recommended.json")
        copy_template(
            "claude-settings.json",
            os.path.join(target, ".claude", "settings.recommended.json"),
            ".claude/settings.recommended.json", args.dry_run
        )

        next_step("Claude agents, skills, commands, hooks, rules, and scripts")
        claude_written = sync_claude(Path(target), args.dry_run)
        action = "would update" if args.dry_run else "updated"
        print(f"     {c(YELLOW if args.dry_run else GREEN, action)} {claude_written} Claude files")

    if install_codex:
        next_step("Codex agents, skills, commands, hooks, and guidance")
        codex_counts = sync_codex(Path(target), dry_run=args.dry_run)
        codex_written = sum(codex_counts.values())
        action = "would update" if args.dry_run else "updated"
        print(f"     {c(YELLOW if args.dry_run else GREEN, action)} {codex_written} Codex files")

    # Runtime guards (optional)
    if args.guards:
        next_step("runtime guards (yana-ai guard install all)")
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

    if install_supervisor:
        next_step("OS-level Giám thị supervisor")
        assets_written = install_supervisor_assets(Path(target), args.dry_run)
        if assets_written:
            action = "would install" if args.dry_run else "installed"
            print(f"     {c(YELLOW if args.dry_run else GREEN, action)} {assets_written} supervisor assets")
        if args.dry_run:
            print(f"     {c(YELLOW, 'would run')} yana-ai giamthi install {target}")
        else:
            result = subprocess.run(
                [sys.executable, GIAMTHI_PY, "install", target],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                print(f"     {c(GREEN, '✓')} supervisor installed and initial scan requested")
            else:
                diagnostic = (result.stderr or result.stdout).strip()
                print(f"     {c(YELLOW, '!')} supervisor setup failed: {diagnostic}")
                print(f"     Retry: yana-ai giamthi repair {target}")

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
    next_number = 1
    if install_claude:
        print(f"    {next_number}. Review .claude/settings.recommended.json → merge into settings.json")
        next_number += 1
    if install_codex:
        print(f"    {next_number}. Codex support is project-scoped in .codex/ and .agents/skills/")
        next_number += 1
    print(f"    {next_number}. Review .mcp.recommended.json → rename to .mcp.json")
    next_number += 1
    print(f"    {next_number}. Run: yana-ai audit {target if target != os.getcwd() else '.'}")
    if args.guards:
        next_number += 1
        print(f"    {next_number}. Guards active — check: yana-ai guard status")
    print()


if __name__ == "__main__":
    main()
