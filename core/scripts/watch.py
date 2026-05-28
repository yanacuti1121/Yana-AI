#!/usr/bin/env python3
"""yamtam watch [target] — re-audit on file change, show score diff."""

import argparse
import glob
import hashlib
import json
import os
import subprocess
import sys
import time

REPO_ROOT  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCANNER_PY = os.path.join(REPO_ROOT, "core/scripts/audit_scanner.py")

WATCH_PATTERNS = [
    ".claude/settings.json",
    ".mcp.json",
    ".github/workflows/*.yml",
    ".github/workflows/*.yaml",
    "scripts/*.sh",
    "*.sh",
    ".env",
    ".env.*",
    "package.json",
]

BOLD   = "\033[1m"
RED    = "\033[31m"
YELLOW = "\033[33m"
GREEN  = "\033[32m"
CYAN   = "\033[36m"
DIM    = "\033[2m"
RESET  = "\033[0m"

RISK_COLOR = {"CRITICAL": RED, "HIGH": RED, "MEDIUM": YELLOW, "LOW": GREEN}

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


def collect_watch_files(target: str) -> list[str]:
    files = []
    for pattern in WATCH_PATTERNS:
        full = os.path.join(target, pattern)
        files.extend(glob.glob(full, recursive=False))
    return sorted(set(files))


def fingerprint(files: list[str]) -> str:
    h = hashlib.sha256()
    for f in sorted(files):
        try:
            with open(f, "rb") as fh:
                h.update(f.encode())
                h.update(fh.read())
        except OSError:
            pass
    return h.hexdigest()


def run_audit(target: str, extra: list[str]) -> dict | None:
    cmd = [sys.executable, SCANNER_PY, target, "--json"] + extra
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(result.stdout)
    except Exception:
        return None


def format_risk(risk: str, score: int) -> str:
    rc = RISK_COLOR.get(risk, "")
    return c(BOLD + rc, f"{score}/100 {risk}")


def print_diff(prev: dict | None, curr: dict):
    score_now  = curr.get("score", 0)
    risk_now   = curr.get("risk_level", "?")

    if prev is None:
        print(f"  {c(BOLD, 'Initial scan')}  →  {format_risk(risk_now, score_now)}")
        return

    score_prev = prev.get("score", 0)
    risk_prev  = prev.get("risk_level", "?")
    delta      = score_now - score_prev

    if delta == 0 and risk_now == risk_prev:
        print(f"  Score unchanged  {format_risk(risk_now, score_now)}")
        return

    arrow = c(GREEN, f"+{delta}") if delta > 0 else c(RED, str(delta))
    print(f"  {format_risk(risk_prev, score_prev)}  →  {format_risk(risk_now, score_now)}  ({arrow})")

    prev_ids = {f["id"] for f in prev.get("findings", [])}
    curr_ids = {f["id"] for f in curr.get("findings", [])}

    new_findings  = [f for f in curr.get("findings", []) if f["id"] not in prev_ids]
    gone_findings = [f for f in prev.get("findings", []) if f["id"] not in curr_ids]

    for f in new_findings[:5]:
        print(f"    {c(RED, '+')} {f['severity']:<10} {f['id']}  {f.get('file','')}")
    for f in gone_findings[:5]:
        print(f"    {c(GREEN, '-')} {f['severity']:<10} {f['id']}  {f.get('file','')}")


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam watch",
        description="Watch AI agent config files and re-audit on change",
    )
    parser.add_argument("target", nargs="?", default=".", help="Directory to watch (default: .)")
    parser.add_argument("--interval", type=float, default=2.0,
                        help="Poll interval in seconds (default: 2)")
    parser.add_argument("--ignore", metavar="ID", action="append", default=[],
                        help="Suppress a finding ID")
    parser.add_argument("--fail-on", choices=["low","medium","high","critical"], default=None)

    args = parser.parse_args()

    extra = []
    for ig in args.ignore:
        extra += ["--ignore", ig]
    if args.fail_on:
        extra += ["--fail-on", args.fail_on]

    watch_files = collect_watch_files(args.target)

    print()
    print(c(BOLD, "  yamtam watch") + c(DIM, f" — {os.path.abspath(args.target)}"))
    print(c(DIM, f"  Watching {len(watch_files)} files · interval {args.interval}s · Ctrl+C to stop"))
    print()

    if not watch_files:
        print(c(YELLOW, "  No watched files found. Create .claude/settings.json or .mcp.json to start."))

    prev_fp   = None
    prev_data = None

    try:
        while True:
            current_files = collect_watch_files(args.target)
            fp = fingerprint(current_files)

            if fp != prev_fp:
                ts = time.strftime("%H:%M:%S")
                print(f"  {c(DIM, ts)}  change detected — scanning…")

                data = run_audit(args.target, extra)
                if data:
                    print_diff(prev_data, data)
                    prev_data = data
                else:
                    print(c(RED, "  scan failed"))

                prev_fp = fp
                watch_files = current_files

            time.sleep(args.interval)

    except KeyboardInterrupt:
        print()
        print(c(DIM, "  Stopped."))
        if prev_data:
            score = prev_data.get("score", 0)
            risk  = prev_data.get("risk_level", "?")
            print(f"  Final: {format_risk(risk, score)}")
        print()


if __name__ == "__main__":
    main()
