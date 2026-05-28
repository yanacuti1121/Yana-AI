#!/usr/bin/env python3
"""yamtam init-policy <tool> — generate safe config template for a tool."""

import argparse
import json
import os
import sys
import shutil

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEMPLATES_DIR = os.path.join(REPO_ROOT, "policy", "templates")

TOOLS = {
    "claude": {
        "description": "Claude Code — safe allowedTools + no dangerouslyAllowAll",
        "template": "claude-settings.json",
        "output": ".claude/settings.recommended.json",
        "note": "Review and rename to .claude/settings.json when ready.",
    },
    "mcp": {
        "description": "MCP server config — minimal permissions, no full-root filesystem",
        "template": "mcp-minimal.json",
        "output": ".mcp.recommended.json",
        "note": "Review and rename to .mcp.json when ready.",
    },
    "github-actions": {
        "description": "GitHub Actions workflow — no auto-merge, approval gates",
        "template": "ci-safe.yml",
        "output": ".github/workflows/ai-pr-safe.yml",
        "note": "Rename or merge with your existing workflow.",
    },
    "gitignore": {
        "description": ".gitignore additions for AI agent projects",
        "template": "gitignore-ai.txt",
        "output": ".gitignore.yamtam",
        "note": "Append to your existing .gitignore.",
    },
    "env": {
        "description": ".env.example template — shows required vars, no real secrets",
        "template": "env-example.txt",
        "output": ".env.example.yamtam",
        "note": "Merge into your .env.example.",
    },
}

RED   = "\033[31m"
GREEN = "\033[32m"
CYAN  = "\033[36m"
BOLD  = "\033[1m"
RESET = "\033[0m"

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


def cmd_list():
    print(c(BOLD, "\nAvailable tools for yamtam init-policy:\n"))
    print(f"  {'TOOL':<18} {'DESCRIPTION'}")
    print("  " + "─" * 60)
    for name, info in TOOLS.items():
        print(f"  {c(CYAN, name):<27} {info['description']}")
    print()


def cmd_init(tool: str, out_override: str | None, dry_run: bool):
    if tool not in TOOLS:
        print(c(RED, f"Error: unknown tool '{tool}'"), file=sys.stderr)
        print(f"Run: yamtam init-policy list", file=sys.stderr)
        sys.exit(1)

    info = TOOLS[tool]
    src = os.path.join(TEMPLATES_DIR, info["template"])

    if not os.path.exists(src):
        print(c(RED, f"Error: template not found: {src}"), file=sys.stderr)
        sys.exit(1)

    dest = out_override or info["output"]
    dest_abs = os.path.join(os.getcwd(), dest)

    print(c(BOLD, f"\nYAMTAM init-policy — {tool}\n"))
    print(f"  template : {src}")
    print(f"  output   : {dest}")
    print(f"  note     : {info['note']}\n")

    if dry_run:
        print(c(CYAN, "  [dry-run] Would write:"))
        with open(src) as f:
            for i, line in enumerate(f, 1):
                print(f"  {i:3}  {line}", end="")
        print()
        return

    os.makedirs(os.path.dirname(dest_abs) or ".", exist_ok=True)

    if os.path.exists(dest_abs):
        print(c(RED, f"  ✗ {dest} already exists — use --out to specify a different path"))
        sys.exit(1)

    shutil.copy2(src, dest_abs)
    print(c(GREEN, f"  ✓ written: {dest}"))
    print(f"\n  Next: review the file, then rename/merge as instructed above.")


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam init-policy",
        description="Generate safe config template for an AI agent tool",
    )
    parser.add_argument("tool", nargs="?", default=None,
                        help="Tool name (claude, mcp, github-actions, gitignore, env) or 'list'")
    parser.add_argument("--out", default=None, help="Override output path")
    parser.add_argument("--dry-run", action="store_true", help="Print template without writing")

    args = parser.parse_args()

    if not args.tool or args.tool == "list":
        cmd_list()
    else:
        cmd_init(args.tool, args.out, args.dry_run)


if __name__ == "__main__":
    main()
