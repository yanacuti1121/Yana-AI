#!/usr/bin/env python3
"""
YAMTAM Doctor — runtime health check before starting an agent session.
Fast, deterministic, no LLM needed. Exits 0 if healthy, 1 if warnings, 2 if failures.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Optional

# ── ANSI ─────────────────────────────────────────────────────────────────────

RESET  = "\033[0m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
RED    = "\033[31m"
YELLOW = "\033[33m"
GREEN  = "\033[32m"
CYAN   = "\033[36m"


def c(color: str, text: str, no_color: bool = False) -> str:
    return text if no_color else f"{color}{text}{RESET}"


# ── Check result ──────────────────────────────────────────────────────────────

class Check:
    def __init__(self, status: str, label: str, detail: str, fix: str = ""):
        self.status = status   # OK | WARN | FAIL | INFO | SKIP
        self.label = label
        self.detail = detail
        self.fix = fix

    @property
    def icon(self) -> str:
        return {"OK": "✓", "WARN": "!", "FAIL": "✗", "INFO": "·", "SKIP": "–"}.get(self.status, "?")

    def color(self, no_color: bool = False) -> str:
        col = {"OK": GREEN, "WARN": YELLOW, "FAIL": RED, "INFO": DIM, "SKIP": DIM}.get(self.status, "")
        return c(col + BOLD, f"[{self.status:<4}]", no_color)


# ── Individual checks ─────────────────────────────────────────────────────────

def check_git_installed() -> Check:
    try:
        subprocess.run(["git", "--version"], capture_output=True, check=True)
        return Check("OK", "git", "available")
    except (subprocess.CalledProcessError, FileNotFoundError):
        return Check("FAIL", "git", "not found", "Install git: https://git-scm.com")


def check_git_repo(target: str) -> Check:
    result = subprocess.run(
        ["git", "rev-parse", "--git-dir"],
        capture_output=True, cwd=target
    )
    if result.returncode != 0:
        return Check("WARN", "git repo", "target is not a git repository", "Run: git init")
    return Check("OK", "git repo", "valid git repository")


def check_git_clean(target: str) -> Check:
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        capture_output=True, text=True, cwd=target
    )
    lines = [l for l in result.stdout.splitlines() if l.strip()]
    if not lines:
        return Check("OK", "working tree", "clean — no uncommitted changes")
    n = len(lines)
    staged   = sum(1 for l in lines if l[0] != " " and l[0] != "?")
    unstaged = sum(1 for l in lines if l[1] != " " and l[0] != "?")
    untracked = sum(1 for l in lines if l.startswith("??"))
    parts = []
    if staged:    parts.append(f"{staged} staged")
    if unstaged:  parts.append(f"{unstaged} unstaged")
    if untracked: parts.append(f"{untracked} untracked")
    detail = f"{n} changed files ({', '.join(parts)})"
    return Check("WARN", "working tree", detail,
                 "Commit or stash before starting an agent session to avoid unintended changes.")


def check_git_branch(target: str) -> Check:
    result = subprocess.run(
        ["git", "branch", "--show-current"],
        capture_output=True, text=True, cwd=target
    )
    branch = result.stdout.strip()
    if not branch:
        return Check("INFO", "git branch", "detached HEAD state")
    if branch in ("main", "master", "develop", "dev"):
        return Check("WARN", "git branch",
                     f"on '{branch}' — agent changes will land directly on the default branch",
                     f"Create a feature branch: git checkout -b agent/my-task")
    return Check("OK", "git branch", f"on '{branch}'")


def check_gitignore(target: str) -> Check:
    gi_path = os.path.join(target, ".gitignore")
    if not os.path.exists(gi_path):
        return Check("WARN", ".gitignore", "not found — .env files may be committed accidentally",
                     "Create .gitignore and add: .env, .env.*, *.env, *.pem, *.key")
    content = Path(gi_path).read_text(errors="replace")
    missing = []
    for pattern in [".env", "*.pem", "*.key", "credentials.json", "token.json"]:
        if pattern not in content:
            missing.append(pattern)
    if missing:
        return Check("WARN", ".gitignore",
                     f"missing entries: {', '.join(missing)}",
                     f"Add to .gitignore: {chr(10).join(missing)}")
    return Check("OK", ".gitignore", "covers .env, credentials, key files")


def check_claude_settings(target: str) -> Check:
    path = os.path.join(target, ".claude", "settings.json")
    if not os.path.exists(path):
        return Check("INFO", "claude settings", ".claude/settings.json not found — using defaults")
    try:
        data = json.loads(Path(path).read_text())
    except json.JSONDecodeError:
        return Check("FAIL", "claude settings", ".claude/settings.json is invalid JSON",
                     "Fix JSON syntax: python3 -m json.tool .claude/settings.json")

    issues = []
    allow = data.get("permissions", {}).get("allow", [])
    if "Bash(*)" in allow or "Bash" in allow:
        issues.append("unrestricted Bash access")
    if data.get("permissions", {}).get("dangerouslyAllowAll"):
        issues.append("dangerouslyAllowAll: true")
    if len(allow) > 15:
        issues.append(f"{len(allow)} tools auto-approved")

    if issues:
        return Check("WARN", "claude settings",
                     "risky config: " + ", ".join(issues),
                     "Run: yamtam audit . --only agent-config  for details")
    return Check("OK", "claude settings", f"found, {len(allow)} allowed tools")


def check_mcp_config(target: str) -> Check:
    candidates = [".mcp.json", ".cursor/mcp.json", "mcp.json"]
    found = None
    for c_path in candidates:
        full = os.path.join(target, c_path)
        if os.path.exists(full):
            found = full
            break
    if not found:
        return Check("INFO", "MCP config", "no MCP config found")

    try:
        data = json.loads(Path(found).read_text())
    except json.JSONDecodeError:
        return Check("FAIL", "MCP config", f"{os.path.basename(found)} is invalid JSON",
                     "Fix JSON syntax before running agent.")

    servers = data.get("mcpServers", {})
    n = len(servers)
    issues = []

    db_pattern = re.compile(r"(postgres|mysql|sqlite|bigquery|cloudsql|database|sql|db)", re.I)
    for name, cfg in servers.items():
        if db_pattern.search(name) or db_pattern.search(str(cfg.get("command", ""))):
            if not cfg.get("read_only"):
                issues.append(f"'{name}' is a DB server with no read_only: true")

    if n >= 4:
        issues.append(f"{n} servers active — large blast radius")

    rel = os.path.relpath(found, target)
    if issues:
        return Check("WARN", "MCP config",
                     f"{rel}: {'; '.join(issues)}",
                     "Run: yamtam audit . --only mcp-config  for details")
    return Check("OK", "MCP config", f"{rel}: {n} server{'s' if n != 1 else ''}")


def check_env_secrets(target: str) -> Check:
    tracked = subprocess.run(
        ["git", "ls-files", "--error-unmatch", ".env"],
        capture_output=True, cwd=target
    )
    if tracked.returncode == 0:
        return Check("FAIL", ".env tracking",
                     ".env is tracked by git — secrets may be committed",
                     "Remove: git rm --cached .env  then add to .gitignore")

    env_path = os.path.join(target, ".env")
    if not os.path.exists(env_path):
        return Check("INFO", ".env", "no .env file found")

    content = Path(env_path).read_text(errors="replace")
    secret_patterns = [
        r"sk-ant-[a-zA-Z0-9\-_]{20,}",
        r"sk-[a-zA-Z0-9]{20,}(?!ant)",
        r"ghp_[a-zA-Z0-9]{36}",
        r"AKIA[0-9A-Z]{16}",
    ]
    for pat in secret_patterns:
        if re.search(pat, content):
            return Check("WARN", ".env",
                         ".env contains what looks like a live API key",
                         "Verify .env is in .gitignore. Rotate any keys that were committed.")
    return Check("OK", ".env", "present, not tracked by git")


def check_python() -> Check:
    result = subprocess.run(
        ["python3", "--version"], capture_output=True, text=True
    )
    if result.returncode != 0:
        return Check("FAIL", "python3",
                     "not found — required for yamtam audit",
                     "Install python3: https://python.org")
    version = result.stdout.strip() or result.stderr.strip()
    try:
        import yaml  # noqa: F401
        return Check("OK", "python3", f"{version}, PyYAML available")
    except ImportError:
        return Check("WARN", "python3",
                     f"{version} found but PyYAML missing",
                     "Install: pip install pyyaml")


def check_github_token() -> Check:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        masked = token[:4] + "****"
        return Check("OK", "GitHub token", f"set ({masked}...)")
    return Check("INFO", "GitHub token",
                 "GITHUB_TOKEN not set — PR scan and CI checks unavailable",
                 "Set: export GITHUB_TOKEN=ghp_...")


def check_anthropic_key() -> Check:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        masked = key[:8] + "****"
        return Check("OK", "Anthropic key", f"set ({masked}...)")
    return Check("INFO", "Anthropic key",
                 "ANTHROPIC_API_KEY not set — LLM-assisted features unavailable")


def check_ci_env() -> Check:
    ci_vars = ["CI", "GITHUB_ACTIONS", "GITLAB_CI", "CIRCLECI", "TRAVIS"]
    found = [v for v in ci_vars if os.environ.get(v)]
    if found:
        return Check("INFO", "CI environment", f"running in CI ({', '.join(found)})")
    return Check("OK", "CI environment", "local development environment")


def check_node() -> Check:
    result = subprocess.run(
        ["node", "--version"], capture_output=True, text=True
    )
    if result.returncode != 0:
        return Check("INFO", "node.js", "not found — JS/TS projects may need it")
    return Check("OK", "node.js", result.stdout.strip())


def check_yamtam_scanners() -> Check:
    script_dir = Path(__file__).resolve().parent
    # scanners live two levels up from core/scripts/
    scanner_dir = script_dir.parent.parent / "scanner"
    if not scanner_dir.exists():
        return Check("WARN", "yamtam scanners", "scanner/ directory not found — audit will use built-in rules only",
                     "Run: git clone or restore the scanner/ directory alongside core/")
    ymls = list(scanner_dir.glob("*.yml"))
    if not ymls:
        return Check("WARN", "yamtam scanners", "scanner/ found but contains no .yml rule files",
                     "Restore rule files or run: yamtam audit . to see which rules are missing")
    return Check("OK", "yamtam scanners", f"{len(ymls)} rule file{'s' if len(ymls) != 1 else ''} in scanner/")


# ── Runner ────────────────────────────────────────────────────────────────────

def run_doctor(target: str, no_color: bool = False, quiet: bool = False) -> dict:
    checks: list[Check] = []

    checks.append(check_python())
    checks.append(check_git_installed())
    checks.append(check_git_repo(target))
    checks.append(check_git_clean(target))
    checks.append(check_git_branch(target))
    checks.append(check_gitignore(target))
    checks.append(check_claude_settings(target))
    checks.append(check_mcp_config(target))
    checks.append(check_env_secrets(target))
    checks.append(check_github_token())
    checks.append(check_anthropic_key())
    checks.append(check_node())
    checks.append(check_ci_env())
    checks.append(check_yamtam_scanners())

    counts = {"OK": 0, "WARN": 0, "FAIL": 0, "INFO": 0}
    for ck in checks:
        if ck.status in counts:
            counts[ck.status] += 1

    healthy = counts["FAIL"] == 0

    return {
        "target": target,
        "checks": checks,
        "counts": counts,
        "healthy": healthy,
    }


# ── Renderer ──────────────────────────────────────────────────────────────────

def render(report: dict, no_color: bool = False, quiet: bool = False, fix: bool = False) -> str:
    checks = report["counts"]
    nc = no_color
    lines = []

    if quiet:
        counts = report["counts"]
        status = "HEALTHY" if report["healthy"] else "UNHEALTHY"
        summary = f"{counts['OK']} ok · {counts['WARN']} warn · {counts['FAIL']} fail · {counts['INFO']} info"
        lines.append(f"Doctor: {status}  |  {summary}")
        return "\n".join(lines)

    lines += [
        "",
        c(CYAN + BOLD, "┌─────────────────────────────────────────────────────┐", nc),
        c(CYAN + BOLD, "│  YAMTAM Doctor — Runtime Health Check               │", nc),
        c(CYAN + BOLD, "│  github.com/phamlongh230-lgtm/yamtam-engine          │", nc),
        c(CYAN + BOLD, "└─────────────────────────────────────────────────────┘", nc),
        "",
        f"  Target:  {report['target']}",
        "",
    ]

    for ck in report["checks"]:
        label = c(BOLD, ck.label, nc)
        lines.append(f"  {ck.color(nc)} {label:<28} {ck.detail}")
        if fix and ck.fix and ck.status in ("WARN", "FAIL"):
            lines.append(c(DIM, f"             → {ck.fix}", nc))

    if not quiet:
        lines.append("")
        lines.append(c(DIM, "  " + "─" * 54, nc))

        status_parts = []
        if checks["OK"]:   status_parts.append(c(GREEN, f"{checks['OK']} ok", nc))
        if checks["WARN"]: status_parts.append(c(YELLOW, f"{checks['WARN']} warn", nc))
        if checks["FAIL"]: status_parts.append(c(RED, f"{checks['FAIL']} fail", nc))
        if checks["INFO"]: status_parts.append(c(DIM, f"{checks['INFO']} info", nc))

        lines.append(f"  Health:  {'  ·  '.join(status_parts)}")

        if checks["FAIL"]:
            lines.append("")
            lines.append(c(RED, "  ✗  Fix FAIL items before starting an agent session.", nc))
        elif checks["WARN"]:
            lines.append("")
            lines.append(c(YELLOW, "  !  Review WARN items. Run with --fix for suggestions.", nc))
        else:
            lines.append("")
            lines.append(c(GREEN, "  ✓  Environment looks good. Safe to start agent session.", nc))

    lines.append("")
    return "\n".join(lines)


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        prog="yamtam doctor",
        description="Check your environment before starting an AI agent session.",
    )
    parser.add_argument("target", nargs="?", default=".",
                        help="Directory to check (default: .)")
    parser.add_argument("--fix", action="store_true",
                        help="Show fix suggestions for WARN and FAIL items")
    parser.add_argument("--no-color", action="store_true")
    parser.add_argument("--quiet", action="store_true",
                        help="Only print the health summary line")
    parser.add_argument("--json", action="store_true",
                        help="Output as JSON")
    args = parser.parse_args()

    target = os.path.abspath(args.target)
    if not os.path.isdir(target):
        print(f"Error: target not found: {args.target}", file=sys.stderr)
        sys.exit(3)

    report = run_doctor(target, no_color=args.no_color, quiet=args.quiet)

    if args.json:
        out = {
            "target": target,
            "healthy": report["healthy"],
            "counts": report["counts"],
            "checks": [
                {"status": ck.status, "label": ck.label,
                 "detail": ck.detail, "fix": ck.fix}
                for ck in report["checks"]
            ],
        }
        print(json.dumps(out, indent=2))
    else:
        print(render(report, no_color=args.no_color, quiet=args.quiet, fix=args.fix))

    if not report["healthy"]:
        sys.exit(2)
    elif report["counts"]["WARN"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
