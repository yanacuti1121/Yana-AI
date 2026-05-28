#!/usr/bin/env python3
"""yamtam score [target] [--explain] — score breakdown with deduction trail."""

import argparse
import json
import os
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCANNER_PY = os.path.join(REPO_ROOT, "core/scripts/audit_scanner.py")

BOLD   = "\033[1m"
RED    = "\033[31m"
YELLOW = "\033[33m"
GREEN  = "\033[32m"
DIM    = "\033[2m"
RESET  = "\033[0m"

SEV_DEDUCT = {"CRITICAL": 30, "HIGH": 20, "MED": 10, "MEDIUM": 10, "LOW": 3}
SEV_COLOR  = {"CRITICAL": RED, "HIGH": RED, "MED": YELLOW, "MEDIUM": YELLOW, "LOW": ""}
RISK_COLOR = {"CRITICAL": RED, "HIGH": RED, "MEDIUM": YELLOW, "LOW": GREEN}

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


def run_audit_json(target: str, extra_args: list[str]) -> dict:
    cmd = [sys.executable, SCANNER_PY, target, "--json"] + extra_args
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        print(c(RED, f"Error: could not parse audit output"), file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(3)


def print_score(data: dict, explain: bool):
    findings = data.get("findings", [])
    score    = data.get("score", 100)
    risk     = data.get("risk_level", "LOW")
    target   = data.get("target", ".")
    scanned  = data.get("files_scanned", 0)

    rc = RISK_COLOR.get(risk, "")

    print()
    print(c(BOLD, "  YAMTAM Score Report"))
    print(c(DIM,  f"  Target: {target}  ·  {scanned} files scanned"))
    print()

    if explain:
        print(c(BOLD, "  Score Breakdown"))
        print(f"  {'Start':.<40} {c(BOLD, '100')}")
        print()

        deductions = []
        running = 100
        for f in findings:
            sev = f.get("severity", "LOW").upper()
            d   = SEV_DEDUCT.get(sev, 0)
            if d > 0:
                running -= d
                deductions.append({
                    "sev": sev, "deduct": d, "id": f.get("id","?"),
                    "file": f.get("file","?"), "desc": f.get("description",""),
                    "running": running,
                })

        if not deductions:
            print(c(DIM, "  No deductions — clean repo"))
        else:
            for item in deductions:
                sev_c = SEV_COLOR.get(item["sev"], "")
                label = f"{c(sev_c, item['sev']):<22} {item['id']}"
                desc  = item["desc"][:45] + ("…" if len(item["desc"]) > 45 else "")
                print(f"  {c(RED, '-' + str(item['deduct'])):<12} {label}  {c(DIM, desc)}")

        print()
        print(f"  {'─' * 55}")
        print(f"  {'Final':.<40} {c(BOLD + rc, str(score) + '/100')}  {c(rc, risk)}")

    else:
        # compact
        summ = data.get("summary", {})
        crit = summ.get("critical", 0)
        high = summ.get("high", 0)
        med  = summ.get("medium", 0)
        low  = summ.get("low", 0)

        print(f"  Score:    {c(BOLD + rc, str(score) + ' / 100')}")
        print(f"  Risk:     {c(BOLD + rc, risk)}")
        print()
        print(f"  Findings: {c(RED, str(crit) + ' critical')}  "
              f"{c(RED, str(high) + ' high')}  "
              f"{c(YELLOW, str(med) + ' medium')}  "
              f"{str(low) + ' low'}")
        print()
        print(c(DIM, "  Run with --explain for full deduction breakdown."))

    print()


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam score",
        description="Show audit score and optional deduction breakdown",
    )
    parser.add_argument("target", nargs="?", default=".", help="Directory to score (default: .)")
    parser.add_argument("--explain", action="store_true", help="Show every deduction step")
    parser.add_argument("--ignore", metavar="ID", action="append", default=[],
                        help="Suppress a finding ID (repeatable)")
    parser.add_argument("--diff", default="", help="Diff mode — only changed files")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")

    args = parser.parse_args()

    extra = []
    for ig in args.ignore:
        extra += ["--ignore", ig]
    if args.diff:
        extra += ["--diff", args.diff]

    data = run_audit_json(args.target, extra)

    if args.json:
        print(json.dumps({
            "score":     data.get("score"),
            "risk":      data.get("risk_level"),
            "breakdown": [
                {"severity": f["severity"], "id": f["id"],
                 "deduction": SEV_DEDUCT.get(f["severity"].upper(), 0)}
                for f in data.get("findings", [])
                if SEV_DEDUCT.get(f["severity"].upper(), 0) > 0
            ],
        }, indent=2))
        return

    print_score(data, args.explain)


if __name__ == "__main__":
    main()
