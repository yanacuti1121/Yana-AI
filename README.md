# YAMTAM ENGINE

**Personal agent operating system.**
Hook layer, safety guards, and workflow rules for AI assistants
(Claude Code, Manus) operating on arbitrary codebases.

**Version:** v1.2.9-fixed (scaffold — release pack pending)
**Status:** Documentation-first scaffold. Hook source files not yet imported.
**Maintainer:** Vũ Văn Tâm
**Repo type:** Standalone — NOT part of any product repo.

---

## What YAMTAM is

A pack of bash hooks, scripts, and tests that you drop into a project's
`.claude/` directory to constrain what an AI agent can do:

- Block destructive shell, DB, and API commands.
- Warn when agent reads secrets/tokens.
- Enforce evidence before agent claims `done` / `passed` / `clean`.
- Log all hook decisions locally for audit.

## What YAMTAM is not

- Not a product. Not user-facing.
- Not a replacement for production safety (IAM, backups, RBAC).
- Not a full protection layer — see `docs/LIMITATIONS.md` (when imported).
- Not coupled to any single project. Apply to any repo via release pack.

---

## Repo structure

```txt
yamtam-engine/
├── README.md              ← you are here
├── CHANGELOG.md
├── ROADMAP.md
├── MANIFEST.json
├── .gitignore
│
├── core/                  ← hook source (PLACEHOLDER, see below)
│   ├── hooks/
│   ├── scripts/
│   └── tests/
│
├── gates/
│   └── truth_gate.md      ← L3 spec, prompt-enforced
│
├── docs/
│   ├── SEPARATION.md      ← YAMTAM vs target product boundary
│   └── RUNBOOK.md         ← apply YAMTAM to any project
│
└── releases/              ← versioned packs (empty until first release)
```

---

## Placeholder status

This scaffold is **documentation-only**. The following are empty placeholders:

| Path | Status | Source |
|---|---|---|
| `core/hooks/` | empty | import from `YAMTAM_ENGINE_v1.2.9.zip` |
| `core/scripts/` | empty | import from `YAMTAM_ENGINE_v1.2.9.zip` |
| `core/tests/` | empty | import from `YAMTAM_ENGINE_v1.2.9.zip` |
| `releases/` | empty | first release pack cut from `core/` |

Until those folders are populated, this repo does NOT enforce anything at runtime.
Truth Gate (gates/truth_gate.md) is enforced via AI prompt only.

---

## How to use

See `docs/RUNBOOK.md` for full apply guide.

Quick version:
```bash
unzip releases/yamtam-engine-vX.Y.Z-fixed.zip -d /path/to/target-project/.claude/
cd /path/to/target-project
.claude/tests/hooks/run-hook-tests.sh
```

---

## License / credits

Licensed under MIT. See `LICENSE`.
Initial author: Vũ Văn Tâm.
Not affiliated with any specific product repo this pack may be applied to.
