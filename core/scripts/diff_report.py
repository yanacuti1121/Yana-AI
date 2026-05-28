#!/usr/bin/env python3
"""yamtam diff-report <before.json> <after.json> — compare two audit runs."""

import argparse
import json
import os
import sys

BOLD   = "\033[1m"; RED    = "\033[31m"; YELLOW = "\033[33m"
GREEN  = "\033[32m"; CYAN   = "\033[36m"; DIM    = "\033[2m"; RESET  = "\033[0m"
RISK_COLOR = {"CRITICAL": RED, "HIGH": RED, "MEDIUM": YELLOW, "LOW": GREEN}

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"

def fmt_risk(score, risk):
    rc = RISK_COLOR.get(risk, "")
    return c(BOLD + rc, f"{score}/100 {risk}")


def load(path: str) -> dict:
    try:
        with open(path) as f:
            return json.load(f)
    except Exception as e:
        print(c(RED, f"Error loading {path}: {e}"), file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam diff-report",
        description="Compare two audit JSON runs — show what changed",
    )
    parser.add_argument("before", help="Before audit JSON file")
    parser.add_argument("after",  help="After audit JSON file")
    parser.add_argument("--json", dest="as_json", action="store_true")

    args = parser.parse_args()

    before = load(args.before)
    after  = load(args.after)

    score_b, risk_b = before.get("score", 0), before.get("risk_level", "?")
    score_a, risk_a = after.get("score",  0), after.get("risk_level", "?")
    delta = score_a - score_b

    findings_b = {f["id"] + "|" + f.get("file","") for f in before.get("findings", [])}
    findings_a = {f["id"] + "|" + f.get("file","") for f in after.get("findings",  [])}

    new_keys  = findings_a - findings_b
    gone_keys = findings_b - findings_a
    same_keys = findings_a & findings_b

    new_findings  = [f for f in after.get("findings",  []) if f["id"]+"|"+f.get("file","") in new_keys]
    gone_findings = [f for f in before.get("findings", []) if f["id"]+"|"+f.get("file","") in gone_keys]

    if args.as_json:
        print(json.dumps({
            "before": {"score": score_b, "risk": risk_b},
            "after":  {"score": score_a, "risk": risk_a},
            "delta":  delta,
            "new_findings":  len(new_findings),
            "gone_findings": len(gone_findings),
            "unchanged":     len(same_keys),
            "new":  [{"id": f["id"], "severity": f["severity"], "file": f.get("file","")} for f in new_findings],
            "gone": [{"id": f["id"], "severity": f["severity"], "file": f.get("file","")} for f in gone_findings],
        }, indent=2))
        return

    print()
    print(c(BOLD, "  YAMTAM Diff Report"))
    print(c(DIM, f"  {os.path.basename(args.before)}  →  {os.path.basename(args.after)}"))
    print()

    arrow = c(GREEN, f"▲ +{delta}") if delta > 0 else (c(RED, f"▼ {delta}") if delta < 0 else c(DIM, "= 0"))
    print(f"  {fmt_risk(score_b, risk_b)}  →  {fmt_risk(score_a, risk_a)}  ({arrow})")
    print()

    if new_findings:
        print(c(RED, f"  New findings ({len(new_findings)})"))
        for f in sorted(new_findings, key=lambda x: x["severity"]):
            rc = RISK_COLOR.get(f["severity"], "")
            print(f"    {c(rc, '+  ' + f['severity'][:4]):<20} {f['id']}  {f.get('file','')}")
        print()

    if gone_findings:
        print(c(GREEN, f"  Resolved findings ({len(gone_findings)})"))
        for f in sorted(gone_findings, key=lambda x: x["severity"]):
            print(f"    {c(GREEN, '-  ') + f['severity'][:4]:<20} {f['id']}  {f.get('file','')}")
        print()

    if not new_findings and not gone_findings:
        print(c(DIM, "  No change in findings."))
        print()

    print(c(DIM, f"  Unchanged: {len(same_keys)} findings"))
    print()

    if delta < 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
