#!/usr/bin/env python3
"""yamtam rule add — add a custom rule to the local scanner."""

import argparse
import os
import sys
import yaml

REPO_ROOT   = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCANNER_DIR = os.path.join(REPO_ROOT, "scanner")
CUSTOM_FILE = os.path.join(SCANNER_DIR, "custom-checks.yml")

BOLD  = "\033[1m"; GREEN = "\033[32m"; YELLOW = "\033[33m"
RED   = "\033[31m"; CYAN  = "\033[36m"; DIM   = "\033[2m"; RESET = "\033[0m"

SEVERITIES = ("CRITICAL", "HIGH", "MED", "LOW")
MATCH_TYPES = ("regex", "json", "exists", "not_exists", "size_gt")

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


def load_custom() -> dict:
    if not os.path.exists(CUSTOM_FILE):
        return {"version": "1.0", "scope": "custom", "checks": []}
    with open(CUSTOM_FILE) as f:
        return yaml.safe_load(f) or {"version": "1.0", "scope": "custom", "checks": []}


def save_custom(data: dict):
    os.makedirs(os.path.dirname(CUSTOM_FILE), exist_ok=True)
    with open(CUSTOM_FILE, "w") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)


def existing_ids() -> set[str]:
    ids = set()
    for fn in os.listdir(SCANNER_DIR):
        if not fn.endswith(".yml"):
            continue
        try:
            with open(os.path.join(SCANNER_DIR, fn)) as f:
                data = yaml.safe_load(f)
            for check in (data or {}).get("checks", []):
                if "id" in check:
                    ids.add(check["id"].upper())
        except Exception:
            pass
    return ids


def cmd_add(args):
    rule_id = args.id.upper()

    taken = existing_ids()
    if rule_id in taken:
        print(c(RED, f"\n  Error: rule ID '{rule_id}' already exists."))
        print(f"  Use a different ID (e.g. CUSTOM001, MY-SEC-001)\n")
        sys.exit(1)

    if args.severity.upper() not in SEVERITIES:
        print(c(RED, f"\n  Error: severity must be one of {SEVERITIES}\n"))
        sys.exit(1)

    rule = {
        "id": rule_id,
        "severity": args.severity.upper(),
        "target": args.target,
        "description": args.description,
        "match": {"type": args.match_type, "pattern": args.pattern},
        "reason": args.reason or f"Custom rule: {args.description}",
        "fix": args.fix or "Review and remediate the finding.",
    }

    if args.dry_run:
        print()
        print(c(BOLD, "  [dry-run] Would add rule:"))
        print(f"  {yaml.dump({'checks': [rule]}, default_flow_style=False)}")
        return

    data = load_custom()
    data["checks"].append(rule)
    save_custom(data)

    print()
    print(c(GREEN, f"  ✓ Rule {rule_id} added to {CUSTOM_FILE}"))
    print(f"  Run: yamtam audit . --only custom")
    print()


def cmd_list(args):
    data = load_custom()
    checks = data.get("checks", [])
    print()
    if not checks:
        print(c(DIM, "  No custom rules. Add one: yamtam rule add --id CUSTOM001 ..."))
        print()
        return
    print(c(BOLD, f"  Custom rules ({len(checks)}) — {CUSTOM_FILE}"))
    print()
    for ch in checks:
        sev = ch.get("severity", "?")
        rc  = {"CRITICAL": RED, "HIGH": RED, "MED": YELLOW, "LOW": GREEN}.get(sev, "")
        print(f"  {c(rc, sev):<18} {c(BOLD, ch.get('id','?'))}  {ch.get('description','')}")
    print()


def cmd_remove(args):
    rule_id = args.id.upper()
    data = load_custom()
    before = len(data["checks"])
    data["checks"] = [c for c in data["checks"] if c.get("id","").upper() != rule_id]
    if len(data["checks"]) == before:
        print(c(RED, f"\n  Rule '{rule_id}' not found in custom rules.\n"))
        sys.exit(1)
    save_custom(data)
    print(c(GREEN, f"\n  ✓ Removed {rule_id}\n"))


def main():
    parser = argparse.ArgumentParser(prog="yamtam rule",
                                     description="Manage custom scanner rules")
    sub = parser.add_subparsers(dest="subcmd")

    # add
    p_add = sub.add_parser("add", help="Add a custom rule")
    p_add.add_argument("--id",          required=True, help="Rule ID (e.g. CUSTOM001)")
    p_add.add_argument("--severity",    required=True, choices=[s.lower() for s in SEVERITIES] + list(SEVERITIES),
                       help="Severity: critical/high/med/low")
    p_add.add_argument("--target",      required=True, help="File glob to scan (e.g. .claude/settings.json)")
    p_add.add_argument("--description", required=True, help="Short description of the finding")
    p_add.add_argument("--pattern",     required=True, help="Regex or JSON path pattern to match")
    p_add.add_argument("--match-type",  default="regex", choices=MATCH_TYPES,
                       help="Match type (default: regex)")
    p_add.add_argument("--reason",      default="", help="Why this is risky")
    p_add.add_argument("--fix",         default="", help="How to fix it")
    p_add.add_argument("--dry-run",     action="store_true")

    # list
    sub.add_parser("list", help="List custom rules")

    # remove
    p_rm = sub.add_parser("remove", help="Remove a custom rule")
    p_rm.add_argument("id", help="Rule ID to remove")

    args = parser.parse_args()

    if args.subcmd == "add":
        cmd_add(args)
    elif args.subcmd == "list":
        cmd_list(args)
    elif args.subcmd == "remove":
        cmd_remove(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
