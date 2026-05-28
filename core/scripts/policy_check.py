#!/usr/bin/env python3
"""yamtam policy check [target] — verify applied configs match policy templates."""

import argparse
import json
import os
import sys
import yaml

REPO_ROOT     = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEMPLATES_DIR = os.path.join(REPO_ROOT, "policy", "templates")
POLICY_INDEX  = os.path.join(REPO_ROOT, "policy", "index.yml")

BOLD  = "\033[1m"; GREEN = "\033[32m"; YELLOW = "\033[33m"
RED   = "\033[31m"; CYAN  = "\033[36m"; DIM   = "\033[2m"; RESET = "\033[0m"

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"

def icon(ok): return c(GREEN, "✓") if ok else c(RED, "✗")


def load_json(path: str) -> dict | None:
    try:
        with open(path) as f: return json.load(f)
    except Exception: return None

def load_yaml(path: str) -> dict | None:
    try:
        with open(path) as f: return yaml.safe_load(f)
    except Exception: return None


CHECKS = [
    {
        "name": "claude-settings",
        "template": "claude-settings.json",
        "targets": [".claude/settings.json"],
        "checks": [
            ("dangerouslyAllowAll is false",
             lambda t, r: not t.get("permissions",{}).get("dangerouslyAllowAll", False)),
            ("deny list present",
             lambda t, r: bool(t.get("permissions",{}).get("deny"))),
            ("no bare Bash(*) in allow",
             lambda t, r: "Bash(*)" not in t.get("permissions",{}).get("allow",[])),
        ],
    },
    {
        "name": "mcp-minimal",
        "template": "mcp-minimal.json",
        "targets": [".mcp.json"],
        "checks": [
            ("mcpServers defined",
             lambda t, r: "mcpServers" in t),
            ("no full-root filesystem access",
             lambda t, r: not any(
                 "/" in str(srv.get("args", [])) and
                 any(a in ("/", os.path.expanduser("~")) for a in srv.get("args", []))
                 for srv in t.get("mcpServers", {}).values()
             )),
        ],
    },
    {
        "name": "ci-safe",
        "template": "ci-safe.yml",
        "targets": [".github/workflows/yamtam-audit.yml",
                    ".github/workflows/ci.yml"],
        "checks": [
            ("permissions block present",
             lambda t, r: "permissions:" in r),
            ("no auto-merge",
             lambda t, r: "auto-merge" not in r.lower() and "automerge" not in r.lower()),
        ],
    },
]


def check_policy(target: str, policy: dict) -> list[dict]:
    results = []
    found_file = None
    raw_content = ""

    for tpath in policy["targets"]:
        full = os.path.join(target, tpath)
        if os.path.exists(full):
            found_file = full
            try:
                with open(full) as f:
                    raw_content = f.read()
            except Exception:
                pass
            break

    if not found_file:
        return [{"name": policy["name"], "file": policy["targets"][0],
                 "check": "file exists", "ok": False, "note": "not found"}]

    # Parse content
    fn = found_file.lower()
    if fn.endswith(".json"):
        data = load_json(found_file) or {}
    elif fn.endswith(".yml") or fn.endswith(".yaml"):
        data = load_yaml(found_file) or {}
    else:
        data = {}

    for check_name, check_fn in policy["checks"]:
        try:
            ok = check_fn(data, raw_content)
        except Exception:
            ok = False
        results.append({
            "name":  policy["name"],
            "file":  os.path.relpath(found_file, target),
            "check": check_name,
            "ok":    ok,
        })

    return results


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam policy check",
        description="Verify applied configs match policy templates",
    )
    parser.add_argument("target",  nargs="?", default=".")
    parser.add_argument("--json",  action="store_true")
    parser.add_argument("--policy", default=None,
                        help="Check only this policy (e.g. claude-settings)")
    args = parser.parse_args()

    policies = CHECKS
    if args.policy:
        policies = [p for p in CHECKS if p["name"] == args.policy]
        if not policies:
            print(c(RED, f"  Unknown policy: {args.policy}")); sys.exit(1)

    all_results = []
    for policy in policies:
        all_results.extend(check_policy(args.target, policy))

    passed = sum(1 for r in all_results if r["ok"])
    total  = len(all_results)
    status = "PASS" if passed == total else ("WARN" if passed >= total // 2 else "FAIL")

    if args.json:
        print(json.dumps({"status": status, "passed": passed,
                          "total": total, "checks": all_results}, indent=2))
        return

    print()
    print(c(BOLD, "  yamtam policy check") + c(DIM, f" — {args.target}"))
    print()

    cur_policy = None
    for r in all_results:
        if r["name"] != cur_policy:
            cur_policy = r["name"]
            print(c(CYAN, f"  {cur_policy}") + c(DIM, f"  ({r['file']})"))

        note = f"  {c(DIM, r.get('note',''))}" if r.get("note") else ""
        print(f"    {icon(r['ok'])}  {r['check']}{note}")

    sc = GREEN if status == "PASS" else (YELLOW if status == "WARN" else RED)
    print()
    print(f"  {icon(status=='PASS')} {c(BOLD+sc, status)} — {passed}/{total} checks passed")
    print()

    if status == "FAIL":
        sys.exit(1)


if __name__ == "__main__":
    main()
