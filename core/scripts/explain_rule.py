#!/usr/bin/env python3
"""yamtam explain <rule-id> — explain a finding in plain language."""

import argparse
import glob
import os
import sys
import yaml

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCANNER_DIR = os.path.join(REPO_ROOT, "scanner")
DOCS_DIR = os.path.join(REPO_ROOT, "rules", "docs")

BOLD  = "\033[1m"
RED   = "\033[31m"
YELLOW= "\033[33m"
GREEN = "\033[32m"
CYAN  = "\033[36m"
DIM   = "\033[2m"
RESET = "\033[0m"

SEVERITY_COLOR = {
    "CRITICAL": RED,
    "HIGH":     RED,
    "MED":      YELLOW,
    "MEDIUM":   YELLOW,
    "LOW":      GREEN,
}

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


def load_rule(rule_id: str) -> dict | None:
    """Find a rule by ID across all scanner YAML files."""
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


def load_doc(rule_id: str) -> str | None:
    """Load extended documentation from rules/docs/<ID>.md if present."""
    doc_path = os.path.join(DOCS_DIR, f"{rule_id.upper()}.md")
    if os.path.exists(doc_path):
        with open(doc_path) as f:
            return f.read()
    return None


def print_rule(rule: dict):
    rid      = rule.get("id", "?")
    severity = rule.get("severity", "?")
    desc     = rule.get("description", "")
    reason   = rule.get("reason", "No reason documented.")
    fix      = rule.get("fix", "No fix documented.")
    target   = rule.get("target", "?")
    sev_c    = SEVERITY_COLOR.get(severity, "")

    print()
    print(c(BOLD, f"  {rid}") + "  " + c(sev_c, f"[{severity}]"))
    print(f"  {desc}")
    print()
    print(c(BOLD, "  Target"))
    print(f"    {target}")
    print()
    print(c(BOLD, "  Why it's risky"))
    print(f"    {reason}")
    print()
    print(c(BOLD, "  How to fix"))
    print(f"    {fix}")

    # Match detail if available
    match = rule.get("match", {})
    if match:
        print()
        print(c(BOLD, "  Detection pattern"))
        mtype   = match.get("type", "")
        pattern = match.get("pattern", match.get("value", ""))
        mpath   = match.get("path", "")
        if mtype:
            print(f"    type    : {mtype}")
        if mpath:
            print(f"    path    : {mpath}")
        if pattern:
            print(f"    pattern : {pattern}")

    print()
    print(c(DIM, f"  Policy: yamtam audit . --only {rid[:2].lower()} | yamtam audit . --ignore {rid}"))
    print()


def list_all():
    print(c(BOLD, "\n  Available rule IDs:\n"))
    seen = []
    for yml_path in sorted(glob.glob(os.path.join(SCANNER_DIR, "*.yml"))):
        try:
            with open(yml_path) as f:
                data = yaml.safe_load(f)
            scope = data.get("scope", os.path.basename(yml_path))
            ids = [c.get("id", "") for c in data.get("checks", [])]
            if ids:
                print(f"  {c(CYAN, scope)}")
                print(f"    {', '.join(ids)}")
                print()
                seen.extend(ids)
        except Exception:
            continue
    print(f"  Total: {len(seen)} rules\n")


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam explain",
        description="Explain a finding rule — what it means, why it's risky, how to fix",
    )
    parser.add_argument("rule_id", nargs="?", help="Rule ID (e.g. CI001, AC002, MCP003)")
    parser.add_argument("--list", action="store_true", help="List all available rule IDs")
    args = parser.parse_args()

    if args.list or not args.rule_id:
        list_all()
        return

    rule = load_rule(args.rule_id)
    if not rule:
        print(c(RED, f"\n  Error: rule '{args.rule_id}' not found."), file=sys.stderr)
        print(f"  Run: yamtam explain --list\n", file=sys.stderr)
        sys.exit(1)

    print_rule(rule)

    # Extended doc if exists
    doc = load_doc(args.rule_id)
    if doc:
        print(c(BOLD, "  Extended documentation"))
        for line in doc.splitlines():
            print(f"  {line}")
        print()


if __name__ == "__main__":
    main()
