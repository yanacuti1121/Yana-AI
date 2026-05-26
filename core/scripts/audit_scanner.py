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
    """Return all values matching a simple JSONPath expression.

    Supported syntax:
      $.key          — dict key access
      $.key.*        — all values of a dict (dict wildcard)
      $.key[*]       — all items of an array (array wildcard)
      $.key[*].sub   — sub-key of each array item
    """
    parts = path.lstrip("$").lstrip(".").split(".")
    results: list[Any] = [obj]

    for part in parts:
        if not part:
            continue
        next_results: list[Any] = []
        array_wildcard = part.endswith("[*]")
        dict_wildcard  = (part == "*")
        key = part[:-3] if array_wildcard else part

        for node in results:
            if dict_wildcard:
                # * alone = all values of a dict, or all items of a list
                if isinstance(node, dict):
                    next_results.extend(node.values())
                elif isinstance(node, list):
                    next_results.extend(node)
            elif isinstance(node, dict):
                val = node.get(key)
                if val is None:
                    continue
                if array_wildcard and isinstance(val, list):
                    next_results.extend(val)
                else:
                    next_results.append(val)
            elif isinstance(node, list):
                for item in node:
                    if isinstance(item, dict):
                        val = item.get(key)
                        if val is None:
                            continue
                        if array_wildcard and isinstance(val, list):
                            next_results.extend(val)
                        else:
                            next_results.append(val)
        results = next_results

    return results


# ── Match engines ─────────────────────────────────────────────────────────────

def run_regex_match(content: str, check: dict) -> list[dict]:
    """Return list of {line, matched_value} for regex matches.

    Supported conditions (applied within a sliding window of N lines):
      accompanied_by       — trigger line must have a companion match within window
      not_accompanied_by   — trigger line must NOT have a companion match within window
      not_followed_by      — trigger line must NOT be followed by companion within window
      not_preceded_by      — trigger line must NOT be preceded by companion within window
    """
    pattern = check.get("pattern", "")
    flags_str = check.get("flags", "")
    skip_comments = check.get("skip_comment_lines", False)
    condition = check.get("condition", "")
    window = int(check.get("lines", 20))

    re_flags = 0
    if "i" in flags_str:
        re_flags |= re.IGNORECASE
    if "m" in flags_str:
        re_flags |= re.MULTILINE

    # Resolve companion pattern (condition uses different key names across rules)
    companion_pattern = (
        check.get("accompanied_by_pattern")
        or check.get("not_accompanied_by_pattern")
        or check.get("not_followed_by_pattern")
        or check.get("not_preceded_by_pattern")
        or check.get("not_accompanied_by")   # AU005 uses bare key name
        or ""
    )

    if not pattern and not condition:
        return []

    lines_list = content.splitlines()
    total = len(lines_list)
    hits = []

    for i, line in enumerate(lines_list):
        stripped = line.lstrip()
        if skip_comments and stripped.startswith("#"):
            continue

        m = re.search(pattern, line, re_flags) if pattern else None
        if not m:
            continue

        matched_val = m.group(0)[:200]
        lineno = i + 1  # 1-based

        # No condition — plain match
        if not condition:
            hits.append({"line": lineno, "matched_value": matched_val})
            continue

        if not companion_pattern:
            # Condition declared but no companion pattern — treat as plain match
            hits.append({"line": lineno, "matched_value": matched_val})
            continue

        # Build the window slice of surrounding lines
        if condition == "accompanied_by":
            # Both before AND after within window
            start = max(0, i - window)
            end   = min(total, i + window + 1)
            window_text = "\n".join(lines_list[start:end])
            companion_found = bool(re.search(companion_pattern, window_text, re_flags))
            if companion_found:
                hits.append({"line": lineno, "matched_value": matched_val})

        elif condition == "not_accompanied_by":
            start = max(0, i - window)
            end   = min(total, i + window + 1)
            window_text = "\n".join(lines_list[start:end])
            companion_found = bool(re.search(companion_pattern, window_text, re_flags))
            if not companion_found:
                hits.append({"line": lineno, "matched_value": matched_val})

        elif condition == "not_followed_by":
            end = min(total, i + 1 + window)
            after_text = "\n".join(lines_list[i + 1:end])
            companion_found = bool(re.search(companion_pattern, after_text, re_flags))
            if not companion_found:
                hits.append({"line": lineno, "matched_value": matched_val})

        elif condition == "not_preceded_by":
            start = max(0, i - window)
            before_text = "\n".join(lines_list[start:i])
            companion_found = bool(re.search(companion_pattern, before_text, re_flags))
            if not companion_found:
                hits.append({"line": lineno, "matched_value": matched_val})

        else:
            # Unknown condition — fall back to plain match so rule isn't silently skipped
            hits.append({"line": lineno, "matched_value": matched_val})

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

    # Condition: missing (entire path absent)
    if condition == "missing":
        values = resolve_json_path(obj, path)
        if not values:
            return [{"matched_value": f"{path} not present"}]
        return []

    # Condition: missing_key — each resolved object must have a specific key
    # Optionally filtered by a pattern match on the object itself (for DB server detection)
    if condition == "missing_key":
        required_key = check.get("key", "")
        values = resolve_json_path(obj, path)
        hits = []
        for v in values:
            if not isinstance(v, dict):
                continue
            # Optional: only flag if object matches the pattern (e.g. name contains "postgres")
            if pattern:
                obj_str = json.dumps(v)
                if not re.search(pattern, obj_str, re.IGNORECASE):
                    # Also check the key in parent context — try matching on server name
                    # by checking if the path resolves through a named key that matches
                    continue
            if required_key and required_key not in v:
                hits.append({"matched_value": f"missing key '{required_key}'"})
        return hits

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
            _st_clean = specific_target[2:] if specific_target.startswith("./") else specific_target.lstrip("/")
            if not (rel == specific_target or rel == _st_clean or rel.endswith(_st_clean)):
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

def run_audit(target: str, scanner_dir: str, diff_files: set[str] | None = None) -> dict:
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
        scanned_this_ruleset: set[str] = set()
        for check in rule_set.get("checks", []):
            specific_target = check.get("target")
            if specific_target:
                _clean = specific_target[2:] if specific_target.startswith("./") else specific_target.lstrip("/")
                explicit_path = os.path.join(target, _clean)
                if os.path.isfile(explicit_path):
                    rel = os.path.relpath(explicit_path, target)
                    if diff_files is not None and rel not in diff_files:
                        files_skipped += 1
                        continue
                    if explicit_path not in scanned_this_ruleset:
                        findings = scan_file(explicit_path, target, rule_set)
                        all_findings.extend(findings)
                        files_scanned.add(explicit_path)
                        scanned_this_ruleset.add(explicit_path)
                        checks_applied += 1

        if file_patterns:
            target_files = resolve_files(target, file_patterns, exclude_patterns)
            for fp in target_files:
                rel = os.path.relpath(fp, target)
                if diff_files is not None and rel not in diff_files:
                    files_skipped += 1
                    continue
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


# ── Report stats recompute ────────────────────────────────────────────────────

def recompute_report_stats(report: dict) -> dict:
    """Recompute score, risk_level, summary, and analytics from findings in-place."""
    findings = report["findings"]
    order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}

    # Score: one deduction per unique rule ID
    scored_rules: set[str] = set()
    score = 100
    for f in findings:
        if f["severity"] != "INFO" and f["id"] not in scored_rules:
            score -= SEVERITY_COST.get(f["severity"], 0)
            scored_rules.add(f["id"])
    report["score"] = max(0, score)
    report["risk_level"] = compute_risk_level(report["score"])

    # Summary counts
    summary = {"total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for f in findings:
        sev = f["severity"].lower()
        summary["total"] += 1
        if sev in summary:
            summary[sev] += 1
    report["summary"] = summary

    # Analytics: by_category
    by_category: dict[str, int] = {}
    for f in findings:
        cat = f.get("category", "unknown")
        by_category[cat] = by_category.get(cat, 0) + 1

    # Analytics: top_rules
    rule_counts: dict[str, dict] = {}
    for f in findings:
        rid = f["id"]
        if rid not in rule_counts:
            rule_counts[rid] = {"id": rid, "severity": f["severity"], "count": 0,
                                "category": f.get("category", "unknown")}
        rule_counts[rid]["count"] += 1
    top_rules = sorted(rule_counts.values(),
                       key=lambda x: (order.get(x["severity"], 5), -x["count"]))[:10]

    files_scanned = report["scan_stats"]["files_scanned"]
    files_with_findings = len({f["file"] for f in findings if f["severity"] != "INFO"})
    files_clean = max(0, files_scanned - files_with_findings)
    hit_rate = round(files_with_findings / files_scanned * 100, 1) if files_scanned else 0.0

    report["analytics"] = {
        "by_category": by_category,
        "top_rules": top_rules,
        "files_with_findings": files_with_findings,
        "files_clean": files_clean,
        "hit_rate_pct": hit_rate,
    }

    return report


# ── .yamtamignore loader ──────────────────────────────────────────────────────

def load_yamtamignore(target: str) -> list[tuple[str, str | None]]:
    """Parse .yamtamignore → list of (rule_id, filepath_or_None).

    Format (per line):
      RULE_ID                           suppress everywhere
      RULE_ID:path/to/file.yml          suppress for one file
      # comment line                    ignored
    """
    ignore_path = os.path.join(target, ".yamtamignore")
    if not os.path.isfile(ignore_path):
        return []
    entries: list[tuple[str, str | None]] = []
    try:
        with open(ignore_path, encoding="utf-8") as f:
            for raw in f:
                line = raw.split("#")[0].strip()
                if not line:
                    continue
                if ":" in line:
                    rule_id, filepath = line.split(":", 1)
                    entries.append((rule_id.strip().upper(), filepath.strip()))
                else:
                    entries.append((line.strip().upper(), None))
    except OSError:
        pass
    return entries


def apply_yamtamignore(
    findings: list[dict], ignore_entries: list[tuple[str, str | None]]
) -> tuple[list[dict], int]:
    """Filter out findings that match .yamtamignore entries.

    Returns (kept_findings, suppressed_count).
    """
    if not ignore_entries:
        return findings, 0

    kept: list[dict] = []
    suppressed = 0
    for f in findings:
        matched = False
        for rule_id, filepath in ignore_entries:
            if f["id"].upper() == rule_id:
                if filepath is None or os.path.normpath(f["file"]) == os.path.normpath(filepath):
                    matched = True
                    break
        if matched:
            suppressed += 1
        else:
            kept.append(f)
    return kept, suppressed


# ── --diff helper ─────────────────────────────────────────────────────────────

def get_diff_files(base: str, target: str) -> set[str]:
    """Return set of relative file paths changed between HEAD and base ref.

    Uses `git diff --name-only <base>` from the target directory.
    Falls back to scanning all files on any error.
    """
    import subprocess
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", base],
            cwd=target,
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode != 0:
            print(
                f"[warn] git diff failed: {result.stderr.strip()} — scanning all files",
                file=sys.stderr,
            )
            return set()
        files = {line.strip() for line in result.stdout.splitlines() if line.strip()}
        # Also include staged (index vs HEAD) changes
        staged = subprocess.run(
            ["git", "diff", "--name-only", "--cached"],
            cwd=target,
            capture_output=True,
            text=True,
            timeout=15,
        )
        if staged.returncode == 0:
            files |= {line.strip() for line in staged.stdout.splitlines() if line.strip()}
        return files
    except (OSError, subprocess.TimeoutExpired) as e:
        print(f"[warn] diff mode unavailable ({e}) — scanning all files", file=sys.stderr)
        return set()


# ── SARIF renderer ────────────────────────────────────────────────────────────

_SARIF_LEVEL = {
    "CRITICAL": "error",
    "HIGH": "error",
    "MEDIUM": "warning",
    "LOW": "note",
    "INFO": "none",
}


def render_sarif(report: dict) -> str:
    """Render report as SARIF 2.1.0 JSON string (GitHub Code Scanning compatible)."""

    # Build rules index from findings
    rules_seen: dict[str, dict] = {}
    for f in report["findings"]:
        rid = f["id"]
        if rid not in rules_seen:
            rules_seen[rid] = {
                "id": rid,
                "name": rid,
                "shortDescription": {"text": f.get("_description") or f.get("reason", rid)},
                "fullDescription": {"text": f.get("reason", "")},
                "help": {"text": f.get("fix", ""), "markdown": f.get("fix", "")},
                "properties": {
                    "tags": [f.get("category", "unknown")],
                    "severity": f["severity"].lower(),
                },
            }

    rules_list = list(rules_seen.values())
    rule_index = {r["id"]: i for i, r in enumerate(rules_list)}

    results = []
    for f in report["findings"]:
        loc: dict = {
            "physicalLocation": {
                "artifactLocation": {
                    "uri": f["file"].replace("\\", "/"),
                    "uriBaseId": "%SRCROOT%",
                },
            }
        }
        if f.get("line"):
            loc["physicalLocation"]["region"] = {"startLine": int(f["line"])}

        results.append({
            "ruleId": f["id"],
            "ruleIndex": rule_index.get(f["id"], 0),
            "level": _SARIF_LEVEL.get(f["severity"], "warning"),
            "message": {"text": f.get("reason", f["id"])},
            "locations": [loc],
        })

    sarif = {
        "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
        "version": "2.1.0",
        "runs": [
            {
                "tool": {
                    "driver": {
                        "name": "yamtam",
                        "version": report.get("yamtam_version", "0.1.0"),
                        "informationUri": "https://github.com/phamlongh230-lgtm/yamtam-engine",
                        "rules": rules_list,
                    }
                },
                "results": results,
                "properties": {
                    "score": report.get("score"),
                    "riskLevel": report.get("risk_level"),
                },
            }
        ],
    }
    return json.dumps(sarif, indent=2)


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
    parser.add_argument("--diff", metavar="BASE",
                        help="Only scan files changed since BASE (e.g. origin/main)")
    parser.add_argument("--sarif", metavar="FILE",
                        help="Write SARIF 2.1.0 report to FILE (GitHub Code Scanning)")
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
        scanner_dir = os.path.join(target, ".claude", "scanner")
    if not os.path.isdir(scanner_dir):
        print(f"Error: scanner rules not found. Expected: {scanner_dir}", file=sys.stderr)
        sys.exit(3)

    # --diff: resolve changed files before scanning
    diff_files: set[str] | None = None
    if args.diff:
        diff_files = get_diff_files(args.diff, target)
        if not diff_files:
            if not args.quiet:
                print(f"  No changed files vs {args.diff} — nothing to scan.\n")
            sys.exit(0)
        if not args.quiet:
            print(f"  Diff mode: scanning {len(diff_files)} changed file(s) vs {args.diff}\n")

    t0 = time.monotonic()
    report = run_audit(target, scanner_dir, diff_files=diff_files)
    report["scan_stats"]["duration_ms"] = int((time.monotonic() - t0) * 1000)

    # Apply --ignore (CLI) filters
    needs_recompute = False
    if args.ignore:
        report["findings"] = [f for f in report["findings"] if f["id"] not in args.ignore]
        needs_recompute = True

    if args.only:
        report["findings"] = [f for f in report["findings"] if f.get("category") == args.only]
        needs_recompute = True

    # Apply .yamtamignore suppression
    ignore_entries = load_yamtamignore(target)
    suppressed_count = 0
    if ignore_entries:
        report["findings"], suppressed_count = apply_yamtamignore(report["findings"], ignore_entries)
        needs_recompute = True

    if needs_recompute:
        recompute_report_stats(report)

    if suppressed_count and not args.quiet:
        print(f"  {suppressed_count} finding(s) suppressed by .yamtamignore\n")

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

    if args.sarif:
        sarif_content = render_sarif(report)
        with open(args.sarif, "w") as f:
            f.write(sarif_content)
        if not args.quiet:
            print(f"  SARIF report written to: {args.sarif}\n")

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
