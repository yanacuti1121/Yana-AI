#!/usr/bin/env python3
"""
yana-ai harness — generate harness adapter files from core/rules/
Usage: yana-ai harness [--target cursor|opencode|zed|all] [--output DIR] [--dry-run]
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path
from datetime import datetime

REPO_ROOT = Path(__file__).resolve().parents[2]
RULES_DIR  = REPO_ROOT / "core" / "rules"
VERSION    = "0.17.0"


# ── Rule loader ───────────────────────────────────────────────────────────────

TIER_MAP = {
    "security": ("**/*.ts", "**/*.py", "**/*.sh", "**/*.js", "**/*.rs", "**/*"),
    "typescript": ("**/*.ts", "**/*.tsx"),
    "code":     ("**/*.ts", "**/*.tsx", "**/*.py", "**/*.go", "**/*.rs"),
    "git":      ("**/*",),
    "ui":       ("**/*.ts", "**/*.tsx", "**/*.css", "**/*.html"),
}

CATEGORY_GLOBS = {
    "security": ["**/*"],
    "typescript": ["**/*.ts", "**/*.tsx"],
    "agent": ["**/*"],
    "verification": ["**/*"],
    "git": ["**/*"],
    "architecture": ["**/*.ts", "**/*.tsx", "**/*.py", "**/*.rs", "**/*.go"],
    "ui": ["**/*.ts", "**/*.tsx", "**/*.css", "**/*.html"],
}

ALWAYS_APPLY = {"security", "agent", "verification", "git"}

RULE_CATEGORIES = {
    "security.md":          "security",
    "02-terminal-validator.md": "security",
    "03-privilege-isolation.md": "security",
    "anti-evasion-law.md":  "security",
    "shell-sanitize-law.md": "security",
    "typescript.md":        "typescript",
    "agent-code-constraints.md": "architecture",
    "verification.md":      "verification",
    "golden-principles.md": "agent",
    "git-workflow-v2.md":   "git",
    "git-push-enforcement.md": "git",
    "color-rules.md":       "ui",
    "typography-rules.md":  "ui",
    "tests.md":             "architecture",
    "subagent-policy.md":   "agent",
    "memory-persistence-law.md": "agent",
}

PRIORITY_RULES = list(RULE_CATEGORIES.keys())


def load_rules(max_rules: int = 12) -> list[dict]:
    rules = []
    seen_cats: dict[str, int] = {}

    for fname in PRIORITY_RULES:
        path = RULES_DIR / fname
        if not path.exists():
            continue
        cat = RULE_CATEGORIES[fname]
        seen_cats[cat] = seen_cats.get(cat, 0) + 1
        if seen_cats[cat] > 3:
            continue
        content = path.read_text(encoding="utf-8", errors="replace")
        title   = _extract_title(content) or fname.replace(".md", "").replace("-", " ").title()
        summary = _extract_summary(content)
        rules.append({"file": fname, "category": cat, "title": title, "summary": summary, "content": content})
        if len(rules) >= max_rules:
            break
    return rules


def _extract_title(text: str) -> str:
    m = re.search(r"^#\s+(.+)", text, re.MULTILINE)
    return m.group(1).strip()[:80] if m else ""


def _extract_summary(text: str) -> str:
    lines = [l.strip() for l in text.splitlines() if l.strip() and not l.startswith("#")]
    for line in lines[:10]:
        if len(line) > 30 and not line.startswith(("```", "|", "-", "*", ">")):
            return line[:200]
    return ""


# ── Cursor exporter ───────────────────────────────────────────────────────────

def export_cursor(rules: list[dict], output_dir: Path, dry_run: bool) -> list[str]:
    out = output_dir / ".cursor" / "rules"
    generated = []

    for rule in rules:
        cat   = rule["category"]
        fname = f"yana-ai-{cat}-{rule['file'].replace('.md','')}.mdc"
        globs = CATEGORY_GLOBS.get(cat, ["**/*"])
        always = str(cat in ALWAYS_APPLY).lower()

        block = _extract_code_examples(rule["content"])
        body  = f"# {rule['title']}\n\n"
        if rule["summary"]:
            body += f"{rule['summary']}\n\n"
        body += _extract_rules_section(rule["content"])
        if block:
            body += f"\n## Examples\n\n{block}"

        mdc = f"---\ndescription: Yana AI {rule['title']} — auto-generated from core/rules/{rule['file']}\nglobs: {json.dumps(globs)}\nalwaysApply: {always}\n---\n\n{body.strip()}\n"

        dest = out / fname
        generated.append(str(dest.relative_to(output_dir)))
        if not dry_run:
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(mdc, encoding="utf-8")

    return generated


def _extract_rules_section(text: str) -> str:
    lines, capture, out = text.splitlines(), False, []
    for line in lines:
        if re.match(r"^#{1,3}\s+", line):
            heading = line.lstrip("# ").lower()
            capture = any(k in heading for k in ("rule", "constraint", "prohibit", "hard", "require", "banned", "block"))
        if capture:
            out.append(line)
        if len(out) > 40:
            break
    return "\n".join(out).strip()


def _extract_code_examples(text: str) -> str:
    blocks = re.findall(r"```(?:bash|typescript|python|ts|sh)?\n(.*?)```", text, re.DOTALL)
    good   = [b.strip() for b in blocks if len(b.strip()) < 400][:2]
    if not good:
        return ""
    return "\n\n".join(f"```\n{b}\n```" for b in good)


# ── OpenCode exporter ─────────────────────────────────────────────────────────

def export_opencode(rules: list[dict], output_dir: Path, dry_run: bool) -> list[str]:
    lines = [
        "# OPENCODE.md — Yana AI Operating Manual",
        f"> Auto-generated {datetime.now().strftime('%Y-%m-%d')} from core/rules/ · v{VERSION}",
        "> If you are an AI assistant entering via OpenCode, read this file first.",
        "",
        "## What this repo is",
        "",
        "Yana AI is a personal agent OS for Claude Code, Cursor, OpenCode, Zed, and other AI coding harnesses.",
        "8,550 skills · 93 agents · 61 security rules · 46 safety hooks · Rust runtime",
        "",
        "Full docs: https://yanacuti1121.github.io/yana-ai/",
        "",
        "---",
        "",
        "## Five rules that apply everywhere",
        "",
        "1. **No claim without evidence.** Before 'done/fixed/clean' — show command output.",
        "2. **Surgical changes.** Only touch what was asked. Don't improve adjacent code.",
        "3. **Scope first.** Declare which files you'll touch before starting.",
        "4. **Gate before push.** `bash core/scripts/drift-check.sh` must show CLEAN.",
        "5. **No secrets.** Never write API keys, tokens, credentials in any file.",
        "",
        "---",
        "",
    ]

    for rule in rules:
        if rule["category"] in ("security", "agent", "verification", "git"):
            lines.append(f"## {rule['title']}")
            if rule["summary"]:
                lines.append(f"\n{rule['summary']}")
            section = _extract_rules_section(rule["content"])
            if section:
                lines.append(f"\n{section[:600]}")
            lines.append("")

    lines += [
        "---",
        "",
        "## Hard prohibitions",
        "",
        "```",
        "NEVER: rm -rf · git push --force · git reset --hard",
        "NEVER: curl|bash · eval dynamic code · DROP TABLE",
        "NEVER: hardcode secrets · claim PASS without evidence",
        "```",
        "",
        "## Before git push",
        "",
        "```bash",
        "bash core/tests/skills/test-skill-triggering.sh   # Result: PASS",
        "bash core/scripts/drift-check.sh                   # CLEAN",
        "```",
    ]

    content = "\n".join(lines)
    dest    = output_dir / "OPENCODE.md"
    if not dry_run:
        dest.write_text(content, encoding="utf-8")
    return ["OPENCODE.md"]


# ── Zed exporter ──────────────────────────────────────────────────────────────

def export_zed(rules: list[dict], output_dir: Path, dry_run: bool) -> list[str]:
    prohibitions = [
        "rm -rf, git push --force, git reset --hard",
        "curl|bash, eval dynamic code, DROP TABLE",
        "Hardcoded secrets or API keys",
        "Claiming PASS/DONE without running the actual command",
    ]
    constraints = [
        "Max function: 50 lines · Max file: 300 lines · Max nesting: 3 levels",
        "No any in TypeScript — use unknown + narrow",
        "Verify before completion: run command, show output, then state result",
        "Declare scope before starting — only touch declared files",
    ]

    prompt = (
        "You are operating under Yana AI governance in this repository.\n\n"
        "Read AGENTS.md first. Then gates/truth_gate.md.\n\n"
        "Hard prohibitions:\n"
        + "\n".join(f"- {p}" for p in prohibitions) +
        "\n\nCode constraints:\n"
        + "\n".join(f"- {c}" for c in constraints) +
        "\n\nBefore git push: bash core/scripts/drift-check.sh must show CLEAN.\n\n"
        "This repo has 8,550 skills in core/skills/, 93 agents, and a Rust runtime.\n"
        "Full docs: https://yanacuti1121.github.io/yana-ai/"
    )

    settings = {
        "assistant": {
            "version": "2",
            "default_model": {"provider": "anthropic", "model": "claude-sonnet-4-6"}
        },
        "context_servers": {},
        "custom_system_prompt": prompt
    }

    dest = output_dir / ".zed" / "settings.json"
    if not dry_run:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(settings, indent=2, ensure_ascii=False), encoding="utf-8")
    return [".zed/settings.json"]


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        prog="yana-ai harness",
        description="Generate harness adapter files from core/rules/",
    )
    parser.add_argument("--target", choices=["cursor", "opencode", "zed", "all"], default="all")
    parser.add_argument("--output", default=str(REPO_ROOT), help="Output directory (default: repo root)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing files")
    args = parser.parse_args()

    output_dir = Path(args.output).resolve()
    rules      = load_rules()
    generated  = []

    targets = ["cursor", "opencode", "zed"] if args.target == "all" else [args.target]

    for target in targets:
        if target == "cursor":
            files = export_cursor(rules, output_dir, args.dry_run)
        elif target == "opencode":
            files = export_opencode(rules, output_dir, args.dry_run)
        elif target == "zed":
            files = export_zed(rules, output_dir, args.dry_run)
        else:
            continue
        generated.extend(files)
        tag = "[DRY RUN] " if args.dry_run else ""
        for f in files:
            print(f"{tag}✓ {target:10} → {f}")

    print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Generated {len(generated)} adapter file(s) from {len(rules)} rules.")


if __name__ == "__main__":
    main()
