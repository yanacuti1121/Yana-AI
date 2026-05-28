#!/usr/bin/env python3
"""yamtam badge [target] — generate shields.io badge for README."""

import argparse
import json
import os
import subprocess
import sys
from urllib.parse import quote

REPO_ROOT  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCANNER_PY = os.path.join(REPO_ROOT, "core/scripts/audit_scanner.py")

RISK_COLOR = {
    "LOW":      "22c55e",  # green
    "MEDIUM":   "f59e0b",  # amber
    "HIGH":     "ef4444",  # red
    "CRITICAL": "7f1d1d",  # dark red
}

BOLD  = "\033[1m"
DIM   = "\033[2m"
CYAN  = "\033[36m"
RESET = "\033[0m"

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


def run_audit_json(target: str, extra: list[str]) -> dict:
    cmd = [sys.executable, SCANNER_PY, target, "--json"] + extra
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        print("Error: could not parse audit output", file=sys.stderr)
        sys.exit(3)


def make_badge_url(score: int, risk: str, style: str = "for-the-badge") -> str:
    color  = RISK_COLOR.get(risk, "gray")
    label  = quote("yamtam audit")
    msg    = quote(f"{score}/100 {risk}")
    return f"https://img.shields.io/badge/{label}-{msg}-{color}?style={style}"


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam badge",
        description="Generate shields.io audit badge for README",
    )
    parser.add_argument("target", nargs="?", default=".", help="Directory to score (default: .)")
    parser.add_argument("--style", default="for-the-badge",
                        choices=["for-the-badge", "flat", "flat-square", "plastic"],
                        help="Badge style (default: for-the-badge)")
    parser.add_argument("--ignore", metavar="ID", action="append", default=[],
                        help="Suppress a finding ID")
    parser.add_argument("--url-only", action="store_true", help="Print badge URL only")
    parser.add_argument("--json", dest="as_json", action="store_true", help="Output JSON")

    args = parser.parse_args()

    extra = []
    for ig in args.ignore:
        extra += ["--ignore", ig]

    data  = run_audit_json(args.target, extra)
    score = data.get("score", 0)
    risk  = data.get("risk_level", "UNKNOWN")
    url   = make_badge_url(score, risk, args.style)
    md    = f"[![YAMTAM Audit]({url})](https://github.com/phamlongh230-lgtm/yamtam-engine)"

    if args.as_json:
        print(json.dumps({"score": score, "risk": risk, "badge_url": url, "markdown": md}))
        return

    if args.url_only:
        print(url)
        return

    print()
    print(c(BOLD, "  YAMTAM Badge"))
    print()
    print(f"  Score:  {score}/100  {risk}")
    print()
    print(c(BOLD, "  Badge URL"))
    print(f"  {c(CYAN, url)}")
    print()
    print(c(BOLD, "  Markdown (paste into README)"))
    print(f"  {md}")
    print()
    print(c(DIM, "  Tip: re-run after each push to update the score in your badge URL."))
    print()


if __name__ == "__main__":
    main()
