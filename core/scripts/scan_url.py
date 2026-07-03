#!/usr/bin/env python3
"""yana-ai scan-url <url> — scan a GitHub repo URL without cloning permanently."""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

REPO_ROOT  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCANNER_PY = os.path.join(REPO_ROOT, "core/scripts/audit_scanner.py")
REPORT_PY  = os.path.join(REPO_ROOT, "core/scripts/report_html.py")

BOLD  = "\033[1m"; GREEN = "\033[32m"; YELLOW = "\033[33m"
RED   = "\033[31m"; CYAN  = "\033[36m"; DIM   = "\033[2m"; RESET = "\033[0m"
RISK_COLOR = {"CRITICAL": RED, "HIGH": RED, "MEDIUM": YELLOW, "LOW": GREEN}

def no_color():
    return os.environ.get("YANA_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


def parse_github_url(url: str) -> tuple[str, str]:
    """Return (clone_url, short_name) from a GitHub URL."""
    # https://github.com/owner/repo  or  git@github.com:owner/repo.git
    m = re.match(r'https?://github\.com/([^/]+/[^/\s]+?)(?:\.git)?/?$', url)
    if m:
        slug = m.group(1)
        return f"https://github.com/{slug}.git", slug.replace("/", "-")
    m2 = re.match(r'git@github\.com:([^/]+/[^/\s]+?)(?:\.git)?$', url)
    if m2:
        slug = m2.group(1)
        return f"https://github.com/{slug}.git", slug.replace("/", "-")
    # network-egress-law.md: reject non-github.com URLs — arbitrary hosts allow
    # SSRF via git:// / file:// / ssh:// schemes and internal-network access.
    raise ValueError(
        f"Unsupported URL: {url!r}\n"
        "Only https://github.com/owner/repo or git@github.com:owner/repo are accepted."
    )


def main():
    parser = argparse.ArgumentParser(
        prog="yana-ai scan-url",
        description="Scan a GitHub repo URL for AI agent risks",
    )
    parser.add_argument("url", help="GitHub repo URL (https://github.com/owner/repo)")
    parser.add_argument("--fail-on",  choices=["low","medium","high","critical"], default=None)
    parser.add_argument("--json",     action="store_true", help="Output as JSON")
    parser.add_argument("--html",     default="", help="Write HTML report to file")
    parser.add_argument("--markdown", default="", help="Write Markdown report to file")
    parser.add_argument("--ignore",   metavar="ID", action="append", default=[])
    parser.add_argument("--branch",   default="", help="Branch to clone (default: default branch)")

    args = parser.parse_args()

    clone_url, name = parse_github_url(args.url)

    if not args.json:
        print()
        print(c(BOLD, f"  yana-ai scan"))
        print(c(DIM,  f"  {clone_url}"))
        print()

    with tempfile.TemporaryDirectory(prefix="yana-ai-scan-") as tmpdir:
        clone_path = os.path.join(tmpdir, name)

        # Clone
        if not args.json:
            print(f"  Cloning…", end="", flush=True)

        clone_cmd = ["git", "clone", "--depth", "1"]
        if args.branch:
            clone_cmd += ["--branch", args.branch]
        clone_cmd += [clone_url, clone_path]

        r = subprocess.run(clone_cmd, capture_output=True, text=True)
        if r.returncode != 0:
            if not args.json:
                print()
                print(c(RED, f"  ✗ Clone failed: {r.stderr[:300]}"))
                print()
            sys.exit(1)

        if not args.json:
            print(c(GREEN, " done"))
            print(f"  Scanning {c(CYAN, clone_url)}…")

        # Build scanner args
        extra = []
        for ig in args.ignore:
            extra += ["--ignore", ig]
        if args.fail_on:
            extra += ["--fail-on", args.fail_on]

        # Audit
        audit_cmd = [sys.executable, SCANNER_PY, clone_path, "--json"] + extra
        audit_result = subprocess.run(audit_cmd, capture_output=True, text=True)

        try:
            data = json.loads(audit_result.stdout)
        except Exception:
            if not args.json:
                print(c(RED, "  ✗ Scanner error"))
            sys.exit(3)

        # Patch target path back to URL
        data["target"] = clone_url

        if args.json:
            print(json.dumps(data, indent=2))
        else:
            score = data.get("score", 0)
            risk  = data.get("risk_level", "?")
            rc    = RISK_COLOR.get(risk, "")
            finds = data.get("findings", [])

            print(f"  Score: {c(BOLD+rc, str(score)+'/100')}  {c(rc, risk)}")
            print()

            if finds:
                for f in finds[:15]:
                    sev = f.get("severity","?")
                    sc  = RISK_COLOR.get(sev,"")
                    print(f"  {c(sc, sev):<18} {f['id']}  {f.get('file','')}")
                if len(finds) > 15:
                    print(c(DIM, f"  … and {len(finds)-15} more findings"))
            else:
                print(c(GREEN, "  ✓ No findings"))
            print()

        # HTML report
        if args.html:
            html_cmd = [sys.executable, REPORT_PY, clone_path,
                        "--out", args.html] + extra
            subprocess.run(html_cmd, capture_output=True)
            if not args.json:
                print(c(GREEN, f"  ✓ HTML report: {args.html}"))

        # Markdown report
        if args.markdown:
            md_extra = extra + ["--markdown", args.markdown]
            md_cmd = [sys.executable, SCANNER_PY, clone_path] + md_extra
            subprocess.run(md_cmd, capture_output=True)
            if not args.json:
                print(c(GREEN, f"  ✓ Markdown report: {args.markdown}"))

    # Exit code from audit result
    if audit_result.returncode != 0:
        sys.exit(audit_result.returncode)


if __name__ == "__main__":
    main()
