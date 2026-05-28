#!/usr/bin/env python3
"""yamtam fix <rule-id> [target] — auto-apply safe fix for a finding (opt-in)."""

import argparse
import glob
import json
import os
import re
import shutil
import sys
import yaml

REPO_ROOT    = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCANNER_DIR  = os.path.join(REPO_ROOT, "scanner")
TEMPLATES_DIR = os.path.join(REPO_ROOT, "policy", "templates")

BOLD   = "\033[1m"
RED    = "\033[31m"
YELLOW = "\033[33m"
GREEN  = "\033[32m"
CYAN   = "\033[36m"
DIM    = "\033[2m"
RESET  = "\033[0m"

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


# ── Rule loader ───────────────────────────────────────────────────────────────

def load_rule(rule_id: str) -> dict | None:
    for yml_path in sorted(glob.glob(os.path.join(SCANNER_DIR, "*.yml"))):
        try:
            with open(yml_path) as f:
                data = yaml.safe_load(f)
            for check in data.get("checks", []):
                if check.get("id", "").upper() == rule_id.upper():
                    return check
        except Exception:
            continue
    return None


# ── Fix strategies ────────────────────────────────────────────────────────────

def fix_ac002(target: str, dry_run: bool) -> bool:
    """AC002 — Remove Bash(*) from allowedTools."""
    path = os.path.join(target, ".claude", "settings.json")
    if not os.path.exists(path):
        print(c(RED, f"  ✗ {path} not found")); return False

    with open(path) as f:
        data = json.load(f)

    allow = data.get("permissions", {}).get("allow", [])
    new_allow = [a for a in allow if a not in ("Bash", "Bash(*)", "Bash(**)")]
    removed = [a for a in allow if a not in new_allow]

    if not removed:
        print(c(GREEN, "  ✓ No Bash(*) found — already clean")); return True

    print(f"  Would remove: {removed}")
    if dry_run:
        print(c(YELLOW, "  [dry-run] no changes written")); return True

    data["permissions"]["allow"] = new_allow
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(c(GREEN, f"  ✓ Removed {removed} from {path}")); return True


def fix_ac003(target: str, dry_run: bool) -> bool:
    """AC003 — Set dangerouslyAllowAll to false."""
    path = os.path.join(target, ".claude", "settings.json")
    if not os.path.exists(path):
        print(c(RED, f"  ✗ {path} not found")); return False

    with open(path) as f:
        data = json.load(f)

    if not data.get("permissions", {}).get("dangerouslyAllowAll"):
        print(c(GREEN, "  ✓ dangerouslyAllowAll already false")); return True

    print(f"  Would set dangerouslyAllowAll: true → false")
    if dry_run:
        print(c(YELLOW, "  [dry-run] no changes written")); return True

    data.setdefault("permissions", {})["dangerouslyAllowAll"] = False
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(c(GREEN, f"  ✓ Set dangerouslyAllowAll=false in {path}")); return True


def fix_ci007(target: str, dry_run: bool) -> bool:
    """CI007 — Add permissions: read-all to workflows missing it."""
    wf_dir = os.path.join(target, ".github", "workflows")
    if not os.path.exists(wf_dir):
        print(c(RED, "  ✗ .github/workflows/ not found")); return False

    fixed = 0
    for wf_path in sorted(glob.glob(os.path.join(wf_dir, "*.yml")) +
                           glob.glob(os.path.join(wf_dir, "*.yaml"))):
        with open(wf_path) as f:
            content = f.read()
        if "permissions:" in content:
            continue
        # Add permissions block after the 'on:' block
        new_content = re.sub(
            r"(^on:.*?)(^jobs:)",
            r"\1\npermissions:\n  contents: read\n\n\2",
            content, flags=re.MULTILINE | re.DOTALL
        )
        if new_content == content:
            # Simpler insertion at top after name line
            new_content = re.sub(
                r"(^name:.*?\n)",
                r"\1\npermissions:\n  contents: read\n",
                content, count=1, flags=re.MULTILINE
            )
        name = os.path.basename(wf_path)
        print(f"  Would add 'permissions: read-all' to {name}")
        if not dry_run:
            with open(wf_path, "w") as f:
                f.write(new_content)
            print(c(GREEN, f"  ✓ Fixed {name}"))
        fixed += 1

    if fixed == 0:
        print(c(GREEN, "  ✓ All workflows already have permissions block"))
    elif dry_run:
        print(c(YELLOW, f"  [dry-run] would fix {fixed} workflow(s)"))
    return True


def fix_mcp001(target: str, dry_run: bool) -> bool:
    """MCP001 — Replace full-root filesystem MCP with scoped path."""
    path = os.path.join(target, ".mcp.json")
    if not os.path.exists(path):
        print(c(RED, "  ✗ .mcp.json not found")); return False

    with open(path) as f:
        data = json.load(f)

    changed = False
    for name, cfg in data.get("mcpServers", {}).items():
        args = cfg.get("args", [])
        risky = [a for a in args if a in ("/", os.path.expanduser("~"), "/home", "/root")]
        if risky:
            new_args = [os.getcwd() if a in risky else a for a in args]
            print(f"  Would change {name} args: {risky} → [{os.getcwd()}]")
            if not dry_run:
                data["mcpServers"][name]["args"] = new_args
            changed = True

    if not changed:
        print(c(GREEN, "  ✓ No root-level filesystem MCP found")); return True
    if dry_run:
        print(c(YELLOW, "  [dry-run] no changes written")); return True

    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(c(GREEN, f"  ✓ Scoped filesystem MCP paths in {path}")); return True


def fix_with_template(target: str, template: str, out: str, dry_run: bool) -> bool:
    """Generic: copy a policy template if target file doesn't exist."""
    src  = os.path.join(TEMPLATES_DIR, template)
    dest = os.path.join(target, out)
    if not os.path.exists(src):
        print(c(RED, f"  ✗ Template not found: {src}")); return False
    if os.path.exists(dest):
        print(c(YELLOW, f"  ! {dest} already exists — use yamtam init-policy for a fresh template"))
        return True
    print(f"  Would write: {dest}")
    if dry_run:
        print(c(YELLOW, "  [dry-run] no changes written")); return True
    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    shutil.copy2(src, dest)
    print(c(GREEN, f"  ✓ Written: {dest}")); return True


# ── Dispatch table ────────────────────────────────────────────────────────────

FIX_DISPATCH = {
    "AC002": lambda t, d: fix_ac002(t, d),
    "AC003": lambda t, d: fix_ac003(t, d),
    "CI007": lambda t, d: fix_ci007(t, d),
    "MCP001": lambda t, d: fix_mcp001(t, d),
    # Template-based fixes
    "AC001": lambda t, d: fix_with_template(t, "claude-settings.json", ".claude/settings.recommended.json", d),
    "AC004": lambda t, d: fix_with_template(t, "claude-settings.json", ".claude/settings.recommended.json", d),
    "MCP002": lambda t, d: fix_with_template(t, "mcp-minimal.json", ".mcp.recommended.json", d),
    "MCP003": lambda t, d: fix_with_template(t, "mcp-minimal.json", ".mcp.recommended.json", d),
}

MANUAL_ONLY = {
    "SE001", "SE002", "SE003",  # secrets — never auto-fix
    "CI004",                     # secrets in workflows — review manually
    "AU001",                     # auth tokens — manual rotation
}


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam fix",
        description="Auto-apply a safe fix for a specific finding (opt-in)",
    )
    parser.add_argument("rule_id", help="Rule ID to fix (e.g. AC002, CI007)")
    parser.add_argument("target", nargs="?", default=".", help="Project directory (default: .)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would change without writing")
    parser.add_argument("--yes", action="store_true",
                        help="Skip confirmation prompt")

    args = parser.parse_args()
    rule_id = args.rule_id.upper()

    rule = load_rule(rule_id)
    if not rule:
        print(c(RED, f"\n  Error: rule '{rule_id}' not found."), file=sys.stderr)
        print("  Run: yamtam explain --list\n", file=sys.stderr)
        sys.exit(1)

    if rule_id in MANUAL_ONLY:
        print()
        print(c(RED, f"  {rule_id} requires manual review — auto-fix is not safe for this rule."))
        print(f"  Reason: {rule.get('reason','')}")
        print(f"  Fix:    {rule.get('fix','')}")
        print()
        sys.exit(0)

    if rule_id not in FIX_DISPATCH:
        print()
        print(c(YELLOW, f"  No automated fix available for {rule_id}."))
        print(f"  Manual fix: {rule.get('fix', 'see yamtam explain ' + rule_id)}")
        print()
        sys.exit(0)

    print()
    print(c(BOLD, f"  yamtam fix {rule_id}"))
    print(f"  {rule.get('description','')}")
    print(f"  {c(DIM, rule.get('fix',''))}")
    print()

    if not args.dry_run and not args.yes:
        ans = input("  Apply fix? [y/N] ").strip().lower()
        if ans != "y":
            print(c(DIM, "  Cancelled.")); print(); sys.exit(0)

    ok = FIX_DISPATCH[rule_id](args.target, args.dry_run)
    print()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
