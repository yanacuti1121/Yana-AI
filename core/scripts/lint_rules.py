#!/usr/bin/env python3
"""yamtam lint [path] — lint rule YAML files for schema correctness."""

import argparse
import glob
import json
import os
import sys
import yaml

REPO_ROOT   = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCANNER_DIR = os.path.join(REPO_ROOT, "scanner")

BOLD   = "\033[1m"; GREEN  = "\033[32m"; YELLOW = "\033[33m"
RED    = "\033[31m"; CYAN   = "\033[36m"; DIM    = "\033[2m"; RESET  = "\033[0m"

REQUIRED_RULE_FIELDS   = {"id", "severity", "target", "description"}
OPTIONAL_RULE_FIELDS   = {"match", "reason", "fix", "note", "tags"}
VALID_SEVERITIES       = {"CRITICAL", "HIGH", "MED", "MEDIUM", "LOW"}
VALID_MATCH_TYPES      = {"regex", "json", "exists", "not_exists", "size_gt",
                          "yaml_key", "line_contains", "accompanied_by"}
REQUIRED_TOP_FIELDS    = {"version", "scope", "checks"}

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


def lint_file(path: str) -> list[dict]:
    issues = []

    try:
        with open(path) as f:
            data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        return [{"level": "ERROR", "file": path, "line": None, "msg": f"YAML parse error: {e}"}]
    except Exception as e:
        return [{"level": "ERROR", "file": path, "line": None, "msg": str(e)}]

    if not isinstance(data, dict):
        return [{"level": "ERROR", "file": path, "line": None, "msg": "Root must be a YAML mapping"}]

    # Top-level fields
    for field in REQUIRED_TOP_FIELDS:
        if field not in data:
            issues.append({"level": "WARN", "file": path, "line": None,
                           "msg": f"Missing top-level field: '{field}'"})

    checks = data.get("checks", [])
    if not isinstance(checks, list):
        issues.append({"level": "ERROR", "file": path, "line": None,
                       "msg": "'checks' must be a list"})
        return issues

    seen_ids = set()
    for i, check in enumerate(checks):
        loc = f"check #{i+1}"
        if not isinstance(check, dict):
            issues.append({"level": "ERROR", "file": path, "line": None,
                           "msg": f"{loc}: must be a mapping"}); continue

        # Required fields
        for f in REQUIRED_RULE_FIELDS:
            if f not in check:
                issues.append({"level": "ERROR", "file": path, "line": None,
                               "msg": f"{loc} ({check.get('id','?')}): missing required field '{f}'"})

        # Duplicate IDs
        rid = check.get("id", "")
        if rid:
            if rid.upper() in seen_ids:
                issues.append({"level": "ERROR", "file": path, "line": None,
                               "msg": f"Duplicate rule ID: '{rid}'"})
            seen_ids.add(rid.upper())

        # Severity
        sev = check.get("severity", "")
        if sev and sev.upper() not in VALID_SEVERITIES:
            issues.append({"level": "ERROR", "file": path, "line": None,
                           "msg": f"{loc} ({rid}): invalid severity '{sev}' — must be one of {VALID_SEVERITIES}"})

        # Match type
        match = check.get("match", {})
        if isinstance(match, dict):
            mt = match.get("type", "")
            if mt and mt not in VALID_MATCH_TYPES:
                issues.append({"level": "WARN", "file": path, "line": None,
                               "msg": f"{loc} ({rid}): unknown match type '{mt}'"})
            if not match.get("pattern") and not match.get("value") and mt not in ("exists", "not_exists"):
                issues.append({"level": "WARN", "file": path, "line": None,
                               "msg": f"{loc} ({rid}): match has no 'pattern' or 'value'"})

        # Unknown fields
        unknown = set(check.keys()) - REQUIRED_RULE_FIELDS - OPTIONAL_RULE_FIELDS
        if unknown:
            issues.append({"level": "WARN", "file": path, "line": None,
                           "msg": f"{loc} ({rid}): unknown fields: {unknown}"})

        # Fix field present
        if "fix" not in check:
            issues.append({"level": "WARN", "file": path, "line": None,
                           "msg": f"{loc} ({rid}): missing 'fix' field (recommended)"})

    return issues


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam lint",
        description="Lint rule YAML files for schema correctness",
    )
    parser.add_argument("path", nargs="?", default=None,
                        help="File or directory to lint (default: scanner/)")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--errors-only", action="store_true",
                        help="Show only ERRORs, not WARNs")
    args = parser.parse_args()

    # Collect files
    if args.path:
        if os.path.isdir(args.path):
            files = sorted(glob.glob(os.path.join(args.path, "*.yml")))
        else:
            files = [args.path]
    else:
        files = sorted(glob.glob(os.path.join(SCANNER_DIR, "*.yml")))

    all_issues = []
    for f in files:
        issues = lint_file(f)
        if args.errors_only:
            issues = [i for i in issues if i["level"] == "ERROR"]
        all_issues.extend(issues)

    if args.json:
        print(json.dumps({"files": len(files), "issues": len(all_issues),
                          "results": all_issues}, indent=2))
        return

    print()
    print(c(BOLD, "  yamtam lint") + c(DIM, f" — {len(files)} file(s)"))
    print()

    if not all_issues:
        print(c(GREEN, f"  ✓ All {len(files)} rule files are valid"))
        print()
        return

    for issue in all_issues:
        lvl = issue["level"]
        lc  = RED if lvl == "ERROR" else YELLOW
        fn  = os.path.basename(issue["file"])
        print(f"  {c(lc, lvl):<18} {c(CYAN, fn):<30} {issue['msg']}")

    errors = sum(1 for i in all_issues if i["level"] == "ERROR")
    warns  = sum(1 for i in all_issues if i["level"] == "WARN")
    print()
    print(f"  {c(RED, str(errors) + ' errors')}  {c(YELLOW, str(warns) + ' warnings')}  in {len(files)} files")
    print()

    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
