"""CLI: trace-audit <file.jsonl | dir> [--json] [--fail-on {low,med,high}]

Exit codes: 0 clean / below threshold · 1 findings at or above --fail-on ·
3 input error.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .checks import run_all
from .parser import build_model
from .report import render_json, render_terminal

RANK = {"LOW": 0, "MED": 1, "HIGH": 2}


def _collect(path: Path):
    if path.is_dir():
        files = sorted(path.rglob("*.jsonl"))
        if not files:
            raise FileNotFoundError(f"no .jsonl files under {path}")
        return files
    if not path.exists():
        raise FileNotFoundError(path)
    return [path]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        prog="trace-audit",
        description="Audit a Claude Code session log: did the agent do what it claims?",
    )
    ap.add_argument("path", help="session .jsonl file, or a directory of them")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--fail-on", choices=["low", "med", "high"],
                    help="exit 1 if any finding at/above this severity")
    args = ap.parse_args(argv)

    try:
        files = _collect(Path(args.path))
    except FileNotFoundError as e:
        print(f"trace-audit: {e}", file=sys.stderr)
        return 3

    worst = -1
    outputs = []
    for f in files:
        model = build_model(f)
        findings = run_all(model)
        outputs.append(render_json(str(f), findings) if args.json
                       else render_terminal(str(f), findings))
        for fd in findings:
            worst = max(worst, RANK.get(fd.severity, 0))

    sep = "\n" if args.json else "\n\n"
    print(sep.join(outputs))

    if args.fail_on is not None and worst >= RANK[args.fail_on.upper()]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
