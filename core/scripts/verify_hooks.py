#!/usr/bin/env python3
"""yana-ai verify [target] — verify all hooks are wired and active."""

import argparse
import json
import os
import stat
import subprocess
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BOLD   = "\033[1m"; GREEN  = "\033[32m"; YELLOW = "\033[33m"
RED    = "\033[31m"; CYAN   = "\033[36m"; DIM    = "\033[2m"; RESET  = "\033[0m"

# Derived from `yana-ai verify --dump` against the live project-layer
# settings.json (2026-08-15) — every row below is a hook file that was
# actually found wired at that moment, not a hand-maintained wishlist.
# 26 unique files / 28 (file, event) pairs were wired; 2 files
# (agent-pixel-notify.sh, tool-guardrails-detector.sh) are wired to two
# events each — listed once here under their primary event, noted in the
# description. .claude/hooks/ holds 63 script files total, so ~37 exist
# on disk but are NOT wired anywhere — that gap is real and separate from
# this list; re-run --dump to see current wiring, don't assume this list
# stays complete as hooks are added or removed.
EXPECTED_HOOKS = [
    ("guard-destructive.sh",            "PreToolUse",     "L5 — blocks rm -rf, DROP TABLE"),
    ("truth-gate-guard.sh",              "Stop",           "L3 — blocks unsupported completion claims"),
    ("prompt-injection-guard.sh",        "PreToolUse",     "L3.5 — blocks jailbreak attempts"),
    ("scope-guard.sh",                   "PreToolUse",     "L1 — warns on cross-scope writes"),
    ("token-scope-guard.sh",             "PreToolUse",     "L1 — warns on secret/env access"),
    ("deploy-gate.sh",                   "PreToolUse",     "L4 — blocks gh/kubectl/docker"),
    ("supply-chain-guard.sh",            "PreToolUse",     "L4.5 — blocks pipe-to-shell"),
    ("audit-log.sh",                     "PostToolUse",    "L0 — hash-chain audit log of every tool call"),
    ("precompact-priority-injection.sh", "PreCompact",     "Injects fidelity requirements before context compaction"),
    ("giamthi-halt-check.sh",            "PreToolUse",     "Denies every tool call while GIAMTHI_HALT.lock exists"),
    ("tool-proxy-enforcer.sh",           "PreToolUse",     "Blocks subshell/pipe-to-interpreter evasion patterns"),
    ("sandbox-wrap.sh",                  "PreToolUse",     "Rewrites Bash commands to route through sandbox execution"),
    ("infra-review-reminder.sh",         "PreToolUse",     "Reminds to dispatch independent reviewers before critical infra writes"),
    ("freeze-scope.sh",                  "PreToolUse",     "Restricts Write/Edit/MultiEdit to a single directory for the session"),
    ("agent-budget-gate.sh",             "PreToolUse",     "Blocks spawning a new agent when budget <= 10%"),
    ("agent-pixel-notify.sh",            "PreToolUse",     "Notifies the optional Pixel Office bridge server (also wired at PostToolUse)"),
    ("token-budget-guard.sh",            "PreToolUse",     "Circuit breaker + fast-tier auto-routing on token budget"),
    ("per-tool-circuit-breaker.sh",      "PreToolUse",     "L5 — per-tool circuit breaker, adaptive backoff on repeated failures"),
    ("auto-decompose.sh",                "UserPromptSubmit", "Hints task decomposition for parallelizable work (non-blocking)"),
    ("session-bootstrap.sh",             "UserPromptSubmit", "Injects relevant L1 facts + session trust into context"),
    ("tool-guardrails-detector.sh",      "Stop",           "Per-turn tool-call loop detector, warn-only (also wired at PostToolUse)"),
    ("context-compress-stop.sh",         "Stop",           "Real-transcript context compression (hermes_adapted Phase 4)"),
    ("budget-sentinel.sh",               "PostToolUse",    "Token budget monitor — 50/80/90/95% thresholds, non-blocking"),
    ("verify-evidence-track.sh",         "PostToolUse",    "Tracks verify-command evidence + edit staleness for Truth Gate"),
    ("context-compress-trigger.sh",      "PostToolUse",    "Triggers background context compression on WARNING/CRITICAL"),
    ("entry-point-verify-reminder.sh",   "PostToolUse",    "Reminds to dispatch verify-agent for entry-point file edits"),
]

def no_color():
    return os.environ.get("YANA_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"

def icon(ok): return c(GREEN, "✓") if ok else c(RED, "✗")


def load_settings_file(path: str) -> dict | None:
    if not os.path.exists(path):
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None


def extract_hook_rows(data: dict) -> list[dict]:
    """Flatten settings.json's hooks object — {event: [{matcher?, hooks:[...]}]} —
    into flat rows. `hooks` is a dict keyed by event name (SessionStart,
    PreToolUse, ...), not a list; each value is a list of matcher groups."""
    rows = []
    hooks = data.get("hooks", {})
    if not isinstance(hooks, dict):
        return rows
    for event, groups in hooks.items():
        if not isinstance(groups, list):
            continue
        for group in groups:
            matcher = group.get("matcher", "*")
            for entry in group.get("hooks", []):
                rows.append({
                    "event": event,
                    "matcher": matcher,
                    "type": entry.get("type", "command"),
                    "command": entry.get("command") or entry.get("prompt") or entry.get("url") or "",
                })
    return rows


def check_settings(target: str) -> tuple[dict | None, list[str]]:
    path = os.path.join(target, ".claude", "settings.json")
    data = load_settings_file(path)
    if data is None:
        return None, []
    wired = [row["command"] for row in extract_hook_rows(data)]
    return data, wired


def check_hook_file(target: str, hook_name: str) -> tuple[bool, bool]:
    """Returns (exists, executable)."""
    for base in [
        os.path.join(target, ".claude", "hooks"),
        os.path.join(REPO_ROOT, "core", "hooks"),
    ]:
        path = os.path.join(base, hook_name)
        if os.path.exists(path):
            exe = bool(os.stat(path).st_mode & stat.S_IXUSR)
            return True, exe
    return False, False


SETTINGS_LAYERS = [
    # (label, path-builder). Order matches Claude Code's documented load
    # order: user -> project -> local (later layers take precedence for
    # scalar settings; hook arrays are additive per event/matcher).
    ("user",    lambda target: os.path.expanduser("~/.claude/settings.json")),
    ("project", lambda target: os.path.join(target, ".claude", "settings.json")),
    ("local",   lambda target: os.path.join(target, ".claude", "settings.local.json")),
]


def truncate(s: str, n: int = 100) -> str:
    s = s.replace("\n", " ")
    return s if len(s) <= n else s[: n - 1] + "…"


def dump_config(target: str, as_json: bool) -> None:
    """Print the effective SessionStart/PreToolUse/... hook tree across all
    settings layers this repo actually has on disk — not a merge simulation,
    each row is labeled with the file it came from so nothing is asserted
    that wasn't read directly off disk."""
    layers = []
    for label, path_fn in SETTINGS_LAYERS:
        path = path_fn(target)
        data = load_settings_file(path)
        rows = extract_hook_rows(data) if data is not None else []
        for r in rows:
            r["layer"] = label
        layers.append({"label": label, "path": path, "found": data is not None, "rows": rows})

    if as_json:
        print(json.dumps({"target": os.path.abspath(target), "layers": layers}, indent=2))
        return

    print()
    print(c(BOLD, "  yana-ai verify --dump — effective hook configuration"))
    print(c(DIM,  f"  Target: {os.path.abspath(target)}"))
    print()
    for layer in layers:
        status = c(GREEN, "found") if layer["found"] else c(DIM, "not found")
        print(f"  {c(BOLD, layer['label']):<10} {layer['path']}  [{status}]")
    print()

    all_rows = [r for layer in layers for r in layer["rows"]]
    if not all_rows:
        print(c(YELLOW, "  No hook entries found in any layer."))
        print()
        return

    events = sorted(set(r["event"] for r in all_rows))
    for event in events:
        print(c(BOLD+CYAN, f"  ── {event} " + "─" * max(0, 40 - len(event))))
        for r in [r for r in all_rows if r["event"] == event]:
            print(f"    {c(DIM, '[' + r['layer'] + ']'):<18} matcher={r['matcher']!r:<22} {truncate(r['command'])}")
        print()

    print(c(DIM, f"  {len(all_rows)} hook entr{'y' if len(all_rows)==1 else 'ies'} across {len(events)} event(s), "
                 f"{sum(1 for l in layers if l['found'])}/{len(layers)} layer file(s) found."))
    print()


def main():
    parser = argparse.ArgumentParser(
        prog="yana-ai verify",
        description="Verify all safety hooks are wired and active",
    )
    parser.add_argument("target", nargs="?", default=".",
                        help="Project directory (default: .)")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--fix",  action="store_true",
                        help="Install missing hooks (yana-ai guard install all)")
    parser.add_argument("--dump", action="store_true",
                        help="Dump the effective hook tree across all settings layers "
                             "(user/project/local), instead of checking against the "
                             "expected-hooks list")
    args = parser.parse_args()

    target = args.target

    if args.dump:
        dump_config(target, args.json)
        return

    settings_data, wired_commands = check_settings(target)

    results = []
    for hook_name, event, desc in EXPECTED_HOOKS:
        exists, executable = check_hook_file(target, hook_name)
        in_settings = any(hook_name in cmd for cmd in wired_commands)
        results.append({
            "hook": hook_name, "event": event, "desc": desc,
            "exists": exists, "executable": executable,
            "wired": in_settings,
            "ok": exists and in_settings,
        })

    passed = sum(1 for r in results if r["ok"])
    total  = len(results)
    status = "PASS" if passed == total else ("WARN" if passed >= total // 2 else "FAIL")

    if args.json:
        print(json.dumps({"status": status, "passed": passed,
                          "total": total, "hooks": results}, indent=2))
        return

    print()
    print(c(BOLD, "  yana-ai verify — hook wiring check"))
    print(c(DIM,  f"  Target: {os.path.abspath(target)}"))
    print()

    sc = {GREEN: GREEN, "PASS": GREEN, "WARN": YELLOW, "FAIL": RED}.get(status, RED)
    if status == "PASS":
        sc = GREEN
    elif status == "WARN":
        sc = YELLOW
    else:
        sc = RED

    if settings_data is None:
        print(c(YELLOW, "  ! .claude/settings.json not found — hooks may not be active"))
        print(c(DIM,    "    Run: yana-ai install . or yana-ai guard install all"))
        print()

    print(f"  {'HOOK':<35} {'EXISTS':<8} {'WIRED':<8} {'DESCRIPTION'}")
    print(f"  {'─'*80}")

    for r in results:
        e_icon = icon(r["exists"])
        w_icon = icon(r["wired"])
        row_c  = "" if r["ok"] else YELLOW
        print(f"  {c(row_c, r['hook']):<44} {e_icon:<12} {w_icon:<12} {c(DIM, r['desc'])}")

    print()
    sc_code = GREEN if status == "PASS" else (YELLOW if status == "WARN" else RED)
    print(f"  {icon(status=='PASS')} {c(BOLD+sc_code, status)} — {passed}/{total} hooks verified")
    print()

    if status != "PASS":
        if args.fix:
            print(c(CYAN, "  Running: yana-ai guard install all…"))
            guard_py = os.path.join(REPO_ROOT, "core/scripts/guard_installer.py")
            subprocess.run([sys.executable, guard_py, "install", "all",
                            "--target", target], check=False)
            print()
        else:
            print(c(DIM, "  Fix: yana-ai guard install all  or  yana-ai verify --fix"))
            print()

    if status == "FAIL":
        sys.exit(1)


if __name__ == "__main__":
    main()
