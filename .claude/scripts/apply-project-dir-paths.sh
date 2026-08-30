#!/usr/bin/env bash
# apply-project-dir-paths.sh — make every guarded-hook command cwd-independent
#
# Background:
#   Every hook command in settings.json is wired as:
#     "YANA_GUARDED_HOOK=.claude/hooks/X.sh bash .claude/hooks/hook-timeout-guard.sh"
#   Both halves are bare paths, relative to whatever directory Claude Code
#   happens to run the hook subprocess in. Per Claude Code's own docs
#   (code.claude.com/docs/en/hooks): if that directory no longer exists
#   (e.g. a git worktree removed mid-session), Claude Code falls back to
#   the project root, the user's home directory, or the system temp
#   directory — and neither $HOME nor /tmp has a .claude/hooks/ folder.
#   Result: "bash: .claude/hooks/hook-timeout-guard.sh: No such file or
#   directory" — the wrapper is always the one named because it's always
#   the first token bash tries to resolve, regardless of which underlying
#   guarded hook was supposed to run. The file itself is never missing;
#   the *path resolution* is what breaks.
#
# What this does:
#   Rewrites each already-wrapped entry:
#     "YANA_GUARDED_HOOK=.claude/hooks/X.sh bash .claude/hooks/hook-timeout-guard.sh [args...]"
#   to:
#     "YANA_GUARDED_HOOK=\"${CLAUDE_PROJECT_DIR}/.claude/hooks/X.sh\" bash \"${CLAUDE_PROJECT_DIR}/.claude/hooks/hook-timeout-guard.sh\" [args...]"
#   $CLAUDE_PROJECT_DIR is set by Claude Code itself to the real project
#   root regardless of the hook subprocess's working directory — this is
#   the exact placeholder the docs recommend for this exact failure mode.
#
# Scope: only rewrites the two .claude/hooks/ paths inside each command
# string. No hook script's logic or content is touched.
#
# Idempotent: a command that already contains ${CLAUDE_PROJECT_DIR} is
# left untouched. Safe to re-run.
#
# Usage:
#   bash .claude/scripts/apply-project-dir-paths.sh [path/to/settings.json]
#   (default: .claude/settings.json)
#
# Exit codes: 0 = applied/already-applied, 1 = settings.json not found/invalid
set -euo pipefail

SETTINGS="${1:-.claude/settings.json}"

if [[ ! -f "$SETTINGS" ]]; then
  echo "[apply-project-dir-paths] $SETTINGS not found" >&2
  exit 1
fi

python3 - "$SETTINGS" <<'PYEOF'
import json
import re
import sys

path = sys.argv[1]

with open(path) as f:
    data = json.load(f)

PATTERN = re.compile(
    r'^(?P<prefix>(?:YANA_HOOK_TIMEOUT=\d+\s+)?)'
    r'YANA_GUARDED_HOOK=(?P<inner>\.claude/hooks/[A-Za-z0-9_.-]+\.sh)\s+'
    r'bash\s+(?P<guard>\.claude/hooks/hook-timeout-guard\.sh)'
    r'(?P<trailing>\s+.*)?$'
)

changed = 0
skipped_already = 0
skipped_nomatch = 0

hooks = data.get("hooks", {})
for event, matchers in hooks.items():
    for matcher in matchers:
        for h in matcher.get("hooks", []):
            if h.get("type") != "command":
                continue
            cmd = h.get("command", "")

            if "${CLAUDE_PROJECT_DIR}" in cmd:
                skipped_already += 1
                continue

            m = PATTERN.match(cmd.strip())
            if not m:
                skipped_nomatch += 1
                continue

            prefix = m.group("prefix")
            inner = m.group("inner")
            guard = m.group("guard")
            trailing = m.group("trailing") or ""

            new_cmd = (
                f'{prefix}YANA_GUARDED_HOOK="${{CLAUDE_PROJECT_DIR}}/{inner}" '
                f'bash "${{CLAUDE_PROJECT_DIR}}/{guard}"{trailing}'
            )

            h["command"] = new_cmd
            changed += 1

with open(path, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"[apply-project-dir-paths] rewrote {changed} command(s), "
      f"{skipped_already} already using \\${{CLAUDE_PROJECT_DIR}}, "
      f"{skipped_nomatch} did not match the guarded-hook pattern, in {path}")
PYEOF
