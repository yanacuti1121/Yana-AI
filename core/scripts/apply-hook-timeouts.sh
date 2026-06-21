#!/usr/bin/env bash
# apply-hook-timeouts.sh — wire hook-timeout-guard.sh into every registered hook
#
# Background (audit 2026-06-21, CORE_AUDIT.md gap #5):
#   hook-timeout-guard.sh has existed since v1.6.0 and correctly kills a hung
#   hook + emits a `deny` decision after YANA_HOOK_TIMEOUT seconds — but it
#   was never referenced anywhere in settings.json. Every one of the 11
#   registered `bash .claude/hooks/X.sh` commands ran with NO hard timeout at
#   all: a hook that hangs (network call with no timeout, infinite loop,
#   waiting on stdin) blocks the agent indefinitely, with no kill switch.
#
# What this does:
#   Rewrites each `"command": "bash .claude/hooks/X.sh [args...]"` entry to:
#     "YANA_GUARDED_HOOK=.claude/hooks/X.sh bash .claude/hooks/hook-timeout-guard.sh [args...]"
#   which runs X.sh under a hard `timeout` and returns a proper `deny` JSON
#   decision (fail closed) if it's killed, instead of the default "allow"
#   you'd get from a bare `timeout` exit code 124.
#
# Idempotent: already-wrapped commands and non-hook commands (echo, python
# inline snippets) are left untouched. Safe to re-run.
#
# Usage:
#   bash core/scripts/apply-hook-timeouts.sh [path/to/settings.json]
#   (default: .claude/settings.json)
#
# Exit codes: 0 = applied/already-applied, 1 = settings.json not found/invalid
set -euo pipefail

SETTINGS="${1:-.claude/settings.json}"

if [[ ! -f "$SETTINGS" ]]; then
  echo "[apply-hook-timeouts] $SETTINGS not found" >&2
  exit 1
fi

python3 - "$SETTINGS" <<'PYEOF'
import json
import re
import sys

path = sys.argv[1]

with open(path) as f:
    data = json.load(f)

HOOK_CMD_RE = re.compile(r'^bash (\.claude/hooks/([A-Za-z0-9_.-]+\.sh))(?:\s+(.*))?$')
GUARD_NAME = "hook-timeout-guard.sh"

changed = 0
skipped_already = 0

hooks = data.get("hooks", {})
for event, matchers in hooks.items():
    for matcher in matchers:
        for h in matcher.get("hooks", []):
            if h.get("type") != "command":
                continue
            cmd = h.get("command", "")

            m = HOOK_CMD_RE.match(cmd.strip())
            if not m:
                continue  # not a `bash .claude/hooks/X.sh` style command

            rel_path, script_name, extra_args = m.group(1), m.group(2), m.group(3)

            if script_name == GUARD_NAME:
                continue  # don't wrap the guard with itself

            if "YANA_GUARDED_HOOK=" in cmd:
                skipped_already += 1
                continue  # already wrapped

            new_cmd = f'YANA_GUARDED_HOOK={rel_path} bash .claude/hooks/{GUARD_NAME}'
            if extra_args:
                new_cmd += f' {extra_args}'

            h["command"] = new_cmd
            changed += 1

with open(path, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"[apply-hook-timeouts] wrapped {changed} hook command(s), "
      f"{skipped_already} already wrapped, in {path}")
PYEOF
