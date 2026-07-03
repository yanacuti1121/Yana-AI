#!/usr/bin/env python3
"""gen_guards_index.py — regenerate guards/index.yml from core/hooks/*.sh.

guards/index.yml used to be hand-maintained and covered 5 of the (now 50)
hooks in core/hooks/ — nothing in the repo actually reads it, so it just
silently fell behind as hooks were added. This script derives what it
safely can from each hook's own header comment and writes a fresh index
covering every hook.

What's auto-derived (mechanical, low-risk to get from a header comment):
  - file           the hook's filename
  - description    the "# Description: ..." line, or the first
                    substantive header comment line as a fallback
  - hook_type      parsed from "Hook type: X" / "X hook —" / "Hook: X"
                    phrasing patterns already used across hook headers

What's NOT auto-derived — these require actually reading and judging the
hook's logic, not just its header comment, so guessing them here would
manufacture false confidence rather than real documentation:
  - risk_level     preserved from the previous index.yml for hooks that
                    already had a human-reviewed entry; left unset for
                    every other hook rather than invented
  - matcher        same: preserved if a prior entry had one, else unset

Usage: python3 core/scripts/gen_guards_index.py [--check]
  --check   exit 1 if guards/index.yml would change (CI drift check),
            don't write anything
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
HOOKS_DIR = REPO / "core/hooks"
INDEX_FILE = REPO / "guards/index.yml"

HOOK_TYPE_PATTERNS = [
    re.compile(r"Hook type:\s*(\w+)", re.I),
    re.compile(r"^Hook:\s*(\w+)", re.I | re.M),
    re.compile(r"\b(PreToolUse|PostToolUse|Stop|UserPromptSubmit|SessionStart|SessionEnd)\s+hook\b", re.I),
    re.compile(r"^(PreToolUse|PostToolUse|Stop|UserPromptSubmit|SessionStart|SessionEnd)\s*(—|:)", re.I | re.M),
]

DESCRIPTION_PATTERNS = [
    re.compile(r"^Description:\s*(.+)$", re.M),
    re.compile(r"^Purpose:\s*(.+)$", re.M),
]


def strip_comment_markers(text: str) -> str:
    """Normalize '#', '//', and '/** ... */'-style leading markers to plain
    text so the same regexes work across bash (.sh) and JS (.js) hooks."""
    out = []
    for line in text.splitlines():
        line = line.strip()
        line = re.sub(r"^(#|//|/\*\*?|\*/?)\s?", "", line)
        out.append(line)
    return "\n".join(out)


def yaml_escape(s: str) -> str:
    s = s.replace('"', '\\"')
    return f'"{s}"'


def parse_hook(path: Path) -> dict:
    raw_lines = path.read_text(errors="replace").splitlines()[:15]
    header = strip_comment_markers("\n".join(raw_lines))

    hook_type = ""
    for pat in HOOK_TYPE_PATTERNS:
        m = pat.search(header)
        if m:
            hook_type = m.group(1)
            break

    description = ""
    for pat in DESCRIPTION_PATTERNS:
        m = pat.search(header)
        if m:
            description = m.group(1).strip()
            break
    if not description:
        # Fallback: first comment line that isn't boilerplate (shebang,
        # "Yana AI Hook", a bare Version/Status line, a title line that's
        # just "<filename> — PreToolUse hook" restating what we already
        # know, a blank comment).
        for line in header.splitlines()[1:]:
            line = line.strip()
            if not line or line.startswith("#!"):
                continue
            if re.match(r"^(Yana AI( Hook)?|Version:|Status:|Last Reviewed:|Hook type:|Hook:|Bypass:|Requires:)", line, re.I):
                continue
            if re.match(rf"^{re.escape(path.name)}\s*(—|-|:)\s*\w+\s+hook\b", line, re.I):
                continue
            description = line
            break

    return {"file": path.name, "description": description, "hook_type": hook_type}


def load_prior_manual_fields() -> dict[str, dict]:
    """Pull risk_level/matcher from the existing hand-maintained index.yml,
    keyed by filename, so a regenerate doesn't discard human judgment calls
    that were already made for the hooks that already had entries.

    Parses by block (a 2-space-indented "key:" line starts a new entry),
    not by "file:" position specifically — field order varies between the
    original hand-written entries (file before risk_level) and this
    script's own output (file after risk_level), and an earlier version of
    this function silently dropped every "matcher" value because it only
    started collecting fields once it had already seen "file:".
    """
    if not INDEX_FILE.exists():
        return {}
    text = INDEX_FILE.read_text()
    manual = {}
    blocks: list[list[str]] = []
    for line in text.splitlines():
        if re.match(r"^  \S.*:\s*$", line):  # new top-level "key:" entry
            blocks.append([])
        if blocks:
            blocks[-1].append(line)

    for block in blocks:
        block_text = "\n".join(block)
        file_m = re.search(r"^\s{4}file:\s*(\S+)", block_text, re.M)
        if not file_m:
            continue
        current_file = file_m.group(1)
        current = {}
        for field in ("risk_level", "matcher"):
            fm = re.search(rf"^\s{{4}}{field}:\s*(.+)$", block_text, re.M)
            if fm:
                value = fm.group(1).split("#")[0].strip().strip('"')
                # "unclassified" is this script's own default marker, not a
                # human judgment call — treating it as "manual" would make
                # a second run read the first run's own placeholder back as
                # preserved data and silently drop the explanatory comment
                # (this script's output would then differ from itself).
                if field == "risk_level" and value == "unclassified":
                    continue
                current[field] = value
        if current:
            manual[current_file] = current
    return manual


def main() -> int:
    check_mode = "--check" in sys.argv

    hooks = sorted(
        p for p in HOOKS_DIR.iterdir()
        if p.is_file() and p.name != "CLAUDE.md" and not p.name.startswith(".")
    )
    prior_manual = load_prior_manual_fields()

    lines = ["guards:", ""]
    for path in hooks:
        info = parse_hook(path)
        key = path.stem
        lines.append(f"  {key}:")
        lines.append(f"    description: {yaml_escape(info['description'] or '(no description found in header)')}")
        lines.append(f"    hook_type: {info['hook_type'] or 'unknown'}")
        manual = prior_manual.get(path.name, {})
        if "matcher" in manual:
            lines.append(f"    matcher: {yaml_escape(manual['matcher'])}")
        if "risk_level" in manual:
            lines.append(f"    risk_level: {manual['risk_level']}")
        else:
            lines.append("    risk_level: unclassified  # not yet human-reviewed — see gen_guards_index.py")
        lines.append(f"    file: {info['file']}")
        lines.append("")

    new_content = "\n".join(lines).rstrip() + "\n"

    if check_mode:
        old_content = INDEX_FILE.read_text() if INDEX_FILE.exists() else ""
        if old_content != new_content:
            print(f"guards/index.yml is stale — {len(hooks)} hooks on disk, "
                  f"regenerate with: python3 core/scripts/gen_guards_index.py")
            return 1
        print(f"guards/index.yml: CLEAN — matches all {len(hooks)} hooks in core/hooks/")
        return 0

    INDEX_FILE.write_text(new_content)
    print(f"wrote {INDEX_FILE} — {len(hooks)} hooks indexed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
