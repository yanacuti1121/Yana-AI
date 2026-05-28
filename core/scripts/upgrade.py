#!/usr/bin/env python3
"""yamtam upgrade — self-update yamtam to latest release."""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request

REPO       = "phamlongh230-lgtm/yamtam-engine"
API_URL    = f"https://api.github.com/repos/{REPO}/releases/latest"
CLONE_URL  = f"https://github.com/{REPO}.git"

BOLD  = "\033[1m"; GREEN = "\033[32m"; YELLOW = "\033[33m"
RED   = "\033[31m"; CYAN  = "\033[36m"; DIM   = "\033[2m"; RESET = "\033[0m"

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


def get_latest_release() -> dict:
    req = urllib.request.Request(API_URL,
          headers={"Accept": "application/vnd.github+json", "User-Agent": "yamtam-cli"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        print(c(RED, f"  Error fetching release info: {e}"), file=sys.stderr)
        sys.exit(1)


def current_version() -> str:
    script_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    bin_path   = os.path.join(script_dir, "bin", "yamtam")
    try:
        r = subprocess.run([bin_path, "version"], capture_output=True, text=True)
        return r.stdout.strip().replace("yamtam ", "")
    except Exception:
        return "unknown"


def main():
    parser = argparse.ArgumentParser(prog="yamtam upgrade",
                                     description="Self-update yamtam to latest release")
    parser.add_argument("--check", action="store_true", help="Check for update without installing")
    parser.add_argument("--yes",   action="store_true", help="Skip confirmation")
    args = parser.parse_args()

    print()
    print(c(BOLD, "  yamtam upgrade"))
    print()

    current = current_version()
    print(f"  Current : {c(CYAN, current)}")
    print(f"  Fetching latest release from GitHub…")

    data   = get_latest_release()
    latest = data.get("tag_name", "?").lstrip("v")
    pub_at = data.get("published_at", "")[:10]
    body   = data.get("body", "")[:200]

    print(f"  Latest  : {c(GREEN, 'v' + latest)}  ({pub_at})")
    print()

    if current == "v" + latest or current == latest:
        print(c(GREEN, "  ✓ Already up to date."))
        print()
        return

    if args.check:
        print(c(YELLOW, f"  Update available: {current} → v{latest}"))
        print(f"  Run: yamtam upgrade  to install")
        print()
        return

    print(c(YELLOW, f"  Update available: {current} → v{latest}"))
    if body:
        for line in body.splitlines()[:5]:
            print(f"  {c(DIM, line)}")
    print()

    if not args.yes:
        ans = input("  Update now? [y/N] ").strip().lower()
        if ans != "y":
            print(c(DIM, "  Cancelled.")); print(); return

    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    with tempfile.TemporaryDirectory() as tmpdir:
        clone_path = os.path.join(tmpdir, "yamtam-engine")
        print(f"  Cloning v{latest}…")

        r = subprocess.run(
            ["git", "clone", "--depth", "1", "--branch", f"v{latest}", CLONE_URL, clone_path],
            capture_output=True, text=True
        )
        if r.returncode != 0:
            # fallback: clone main
            r2 = subprocess.run(
                ["git", "clone", "--depth", "1", CLONE_URL, clone_path],
                capture_output=True, text=True
            )
            if r2.returncode != 0:
                print(c(RED, f"  ✗ Clone failed: {r2.stderr[:200]}")); sys.exit(1)

        # Sync core/ bin/ scanner/ policy/ guards/ docs/
        for d in ("core", "bin", "scanner", "policy", "guards"):
            src  = os.path.join(clone_path, d)
            dest = os.path.join(repo_root, d)
            if os.path.exists(src):
                shutil.copytree(src, dest, dirs_exist_ok=True)
                print(f"  {c(GREEN, '✓')} Updated {d}/")

    print()
    print(c(GREEN, f"  ✓ Upgraded to v{latest}"))
    print(f"  Run: yamtam version  to confirm")
    print()


if __name__ == "__main__":
    main()
