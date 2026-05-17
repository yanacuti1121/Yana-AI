# YAMTAM ENGINE

**Personal agent operating system.**
Hook layer, safety guards, and workflow rules for AI assistants
(Claude Code, Manus) operating on arbitrary codebases.

**Version:** 1.3.0
**Status:** Runtime active. Truth Gate hook live. L1 memory schema in place. Release pack not yet cut.
**Maintainer:** Vũ Văn Tâm
**Repo type:** Standalone — NOT part of any product repo.

---

## What YAMTAM is

A pack of bash hooks, scripts, and tests that you drop into a project's
`.claude/` directory to constrain what an AI agent can do:

- Block destructive shell, DB, and API commands.
- Warn when agent reads secrets/tokens or writes to product directories.
- Enforce evidence before agent claims `done` / `passed` / `clean` (Truth Gate).
- Detect documentation drift and stale claims automatically.
- Store verified facts in L1 Atomic Memory (file-based, no network).
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
├── AGENTS.md              ← entry point for AI assistants (read first if AI)
├── CHANGELOG.md
├── ROADMAP.md
├── MANIFEST.json
├── LICENSE
├── .gitignore
│
├── core/                  ← runtime assets
│   ├── agents/            ← 19 agent definitions
│   ├── commands/          ← 23 slash commands (incl. /verify, /memory)
│   ├── hooks/             ← 22 hooks (.sh + .js)
│   ├── scripts/           ← 13 utility scripts (incl. drift-check, search-facts, add-fact)
│   ├── rules/             ← 3 coding rules
│   ├── templates/         ← 11 project templates
│   ├── skills/            ← 8 skill definitions (gitnexus + karpathy)
│   ├── config/            ← 6 config JSON files
│   └── tests/
│       └── hooks/         ← run-hook-tests.sh (20 test cases)
│
├── memory/
│   └── L1_atomic/         ← file-based fact store (schema + index)
│
├── gates/
│   ├── truth_gate.md      ← L3 spec + runtime hook (truth-gate-guard.sh)
│   └── action_gate.md     ← L4 spec + runtime hook (scope-guard.sh)
│
├── prompts/
│   └── system_prompt.md   ← copy-paste prompt block for AI operators
│
├── docs/
│   ├── SEPARATION.md      ← YAMTAM vs target product boundary
│   ├── RUNBOOK.md         ← apply YAMTAM to any project
│   ├── AGENT_BEHAVIOR.md  ← good vs bad behavior examples
│   ├── AGENT_INCIDENT_DEFENSE.md  ← incident defense patterns
│   └── YAMTAM_ENGINE_v1.2.9_Known_Limitations.md
│
└── releases/              ← versioned packs (empty until first release)
```

---

## Import status

Phase 1 runtime import complete. Core assets are present in `core/`.

| Path | Status |
|---|---|
| `core/agents/` | ✅ 19 agents |
| `core/commands/` | ✅ 23 commands |
| `core/hooks/` | ✅ 22 hooks |
| `core/scripts/` | ✅ 13 scripts |
| `core/rules/` | ✅ 3 rules |
| `core/templates/` | ✅ 11 templates |
| `core/skills/` | ✅ 8 skills |
| `core/config/` | ✅ 6 config files |
| `core/tests/hooks/` | ✅ 20 test cases |
| `memory/L1_atomic/` | 🟡 schema + index (no facts yet) |
| `releases/` | empty — release pack not yet cut |

**Pending review before import:** `react-native-developer.md`, `copywriter-seo.md`, `settings.json`.

Truth Gate enforced via prompt **and** runtime hook (`truth-gate-guard.sh`).

---

## How to use

See `docs/RUNBOOK.md` for full apply guide.

> Once a release pack has been cut (see RUNBOOK §"Cut a New YAMTAM Release"),
> the `releases/` folder will contain the pack zip. At scaffold stage, this
> folder is empty.

Quick version (after a release pack exists):
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
