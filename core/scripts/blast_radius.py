#!/usr/bin/env python3
"""yamtam map . — Agent Blast Radius Map.

Answers: "What can my AI agent actually reach in this repo?"
Scans .claude/settings.json, .mcp.json, .github/workflows/ and outputs
a structured map of agent capabilities and risk level.
"""

import argparse
import glob
import json
import os
import re
import sys

BOLD   = "\033[1m"
RED    = "\033[31m"
YELLOW = "\033[33m"
GREEN  = "\033[32m"
CYAN   = "\033[36m"
DIM    = "\033[2m"
RESET  = "\033[0m"

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"

def risk_color(level):
    return {
        "CRITICAL": RED,
        "HIGH":     RED,
        "MEDIUM":   YELLOW,
        "LOW":      GREEN,
        "NONE":     GREEN,
    }.get(level, "")


# ── Scanners ──────────────────────────────────────────────────────────────────

def scan_claude_settings(target: str) -> dict:
    path = os.path.join(target, ".claude", "settings.json")
    result = {
        "found": False,
        "shell": {"level": "NONE", "detail": "no Bash access"},
        "file_read": {"level": "NONE", "detail": "no Read access"},
        "file_write": {"level": "NONE", "detail": "no Write access"},
        "git": {"level": "NONE", "detail": "no git access"},
        "network": {"level": "NONE", "detail": "no network access"},
        "dangerous": False,
    }
    if not os.path.exists(path):
        return result

    try:
        with open(path) as f:
            data = json.load(f)
    except Exception:
        return result

    result["found"] = True
    allow = data.get("permissions", {}).get("allow", [])
    deny  = data.get("permissions", {}).get("deny", [])
    dangerous = data.get("permissions", {}).get("dangerouslyAllowAll", False)
    result["dangerous"] = dangerous

    if dangerous:
        result["shell"]       = {"level": "CRITICAL", "detail": "dangerouslyAllowAll=true — unrestricted"}
        result["file_read"]   = {"level": "CRITICAL", "detail": "unrestricted"}
        result["file_write"]  = {"level": "CRITICAL", "detail": "unrestricted"}
        result["git"]         = {"level": "HIGH",     "detail": "unrestricted"}
        result["network"]     = {"level": "HIGH",     "detail": "unrestricted"}
        return result

    bash_entries = [a for a in allow if a.startswith("Bash")]

    # Shell access
    if any(a in ("Bash", "Bash(*)") for a in bash_entries):
        result["shell"] = {"level": "CRITICAL", "detail": "Bash(*) — wildcard shell"}
    elif bash_entries:
        cmds = [re.sub(r"^Bash\((.+)\)$", r"\1", b) for b in bash_entries]
        risky = [c for c in cmds if any(k in c for k in ("rm", "curl", "wget", "chmod", "sudo", "eval"))]
        level = "HIGH" if risky else "MEDIUM"
        result["shell"] = {"level": level, "detail": f"{len(cmds)} scoped commands" + (f" (risky: {', '.join(risky[:3])})" if risky else "")}

    # File read
    if any(a in ("Read", "Read(*)") for a in allow):
        result["file_read"] = {"level": "MEDIUM", "detail": "Read(*) — full repo read"}
    elif any(a.startswith("Read(") for a in allow):
        result["file_read"] = {"level": "LOW", "detail": "scoped read"}

    # File write
    if any(a in ("Write", "Write(*)") for a in allow):
        result["file_write"] = {"level": "HIGH", "detail": "Write(*) — can write anywhere"}
    elif any(a in ("Edit", "Edit(*)") for a in allow):
        result["file_write"] = {"level": "HIGH", "detail": "Edit(*) — can edit anywhere"}
    elif any(a.startswith(("Write(", "Edit(")) for a in allow):
        result["file_write"] = {"level": "MEDIUM", "detail": "scoped write/edit"}

    # Git
    git_cmds = [a for a in bash_entries if "git" in a.lower()]
    if git_cmds:
        has_push = any("push" in g for g in git_cmds)
        result["git"] = {"level": "HIGH" if has_push else "MEDIUM",
                         "detail": f"{len(git_cmds)} git commands" + (" (including push)" if has_push else "")}

    # Network (curl/wget/fetch)
    net_cmds = [a for a in bash_entries if any(n in a for n in ("curl", "wget", "fetch", "http"))]
    if net_cmds:
        result["network"] = {"level": "HIGH", "detail": f"network commands: {', '.join(net_cmds[:3])}"}

    return result


def scan_mcp(target: str) -> list[dict]:
    path = os.path.join(target, ".mcp.json")
    servers = []
    if not os.path.exists(path):
        return servers
    try:
        with open(path) as f:
            data = json.load(f)
    except Exception:
        return servers

    for name, cfg in data.get("mcpServers", {}).items():
        server = {"name": name, "type": "unknown", "risk": "LOW", "detail": ""}
        cmd = cfg.get("command", "")
        args = cfg.get("args", [])

        if "filesystem" in name.lower() or any("filesystem" in a for a in args):
            roots = [a for a in args if a.startswith("/") or a == "~"]
            if any(r in ("/", os.path.expanduser("~")) for r in roots):
                server["risk"] = "CRITICAL"
                server["detail"] = f"filesystem MCP with root/home access: {', '.join(roots)}"
            else:
                server["risk"] = "MEDIUM"
                server["detail"] = f"filesystem MCP: {', '.join(roots) or 'unscoped'}"
            server["type"] = "filesystem"

        elif "postgres" in name.lower() or "database" in name.lower() or "db" in name.lower():
            server["risk"] = "HIGH"
            server["type"] = "database"
            server["detail"] = "database MCP — raw SQL access"

        elif cmd.startswith("http") or any(a.startswith("http") for a in args):
            server["risk"] = "HIGH"
            server["type"] = "remote"
            server["detail"] = f"remote MCP server"

        else:
            server["type"] = "local"
            server["detail"] = f"local MCP: {cmd}"

        servers.append(server)

    return servers


def scan_workflows(target: str) -> list[dict]:
    wf_dir = os.path.join(target, ".github", "workflows")
    findings = []
    if not os.path.exists(wf_dir):
        return findings

    for wf_path in sorted(glob.glob(os.path.join(wf_dir, "*.yml")) +
                           glob.glob(os.path.join(wf_dir, "*.yaml"))):
        try:
            with open(wf_path) as f:
                content = f.read()
        except Exception:
            continue

        name = os.path.basename(wf_path)
        wf = {"file": name, "triggers": [], "risks": []}

        # Triggers
        on_match = re.findall(r'on:\s*\[?([^\]#\n]+)', content)
        if on_match:
            wf["triggers"] = [t.strip() for t in on_match[0].split(",")]

        # Risk patterns
        if re.search(r'auto.merge|automerge', content, re.IGNORECASE):
            wf["risks"].append({"level": "HIGH", "detail": "auto-merge enabled"})
        if re.search(r'secrets\.\w+.*echo|echo.*secrets\.\w+', content):
            wf["risks"].append({"level": "HIGH", "detail": "secrets echoed in step"})
        if re.search(r'pull_request_target', content):
            wf["risks"].append({"level": "HIGH", "detail": "pull_request_target trigger (fork write access)"})
        if re.search(r'permissions:\s*write-all', content):
            wf["risks"].append({"level": "HIGH", "detail": "permissions: write-all"})

        if wf["triggers"] or wf["risks"]:
            findings.append(wf)

    return findings


# ── Output ────────────────────────────────────────────────────────────────────

def overall_risk(claude: dict, mcps: list, wfs: list) -> str:
    levels = []
    for v in claude.values():
        if isinstance(v, dict):
            levels.append(v.get("level", "NONE"))
    for m in mcps:
        levels.append(m.get("risk", "NONE"))
    for w in wfs:
        for r in w.get("risks", []):
            levels.append(r.get("level", "NONE"))

    order = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"]
    for lvl in order:
        if lvl in levels:
            return lvl
    return "NONE"


def print_map(target: str, claude: dict, mcps: list, wfs: list):
    overall = overall_risk(claude, mcps, wfs)
    oc = risk_color(overall)

    print()
    print(c(BOLD, "  YAMTAM Agent Blast Radius Map"))
    print(c(DIM,  f"  Target: {os.path.abspath(target)}"))
    print()
    print(f"  Overall Risk: {c(BOLD + oc, overall)}")
    print()

    # Claude settings
    print(c(BOLD, "  ── Claude Code (.claude/settings.json)"))
    if not claude["found"]:
        print(c(DIM, "     not found"))
    else:
        if claude["dangerous"]:
            print(f"  {c(RED, '  ✗ dangerouslyAllowAll = true — ALL gates disabled')}")

        rows = [
            ("Shell (Bash)",  claude["shell"]),
            ("File read",     claude["file_read"]),
            ("File write",    claude["file_write"]),
            ("Git",           claude["git"]),
            ("Network",       claude["network"]),
        ]
        for label, info in rows:
            lvl = info["level"]
            detail = info["detail"]
            icon = "✗" if lvl in ("CRITICAL", "HIGH") else ("!" if lvl == "MEDIUM" else "✓")
            print(f"     {c(risk_color(lvl), icon)}  {label:<14} {c(risk_color(lvl), lvl):<20}  {detail}")
    print()

    # MCP servers
    print(c(BOLD, "  ── MCP Servers (.mcp.json)"))
    if not mcps:
        print(c(DIM, "     not found or no servers configured"))
    else:
        for m in mcps:
            lvl = m["risk"]
            icon = "✗" if lvl in ("CRITICAL", "HIGH") else "!"
            print(f"     {c(risk_color(lvl), icon)}  {m['name']:<20} {c(risk_color(lvl), lvl):<20}  {m['detail']}")
    print()

    # CI workflows
    print(c(BOLD, "  ── GitHub Actions (.github/workflows/)"))
    if not wfs:
        print(c(DIM, "     not found or no risky patterns"))
    else:
        for wf in wfs:
            triggers = ", ".join(wf["triggers"][:3]) or "unknown"
            print(f"     {c(CYAN, wf['file'])}  (on: {triggers})")
            for r in wf["risks"]:
                lvl = r["level"]
                print(f"       {c(risk_color(lvl), '✗')}  {c(risk_color(lvl), lvl)} — {r['detail']}")
            if not wf["risks"]:
                print(c(DIM, "       no risky patterns detected"))
    print()

    print(c(DIM, "  Run yamtam audit . for full findings and score."))
    print()


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam map",
        description="Agent Blast Radius Map — what your agent can reach",
    )
    parser.add_argument("target", nargs="?", default=".", help="Directory to scan (default: .)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    target = args.target

    claude = scan_claude_settings(target)
    mcps   = scan_mcp(target)
    wfs    = scan_workflows(target)

    if args.json:
        print(json.dumps({
            "target":   os.path.abspath(target),
            "overall":  overall_risk(claude, mcps, wfs),
            "claude":   claude,
            "mcp":      mcps,
            "workflows": wfs,
        }, indent=2))
        return

    print_map(target, claude, mcps, wfs)


if __name__ == "__main__":
    main()
