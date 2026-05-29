#!/usr/bin/env python3
"""yamtam rule test [rule-id] — test scanner rules against fixtures.

Usage:
  yamtam rule test               Run all built-in rule sanity checks
  yamtam rule test <id>          Show what content rule <id> would match
  yamtam rule test <id> --file <path>   Test rule <id> against a specific file
  yamtam rule test --all         Validate all rule YAML structure (deep lint)
"""

import argparse
import os
import re
import sys

try:
    import yaml
    _HAS_YAML = True
except ImportError:
    _HAS_YAML = False

REPO_ROOT   = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCANNER_DIR = os.path.join(REPO_ROOT, "scanner")
SCANNER_PY  = os.path.join(REPO_ROOT, "core/scripts/audit_scanner.py")

BOLD   = "\033[1m"; GREEN = "\033[32m"; RED = "\033[31m"
CYAN   = "\033[36m"; DIM   = "\033[2m"; YELLOW = "\033[33m"; RESET = "\033[0m"

PASS_MARK = "✓"; FAIL_MARK = "✗"; SKIP_MARK = "–"


def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


# ── YAML loading ──────────────────────────────────────────────────────────────

def load_all_rules() -> list[tuple[str, dict]]:
    """Return list of (yaml_file, check_dict) for all scanner rules."""
    if not _HAS_YAML:
        print(c(RED, "  ✗ PyYAML not installed — pip install PyYAML"), file=sys.stderr)
        sys.exit(3)
    results = []
    for fn in sorted(os.listdir(SCANNER_DIR)):
        if not fn.endswith(".yml"):
            continue
        path = os.path.join(SCANNER_DIR, fn)
        try:
            with open(path) as f:
                data = yaml.safe_load(f) or {}
            for check in data.get("checks", []):
                results.append((fn, check))
        except Exception as e:
            results.append((fn, {"_error": str(e)}))
    return results


def find_rule(rule_id: str) -> tuple[str, dict] | None:
    for fn, check in load_all_rules():
        if check.get("id", "").upper() == rule_id.upper():
            return fn, check
    return None


# ── Rule structure validation ─────────────────────────────────────────────────

REQUIRED_FIELDS = {"id", "severity", "description"}
VALID_SEVERITIES = {"CRITICAL", "HIGH", "MED", "MEDIUM", "LOW"}
VALID_MATCH_TYPES = {"regex", "json", "exists", "not_exists", "yaml"}


def validate_check(fn: str, check: dict) -> list[str]:
    errs = []
    if "_error" in check:
        errs.append(f"YAML parse error: {check['_error']}")
        return errs
    for field in REQUIRED_FIELDS:
        if field not in check:
            errs.append(f"missing required field '{field}'")
    sev = check.get("severity", "").upper()
    if sev and sev not in VALID_SEVERITIES:
        errs.append(f"invalid severity {sev!r} (must be CRITICAL/HIGH/MED/MEDIUM/LOW)")
    m = check.get("match", {})
    mtype = m.get("type", "")
    if m and mtype and mtype not in VALID_MATCH_TYPES:
        errs.append(f"unknown match type {mtype!r}")
    if mtype == "regex":
        pattern = m.get("pattern", "")
        if pattern:
            try:
                flags = 0
                for flag in (m.get("flags") or "").split(","):
                    flag = flag.strip().upper()
                    if flag == "I":
                        flags |= re.IGNORECASE
                    elif flag == "M":
                        flags |= re.MULTILINE
                re.compile(pattern, flags)
            except re.error as e:
                errs.append(f"invalid regex pattern: {e}")
    return errs


# ── Pattern matching test ─────────────────────────────────────────────────────

def test_rule_against_content(check: dict, content: str) -> list[dict]:
    """Run a single check against content string, return list of hit dicts."""
    m = check.get("match", {})
    if not m:
        return []
    mtype = m.get("type", "regex")
    if mtype != "regex":
        return [{"note": f"match type '{mtype}' not testable inline (requires file context)"}]

    pattern = m.get("pattern", "")
    if not pattern:
        return []

    flags = re.IGNORECASE if "i" in (m.get("flags") or "").lower() else 0
    try:
        rx = re.compile(pattern, flags)
    except re.error as e:
        return [{"error": str(e)}]

    hits = []
    for i, line in enumerate(content.splitlines(), 1):
        if rx.search(line):
            hits.append({"line": i, "content": line.rstrip()})
    return hits


# ── Commands ──────────────────────────────────────────────────────────────────

def cmd_all(scanner_dir: str) -> int:
    """Validate all rule YAML files — structure + regex compilation."""
    print()
    print(c(BOLD, "  yamtam rule test --all"))
    print(c(DIM, f"  Scanner: {scanner_dir}"))
    print()

    rules = load_all_rules()
    if not rules:
        print(c(YELLOW, "  No rules found in scanner directory."))
        return 0

    total = passed = failed = 0
    last_file = None

    for fn, check in rules:
        if fn != last_file:
            print(f"  {c(DIM, fn)}")
            last_file = fn
        total += 1
        rule_id = check.get("id", "?")
        errs = validate_check(fn, check)
        if errs:
            failed += 1
            print(f"    {c(RED, FAIL_MARK)} {rule_id}")
            for err in errs:
                print(f"      {c(RED, '→')} {err}")
        else:
            passed += 1
            print(f"    {c(GREEN, PASS_MARK)} {rule_id}")

    print()
    print(f"  {c(BOLD, 'Summary')}  {c(GREEN, str(passed))} passed, "
          f"{c(RED if failed else DIM, str(failed))} failed  ({total} rules)")
    print()
    return 1 if failed else 0


def cmd_show(rule_id: str) -> int:
    """Show rule metadata."""
    result = find_rule(rule_id)
    if not result:
        print(c(RED, f"  ✗ Rule {rule_id!r} not found."), file=sys.stderr)
        print(f"  Run {c(CYAN, 'yamtam rule list')} to see available rules.", file=sys.stderr)
        return 1

    fn, check = result
    print()
    print(c(BOLD, f"  {check.get('id')}"))
    print(c(DIM, f"  Source: {fn}"))
    print()
    print(f"  {c(BOLD, 'Severity')}    {check.get('severity', '?')}")
    print(f"  {c(BOLD, 'Description')} {check.get('description', '')}")
    print(f"  {c(BOLD, 'Reason')}      {check.get('reason', c(DIM, 'n/a'))}")
    print(f"  {c(BOLD, 'Fix')}         {check.get('fix', c(DIM, 'n/a'))}")
    m = check.get("match", {})
    if m:
        print()
        print(f"  {c(BOLD, 'Match type')}  {m.get('type', 'regex')}")
        if m.get("pattern"):
            print(f"  {c(BOLD, 'Pattern')}     {c(CYAN, m['pattern'])}")
        if m.get("flags"):
            print(f"  {c(BOLD, 'Flags')}       {m['flags']}")
    print()
    return 0


def cmd_test_file(rule_id: str, file_path: str) -> int:
    """Test a rule against a file."""
    result = find_rule(rule_id)
    if not result:
        print(c(RED, f"  ✗ Rule {rule_id!r} not found."), file=sys.stderr)
        return 1

    fn, check = result
    if not os.path.isfile(file_path):
        print(c(RED, f"  ✗ File not found: {file_path}"), file=sys.stderr)
        return 1

    with open(file_path, errors="replace") as f:
        content = f.read()

    hits = test_rule_against_content(check, content)

    print()
    print(c(BOLD, f"  Rule {rule_id} × {os.path.basename(file_path)}"))
    print()

    if not hits:
        print(c(GREEN, f"  {PASS_MARK} No matches — rule does not fire on this file."))
    elif "note" in (hits[0] if hits else {}):
        print(c(YELLOW, f"  {SKIP_MARK} {hits[0]['note']}"))
    elif "error" in (hits[0] if hits else {}):
        print(c(RED, f"  ✗ Pattern error: {hits[0]['error']}"))
        return 1
    else:
        print(c(RED, f"  {FAIL_MARK} {len(hits)} match(es) found — rule fires:"))
        for hit in hits[:20]:
            print(f"    line {hit['line']:4d}  {c(CYAN, hit['content'][:120])}")
        if len(hits) > 20:
            print(c(DIM, f"    … and {len(hits)-20} more"))

    print()
    return 0 if not hits else 1


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam rule test",
        description="Test scanner rules for correctness",
    )
    parser.add_argument("rule_id", nargs="?", default=None,
                        help="Rule ID to inspect or test (e.g. AC001)")
    parser.add_argument("--file", metavar="PATH",
                        help="Test rule against a specific file")
    parser.add_argument("--all", action="store_true",
                        help="Validate all rule YAML files (structure + regex)")
    parser.add_argument("--scanner", default=SCANNER_DIR,
                        help=f"Scanner YAML directory (default: {SCANNER_DIR})")
    args = parser.parse_args()

    if args.all or args.rule_id is None:
        sys.exit(cmd_all(args.scanner))

    if args.file:
        sys.exit(cmd_test_file(args.rule_id, args.file))

    sys.exit(cmd_show(args.rule_id))


if __name__ == "__main__":
    main()
