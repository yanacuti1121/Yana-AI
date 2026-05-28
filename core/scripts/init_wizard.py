#!/usr/bin/env python3
"""yamtam init [target] — interactive setup wizard."""

import argparse
import json
import os
import shutil
import subprocess
import sys

REPO_ROOT     = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEMPLATES_DIR = os.path.join(REPO_ROOT, "policy", "templates")
GUARD_PY      = os.path.join(REPO_ROOT, "core/scripts/guard_installer.py")
SCANNER_PY    = os.path.join(REPO_ROOT, "core/scripts/audit_scanner.py")

BOLD   = "\033[1m"; GREEN  = "\033[32m"; YELLOW = "\033[33m"
RED    = "\033[31m"; CYAN   = "\033[36m"; DIM    = "\033[2m"; RESET  = "\033[0m"

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"

def ask(prompt: str, default: str = "", options: list[str] | None = None) -> str:
    if options:
        opts_str = "/".join(
            c(BOLD, o) if o.lower() == default.lower() else o
            for o in options
        )
        prompt = f"{prompt} [{opts_str}]: "
    elif default:
        prompt = f"{prompt} [{c(BOLD, default)}]: "
    else:
        prompt = f"{prompt}: "

    try:
        ans = input(f"  {prompt}").strip()
    except (KeyboardInterrupt, EOFError):
        print(); print(c(DIM, "\n  Cancelled.")); sys.exit(0)

    return ans if ans else default

def section(title: str):
    print()
    print(c(BOLD + CYAN, f"  ── {title}"))
    print()


ENGINES = {
    "claude": "Claude Code",
    "cursor": "Cursor",
    "aider":  "Aider",
    "copilot": "GitHub Copilot",
    "other":  "Other",
}

PROFILES = {
    "strict":   "Block all risky operations (recommended for teams)",
    "balanced": "Block critical, warn on high (default)",
    "minimal":  "Audit only — no blocking (read-only enforcement)",
}

SAFE_TOOLS_BALANCED = [
    "Bash(git *)", "Bash(npm test)", "Bash(npm run *)", "Bash(npx *)",
    "Bash(python3 *)", "Bash(pytest *)", "Bash(ls *)", "Bash(find *)",
    "Bash(grep *)", "Bash(cat *)", "Read(*)", "Write(*)", "Edit(*)",
    "MultiEdit(*)", "Glob(*)", "Grep(*)",
]

SAFE_TOOLS_STRICT = [
    "Bash(git status)", "Bash(git log *)", "Bash(git diff *)",
    "Bash(npm test)", "Bash(ls *)", "Bash(grep *)", "Bash(cat *)",
    "Read(*)", "Glob(*)", "Grep(*)",
]

SAFE_TOOLS_MINIMAL = ["Read(*)", "Glob(*)", "Grep(*)", "Bash(*)"]


def generate_settings(profile: str) -> dict:
    tools = {
        "strict": SAFE_TOOLS_STRICT,
        "balanced": SAFE_TOOLS_BALANCED,
        "minimal": SAFE_TOOLS_MINIMAL,
    }.get(profile, SAFE_TOOLS_BALANCED)

    return {
        "permissions": {
            "allow": tools,
            "deny": ["Bash(rm -rf *)", "Bash(curl * | *)", "Bash(wget * | *)"],
            "dangerouslyAllowAll": False,
        }
    }


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam init",
        description="Interactive yamtam setup wizard",
    )
    parser.add_argument("target", nargs="?", default=".",
                        help="Project directory (default: .)")
    parser.add_argument("--yes", action="store_true",
                        help="Accept all defaults non-interactively")
    args = parser.parse_args()

    target = os.path.abspath(args.target)
    yes    = args.yes

    print()
    print(c(BOLD, "  yamtam init") + c(DIM, " — setup wizard"))
    print(c(DIM,  f"  Target: {target}"))
    print()
    print(c(DIM, "  Press Enter to accept default. Ctrl+C to cancel."))

    # ── Step 1: AI engine ─────────────────────────────────────────────────────
    section("1. AI Engine")
    for k, v in ENGINES.items():
        print(f"  {c(CYAN, k):<12} {v}")
    print()
    engine = "claude" if yes else ask("Engine", "claude")
    if engine not in ENGINES:
        engine = "claude"

    # ── Step 2: Risk profile ──────────────────────────────────────────────────
    section("2. Risk Profile")
    for k, v in PROFILES.items():
        print(f"  {c(CYAN, k):<12} {v}")
    print()
    profile = "balanced" if yes else ask("Profile", "balanced")
    if profile not in PROFILES:
        profile = "balanced"

    # ── Step 3: Install guards ────────────────────────────────────────────────
    section("3. Runtime Guards")
    print(f"  Install runtime hooks (.claude/hooks/) for {c(BOLD, profile)} profile?")
    install_guards = "y" if yes else ask("Install guards", "y", ["y", "n"])

    # ── Step 4: CI integration ────────────────────────────────────────────────
    section("4. CI Integration")
    print(f"  Add yamtam-audit.yml GitHub Actions workflow?")
    add_ci = "y" if yes else ask("Add CI workflow", "y", ["y", "n"])

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    print(c(BOLD, "  Summary"))
    print(f"  Engine   : {c(CYAN, ENGINES.get(engine, engine))}")
    print(f"  Profile  : {c(CYAN, profile)} — {PROFILES[profile]}")
    print(f"  Guards   : {'yes' if install_guards.lower()=='y' else 'no'}")
    print(f"  CI       : {'yes' if add_ci.lower()=='y' else 'no'}")
    print()

    if not yes:
        confirm = ask("Proceed?", "y", ["y", "n"])
        if confirm.lower() != "y":
            print(c(DIM, "  Cancelled.")); print(); return

    print()

    # ── Write files ───────────────────────────────────────────────────────────

    def wrote(label):
        print(f"  {c(GREEN, '✓')} {label}")

    def skipped(label):
        print(c(DIM, f"  · {label} (already exists)"))

    # .yamtamignore
    ig_path = os.path.join(target, ".yamtamignore")
    if not os.path.exists(ig_path):
        with open(ig_path, "w") as f:
            f.write("# .yamtamignore — suppress known-safe findings\n")
        wrote(".yamtamignore")
    else:
        skipped(".yamtamignore")

    # .claude/settings.json (as recommended)
    settings_dir  = os.path.join(target, ".claude")
    settings_path = os.path.join(settings_dir, "settings.recommended.json")
    if not os.path.exists(settings_path):
        os.makedirs(settings_dir, exist_ok=True)
        with open(settings_path, "w") as f:
            json.dump(generate_settings(profile), f, indent=2)
            f.write("\n")
        wrote(f".claude/settings.recommended.json ({profile} profile)")
    else:
        skipped(".claude/settings.recommended.json")

    # .gitignore
    gi_path = os.path.join(target, ".gitignore")
    gi_entry = "\n# YAMTAM\n.yamtam/\nyamtam-*.html\nyamtam-*.sarif\n"
    existing = open(gi_path).read() if os.path.exists(gi_path) else ""
    if "# YAMTAM" not in existing:
        with open(gi_path, "a") as f:
            f.write(gi_entry)
        wrote(".gitignore — added YAMTAM entries")
    else:
        skipped(".gitignore (already has YAMTAM entries)")

    # CI workflow
    if add_ci.lower() == "y":
        wf_src  = os.path.join(REPO_ROOT, ".github", "workflows", "yamtam-audit.yml")
        wf_dest = os.path.join(target, ".github", "workflows", "yamtam-audit.yml")
        if not os.path.exists(wf_dest) and os.path.exists(wf_src):
            os.makedirs(os.path.dirname(wf_dest), exist_ok=True)
            shutil.copy2(wf_src, wf_dest)
            wrote(".github/workflows/yamtam-audit.yml")
        else:
            skipped("yamtam-audit.yml")

    # Guards
    if install_guards.lower() == "y":
        r = subprocess.run(
            [sys.executable, GUARD_PY, "install", "all", "--target", target],
            capture_output=True, text=True
        )
        if r.returncode == 0:
            wrote("runtime guards installed")
        else:
            print(c(YELLOW, "  ! guard install had warnings"))

    print()

    # Initial audit
    print(c(DIM, "  Running initial audit…"))
    r = subprocess.run(
        [sys.executable, SCANNER_PY, target, "--json"],
        capture_output=True, text=True
    )
    try:
        import json as _json
        data  = _json.loads(r.stdout)
        score = data.get("score", 0)
        risk  = data.get("risk_level", "?")
        rc    = {"CRITICAL": RED, "HIGH": RED, "MEDIUM": YELLOW, "LOW": GREEN}.get(risk, "")
        print(f"  Initial score: {c(BOLD+rc, f'{score}/100 {risk}')}")
    except Exception:
        pass

    print()
    print(c(GREEN, "  ✓ Init complete!"))
    print()
    print("  Next steps:")
    print(f"  1. Review .claude/settings.recommended.json → rename to settings.json")
    print(f"  2. Run: yamtam audit {target if target != os.getcwd() else '.'}")
    print(f"  3. Run: yamtam verify  — check hook wiring")
    print()


if __name__ == "__main__":
    main()
