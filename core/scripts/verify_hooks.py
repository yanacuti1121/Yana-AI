#!/usr/bin/env python3
"""yamtam verify [target] — verify all hooks are wired and active."""

import argparse
import json
import os
import stat
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BOLD   = "\033[1m"; GREEN  = "\033[32m"; YELLOW = "\033[33m"
RED    = "\033[31m"; CYAN   = "\033[36m"; DIM    = "\033[2m"; RESET  = "\033[0m"

EXPECTED_HOOKS = [
    ("guard-destructive.sh",      "PreToolUse",  "L5 — blocks rm -rf, DROP TABLE"),
    ("truth-gate-guard.sh",       "Stop",        "L3 — blocks unsupported completion claims"),
    ("prompt-injection-guard.sh", "PreToolUse",  "L3.5 — blocks jailbreak attempts"),
    ("scope-guard.sh",            "PreToolUse",  "L1 — warns on cross-scope writes"),
    ("token-scope-guard.sh",      "PreToolUse",  "L1 — warns on secret/env access"),
    ("deploy-gate.sh",            "PreToolUse",  "L4 — blocks gh/kubectl/docker"),
    ("supply-chain-guard.sh",     "PreToolUse",  "L4.5 — blocks pipe-to-shell"),
    ("audit-log.sh",              "PostToolUse", "L0 — logs every tool call"),
]

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"

def icon(ok): return c(GREEN, "✓") if ok else c(RED, "✗")


def check_settings(target: str) -> tuple[dict | None, list[str]]:
    path = os.path.join(target, ".claude", "settings.json")
    if not os.path.exists(path):
        return None, []
    try:
        with open(path) as f:
            data = json.load(f)
        hooks = data.get("hooks", [])
        wired = []
        for h in hooks:
            for match in h.get("hooks", []):
                cmd = match.get("command", "")
                wired.append(cmd)
        return data, wired
    except Exception:
        return None, []


def check_hook_file(target: str, hook_name: str) -> tuple[bool, bool]:
    """Returns (exists, executable)."""
    for base in [
        os.path.join(target, ".claude", "hooks"),
        os.path.join(REPO_ROOT, "core", "hooks"),
    ]:
        path = os.path.join(base, hook_name)
        if os.path.exists(path):
            exe = bool(os.stat(path).st_mode & stat.S_IXUSR)
            return True, exe
    return False, False


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam verify",
        description="Verify all safety hooks are wired and active",
    )
    parser.add_argument("target", nargs="?", default=".",
                        help="Project directory (default: .)")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--fix",  action="store_true",
                        help="Install missing hooks (yamtam guard install all)")
    args = parser.parse_args()

    target = args.target
    settings_data, wired_commands = check_settings(target)

    results = []
    for hook_name, event, desc in EXPECTED_HOOKS:
        exists, executable = check_hook_file(target, hook_name)
        in_settings = any(hook_name in cmd for cmd in wired_commands)
        results.append({
            "hook": hook_name, "event": event, "desc": desc,
            "exists": exists, "executable": executable,
            "wired": in_settings,
            "ok": exists and in_settings,
        })

    passed = sum(1 for r in results if r["ok"])
    total  = len(results)
    status = "PASS" if passed == total else ("WARN" if passed >= total // 2 else "FAIL")

    if args.json:
        print(json.dumps({"status": status, "passed": passed,
                          "total": total, "hooks": results}, indent=2))
        return

    print()
    print(c(BOLD, "  yamtam verify — hook wiring check"))
    print(c(DIM,  f"  Target: {os.path.abspath(target)}"))
    print()

    sc = {GREEN: GREEN, "PASS": GREEN, "WARN": YELLOW, "FAIL": RED}.get(status, RED)
    if status == "PASS":
        sc = GREEN
    elif status == "WARN":
        sc = YELLOW
    else:
        sc = RED

    if settings_data is None:
        print(c(YELLOW, "  ! .claude/settings.json not found — hooks may not be active"))
        print(c(DIM,    "    Run: yamtam install . or yamtam guard install all"))
        print()

    print(f"  {'HOOK':<35} {'EXISTS':<8} {'WIRED':<8} {'DESCRIPTION'}")
    print(f"  {'─'*80}")

    for r in results:
        e_icon = icon(r["exists"])
        w_icon = icon(r["wired"])
        row_c  = "" if r["ok"] else YELLOW
        print(f"  {c(row_c, r['hook']):<44} {e_icon:<12} {w_icon:<12} {c(DIM, r['desc'])}")

    print()
    sc_code = GREEN if status == "PASS" else (YELLOW if status == "WARN" else RED)
    print(f"  {icon(status=='PASS')} {c(BOLD+sc_code, status)} — {passed}/{total} hooks verified")
    print()

    if status != "PASS":
        if args.fix:
            print(c(CYAN, "  Running: yamtam guard install all…"))
            guard_py = os.path.join(REPO_ROOT, "core/scripts/guard_installer.py")
            subprocess.run([sys.executable, guard_py, "install", "all",
                            "--target", target], check=False)
            print()
        else:
            print(c(DIM, "  Fix: yamtam guard install all  or  yamtam verify --fix"))
            print()

    if status == "FAIL":
        sys.exit(1)


if __name__ == "__main__":
    main()
