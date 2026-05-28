#!/usr/bin/env python3
"""yamtam rule import <url-or-file> — import a rule pack into local scanner."""

import argparse
import os
import sys
import tempfile
import urllib.request
import yaml

REPO_ROOT   = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCANNER_DIR = os.path.join(REPO_ROOT, "scanner")

BOLD  = "\033[1m"; GREEN = "\033[32m"; YELLOW = "\033[33m"
RED   = "\033[31m"; CYAN  = "\033[36m"; DIM   = "\033[2m"; RESET = "\033[0m"

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


def existing_ids() -> set[str]:
    ids = set()
    for fn in os.listdir(SCANNER_DIR):
        if not fn.endswith(".yml"):
            continue
        try:
            with open(os.path.join(SCANNER_DIR, fn)) as f:
                data = yaml.safe_load(f)
            for check in (data or {}).get("checks", []):
                ids.add(check.get("id", "").upper())
        except Exception:
            pass
    return ids


def fetch_content(source: str) -> str:
    if source.startswith("http://") or source.startswith("https://"):
        print(f"  Fetching {c(CYAN, source)}…")
        req = urllib.request.Request(source, headers={"User-Agent": "yamtam-cli"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.read().decode()
    else:
        with open(source) as f:
            return f.read()


def validate_pack(data: dict) -> list[str]:
    errors = []
    if "checks" not in data:
        errors.append("Missing 'checks' key — not a valid rule pack")
        return errors
    for i, check in enumerate(data["checks"]):
        if "id" not in check:
            errors.append(f"Check #{i}: missing 'id'")
        if "severity" not in check:
            errors.append(f"Check #{i}: missing 'severity'")
        if check.get("severity","").upper() not in ("CRITICAL","HIGH","MED","MEDIUM","LOW"):
            errors.append(f"Check #{i}: invalid severity '{check.get('severity')}'")
    return errors


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam rule import",
        description="Import a rule pack from URL or local file",
    )
    parser.add_argument("source", help="URL or file path to rule YAML")
    parser.add_argument("--name", default=None,
                        help="Output filename in scanner/ (default: derived from source)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate and preview without writing")
    parser.add_argument("--force", action="store_true",
                        help="Allow overwriting existing rule file")
    args = parser.parse_args()

    print()
    print(c(BOLD, "  yamtam rule import"))
    print()

    # Fetch content
    try:
        content = fetch_content(args.source)
    except Exception as e:
        print(c(RED, f"  ✗ Failed to fetch: {e}")); sys.exit(1)

    # Parse YAML
    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError as e:
        print(c(RED, f"  ✗ Invalid YAML: {e}")); sys.exit(1)

    if not isinstance(data, dict):
        print(c(RED, "  ✗ Rule pack must be a YAML mapping")); sys.exit(1)

    # Validate
    errors = validate_pack(data)
    if errors:
        print(c(RED, "  ✗ Validation failed:"))
        for e in errors:
            print(f"    {e}")
        sys.exit(1)

    checks    = data.get("checks", [])
    scope     = data.get("scope", "imported")
    existing  = existing_ids()
    conflicts = [ch["id"] for ch in checks if ch.get("id","").upper() in existing]
    new_ids   = [ch["id"] for ch in checks if ch.get("id","").upper() not in existing]

    print(f"  Pack scope : {scope}")
    print(f"  Rules      : {len(checks)} total  ({len(new_ids)} new, {len(conflicts)} conflicts)")
    print()

    if new_ids:
        print(c(GREEN, f"  New rules:"))
        for rid in new_ids[:10]:
            ch = next(c for c in checks if c.get("id") == rid)
            print(f"    + {c(CYAN, rid):<14} {ch.get('severity','?'):<8} {ch.get('description','')[:50]}")
        if len(new_ids) > 10:
            print(c(DIM, f"    … and {len(new_ids)-10} more"))
        print()

    if conflicts:
        print(c(YELLOW, f"  Conflicts (already exist — will skip unless --force):"))
        for rid in conflicts[:5]:
            print(f"    ! {rid}")
        print()

    if args.dry_run:
        print(c(YELLOW, "  [dry-run] No files written."))
        print(); return

    # Determine output filename
    if args.name:
        out_name = args.name if args.name.endswith(".yml") else args.name + ".yml"
    else:
        base = os.path.basename(args.source).split("?")[0]
        out_name = base if base.endswith(".yml") else scope + "-checks.yml"
    out_path = os.path.join(SCANNER_DIR, out_name)

    if os.path.exists(out_path) and not args.force:
        print(c(YELLOW, f"  ! {out_name} already exists. Use --force to overwrite."))
        sys.exit(0)

    # Filter out conflicts unless --force
    if not args.force and conflicts:
        data["checks"] = [ch for ch in checks
                          if ch.get("id","").upper() not in existing]

    with open(out_path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

    print(c(GREEN, f"  ✓ Imported {len(data['checks'])} rules → {out_name}"))
    print(f"  Run: yamtam audit . --only {scope}")
    print()


if __name__ == "__main__":
    main()
