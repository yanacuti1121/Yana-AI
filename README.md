# YAMTAM ENGINE

**Personal agent operating system.**
Hook layer, safety guards, and workflow rules for AI assistants
(Claude Code or other AI coding assistants) operating on arbitrary codebases.

![YAMTAM ENGINE Overview](docs/yamtam-engine-overview.png)

| Asset | Count |
|---|---|
| Agents | 87 |
| Commands | 156 |
| Hooks | 26 |
| Scripts | 21 |
| Skills | 77 |
| Rules | 11 |
| Templates | 12 |
| Tests | 131 checks (55 hook + 12 audit + 58 skill + 6 smoke) |

**Version:** 1.3.27
**Status:** Runtime active. 131 checks passing (55 hook + 12 audit + 58 skill + 6 smoke). Release pack live.
**Maintainer:** Vũ Văn Tâm
**Repo type:** Standalone — NOT part of any product repo.

---

## What YAMTAM is

A pack of bash hooks, scripts, and tests that you drop into a project's
`.claude/` directory to constrain what an AI agent can do:

- Block destructive shell, DB, API, and deploy commands.
- Warn when agent reads secrets/tokens or writes to product directories.
- Enforce evidence before agent claims `done` / `passed` / `clean` (Truth Gate).
- Gate commits touching cross-scope paths; block unauthorized deploys.
- Store verified facts in L1 Atomic Memory; session facts in L2 (gitignored).
- Detect documentation drift and stale claims automatically.
- Log all hook decisions locally with SHA-256 hash-chain audit trail (tamper-evident).
- Track session trust score — Truth Gate violations decrement score; score < 50 requires double evidence.
- Proactively verify claims with `/fact-check`; self-improve skills with `/improve-skill` (human-gated).

## What YAMTAM is not

- Not a product. Not user-facing.
- Not a replacement for production safety (IAM, backups, RBAC).
- Not a full protection layer — see `docs/LIMITATIONS.md` (when imported).
- Not coupled to any single project. Apply to any repo via release pack.
- See `.out-of-scope/` for features deliberately not built.

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
│   ├── agents/            ← 87 agent definitions across root and domain subfolders (quality-testing x5, infrastructure x12, security-team, core-development x8, quality-assurance x6, business x4, data-ai x6, orchestration x3, dev-experience x4, research x2, forge x4)
│   ├── commands/          ← 156 slash commands (incl. /security-audit, /security-scan, /performance-audit, /write-tests, /ultra-think, /tdd-cycle, /smart-fix)
│   ├── hooks/             ← 26 hooks (.sh + .js)
│   ├── scripts/           ← 21 utility scripts
│   ├── rules/             ← 11 coding rules (incl. subagent-policy, conflict-resolution)
│   ├── templates/         ← 12 project templates (incl. SKILL_TEMPLATE.md)
│   ├── skills/            ← 77 skill definitions (gitnexus x7, karpathy, git-lessons, plan-first, verify-before-done, debug-protocol, branch-finish, worktree-safety, tdd, executing-plans, requesting-code-review, receiving-code-review, writing-skills, lsp-navigation, audit-env-variables, remove-dead-code, file-watcher, setup-agent-tail, telemetry-analysis, subagent-dependency, agenthub, write-a-skill, handoff, caveman, code-tour, chaos-engineering, llm-cost-optimizer, pulse, research, session-context, pre-compact-backup, team-orchestrator, strategic-compact, session-wrap, verification-engine, skill-factory, security-compliance, security-pipeline, stride-analysis-patterns, debugging-strategies, extract-errors, build-system, cache-components, verify-implementation, hook-block-commands, hook-protect-secrets, l1-promote, red-team-check, blue-team-fix, purple-team-report, design-taste-frontend, image-to-code, ui-redesign, output-enforcement, minimalist-ui, aesthetic-anchor, accessibility-audit, design-system-gen, ux-heuristics)
│   ├── config/            ← 6 config JSON files
│   └── tests/
│       ├── hooks/         ← run-hook-tests.sh + test-audit-chain.sh (55+12 test cases)
│       ├── skills/        ← test-skill-triggering.sh (58 skill trigger tests)
│       └── commands/      ← test-hook-review-smoke.sh (6 smoke tests)
│
├── memory/
│   ├── L1_atomic/         ← persistent fact store (tagged, confidence-gated)
│   └── L2_session/        ← session-scoped facts (gitignored, cleared each session)
│
├── gates/
│   ├── truth_gate.md           ← L3 spec + runtime hook (truth-gate-guard.sh)
│   ├── action_gate.md          ← L4 spec (L0–L5 coverage table)
│   ├── anti-fake-pass-gate.md  ← L4 process gate — evidence hierarchy (PASS/REVIEWED/UNKNOWN)
│   ├── security-scope-gate.md  ← ownership confirmation before any security scan
│   └── ui-quality-gate.md      ← L1–L4 UI delivery gate (baseline → accessible → ship-ready)
│
├── prompts/
│   └── system_prompt.md   ← copy-paste prompt block for AI operators
│
├── docs/
│   ├── HOOK_WIRING.md        ← settings.json presets for all 26 hooks + /hook-review entry
│   ├── MAINTENANCE_POLICY.md ← hook lifecycle: active/review/deprecated/removed
│   ├── CLAUDE_MD_GUIDE.md    ← CLAUDE.md architecture guide (4-tier layering)
│   ├── SEPARATION.md         ← YAMTAM vs target product boundary
│   ├── RUNBOOK.md            ← apply YAMTAM to any project
│   ├── AGENT_BEHAVIOR.md     ← good vs bad behavior examples
│   ├── AGENT_INCIDENT_DEFENSE.md
│   ├── AUDIT_HARDENING.md    ← hash-chain audit log design
│   ├── OUTPUT_BUDGET_POLICY.md   ← token output budget rules
│   ├── OUTPUT_BUDGET_INTEGRATION.md ← wiring output budget layer
│   ├── third-party-inspiration.md   ← attribution log for all external sources
│   ├── skill-spec.md                ← YAMTAM Skill Specification v1.0
│   ├── skill-writing-guide.md       ← 8-section guide: descriptions, anti-patterns, attribution
│   ├── skill-evaluation-rules.md    ← pre-add quality checklist + trigger test
│   ├── security-scan-modes.md       ← quick / targeted / deep scan specs
│   └── model-routing-strategy.md    ← Power/Balanced/Fast tier taxonomy + agent routing map
│
├── .out-of-scope/         ← features deliberately not built (5 boundary docs)
├── .claude-plugin/        ← plugin manifest for /plugin install
│   ├── plugin.json
│   └── marketplace.json
├── .github/
│   ├── workflows/release.yml      ← auto-release on semver tag push
│   └── security-advisories/       ← GHSA template + filed advisories
│
└── releases/              ← versioned packs
    ├── yamtam-engine-v1.3.27-fixed.zip  ← current
    └── yamtam-engine-latest.zip         ← symlink → current
```

---

## Asset counts

| Path | Count |
|---|---|
| `core/agents/` | 87 agents |
| `core/commands/` | 156 commands |
| `core/hooks/` | 26 hooks |
| `core/scripts/` | 21 scripts |
| `core/rules/` | 11 rules |
| `core/templates/` | 12 templates |
| `core/skills/` | 77 skills |
| `core/config/` | 6 config files |
| `core/tests/hooks/` | 55 test cases |
| `core/tests/skills/` | 58 skill trigger tests |
| `core/tests/commands/` | 6 smoke tests |
| `memory/L1_atomic/` | 4 seed facts (tagged) |
| `memory/L2_session/` | ephemeral — gitignored |

---

## Action Gate coverage (L0–L5)

| Level | Hook | Behavior |
|---|---|---|
| L0 | `audit-log.sh`, `telemetry-sender.sh` | Log every tool call (hash-chain tamper-evident) |
| L1 | `token-scope-guard.sh`, `scope-guard.sh` | Warn on secret/scope access |
| L2 | `commit-gate.sh` | Advisory warn on cross-scope commits |
| L3 | `truth-gate-guard.sh` | Warn on unsupported claims |
| L4 | `deploy-gate.sh` | Block gh/kubectl/docker/gcloud/fly/heroku deploys |
| L5 | `db-protect.sh`, `api-destruct-guard.sh`, `guard-destructive.sh` | Block destructive ops |

Bypass: `YAMTAM_DEPLOY_APPROVED=1`, `YAMTAM_SCOPE_OK=1`, `YAMTAM_TRUTH_GATE_BYPASS=1`.

---

## How to apply to a project

See `docs/HOOK_WIRING.md` for full wiring guide and `settings.json` presets.

```bash
# Apply latest release pack
unzip releases/yamtam-engine-latest.zip -d /path/to/project/.claude/

# Verify
cd /path/to/project
bash .claude/tests/hooks/run-hook-tests.sh
```

Or install via Claude Code plugin system:
```
/plugin install phamlongh230-lgtm/yamtam-engine
```

---

## How to cut a new release

```bash
# In this repo — after making changes:
bash core/scripts/build-release.sh
# Runs: syntax check → 131 checks → drift check → zip → symlink latest
```

GitHub Actions auto-releases on semver tag push:
```bash
git tag v1.3.27 && git push origin v1.3.27
```

---

## License / credits

Licensed under MIT. See `LICENSE`.
Initial author: Vũ Văn Tâm.
Not affiliated with any specific product repo this pack may be applied to.
