#!/usr/bin/env python3
"""
YAMTAM Audit Scanner — core engine for `yamtam audit .`
Phase v0.1: rule-based, deterministic, no AI, no auto-fix.
"""

import json
import os
import re
import sys
import glob
import datetime
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    print("Error: PyYAML is required. Run: pip install pyyaml", file=sys.stderr)
    sys.exit(3)


# ── Score model ───────────────────────────────────────────────────────────────

SEVERITY_COST = {"CRITICAL": 30, "HIGH": 20, "MEDIUM": 10, "LOW": 3, "INFO": 0}

def compute_risk_level(score: int) -> str:
    if score >= 90:
        return "LOW"
    if score >= 70:
        return "MEDIUM"
    if score >= 40:
        return "HIGH"
    return "CRITICAL"


# ── File helpers ──────────────────────────────────────────────────────────────

def resolve_files(target: str, file_patterns: list[str], exclude_patterns: list[str]) -> list[str]:
    matched: set[str] = set()
    for pattern in file_patterns:
        full = os.path.join(target, pattern)
        for path in glob.glob(full, recursive=True):
            if os.path.isfile(path):
                matched.add(os.path.normpath(path))

    excluded: set[str] = set()
    for pattern in exclude_patterns:
        full = os.path.join(target, pattern)
        for path in glob.glob(full, recursive=True):
            excluded.add(os.path.normpath(path))

    return sorted(matched - excluded)


def read_file_safe(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except (OSError, PermissionError):
        return None


def parse_json_safe(content: str) -> Any | None:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return None


# ── JSON path resolver ────────────────────────────────────────────────────────
# Supports simple JSONPath: $.key, $.key.sub, $.key[*], $.key[*].sub

def resolve_json_path(obj: Any, path: str) -> list[Any]:
    """Return all values matching a simple JSONPath expression."""
    parts = path.lstrip("$").lstrip(".").split(".")
    results: list[Any] = [obj]

    for part in parts:
        if not part:
            continue
        next_results: list[Any] = []
        wildcard = part.endswith("[*]")
        key = part[:-3] if wildcard else part

        for node in results:
            if isinstance(node, dict):
                val = node.get(key)
                if val is None:
                    continue
                if wildcard and isinstance(val, list):
                    next_results.extend(val)
                else:
                    next_results.append(val)
            elif isinstance(node, list):
                for item in node:
                    if isinstance(item, dict):
                        val = item.get(key)
                        if val is None:
                            continue
                        if wildcard and isinstance(val, list):
                            next_results.extend(val)
                        else:
                            next_results.append(val)
        results = next_results

    return results


# ── Match engines ─────────────────────────────────────────────────────────────

def run_regex_match(content: str, check: dict) -> list[dict]:
    """Return list of {line, matched_value} for regex matches."""
    pattern = check.get("pattern", "")
    flags_str = check.get("flags", "")
    skip_comments = check.get("skip_comment_lines", False)
    re_flags = 0
    if "i" in flags_str:
        re_flags |= re.IGNORECASE
    if "m" in flags_str:
        re_flags |= re.MULTILINE

    hits = []
    for i, line in enumerate(content.splitlines(), 1):
        stripped = line.lstrip()
        if skip_comments and stripped.startswith("#"):
            continue
        m = re.search(pattern, line, re_flags)
        if m:
            hits.append({"line": i, "matched_value": m.group(0)[:200]})
    return hits


def run_json_match(content: str, check: dict) -> list[dict]:
    """Return list of {matched_value} for JSON path matches."""
    obj = parse_json_safe(content)
    if obj is None:
        return []

    path = check.get("path", "$")
    condition = check.get("condition", "")
    pattern = check.get("pattern", "")
    expected_value = check.get("value")

    # Condition: missing key
    if condition == "missing":
        values = resolve_json_path(obj, path)
        if not values:
            return [{"matched_value": f"{path} not present"}]
        return []

    # Condition: array length > N
    if condition.startswith("array_length_gt_"):
        threshold = int(condition.split("_")[-1])
        values = resolve_json_path(obj, path)
        if values and isinstance(values[0], list) and len(values[0]) > threshold:
            return [{"matched_value": f"array length {len(values[0])}"}]
        return []

    # Exact value match
    if expected_value is not None:
        values = resolve_json_path(obj, path)
        hits = []
        for v in values:
            if v == expected_value:
                hits.append({"matched_value": str(v)[:200]})
        return hits

    # Pattern match on resolved values
    if pattern:
        values = resolve_json_path(obj, path)
        allowlist: list[str] = check.get("allowlist", [])
        hits = []
        for v in values:
            sv = str(v)
            if re.search(pattern, sv):
                if allowlist and any(sv == a or re.search(a.replace("*", ".*"), sv) for a in allowlist):
                    continue
                hits.append({"matched_value": sv[:200]})
        return hits

    return []


# ── Scanner loader ────────────────────────────────────────────────────────────

def load_scanner_rules(scanner_dir: str) -> list[dict]:
    """Load all *.yml files from scanner_dir, return list of rule sets."""
    rule_files = sorted(glob.glob(os.path.join(scanner_dir, "*.yml")))
    rule_sets = []
    for rf in rule_files:
        try:
            with open(rf) as f:
                data = yaml.safe_load(f)
            if data and "checks" in data:
                data["_source_file"] = rf
                rule_sets.append(data)
        except Exception as e:
            print(f"[warn] Could not parse {rf}: {e}", file=sys.stderr)
    return rule_sets


# ── Single-file scanner ───────────────────────────────────────────────────────

def scan_file(file_path: str, target: str, rule_set: dict) -> list[dict]:
    """Run all checks in a rule_set against one file. Return findings."""
    content = read_file_safe(file_path)
    if content is None:
        return [{
            "id": "SCAN_SKIP",
            "severity": "INFO",
            "category": rule_set.get("scope", "unknown"),
            "file": os.path.relpath(file_path, target),
            "rule": "scanner/file-unreadable",
            "reason": f"File could not be read (permissions or encoding)",
            "fix": "Check file permissions.",
            "confidence": "HIGH",
        }]

    findings = []
    for check in rule_set.get("checks", []):
        # Check if check has a specific 'target' file override
        specific_target = check.get("target")
        if specific_target:
            rel = os.path.relpath(file_path, target)
            # Normalize both paths for comparison
            if not (rel == specific_target or rel.endswith(specific_target.lstrip("./"))):
                continue

        match_type = check.get("match", {}).get("type", "regex") if isinstance(check.get("match"), dict) else "regex"
        match_def = check.get("match", check)  # support flat or nested match

        hits = []
        if match_type == "regex":
            hits = run_regex_match(content, match_def)
        elif match_type == "json":
            hits = run_json_match(content, match_def)

        for hit in hits:
            findings.append({
                "id": check["id"],
                "severity": check["severity"],
                "category": rule_set.get("scope", "unknown"),
                "file": os.path.relpath(file_path, target),
                "line": hit.get("line"),
                "rule": f"{rule_set.get('scope', 'unknown')}/{check['id'].lower()}",
                "reason": check.get("reason", ""),
                "fix": check.get("fix", ""),
                "confidence": "HIGH",
                "matched_value": hit.get("matched_value", ""),
                "_description": check.get("description", ""),
            })

    return findings


# ── Main audit runner ─────────────────────────────────────────────────────────

def run_audit(target: str, scanner_dir: str) -> dict:
    rule_sets = load_scanner_rules(scanner_dir)
    if not rule_sets:
        print(f"[error] No scanner rules found in {scanner_dir}", file=sys.stderr)
        sys.exit(3)

    all_findings: list[dict] = []
    files_scanned: set[str] = set()
    files_skipped = 0
    checks_applied = 0

    for rule_set in rule_sets:
        file_patterns = rule_set.get("file_patterns", [])
        exclude_patterns = rule_set.get("exclude_patterns", [])

        # Also handle per-check 'target' overrides — add those files to scan
        for check in rule_set.get("checks", []):
            specific_target = check.get("target")
            if specific_target:
                explicit_path = os.path.join(target, specific_target.lstrip("./"))
                if os.path.isfile(explicit_path):
                    if explicit_path not in files_scanned:
                        findings = scan_file(explicit_path, target, rule_set)
                        all_findings.extend(findings)
                        files_scanned.add(explicit_path)
                        checks_applied += 1

        if file_patterns:
            target_files = resolve_files(target, file_patterns, exclude_patterns)
            for fp in target_files:
                if fp not in files_scanned:
                    findings = scan_file(fp, target, rule_set)
                    all_findings.extend(findings)
                    files_scanned.add(fp)
                checks_applied += len(rule_set.get("checks", []))

    # Remove duplicate findings (same id + file + line)
    seen: set[tuple] = set()
    deduped: list[dict] = []
    for f in all_findings:
        key = (f["id"], f["file"], f.get("line"))
        if key not in seen:
            seen.add(key)
            deduped.append(f)

    all_findings = deduped

    # Compute score: each unique rule ID deducts once (multiple instances = one systemic problem)
    scored_rules: set[str] = set()
    score = 100
    for f in all_findings:
        if f["severity"] != "INFO" and f["id"] not in scored_rules:
            score -= SEVERITY_COST.get(f["severity"], 0)
            scored_rules.add(f["id"])
    score = max(0, score)

    # Summary counts
    summary = {"total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for f in all_findings:
        sev = f["severity"].lower()
        summary["total"] += 1
        if sev in summary:
            summary[sev] += 1

    # Sort: CRITICAL → HIGH → MEDIUM → LOW → INFO
    order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
    all_findings.sort(key=lambda x: order.get(x["severity"], 5))

    # Analytics block (inspired by freellmapi requests table analytics)
    # by_category: findings count per scanner scope
    by_category: dict[str, int] = {}
    for f in all_findings:
        cat = f.get("category", "unknown")
        by_category[cat] = by_category.get(cat, 0) + 1

    # top_rules: rule IDs ranked by instance count (signal vs noise indicator)
    rule_counts: dict[str, dict] = {}
    for f in all_findings:
        rid = f["id"]
        if rid not in rule_counts:
            rule_counts[rid] = {"id": rid, "severity": f["severity"], "count": 0,
                                "category": f.get("category", "unknown")}
        rule_counts[rid]["count"] += 1
    top_rules = sorted(rule_counts.values(), key=lambda x: (order.get(x["severity"], 5), -x["count"]))[:10]

    # files with findings vs clean
    files_with_findings = len({f["file"] for f in all_findings if f["severity"] != "INFO"})
    files_clean = len(files_scanned) - files_with_findings
    hit_rate = round(files_with_findings / len(files_scanned) * 100, 1) if files_scanned else 0.0

    analytics = {
        "by_category": by_category,
        "top_rules": top_rules,
        "files_with_findings": files_with_findings,
        "files_clean": files_clean,
        "hit_rate_pct": hit_rate,
    }

    return {
        "schema_version": "0.1.0",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "target": target,
        "yamtam_version": "0.1.0",
        "score": score,
        "risk_level": compute_risk_level(score),
        "summary": summary,
        "scan_stats": {
            "files_scanned": len(files_scanned),
            "files_skipped": files_skipped,
            "scanners_run": len(rule_sets),
            "checks_applied": checks_applied,
            "duration_ms": 0,
        },
        "analytics": analytics,
        "findings": all_findings,
    }


# ── Output renderers ──────────────────────────────────────────────────────────

RESET  = "\033[0m"
BOLD   = "\033[1m"
RED    = "\033[31m"
YELLOW = "\033[33m"
CYAN   = "\033[36m"
GREEN  = "\033[32m"
DIM    = "\033[2m"

SEVERITY_COLOR = {
    "CRITICAL": RED + BOLD,
    "HIGH":     RED,
    "MEDIUM":   YELLOW,
    "LOW":      DIM,
    "INFO":     DIM,
}


def render_console(report: dict, no_color: bool = False, quiet: bool = False) -> str:
    def c(color: str, text: str) -> str:
        return text if no_color else f"{color}{text}{RESET}"

    risk = report["risk_level"]
    score = report["score"]
    s = report["summary"]
    stats = report["scan_stats"]

    risk_color = {
        "LOW": GREEN, "MEDIUM": YELLOW, "HIGH": RED, "CRITICAL": RED + BOLD
    }.get(risk, "")

    lines = []

    if not quiet:
        lines.append("")
        lines.append(c(CYAN + BOLD, "┌─────────────────────────────────────────────────────┐"))
        lines.append(c(CYAN + BOLD, "│  YAMTAM Agent Audit Report                          │"))
        lines.append(c(CYAN + BOLD, "│  github.com/phamlongh230-lgtm/yamtam-engine          │"))
        lines.append(c(CYAN + BOLD, "└─────────────────────────────────────────────────────┘"))
        lines.append("")
        lines.append(f"  Target:   {report['target']}")
        lines.append(f"  Scanned:  {stats['files_scanned']} files  ·  {stats['scanners_run']} scanners  ·  {stats['checks_applied']} checks")
        lines.append("")

    score_line = f"  Score:    {c(risk_color + BOLD, str(score))} / 100"
    risk_line  = f"  Risk:     {c(risk_color + BOLD, risk)}"

    if quiet:
        summary_str = f"{s['critical']} critical · {s['high']} high · {s['medium']} medium · {s['low']} low"
        lines.append(f"Score: {score}/100  |  Risk: {risk}  |  {s['total']} findings ({summary_str})")
        return "\n".join(lines)

    lines.append(score_line)
    lines.append(risk_line)
    lines.append("")

    findings = report["findings"]
    non_info = [f for f in findings if f["severity"] != "INFO"]

    if not non_info:
        lines.append(c(GREEN, "  ✓  No significant findings."))
    else:
        lines.append(c(DIM, "  " + "─" * 54))
        for f in non_info:
            sev_label = f"[{f['severity']:<8}]"
            file_loc = f["file"]
            if f.get("line"):
                file_loc += f":{f['line']}"
            desc = f.get("_description") or f["reason"][:80]
            sev_col = SEVERITY_COLOR.get(f["severity"], "")

            lines.append(f"  {c(sev_col, sev_label)} {c(BOLD, f['id'])}  {file_loc}")
            lines.append(f"             {desc}")
            if f.get("fix"):
                lines.append(c(DIM, f"             Fix: {f['fix'][:100]}"))
            lines.append("")

        lines.append(c(DIM, "  " + "─" * 54))
        parts = []
        if s["critical"]: parts.append(c(RED + BOLD, f"{s['critical']} critical"))
        if s["high"]:     parts.append(c(RED, f"{s['high']} high"))
        if s["medium"]:   parts.append(c(YELLOW, f"{s['medium']} medium"))
        if s["low"]:      parts.append(c(DIM, f"{s['low']} low"))
        lines.append(f"  Summary:  {' · '.join(parts) if parts else 'none'}")
        lines.append("")
        lines.append(c(DIM, "  Run with --markdown report.md to export."))
        lines.append(c(DIM, "  Run with --fail-on high for CI use."))
        lines.append(c(DIM, "  Run with --json to get analytics (top_rules, by_category, hit_rate)."))

    # Analytics hint: show top repeating rule if > 1 instance
    analytics = report.get("analytics", {})
    top = analytics.get("top_rules", [])
    if top and top[0].get("count", 0) > 1:
        t = top[0]
        lines.append(c(DIM, f"  Top finding: {t['id']} × {t['count']} ({t['severity']}) — run --json for full breakdown."))

    lines.append("")
    return "\n".join(lines)


def render_markdown(report: dict) -> str:
    risk = report["risk_level"]
    score = report["score"]
    s = report["summary"]
    stats = report["scan_stats"]
    findings = [f for f in report["findings"] if f["severity"] != "INFO"]

    lines = [
        "# YAMTAM Agent Audit Report",
        "",
        f"> Generated by YAMTAM v{report['yamtam_version']} · {report['generated_at']}",
        "",
        "---",
        "",
        "## Score",
        "",
        "| | |",
        "|---|---|",
        f"| **Score** | {score} / 100 |",
        f"| **Risk** | {risk} |",
        f"| **Files scanned** | {stats['files_scanned']} |",
        f"| **Findings** | {s['critical']} critical · {s['high']} high · {s['medium']} medium · {s['low']} low |",
        "",
    ]

    risk_note = {
        "CRITICAL": "> **CRITICAL** — Severe agent safety risks. Address CRITICAL findings immediately.",
        "HIGH":     "> **HIGH** — Significant risks that could allow an AI agent to cause serious damage.",
        "MEDIUM":   "> **MEDIUM** — Some risks detected. Review findings and apply recommended fixes.",
        "LOW":      "> **LOW** — Setup looks solid. A few minor improvements are available.",
    }
    lines.append(risk_note.get(risk, ""))
    lines.append("")
    lines.append("---")
    lines.append("")

    if not findings:
        lines.append("## Findings")
        lines.append("")
        lines.append("No significant findings.")
    else:
        lines.append("## Findings")
        lines.append("")
        for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
            sev_findings = [f for f in findings if f["severity"] == sev]
            if not sev_findings:
                continue
            lines.append(f"### {sev.title()}")
            lines.append("")
            for f in sev_findings:
                file_loc = f"`{f['file']}`"
                if f.get("line"):
                    file_loc += f":{f['line']}"
                desc = f.get("_description") or f["reason"]
                lines += [
                    f"#### {f['id']} — {desc}",
                    "",
                    "| | |",
                    "|---|---|",
                    f"| **File** | {file_loc} |",
                    f"| **Rule** | `{f['rule']}` |",
                    f"| **Confidence** | {f['confidence']} |",
                    "",
                    f"**Why this is a risk:**  ",
                    f"{f['reason']}",
                    "",
                    f"**How to fix:**  ",
                    f"{f['fix']}",
                    "",
                    "---",
                    "",
                ]

    lines += [
        "## Next Steps",
        "",
    ]
    if risk in ("CRITICAL", "HIGH"):
        lines += [
            "1. Fix all CRITICAL and HIGH findings before using AI agents in this repo",
            "2. Re-run `yamtam audit .` to verify fixes",
            "3. Add `yamtam audit . --fail-on high` to your CI pipeline",
        ]
    else:
        lines += [
            "1. Review MEDIUM findings and apply where practical",
            "2. Add `yamtam audit . --fail-on high` to your CI pipeline",
        ]

    lines += [
        "",
        "---",
        "",
        "*Report generated by [YAMTAM](https://github.com/phamlongh230-lgtm/yamtam-engine)*",
    ]
    return "\n".join(lines)


# ── CLI entrypoint ────────────────────────────────────────────────────────────

def main() -> None:
    import argparse
    import time

    parser = argparse.ArgumentParser(
        prog="yamtam audit",
        description="Audit AI coding agent setup for common risk patterns.",
    )
    parser.add_argument("target", nargs="?", default=".", help="Directory to scan (default: .)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--markdown", metavar="FILE", help="Write Markdown report to FILE")
    parser.add_argument("--fail-on", choices=["low", "medium", "high", "critical"],
                        help="Exit non-zero if findings at this severity or above exist")
    parser.add_argument("--only", metavar="CATEGORY",
                        help="Run only one scanner category")
    parser.add_argument("--ignore", metavar="ID", action="append", default=[],
                        help="Suppress a finding ID (can repeat)")
    parser.add_argument("--no-color", action="store_true", help="Disable ANSI color")
    parser.add_argument("--quiet", action="store_true", help="Only print score + risk level")
    args = parser.parse_args()

    target = os.path.abspath(args.target)
    if not os.path.isdir(target):
        print(f"Error: target not found: {args.target}", file=sys.stderr)
        sys.exit(3)

    # Find scanner dir relative to this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(os.path.dirname(script_dir))
    scanner_dir = os.path.join(repo_root, "scanner")
    if not os.path.isdir(scanner_dir):
        # Fallback: look for scanner/ relative to target
        scanner_dir = os.path.join(target, ".claude", "scanner")
    if not os.path.isdir(scanner_dir):
        print(f"Error: scanner rules not found. Expected: {scanner_dir}", file=sys.stderr)
        sys.exit(3)

    t0 = time.monotonic()
    report = run_audit(target, scanner_dir)
    report["scan_stats"]["duration_ms"] = int((time.monotonic() - t0) * 1000)

    # Apply --ignore
    if args.ignore:
        report["findings"] = [f for f in report["findings"] if f["id"] not in args.ignore]

    # Apply --only category filter
    if args.only:
        report["findings"] = [f for f in report["findings"] if f.get("category") == args.only]

    # Recompute score after filters (unique rule IDs only)
    seen_ids: set[str] = set()
    score = 100
    for f in report["findings"]:
        if f["severity"] != "INFO" and f["id"] not in seen_ids:
            score -= SEVERITY_COST.get(f["severity"], 0)
            seen_ids.add(f["id"])
    report["score"] = max(0, score)
    report["risk_level"] = compute_risk_level(report["score"])

    # Output
    if args.json:
        print(json.dumps(report, indent=2, default=str))
    else:
        print(render_console(report, no_color=args.no_color, quiet=args.quiet))

    if args.markdown:
        md = render_markdown(report)
        with open(args.markdown, "w") as f:
            f.write(md)
        if not args.quiet:
            print(f"  Report written to: {args.markdown}\n")

    # Exit codes
    fail_level = args.fail_on
    if fail_level:
        order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
        threshold = order.get(fail_level, 99)
        for f in report["findings"]:
            if order.get(f["severity"].lower(), 99) >= threshold:
                sys.exit(2 if f["severity"] == "CRITICAL" else 1)
    elif report["summary"]["critical"] > 0:
        sys.exit(2)
    elif report["summary"]["high"] > 0 or report["summary"]["medium"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
