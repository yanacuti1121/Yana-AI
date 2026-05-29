#!/usr/bin/env python3
"""yamtam report pdf [target] — export audit report as PDF.

Tries conversion backends in order:
  1. weasyprint  (pip install weasyprint)
  2. wkhtmltopdf (system binary)
  3. Fallback: saves HTML and instructs user to print-to-PDF
"""

import argparse
import os
import subprocess
import sys
import tempfile

REPO_ROOT   = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPORT_HTML = os.path.join(REPO_ROOT, "core/scripts/report_html.py")

BOLD  = "\033[1m"; GREEN = "\033[32m"; RED = "\033[31m"
CYAN  = "\033[36m"; DIM  = "\033[2m";  RESET = "\033[0m"

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


def build_html(target: str, extra: list[str]) -> str:
    """Generate HTML report into a temp file, return its path."""
    fd, path = tempfile.mkstemp(suffix=".html", prefix="yamtam-pdf-")
    os.close(fd)
    cmd = [sys.executable, REPORT_HTML, target, "--out", path] + extra
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode not in (0, 1):
        print(c(RED, f"  ✗ HTML generation failed: {r.stderr[:300]}"), file=sys.stderr)
        sys.exit(r.returncode)
    return path


def try_weasyprint(html_path: str, pdf_path: str) -> bool:
    try:
        import importlib
        wp = importlib.import_module("weasyprint")
        wp.HTML(filename=html_path).write_pdf(pdf_path)
        return True
    except ImportError:
        return False
    except Exception as e:
        print(c(RED, f"  ✗ weasyprint error: {e}"), file=sys.stderr)
        return False


def try_wkhtmltopdf(html_path: str, pdf_path: str) -> bool:
    try:
        r = subprocess.run(
            ["wkhtmltopdf", "--quiet", "--enable-local-file-access", html_path, pdf_path],
            capture_output=True, text=True, timeout=60,
        )
        return r.returncode == 0
    except FileNotFoundError:
        return False


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam report pdf",
        description="Export audit report as PDF",
    )
    parser.add_argument("target", nargs="?", default=".",
                        help="Directory to audit (default: .)")
    parser.add_argument("--out", default="yamtam-report.pdf",
                        help="Output PDF path (default: yamtam-report.pdf)")
    parser.add_argument("--fail-on", choices=["low", "medium", "high", "critical"],
                        default=None)
    parser.add_argument("--ignore", metavar="ID", action="append", default=[])
    parser.add_argument("--open", action="store_true",
                        help="Open PDF after generation")
    args = parser.parse_args()

    print()
    print(c(BOLD, "  yamtam report pdf"))
    print()

    extra = []
    if args.fail_on:
        extra += ["--fail-on", args.fail_on]
    for ig in args.ignore:
        extra += ["--ignore", ig]

    print(f"  Generating HTML…", end="", flush=True)
    html_path = build_html(args.target, extra)
    print(c(GREEN, " done"))

    pdf_path = os.path.abspath(args.out)

    # Backend 1: weasyprint
    print(f"  Converting to PDF (weasyprint)…", end="", flush=True)
    if try_weasyprint(html_path, pdf_path):
        print(c(GREEN, " done"))
        print(c(GREEN, f"\n  ✓ PDF report: {pdf_path}"))
    else:
        print(c(DIM, " not available"))
        # Backend 2: wkhtmltopdf
        print(f"  Converting to PDF (wkhtmltopdf)…", end="", flush=True)
        if try_wkhtmltopdf(html_path, pdf_path):
            print(c(GREEN, " done"))
            print(c(GREEN, f"\n  ✓ PDF report: {pdf_path}"))
        else:
            print(c(DIM, " not available"))
            # Fallback: keep HTML
            import shutil
            html_out = pdf_path.replace(".pdf", ".html")
            shutil.copy(html_path, html_out)
            print()
            print(c(RED, "  ✗ No PDF backend found."))
            print(f"  HTML report saved to: {c(CYAN, html_out)}")
            print(f"  Install a backend:")
            print(f"    pip install weasyprint   — recommended")
            print(f"    brew install wkhtmltopdf — macOS")
            print(f"    apt install wkhtmltopdf  — Linux")
            print(f"  Then open the HTML in a browser and use Print → Save as PDF.")
            os.unlink(html_path)
            sys.exit(0)

    os.unlink(html_path)

    if args.open:
        import webbrowser
        webbrowser.open(f"file://{pdf_path}")

    print()


if __name__ == "__main__":
    main()
