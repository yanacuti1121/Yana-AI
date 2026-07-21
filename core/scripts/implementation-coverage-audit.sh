#!/usr/bin/env bash
# implementation-coverage-audit.sh — does this hook/script actually run?
# Status: active
#
# Complements verify-core-lock.sh / verify-skills-lock.sh / drift-check.sh:
# those check hashes and counts. None of them answer "is this file actually
# reachable from a live tool call, or does it just sit on disk." This one
# does, for core/hooks/*.{sh,js} and core/scripts/*.sh (v1 scope — .py/.js
# under core/scripts/ are out of scope, not silently skipped).
#
# Built after finding a real false claim in this repo's own audit history
# (2026-07-18): "sandbox-exec.sh is never called" was concluded from a
# 2-location grep, but core/scripts/tool-proxy.sh builds its path at
# runtime and execs it — a real call path that plain string grep for
# "sandbox-exec.sh" in just settings.json/core/hooks/ missed. See
# .claude/assistant/context.md's "Architecture Audit (2026-07)" section
# for the Evidence Level scale this script's output is graded against.
#
# What this script CANNOT do: prove a file is truly dead code. It does
# static reference scanning only (Evidence Level L1 — see context.md) —
# one hop of grep, not a full call graph, and never a runtime trace. A
# "not wired" result here is a lead to check by hand, not a verdict.
#
# Usage: bash core/scripts/implementation-coverage-audit.sh [--json]

set -uo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$PROJECT_ROOT" || { echo "[coverage-audit] ERROR: cannot cd to $PROJECT_ROOT" >&2; exit 2; }

JSON_MODE=0
if [[ "${1:-}" == "--json" ]]; then
  JSON_MODE=1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "[coverage-audit] ERROR: python3 required" >&2
  exit 2
fi

if [[ ! -f ".claude/settings.json" ]]; then
  echo "[coverage-audit] ERROR: .claude/settings.json not found" >&2
  exit 2
fi

JSON_MODE="$JSON_MODE" python3 - <<'PYEOF'
import json
import os
import re
import sys

JSON_MODE = os.environ.get("JSON_MODE") == "1"


def read_text(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def find_commands(obj, out):
    """Walk settings.json for every string value under a 'command' key,
    regardless of exact nesting — robust to the hooks.<Event>[].hooks[]
    array structure without hardcoding array positions."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "command" and isinstance(v, str):
                out.append(v)
            else:
                find_commands(v, out)
    elif isinstance(obj, list):
        for item in obj:
            find_commands(item, out)


settings = json.load(open(".claude/settings.json", encoding="utf-8"))
commands = []
find_commands(settings, commands)
settings_blob = "\n".join(commands)

hook_files = sorted(
    [os.path.join("core/hooks", f) for f in os.listdir("core/hooks")
     if f.endswith((".sh", ".js"))]
) if os.path.isdir("core/hooks") else []

script_files = sorted(
    [os.path.join("core/scripts", f) for f in os.listdir("core/scripts")
     if f.endswith(".sh")]
) if os.path.isdir("core/scripts") else []

targets = hook_files + script_files

# Pre-read every candidate file once — used both as a search corpus (for
# "does anything else reference me") and, combined, as the test-coverage
# corpus. This script's own file is excluded from the corpus: its header
# comment names several hooks/scripts as worked examples, which would
# otherwise register as false "runtime wired via" hits on itself — caught
# by exactly this bug during self-test (sandbox-exec.sh matched this file
# before the real caller, tool-proxy.sh, because "core/scripts/i..." sorts
# before "core/scripts/t..." and the search takes the first hit found).
file_text = {p: read_text(p) for p in targets if os.path.basename(p) != "implementation-coverage-audit.sh"}

test_files = []
if os.path.isdir("core/tests"):
    for root, _dirs, files in os.walk("core/tests"):
        for f in files:
            test_files.append(os.path.join(root, f))
tests_blob = "\n".join(read_text(p) for p in test_files)

rows = []
n_default_enabled = 0
n_runtime_wired_only = 0
n_tested = 0
n_no_coverage = 0

for path in targets:
    name = os.path.basename(path)
    default_enabled = name in settings_blob

    runtime_wired_via = None
    if not default_enabled:
        for other_path, other_text in file_text.items():
            if other_path == path:
                continue
            if name in other_text:
                runtime_wired_via = other_path
                break

    tested = name in tests_blob

    if default_enabled:
        n_default_enabled += 1
    elif runtime_wired_via:
        n_runtime_wired_only += 1
    if tested:
        n_tested += 1
    if not default_enabled and not runtime_wired_via and not tested:
        n_no_coverage += 1

    rows.append({
        "path": path,
        "exists": True,
        "default_enabled": default_enabled,
        "runtime_wired": bool(default_enabled or runtime_wired_via),
        "runtime_wired_via": runtime_wired_via,
        "tested": tested,
        "evidence": "L1",
    })

if JSON_MODE:
    print(json.dumps({
        "generated_component_count": len(rows),
        "summary": {
            "checked": len(rows),
            "default_enabled": n_default_enabled,
            "runtime_wired_only": n_runtime_wired_only,
            "tested": n_tested,
            "no_coverage_at_all": n_no_coverage,
        },
        "components": rows,
    }, indent=2))
else:
    def glyph(b):
        return "✓" if b else "✗"

    print(f"{'Component':<42} {'Exists':<7} {'Default':<8} {'Runtime':<9} {'Tested':<7} Evidence")
    print(f"{'':<42} {'':<7} {'Enabled':<8} {'Wired':<9}")
    for r in rows:
        wired_note = f" (via {r['runtime_wired_via']})" if r["runtime_wired_via"] else ""
        print(
            f"{r['path']:<42} {glyph(r['exists']):<7} {glyph(r['default_enabled']):<8} "
            f"{glyph(r['runtime_wired']):<9} {glyph(r['tested']):<7} {r['evidence']}{wired_note}"
        )
    print()
    print(
        f"Summary: {len(rows)} checked · {n_default_enabled} default-enabled · "
        f"{n_runtime_wired_only} runtime-wired-only · {n_tested} tested · "
        f"{n_no_coverage} no-coverage-at-all"
    )
    print(
        "[coverage-audit] Evidence Level L1 for every row (static reference scan, "
        "one hop) — not proof of execution or of dead code. Verify by hand "
        "(exec_pass) before deleting anything flagged ✗ everywhere."
    )

sys.exit(0)
PYEOF
exit $?
