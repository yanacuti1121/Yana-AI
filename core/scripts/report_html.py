#!/usr/bin/env python3
"""yana-ai report html [target] — export audit as standalone HTML."""

import argparse
import html
import json
import os
import subprocess
import sys
from datetime import datetime

REPO_ROOT  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCANNER_PY = os.path.join(REPO_ROOT, "core/scripts/audit_scanner.py")

BOLD = "\033[1m"; GREEN = "\033[32m"; DIM = "\033[2m"; RED = "\033[31m"; RESET = "\033[0m"

SEV_COLOR = {"CRITICAL": "#ef4444", "HIGH": "#ef4444", "MED": "#f59e0b",
             "MEDIUM": "#f59e0b", "LOW": "#6b7280"}
SEV_BG    = {"CRITICAL": "#fef2f2", "HIGH": "#fef2f2", "MED": "#fffbeb",
             "MEDIUM": "#fffbeb", "LOW": "#f9fafb"}
RISK_COLOR = {"CRITICAL": "#7f1d1d", "HIGH": "#ef4444", "MEDIUM": "#f59e0b", "LOW": "#22c55e"}

def no_color():
    return os.environ.get("YANA_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


def run_audit(target: str, extra: list[str]) -> dict:
    cmd = [sys.executable, SCANNER_PY, target, "--json"] + extra
    r = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except Exception:
        print(c(RED, "Error: could not parse audit output"), file=sys.stderr)
        sys.exit(3)


def score_bar(score: int, risk: str) -> str:
    color = RISK_COLOR.get(risk, "#6b7280")
    width = max(score, 2)
    return f'<div style="background:#e5e7eb;border-radius:4px;height:8px;margin:8px 0"><div style="width:{width}%;background:{color};height:8px;border-radius:4px;transition:width 0.3s"></div></div>'


def finding_row(f: dict) -> str:
    sev   = f.get("severity", "LOW").upper()
    color = SEV_COLOR.get(sev, "#6b7280")
    bg    = SEV_BG.get(sev, "#f9fafb")
    fid   = html.escape(f.get("id", "?"))
    file_ = f.get("file", "")
    line  = f.get("line", "")
    # owasp-llm-output-law.md: escape all scanned-repo-derived values before HTML insertion
    desc  = html.escape(f.get("description", ""))
    fix   = html.escape(f.get("fix", ""))
    loc   = html.escape(f"{file_}:{line}" if line else file_)

    return f"""
    <div class="finding" style="border-left:4px solid {color};background:{bg};padding:12px 16px;margin:8px 0;border-radius:0 4px 4px 0">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="background:{color};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:3px">{sev}</span>
        <strong style="color:#111">{fid}</strong>
        <span style="color:#6b7280;font-size:12px">{loc}</span>
      </div>
      <div style="color:#374151;font-size:14px">{desc}</div>
      {f'<div style="color:#6b7280;font-size:12px;margin-top:4px">→ {fix}</div>' if fix else ''}
    </div>"""


def build_html(data: dict, target: str) -> str:
    score    = data.get("score", 0)
    risk     = data.get("risk_level", "LOW")
    findings = data.get("findings", [])
    scanned  = data.get("files_scanned", 0)
    ts       = datetime.now().strftime("%Y-%m-%d %H:%M")
    rc       = RISK_COLOR.get(risk, "#6b7280")

    findings_html = "".join(finding_row(f) for f in findings) if findings else \
        '<p style="color:#22c55e;text-align:center;padding:32px">✓ No findings</p>'

    by_sev = {}
    for f in findings:
        s = f.get("severity","LOW").upper()
        by_sev[s] = by_sev.get(s, 0) + 1

    summary_chips = " ".join(
        f'<span style="background:{SEV_COLOR.get(s,"#999")};color:#fff;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600">{n} {s.lower()}</span>'
        for s, n in [("CRITICAL", by_sev.get("CRITICAL",0)),
                     ("HIGH",     by_sev.get("HIGH",0)),
                     ("MEDIUM",   by_sev.get("MEDIUM", by_sev.get("MED",0))),
                     ("LOW",      by_sev.get("LOW",0))]
        if n > 0
    ) or '<span style="color:#22c55e;font-weight:600">✓ Clean</span>'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Yana AI Audit Report — {html.escape(os.path.basename(target))}</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;background:#f8fafc;color:#1e293b;padding:24px}}
  .card{{background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:24px;max-width:900px;margin:0 auto}}
  h1{{font-size:20px;font-weight:700;margin-bottom:4px}}
  .meta{{color:#6b7280;font-size:13px;margin-bottom:20px}}
  .score-num{{font-size:48px;font-weight:800;color:{rc};line-height:1}}
  .risk-badge{{display:inline-block;background:{rc};color:#fff;padding:4px 14px;border-radius:20px;font-weight:700;font-size:14px;margin-left:12px;vertical-align:middle}}
  .section-title{{font-size:14px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin:20px 0 8px}}
  .stats{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}}
  .stat{{background:#f8fafc;border-radius:6px;padding:12px;text-align:center}}
  .stat-n{{font-size:24px;font-weight:700;color:#1e293b}}
  .stat-l{{font-size:11px;color:#6b7280;margin-top:2px}}
  footer{{text-align:center;color:#9ca3af;font-size:11px;margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb}}
</style>
</head>
<body>
<div class="card">
  <h1>Yana AI Agent Audit Report</h1>
  <div class="meta">Target: {html.escape(os.path.abspath(target))} · {scanned} files scanned · {ts}</div>

  <div style="display:flex;align-items:center;margin-bottom:8px">
    <div class="score-num">{score}</div>
    <div style="margin-left:8px;color:#6b7280;font-size:14px">/ 100</div>
    <div class="risk-badge">{risk}</div>
  </div>
  {score_bar(score, risk)}

  <div style="margin:12px 0">{summary_chips}</div>

  <div class="stats">
    <div class="stat"><div class="stat-n">{scanned}</div><div class="stat-l">Files scanned</div></div>
    <div class="stat"><div class="stat-n">{len(findings)}</div><div class="stat-l">Findings</div></div>
    <div class="stat"><div class="stat-n">{score}</div><div class="stat-l">Score / 100</div></div>
  </div>

  <div class="section-title">Findings</div>
  {findings_html}

  <footer>
    Generated by Yana AI v0.9.0 · <a href="https://github.com/yanacuti1121/yana-ai" style="color:#6b7280">yana-ai</a>
  </footer>
</div>
</body>
</html>"""


def main():
    parser = argparse.ArgumentParser(
        prog="yana-ai report html",
        description="Export audit report as standalone HTML",
    )
    parser.add_argument("target",  nargs="?", default=".", help="Directory to audit (default: .)")
    parser.add_argument("--out",   default="yana-ai-report.html", help="Output file (default: yana-ai-report.html)")
    parser.add_argument("--open",  action="store_true", help="Open in browser after generating")
    parser.add_argument("--ignore", metavar="ID", action="append", default=[])
    parser.add_argument("--diff",  default="")
    parser.add_argument("--fail-on", choices=["low","medium","high","critical"], default=None)

    args = parser.parse_args()

    extra = []
    for ig in args.ignore:
        extra += ["--ignore", ig]
    if args.diff:
        extra += ["--diff", args.diff]

    print()
    print(f"  Scanning {c(BOLD, args.target)}…")
    data = run_audit(args.target, extra)

    html = build_html(data, args.target)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(html)

    score = data.get("score", 0)
    risk  = data.get("risk_level", "?")
    print(f"  Score: {score}/100  {risk}")
    print(f"  {c(GREEN, '✓')} Report written: {c(BOLD, args.out)}")

    if args.open:
        import webbrowser
        webbrowser.open(f"file://{os.path.abspath(args.out)}")

    print()

    if args.fail_on:
        order = {"low":0,"medium":1,"high":2,"critical":3}
        thr = order.get(args.fail_on, 99)
        for f in data.get("findings", []):
            if order.get(f["severity"].lower(), 99) >= thr:
                sys.exit(1)


if __name__ == "__main__":
    main()
