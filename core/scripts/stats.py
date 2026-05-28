#!/usr/bin/env python3
"""yamtam stats [target] — audit score trend over time."""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime

REPO_ROOT  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCANNER_PY = os.path.join(REPO_ROOT, "core/scripts/audit_scanner.py")

BOLD   = "\033[1m"; GREEN  = "\033[32m"; YELLOW = "\033[33m"
RED    = "\033[31m"; CYAN   = "\033[36m"; DIM    = "\033[2m"; RESET  = "\033[0m"

RISK_COLOR = {"CRITICAL": RED, "HIGH": RED, "MEDIUM": YELLOW, "LOW": GREEN}

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"

def history_path(target: str) -> str:
    return os.path.join(target, ".yamtam", "history.json")

def load_history(target: str) -> list[dict]:
    path = history_path(target)
    if not os.path.exists(path):
        return []
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return []

def save_history(target: str, history: list[dict]):
    path = history_path(target)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(history[-100:], f, indent=2)  # keep last 100 entries

def run_audit(target: str, extra: list[str]) -> dict | None:
    cmd = [sys.executable, SCANNER_PY, target, "--json"] + extra
    r   = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except Exception:
        return None

def score_bar(score: int, width: int = 20) -> str:
    filled = int(score / 100 * width)
    risk   = "LOW" if score >= 90 else ("MEDIUM" if score >= 70 else ("HIGH" if score >= 40 else "CRITICAL"))
    rc     = RISK_COLOR.get(risk, "")
    bar    = c(rc, "█" * filled) + c(DIM, "░" * (width - filled))
    return f"[{bar}] {c(BOLD+rc, str(score))}"

def trend_arrow(prev: int, curr: int) -> str:
    if curr > prev:   return c(GREEN,  f"▲ +{curr-prev}")
    elif curr < prev: return c(RED,    f"▼ {curr-prev}")
    else:             return c(DIM,    "= 0")

def main():
    parser = argparse.ArgumentParser(
        prog="yamtam stats",
        description="Audit score trend over time",
    )
    parser.add_argument("target",  nargs="?", default=".")
    parser.add_argument("--record", action="store_true",
                        help="Run a new audit and record to history")
    parser.add_argument("--clear",  action="store_true",
                        help="Clear history")
    parser.add_argument("--json",   action="store_true")
    parser.add_argument("--ignore", metavar="ID", action="append", default=[])
    parser.add_argument("--limit",  type=int, default=10,
                        help="Number of history entries to show (default: 10)")

    args = parser.parse_args()

    if args.clear:
        path = history_path(args.target)
        if os.path.exists(path):
            os.remove(path)
            print(c(GREEN, "  ✓ History cleared"))
        else:
            print(c(DIM, "  No history found"))
        return

    history = load_history(args.target)

    # Record new scan
    if args.record:
        extra = []
        for ig in args.ignore:
            extra += ["--ignore", ig]
        if not args.json:
            print(c(DIM, "  Scanning…"), end="", flush=True)
        data = run_audit(args.target, extra)
        if data:
            entry = {
                "ts":       datetime.now().isoformat(timespec="seconds"),
                "score":    data.get("score", 0),
                "risk":     data.get("risk_level", "?"),
                "findings": len(data.get("findings", [])),
                "scanned":  data.get("files_scanned", 0),
            }
            history.append(entry)
            save_history(args.target, history)
            if not args.json:
                print(c(GREEN, " recorded"))

    if args.json:
        print(json.dumps({"target": args.target, "history": history[-args.limit:]}, indent=2))
        return

    print()
    print(c(BOLD, "  yamtam stats") + c(DIM, f" — {os.path.abspath(args.target)}"))
    print()

    if not history:
        print(c(DIM, "  No history yet."))
        print(c(DIM, "  Run: yamtam stats --record  to start tracking"))
        print()
        return

    recent = history[-args.limit:]

    print(f"  {'DATE':<22} {'SCORE BAR':<35} {'RISK':<10} {'TREND'}")
    print(f"  {'─'*75}")

    for i, entry in enumerate(recent):
        ts    = entry.get("ts","")[:16].replace("T"," ")
        score = entry.get("score", 0)
        risk  = entry.get("risk", "?")
        rc    = RISK_COLOR.get(risk, "")
        bar   = score_bar(score, 15)
        prev_score = recent[i-1].get("score", score) if i > 0 else score
        tr    = trend_arrow(prev_score, score) if i > 0 else c(DIM, "  —")
        print(f"  {c(DIM, ts):<22} {bar:<44} {c(rc, risk):<19} {tr}")

    print()

    if len(recent) >= 2:
        first  = recent[0]["score"]
        last   = recent[-1]["score"]
        delta  = last - first
        dc     = GREEN if delta >= 0 else RED
        print(f"  Trend over {len(recent)} scans: {c(BOLD+dc, ('+' if delta>=0 else '')+str(delta))} points")

    best  = max(recent, key=lambda x: x["score"])
    worst = min(recent, key=lambda x: x["score"])
    print(f"  Best:  {score_bar(best['score'],  10)}  on {best['ts'][:10]}")
    print(f"  Worst: {score_bar(worst['score'], 10)}  on {worst['ts'][:10]}")
    print()
    print(c(DIM, "  Run: yamtam stats --record  to add today's scan"))
    print()


if __name__ == "__main__":
    main()
