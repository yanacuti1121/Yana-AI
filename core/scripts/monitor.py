#!/usr/bin/env python3
"""yamtam monitor [target] — real-time audit log tail with color output."""

import argparse
import os
import re
import sys
import time

BOLD   = "\033[1m"; GREEN  = "\033[32m"; YELLOW = "\033[33m"
RED    = "\033[31m"; CYAN   = "\033[36m"; DIM    = "\033[2m"; RESET  = "\033[0m"

LOG_CANDIDATES = [
    ".claude/state/audit.log",
    ".claude/state/agent-actions.log",
    "core/memory/audit/agent-actions.log",
    "releases/logs/audit.log",
]

BLOCK_PATTERNS = [
    (r"BLOCK|BLOCKED|L5|DESTRUCTIVE",      RED,    "BLOCK"),
    (r"WARN|WARNING|L3|TRUTH.GATE",        YELLOW, "WARN"),
    (r"PASS|ALLOW|OK|SUCCESS|clean",       GREEN,  "PASS"),
    (r"INJECT|JAILBREAK|PROMPT.INJECT",    RED,    "SECURITY"),
    (r"SUPPLY.CHAIN|PIPE.TO.SHELL",        RED,    "SUPPLY"),
    (r"SCOPE|CROSS.SCOPE",                 YELLOW, "SCOPE"),
    (r"TOKEN|BUDGET|CIRCUIT",              CYAN,   "BUDGET"),
    (r"DEPLOY|PUSH|PUBLISH",               YELLOW, "DEPLOY"),
]

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"


def colorize(line: str) -> str:
    for pattern, color, label in BLOCK_PATTERNS:
        if re.search(pattern, line, re.IGNORECASE):
            # Highlight key words
            highlighted = re.sub(
                r'\b(' + pattern.replace(r".", r"[^ ]") + r')\b',
                lambda m: c(BOLD + color, m.group()),
                line, flags=re.IGNORECASE
            )
            return c(color, f"[{label}]") + " " + highlighted.rstrip()
    return c(DIM, line.rstrip())


def find_log(target: str) -> str | None:
    for candidate in LOG_CANDIDATES:
        path = os.path.join(target, candidate)
        if os.path.exists(path):
            return path
        # also check absolute
        if os.path.exists(candidate):
            return candidate
    return None


def tail_file(path: str, lines: int = 20):
    """Print last N lines of file."""
    try:
        with open(path) as f:
            all_lines = f.readlines()
        for line in all_lines[-lines:]:
            print(colorize(line))
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam monitor",
        description="Real-time audit log tail with color output",
    )
    parser.add_argument("target",    nargs="?", default=".",
                        help="Project directory (default: .)")
    parser.add_argument("--log",     default="",
                        help="Explicit log file path")
    parser.add_argument("--lines",   type=int, default=20,
                        help="Initial lines to show (default: 20)")
    parser.add_argument("--interval", type=float, default=1.0,
                        help="Poll interval in seconds (default: 1.0)")
    parser.add_argument("--filter",  default="",
                        help="Show only lines matching this pattern")

    args = parser.parse_args()

    log_path = args.log or find_log(args.target)

    print()
    print(c(BOLD, "  yamtam monitor") + c(DIM, " — real-time audit log"))

    if not log_path:
        print(c(YELLOW, "  ! No audit log found. Watching for log file creation…"))
        print(c(DIM,    f"  Looked in: {', '.join(LOG_CANDIDATES)}"))
        print(c(DIM,    "  Ctrl+C to stop"))
        print()
        # Wait for log to appear
        try:
            while True:
                log_path = find_log(args.target)
                if log_path:
                    break
                time.sleep(2)
        except KeyboardInterrupt:
            print(); sys.exit(0)

    print(c(DIM, f"  Log: {log_path}  ·  interval {args.interval}s  ·  Ctrl+C to stop"))
    print()

    # Show legend
    if not no_color():
        print(c(DIM, "  Legend: ") +
              c(RED,    "[BLOCK]") + " " +
              c(YELLOW, "[WARN]")  + " " +
              c(GREEN,  "[PASS]")  + " " +
              c(CYAN,   "[BUDGET]") + " " +
              c(DIM, "[other]"))
        print()

    # Show initial tail
    tail_file(log_path, args.lines)

    # Follow
    try:
        with open(log_path) as f:
            f.seek(0, 2)  # seek to end
            while True:
                line = f.readline()
                if line:
                    if args.filter and args.filter.lower() not in line.lower():
                        continue
                    print(colorize(line))
                    sys.stdout.flush()
                else:
                    time.sleep(args.interval)
                    # Re-open if rotated
                    try:
                        new_size = os.path.getsize(log_path)
                        pos = f.tell()
                        if new_size < pos:
                            f.seek(0)
                    except OSError:
                        pass
    except KeyboardInterrupt:
        print()
        print(c(DIM, "  Stopped."))
        print()


if __name__ == "__main__":
    main()
