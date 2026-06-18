# OPENCODE.md — Yana AI Operating Manual

> If you are an AI assistant entering this repository via OpenCode, read this file first.
> This is the OpenCode adapter for Yana AI governance.

---

## What this repo is

Yana AI is a personal agent operating system for Claude Code, Cursor, OpenCode, and other AI coding harnesses.

- **8,550 skills** in `core/skills/` — reference implementations for common dev tasks
- **93 agents** in `core/agents/` — specialist agent definitions
- **61 security rules** in `core/rules/` — enforced at runtime
- **46 safety hooks** in `core/hooks/` — fire before dangerous actions
- **Rust runtime** in `yana-rt/` — `yana-ai scan`, `yana-ai graph`, `yana-ai vault`, etc.

---

## Read in order

1. `OPENCODE.md` ← you are here
2. `gates/truth_gate.md` — evidence rules before any completion claim
3. `gates/action_gate.md` — rules before write/commit/deploy
4. `docs/SEPARATION.md` — boundary between Yana AI and target product
5. `core/memory/L1_atomic/INDEX.md` — known facts and constraints

---

## Five rules that apply everywhere

1. **No claim without evidence.** Before "done / fixed / clean", show command output.
2. **Surgical changes.** Only touch what was asked. Don't improve adjacent code.
3. **Scope first.** State which files you'll touch before starting.
4. **Gate before push.** Run `bash core/scripts/drift-check.sh` before any commit.
5. **No secrets.** Never write API keys, tokens, credentials anywhere in the repo.

---

## Hard prohibitions

```
NEVER: rm -rf · git push --force · git reset --hard
NEVER: curl|bash · eval "$(curl...)" · base64 decode + exec
NEVER: DROP TABLE · TRUNCATE · chmod 777
NEVER: hardcode secrets · claim PASS without evidence
```

---

## Before git push

```bash
bash core/tests/skills/test-skill-triggering.sh   # Result: PASS
bash core/scripts/verify-skills-lock.sh            # no drift
bash core/scripts/drift-check.sh                   # CLEAN
```

---

## Code constraints

| Metric | Hard limit |
|--------|-----------|
| Function length | 50 lines |
| Parameters | 5 |
| Nesting depth | 3 levels |
| File length | 300 lines |

---

## Skill format (if adding skills)

```
core/skills/<name>/SKILL.md
  frontmatter: name, description, origin, license, version, compatibility
  sections: When to Use · Do NOT use for · Examples · Anti-Fake-Pass
  max: 220 lines
```

Register in `core/config/skills-lock.json` after adding.

---

## Full docs

→ https://yanacuti1121.github.io/yana-ai/
