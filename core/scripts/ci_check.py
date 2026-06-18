#!/usr/bin/env python3
"""yana-ai ci-check [target] — CI/CD pipeline health check."""

import argparse
import glob
import json
import os
import re
import sys

BOLD   = "\033[1m"; RED    = "\033[31m"; YELLOW = "\033[33m"
GREEN  = "\033[32m"; CYAN   = "\033[36m"; DIM    = "\033[2m"; RESET  = "\033[0m"

def no_color():
    return os.environ.get("YANA_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


# ── Checks ─────────────────────────────────────────────────────────────────

def check_workflows(target: str) -> list[dict]:
    wf_dir = os.path.join(target, ".github", "workflows")
    results = []

    if not os.path.exists(wf_dir):
        results.append({"id": "CI-SETUP-001", "level": "WARN",
                         "msg": "No .github/workflows/ directory found",
                         "fix": "Add yana-ai-audit.yml CI workflow"})
        return results

    wf_files = sorted(glob.glob(os.path.join(wf_dir, "*.yml")) +
                      glob.glob(os.path.join(wf_dir, "*.yaml")))

    if not wf_files:
        results.append({"id": "CI-SETUP-002", "level": "WARN",
                         "msg": "No workflow files found in .github/workflows/",
                         "fix": "Add at least one CI workflow"})
        return results

    has_yana_ai_audit = False

    for wf_path in wf_files:
        name = os.path.basename(wf_path)
        try:
            with open(wf_path) as f:
                content = f.read()
        except OSError:
            continue

        # Check: yana-ai audit present
        if "yana-ai" in content and "audit" in content:
            has_yana_ai_audit = True

        # Check: permissions block
        if "permissions:" not in content:
            results.append({"id": "CI-PERM-001", "level": "WARN",
                             "file": name,
                             "msg": f"{name}: no permissions block — inherits max token permissions",
                             "fix": "Add 'permissions: contents: read' at workflow level"})

        # Check: pinned action SHAs
        unpinned = re.findall(r'uses:\s+([^\s@]+@(?![\da-f]{40})[^\s]+)', content)
        if unpinned:
            results.append({"id": "CI-PIN-001", "level": "WARN",
                             "file": name,
                             "msg": f"{name}: {len(unpinned)} unpinned action(s): {', '.join(unpinned[:3])}",
                             "fix": "Pin actions to full commit SHA"})

        # Check: timeout
        if "timeout-minutes:" not in content:
            results.append({"id": "CI-TIMEOUT-001", "level": "INFO",
                             "file": name,
                             "msg": f"{name}: no timeout-minutes — runaway jobs waste credits",
                             "fix": "Add timeout-minutes: 30 to each job"})

        # Check: auto-merge
        if re.search(r'auto.merge|automerge', content, re.IGNORECASE):
            results.append({"id": "CI-GATE-001", "level": "FAIL",
                             "file": name,
                             "msg": f"{name}: auto-merge enabled — no human approval gate",
                             "fix": "Remove auto-merge or add required reviewers gate"})

        # Check: pull_request_target with write access
        if "pull_request_target" in content and re.search(r'contents:\s*write', content):
            results.append({"id": "CI-GATE-002", "level": "FAIL",
                             "file": name,
                             "msg": f"{name}: pull_request_target + write access — fork exfiltration risk",
                             "fix": "Use pull_request trigger instead, or remove write permissions"})

        # Check: secrets in env without masking
        if re.search(r'env:.*\n.*\$\{\{\s*secrets\.\w+\s*\}\}', content):
            results.append({"id": "CI-SECRET-001", "level": "WARN",
                             "file": name,
                             "msg": f"{name}: secret passed via env — ensure not echoed in logs",
                             "fix": "Never echo env vars containing secrets"})

        # Check: fail-on flag for any audit step
        if "yana-ai" in content and "fail-on" not in content and "fail_on" not in content:
            results.append({"id": "CI-AUDIT-001", "level": "WARN",
                             "file": name,
                             "msg": f"{name}: yana-ai used but --fail-on not set — audit won't gate the build",
                             "fix": "Add --fail-on high to yana-ai audit step"})

    if not has_yana_ai_audit:
        results.append({"id": "CI-AUDIT-002", "level": "WARN",
                         "msg": "No yana-ai audit step found in any workflow",
                         "fix": "Copy .github/workflows/yana-ai-audit.yml into your repo"})

    return results


def check_branch_protection_hints(target: str) -> list[dict]:
    """Heuristic hints — can't read actual GitHub branch protection via CLI."""
    results = []
    pr_wf = os.path.join(target, ".github", "workflows")
    if os.path.exists(pr_wf):
        has_status_check = False
        for wf_path in glob.glob(os.path.join(pr_wf, "*.yml")):
            try:
                with open(wf_path) as f:
                    content = f.read()
                if "required_status_checks" in content or "status_check" in content:
                    has_status_check = True
            except OSError:
                pass
        if not has_status_check:
            results.append({"id": "CI-BRANCH-001", "level": "INFO",
                             "msg": "No required status checks configured (check GitHub branch protection settings)",
                             "fix": "Enable branch protection: require status checks before merging"})
    return results


# ── Scoring ────────────────────────────────────────────────────────────────

LEVEL_ORDER = {"FAIL": 0, "WARN": 1, "INFO": 2, "PASS": 3}
LEVEL_COLOR = {"FAIL": RED, "WARN": YELLOW, "INFO": CYAN, "PASS": GREEN}
LEVEL_ICON  = {"FAIL": "✗", "WARN": "!", "INFO": "·", "PASS": "✓"}


def overall(results: list[dict]) -> str:
    for lvl in ("FAIL", "WARN", "INFO"):
        if any(r["level"] == lvl for r in results):
            return lvl
    return "PASS"


def print_report(target: str, results: list[dict], as_json: bool):
    status = overall(results)

    if as_json:
        print(json.dumps({"target": target, "status": status, "checks": results}, indent=2))
        return

    sc = LEVEL_COLOR.get(status, "")
    print()
    print(c(BOLD, "  Yana AI CI Health Check"))
    print(c(DIM,  f"  Target: {os.path.abspath(target)}"))
    print()
    print(f"  Status: {c(BOLD + sc, status)}")
    print()

    if not results:
        print(c(GREEN, "  ✓ All CI checks passed"))
    else:
        counts = {"FAIL": 0, "WARN": 0, "INFO": 0}
        for r in sorted(results, key=lambda x: LEVEL_ORDER.get(x["level"], 9)):
            lvl  = r["level"]
            lc   = LEVEL_COLOR.get(lvl, "")
            icon = LEVEL_ICON.get(lvl, "?")
            counts[lvl] = counts.get(lvl, 0) + 1
            print(f"  {c(lc, icon)}  {c(BOLD, r['id']):<22} {r['msg']}")
            print(c(DIM,  f"       Fix: {r['fix']}"))
            print()

        summary_parts = []
        if counts.get("FAIL"):  summary_parts.append(c(RED,    f"{counts['FAIL']} fail"))
        if counts.get("WARN"):  summary_parts.append(c(YELLOW, f"{counts['WARN']} warn"))
        if counts.get("INFO"):  summary_parts.append(c(CYAN,   f"{counts['INFO']} info"))
        print(f"  Summary: {' · '.join(summary_parts)}")

    print()


def main():
    parser = argparse.ArgumentParser(
        prog="yana-ai ci-check",
        description="CI/CD pipeline health check — missing gates, weak permissions",
    )
    parser.add_argument("target", nargs="?", default=".",
                        help="Project directory (default: .)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--fail-on", choices=["fail", "warn", "info"], default="fail",
                        help="Exit non-zero on this level+ (default: fail)")

    args = parser.parse_args()

    results  = check_workflows(args.target)
    results += check_branch_protection_hints(args.target)

    print_report(args.target, results, args.json)

    status    = overall(results)
    threshold = LEVEL_ORDER.get(args.fail_on.upper(), 0)
    actual    = LEVEL_ORDER.get(status, 3)

    if actual <= threshold:
        sys.exit(1)


if __name__ == "__main__":
    main()
