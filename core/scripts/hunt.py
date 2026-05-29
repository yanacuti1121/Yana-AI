#!/usr/bin/env python3
"""yamtam hunt [target] — active security scanner.

Inspired by gadievron/raptor. Turns YAMTAM from passive auditor → active hunter.
Unlike `yamtam audit` (reads config/settings), `hunt` digs into source code.

Subcommands:
  secrets      Scan for exposed secrets, API keys, tokens
  deps         Dependency vulnerability check (pip-audit / npm audit / cargo audit)
  code         Static code analysis (semgrep patterns / regex)
  supply-chain Suspicious install scripts, pipe-to-shell, unpinned deps
  all          Run all checks (default)
"""

import argparse, json, os, re, subprocess, sys
from pathlib import Path
from datetime import datetime, timezone

REPO_ROOT  = Path(__file__).parent.parent.parent

BOLD="\033[1m"; GREEN="\033[32m"; RED="\033[31m"; YELLOW="\033[33m"
CYAN="\033[36m"; DIM="\033[2m"; MAGENTA="\033[35m"; RESET="\033[0m"
SEV_COLOR = {"CRITICAL":RED,"HIGH":RED,"MEDIUM":YELLOW,"LOW":DIM}

def no_color(): return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()
def c(code,t):  return t if no_color() else f"{code}{t}{RESET}"

# ── Secret patterns ────────────────────────────────────────────────────────────
SECRET_PATTERNS = [
    ("AWS Access Key",     r'AKIA[0-9A-Z]{16}',                  "CRITICAL"),
    ("AWS Secret Key",     r'(?i)aws.{0,20}secret.{0,20}[=:]\s*["\']?[A-Za-z0-9/+]{40}', "CRITICAL"),
    ("GitHub Token",       r'gh[ps]_[A-Za-z0-9]{36,}',           "CRITICAL"),
    ("OpenAI Key",         r'sk-[A-Za-z0-9]{48}',                "CRITICAL"),
    ("Anthropic Key",      r'sk-ant-[A-Za-z0-9\-_]{40,}',        "CRITICAL"),
    ("Stripe Secret",      r'sk_(live|test)_[A-Za-z0-9]{24,}',   "CRITICAL"),
    ("Google API Key",     r'AIza[0-9A-Za-z\-_]{35}',            "HIGH"),
    ("Slack Token",        r'xox[baprs]-[0-9A-Za-z\-]{10,}',     "HIGH"),
    ("Private Key",        r'-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----', "CRITICAL"),
    ("Password in var",    r'(?i)(password|passwd|pwd)\s*[=:]\s*["\'][^"\']{6,}["\']', "HIGH"),
    ("DB connection str",  r'(?i)(mongodb|postgres|mysql|redis)://[^@]+:[^@]+@', "HIGH"),
    ("JWT Secret",         r'(?i)jwt.{0,20}secret.{0,20}[=:]\s*["\'][^"\']{10,}', "MEDIUM"),
    ("Hardcoded IP+port",  r'\b(?:10|172|192\.168)\.\d+\.\d+:\d{4,5}\b', "LOW"),
]

# ── Code vuln patterns ─────────────────────────────────────────────────────────
CODE_PATTERNS = [
    ("SQL Injection risk",     r'(?i)(execute|query)\s*\(\s*["\'][^"\']*\s*\+', "HIGH",
     "Use parameterized queries"),
    ("Command injection",      r'(?i)(os\.system|subprocess\.call\(.*shell\s*=\s*True|eval\()', "HIGH",
     "Avoid shell=True; use subprocess.run with list args"),
    ("Path traversal",         r'\.\./', "MEDIUM",
     "Validate paths against workspace boundary"),
    ("Hardcoded localhost",    r'(?i)(http://localhost|127\.0\.0\.1):\d+', "LOW",
     "Use env vars for service URLs"),
    ("Debug flag in prod",     r'(?i)(DEBUG\s*=\s*True|debug\s*=\s*true)', "MEDIUM",
     "Remove DEBUG=True before deploying"),
    ("TODO security note",     r'(?i)(TODO|FIXME|HACK).{0,50}(auth|secret|password|token|vuln)', "LOW",
     "Resolve security TODOs"),
]

# ── Supply chain patterns ──────────────────────────────────────────────────────
SUPPLY_CHAIN_PATTERNS = [
    ("Pipe to shell",          r'(curl|wget).+\|\s*(ba)?sh', "CRITICAL"),
    ("npm postinstall shell",  r'"postinstall":\s*"[^"]*sh\b', "HIGH"),
    ("Floating npm version",   r'"[a-z@][^"]+"\s*:\s*"\*"', "MEDIUM"),
    ("git URL dep",            r'git\+(https?|ssh)://', "MEDIUM"),
    ("PyPI floating",          r'^[a-zA-Z][a-zA-Z0-9_-]*\s*>=[0-9]', "LOW"),
]

IGNORE_DIRS = {".git","node_modules","dist","build",".yamtam","__pycache__","venv",".venv","target"}
IGNORE_EXTS = {".png",".jpg",".jpeg",".gif",".svg",".ico",".woff",".woff2",".ttf",".eot",
               ".pdf",".zip",".tar",".gz",".lock",".pyc",".class",".o",".so"}

def walk_files(target: str, exts: set|None=None) -> list[str]:
    result = []
    for root, dirs, files in os.walk(target):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith(".")]
        for f in files:
            ext = Path(f).suffix.lower()
            if ext in IGNORE_EXTS: continue
            if exts and ext not in exts: continue
            result.append(os.path.join(root, f))
    return result


def scan_patterns(files, patterns, label, max_per_file=5):
    findings = []
    for fpath in files:
        try:
            content = Path(fpath).read_text(errors="replace")
        except OSError:
            continue
        rel = os.path.relpath(fpath)
        hits_in_file = 0
        for lines_idx, line in enumerate(content.splitlines(), 1):
            for name, pattern, sev, *rest in patterns:
                fix = rest[0] if rest else ""
                if re.search(pattern, line):
                    # Skip test/example files for some patterns
                    if "test" in rel.lower() and sev in ("LOW","MEDIUM"):
                        continue
                    findings.append({
                        "id": f"HNT-{label[:3].upper()}-{len(findings)+1:03d}",
                        "severity": sev,
                        "file": rel,
                        "line": lines_idx,
                        "description": name,
                        "match": line.strip()[:80],
                        "fix": fix,
                    })
                    hits_in_file += 1
                    if hits_in_file >= max_per_file:
                        break
            if hits_in_file >= max_per_file:
                break
    return findings


def run_tool(cmd: list, cwd: str) -> tuple[int, str]:
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=60)
        return r.returncode, r.stdout + r.stderr
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        return -1, str(e)


def hunt_secrets(target: str) -> list[dict]:
    files = walk_files(target)
    return scan_patterns(files, [(n,p,s) for n,p,s in SECRET_PATTERNS], "SEC")


def hunt_code(target: str) -> list[dict]:
    code_exts = {".py",".ts",".tsx",".js",".jsx",".mjs",".sh",".bash",".rb",".php",".go",".rs",".java"}
    files = walk_files(target, code_exts)
    return scan_patterns(files, CODE_PATTERNS, "CODE")


def hunt_supply_chain(target: str) -> list[dict]:
    chain_files = walk_files(target, {".json",".txt",".toml",".yaml",".yml",".sh"})
    return scan_patterns(chain_files, SUPPLY_CHAIN_PATTERNS, "SUP")


def hunt_deps(target: str) -> list[dict]:
    findings = []
    # npm audit
    if Path(target, "package.json").exists():
        code, out = run_tool(["npm", "audit", "--json"], target)
        if code not in (-1,) and out.strip().startswith("{"):
            try:
                data = json.loads(out)
                vulns = data.get("vulnerabilities", {})
                for pkg, info in list(vulns.items())[:20]:
                    sev = info.get("severity","low").upper()
                    findings.append({
                        "id": f"HNT-DEP-{len(findings)+1:03d}",
                        "severity": sev if sev in ("CRITICAL","HIGH","MEDIUM","LOW") else "MEDIUM",
                        "file": "package.json",
                        "line": 0,
                        "description": f"npm vulnerability: {pkg}",
                        "match": info.get("via",[{}])[0].get("title","") if info.get("via") else "",
                        "fix": f"npm audit fix",
                    })
            except Exception:
                pass
        elif code == -1:
            pass  # npm not available

    # pip-audit
    if Path(target, "requirements.txt").exists() or Path(target, "pyproject.toml").exists():
        code, out = run_tool(["pip-audit", "--format", "json", "-r",
                              "requirements.txt" if Path(target,"requirements.txt").exists() else "."],
                             target)
        if code not in (-1,) and "[" in out:
            try:
                vulns = json.loads(out)
                for v in vulns[:20]:
                    for vuln in v.get("vulns", []):
                        findings.append({
                            "id": f"HNT-DEP-{len(findings)+1:03d}",
                            "severity": "HIGH",
                            "file": "requirements.txt",
                            "line": 0,
                            "description": f"PyPI vulnerability: {v.get('name')} {v.get('version')}",
                            "match": vuln.get("id",""),
                            "fix": f"pip install {v.get('name')}=={vuln.get('fix_versions',['latest'])[0]}",
                        })
            except Exception:
                pass

    if not findings:
        findings.append({
            "id": "HNT-DEP-INFO",
            "severity": "LOW",
            "file": "-",
            "line": 0,
            "description": "No dependency scanner output (npm audit / pip-audit not available or no vulns)",
            "match": "",
            "fix": "Install: npm (Node.js), pip-audit (pip install pip-audit)",
        })
    return findings


def render_findings(findings: list[dict], category: str) -> None:
    if not findings:
        print(c(GREEN, f"  ✓ {category} — no issues"))
        return
    by_sev = {}
    for f in findings:
        by_sev.setdefault(f["severity"],[]).append(f)
    for sev in ("CRITICAL","HIGH","MEDIUM","LOW"):
        group = by_sev.get(sev,[])
        if not group: continue
        col = SEV_COLOR.get(sev, DIM)
        print(f"\n  {c(col+BOLD, sev)} ({len(group)})")
        for f in group:
            loc = f"{f['file']}:{f['line']}" if f['line'] else f['file']
            print(f"  {c(col,'▸')} {c(BOLD, f['description'])}")
            print(f"    {c(DIM, loc)}")
            if f.get("match"):
                print(f"    {c(CYAN, f['match'][:90])}")
            if f.get("fix"):
                print(f"    {c(DIM, '→')} {f['fix']}")


def main():
    parser = argparse.ArgumentParser(prog="yamtam hunt",
        description="Active security scanner — digs into source code")
    parser.add_argument("target", nargs="?", default=".", help="Directory to scan")
    parser.add_argument("checks", nargs="*",
        choices=["secrets","deps","code","supply-chain","all"],
        help="Checks to run (default: all)")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--fail-on", choices=["low","medium","high","critical"])
    args = parser.parse_args()

    target = os.path.abspath(args.target)
    checks = args.checks or ["all"]
    if "all" in checks:
        checks = ["secrets","code","supply-chain","deps"]

    if not args.json:
        print()
        print(c(BOLD, "  yamtam hunt"))
        print(c(DIM,  f"  {target}"))
        print()

    all_findings = []
    ts = datetime.now(timezone.utc).isoformat()

    check_map = {
        "secrets":      (hunt_secrets,      "Secrets & Credentials"),
        "code":         (hunt_code,         "Code Vulnerabilities"),
        "supply-chain": (hunt_supply_chain, "Supply Chain"),
        "deps":         (hunt_deps,         "Dependencies"),
    }

    for check in checks:
        fn, label = check_map[check]
        if not args.json:
            print(f"  {c(MAGENTA,'▶')} Scanning {label}…", end="", flush=True)
        findings = fn(target)
        all_findings.extend(findings)
        if not args.json:
            n_crit = sum(1 for f in findings if f["severity"]=="CRITICAL")
            n_high = sum(1 for f in findings if f["severity"]=="HIGH")
            summary = f"{n_crit} CRITICAL, {n_high} HIGH" if n_crit+n_high else f"{len(findings)} findings"
            col = RED if n_crit+n_high else (YELLOW if findings else GREEN)
            print(c(col, f" {summary}"))
            render_findings(findings, label)

    # Summary
    by_sev = {}
    for f in all_findings:
        by_sev[f["severity"]] = by_sev.get(f["severity"],0)+1

    if args.json:
        print(json.dumps({
            "tool": "yamtam hunt", "target": target, "timestamp": ts,
            "summary": by_sev, "findings": all_findings
        }, indent=2))
        return

    print()
    print(c(BOLD,"  Summary"))
    for sev in ("CRITICAL","HIGH","MEDIUM","LOW"):
        n = by_sev.get(sev,0)
        if n:
            col = SEV_COLOR.get(sev,DIM)
            print(f"  {c(col, f'{sev:<10}')} {n}")
    if not any(by_sev.values()):
        print(c(GREEN,"  All checks passed — no issues found ✓"))
    print()

    if args.fail_on:
        order = {"low":0,"medium":1,"high":2,"critical":3}
        thresh = order[args.fail_on]
        for sev, n in by_sev.items():
            if n and order.get(sev.lower(),0) >= thresh:
                sys.exit(1)


if __name__ == "__main__":
    main()
