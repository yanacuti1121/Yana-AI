# YAMTAM ENGINE — Changelog

All notable changes to YAMTAM ENGINE release packs are documented here.

> **Note:** This changelog tracks **release pack** events. This scaffold repo
> does not enforce any release item at runtime until the pack's `hooks/`,
> `scripts/`, and `tests/` are imported into `core/`.

---

## v0.18.0 — yamtam-rt v1.1.0: CI publish + score command
*TBD*

### Status: UNRELEASED 🔲

### Highlights
- **yamtam-rt v1.1.0** — CI publish pipeline to crates.io + 35 integration tests + `score` subcommand
- CI workflow publishes binary artifacts on release tag push
- `score` subcommand for rule scoring and analysis

---

## v0.17.0 — yamtam-rt v1.0.0: Full Python CLI parity in Rust
*2026-05-30*

### Status: RELEASED ✅

### Highlights
- **yamtam-rt v1.0.0** — 17 Rust subcommands, full Python CLI parity
- **Ported 9 Python scripts → Rust** (~4.5k lines): scan, graph, hunt, design, doctor, spec, ci, map, fix
- **vault** subcommand: Vietnamese-first knowledge vault + multilingual translation links (WMT23-inspired)
- **+235 skills** imported from affaan-m/ECC (225), Leonxlnx/taste-skill (7), hardikpandya/stop-slop (1), NanmiCoder/cc-haha (2) — total 2197 skills
- **liteparse** Rust dep + `vault import` command (PDF/DOCX → markdown via markitdown)

### New subcommands
`ci` · `map` · `fix` · `doctor` · `spec` · `graph` · `vault` · `hunt` · `design`

---

## v0.16.0 — yamtam-rt runtime: Agent Bus + L3 Memory + Config/Plugin/Cost
*2026-05-29*

### Status: RELEASED ✅

### New: `yamtam-rt bus` — Agent Message Bus (Phase 1)
JSONL event bus at `.yamtam/bus.jsonl`. Agents pass output to each other via file, not context window.
- `bus emit <from> <to> <type> <payload>` — broadcast supported via `to="*"`
- `bus read [--agent] [--since] [--reply-to] [--last]` — filtered event stream
- `bus reply <id> <from> <payload>` — linked reply with `reply_to` field
- `bus inbox <agent>` — all messages addressed to an agent

### New: `yamtam-rt memory` — L3 Shared Memory (Phase 2)
Workspace-level fact store at `.yamtam/l3.jsonl`. Survives across sessions, shared between agents.
- `memory store <key> <value> [--tag] [--agent] [--confidence]` — upsert
- `memory get <key>` — prefix-match lookup
- `memory list [--tag] [--agent] [--last]` — promoted flag shown
- `memory promote <key>` — L3 → L1 atomic `.md` file + `INDEX.md`
- `memory import [--l2-dir]` — bulk L2 session facts → L3
- Promotion pipeline: L2 (session) → L3 (workspace) → L1 (permanent, git-tracked)

### New: `yamtam-rt config / plugin / cost` — Cross-repo Pack (Phase 3)
- `config init/show/set` — reads `.yamtam/settings.json` from any target repo
- `plugin add/remove/enable/disable/run` — inject custom guards without forking
- `cost log/show/breakdown` — token usage ledger with tier/model/task breakdown (rates from `model-routing-policy.yml`)

### Architecture: module split
`src/` split into `main.rs` + `config.rs` + `plugin.rs` + `cost.rs`

---

## v0.15.0 — yamtam hunt, yamtam design, design/book skills (Total: 1,967)
*2026-05-29*

### Status: RELEASED ✅

### New: `yamtam hunt [target]` — active security scanner
Turns YAMTAM from passive auditor → active hunter. Inspired by gadievron/raptor.

- **secrets**: 13 patterns (AWS keys, GitHub tokens, OpenAI/Anthropic keys, Stripe, private keys, DB connection strings, JWT secrets...)
- **code**: SQL injection, command injection, path traversal, debug flags, security TODOs
- **supply-chain**: pipe-to-shell, npm postinstall scripts, floating versions, git URL deps
- **deps**: npm audit + pip-audit integration
- `--json` machine-readable output, `--fail-on` CI gate

### New: `yamtam design <subcommand>` — design context extraction
Inspired by bergside/design-md-chrome. Extract design tokens from any URL → DESIGN.md for AI agent context.

- `yamtam design extract <url>` — fetch page, extract CSS variables, colors, fonts, spacing, shadows, border-radius
- `yamtam design show` — display extracted token summary
- `yamtam design init` — generate DESIGN.md from tokens (ready for AI agent context)

### Skill imports (+116)
- **bergside/awesome-design-skills** (MIT): 67 design skills — glassmorphism, neumorphism, neobrutalism, brutalism, claymorphism, retro, vintage, luxury, editorial, matrix, tetris, sega, shadcn...
- **ciembor/agent-rules-books** (MIT): 42 skills (14 books × 3 variants: full/mini/nano) — Clean Code, Clean Architecture, DDIA, DDD, Pragmatic Programmer, Refactoring, Release It!, PoEAA, Philosophy of Software Design, Code Complete, Working with Legacy Code

### CLI version bump
- `bin/yamtam` → v0.15.0
- New commands: `hunt`, `design`
- Total skills: 1,851 → **1,967**

---

## v0.14.2 — 1,048 Skills from Open-Source Repos (Total: 1,851)
*2026-05-29*

### Status: RELEASED ✅

### Skill imports
- **TerminalSkills/skills** (Apache-2.0): 1,009 skills — AWS full stack, Azure, GCP, Ansible, ArgoCD, Blender (8 skills), AI pentesting, Aircrack-ng, Burp Suite, Anthropic SDK, Venice AI, Braintrust, actix-web, axum, Bun, AdonisJS, FastAPI, and more
- **veniceai/skills** (MIT): 19 skills — full Venice.ai API surface (chat, image, audio, video, embeddings, crypto-rpc, E2EE, characters)
- **machina-sports/sports-skills** (MIT): 20 skills — NFL, NBA, MLB, NHL, F1 (FastF1), prediction markets (Kalshi, Polymarket), college sports
- Total skills: 810 → **1,851**

### New importer
- `core/scripts/import_skills_flat.py` — handles flat `skills/<name>/SKILL.md` structure

---

## v0.14.1 — 423 Skills from openai/plugins (MIT)
*2026-05-29*

### Status: RELEASED ✅

### Skills imported from openai/plugins (MIT, 1.2k stars)
- 49 plugin namespaces: GitHub (4), Slack (6), Linear (1), Stripe (2), Vercel (47), Zoom (27), Netlify (12), Twilio (55), Cloudflare (9), Figma (8), Hugging Face (11), Expo (13), Codex Security (8), Game Studio (9), Sentry (1), Supabase (2), and more
- 73 skills include Python helper scripts (inspect_pr_checks.py, etc.)
- Naming convention: `openai--<plugin>--<skill-name>`
- Total skills: 387 → **810**

### New importer
- `core/scripts/import_openai_plugins.py` — handles `plugins/<name>/skills/<skill>/SKILL.md` structure

---

## v0.14.0 — yamtam graph (Understand-Anything knowledge graph pipeline)
*2026-05-29*

### Status: RELEASED ✅

### New: `yamtam graph` — knowledge graph pipeline
Adapted from Lum1104/Understand-Anything (MIT, 43k stars). Pure Python, no tree-sitter, no automatic LLM calls.

**Pipeline (graph_builder.py):**
- Stage 1 — project_scan: file walk, language/framework detection, regex import map (12 languages)
- Stage 2 — file_analyze: batched (20 files), ast for Python, regex for TS/JS; 1,427 nodes from YAMTAM itself
- Stage 3 — arch_analyze: heuristic layer assignment (api/service/data/ui/config/test/docs/util)
- Stage 4 — tour_build: topological sort (Kahn's) → dependency-ordered tour
- Stage 5 — assemble → `.yamtam/graph/knowledge-graph.json`

**Commands:**
- `yamtam graph build [target]` — build knowledge graph
- `yamtam graph show [target]` — summary (nodes/edges/layers/tour)
- `yamtam graph search <query>` — keyword search with `--expand` for 1-hop neighbours
- `yamtam graph onboard [target]` — Markdown onboarding guide (`--out <file>`)
- `yamtam graph diff [base]` — diff impact analysis (risk level, blast radius, affected layers)

### CLI version bump
- `bin/yamtam` → v0.14.0
- New command: `graph`
- scripts: 81 → 83

---

## v0.13.0 — audit --watch, report pdf, rule test, config manager
*2026-05-29*

### Status: RELEASED ✅

### New: `yamtam audit --watch`
- Re-audits whenever files in target directory change (polls every 2s, sha256 fingerprint)
- Ctrl-C to stop; supports all audit flags (--json, --quiet, --ignore, --only)

### New: `yamtam report pdf`
- Generates HTML first, converts to PDF via: weasyprint → wkhtmltopdf → fallback HTML
- `--out`, `--fail-on`, `--ignore`, `--open` flags

### New: `yamtam rule test`
- `yamtam rule test --all` — validates all 69 scanner YAML files (structure + regex compile); 0 failures
- `yamtam rule test <id>` — show rule metadata (severity, description, match pattern)
- `yamtam rule test <id> --file <path>` — test rule against a specific file

### New: `yamtam config`
- Manages `.yamtam/config.yml`: `list`, `get`, `set`, `reset`, `show`
- Persists: `fail_on`, `ignore`, `no_color`, `quiet`, `scanner_dir`, `since`, `open_report`
- Coerces types; saves only keys that differ from defaults

### CLI version bump
- `bin/yamtam` → v0.13.0
- New commands: `config`, `rule test`, `report pdf`, `audit --watch`
- scripts: 78 → 81

---

## v0.12.0 — Check File, Template List, Audit --since, Doctor Enhanced
*2026-05-28*

### Status: RELEASED ✅

### New: `yamtam check <file>` — single file scanner
- Scan any file against all matching rules (regex, json, exists)
- Shows severity, rule ID, line number, description, fix suggestion
- `--severity` filter threshold, `--json` machine-readable
- 69 rules checked per file

### New: `yamtam template list/show` — policy template browser
- Lists all 5 policy templates with names, fix IDs, output paths
- `yamtam template show claude-settings` — preview template content
- `--json` output for scripting

### New: `yamtam audit . --since <date>` — date-filtered scan
- Only scan files modified since a given date via `git log`
- Accepts: `2026-05-01`, `yesterday`, `7 days ago`, `1 week ago`
- Exit 0 if no files modified since date

### Enhanced: `yamtam doctor` — +2 new checks
- `yamtam CLI` — verifies `bin/yamtam` accessible and reports version
- `yamtam hooks` — checks if hooks are wired in `.claude/settings.json`
- Total: 15 checks (was 13)

### CLI version bump
- `bin/yamtam` → v0.12.0
- New commands: `check`, `template`
- scripts: 78 → 80

---

## v0.11.0 — Lint, Snapshot, Policy Check, Export
*2026-05-28*

### Status: RELEASED ✅

### New: `yamtam lint [path]` — rule YAML linter
- Validates rule files against schema: required fields (id/severity/target/description), valid severity, valid match types
- Detects duplicate IDs, unknown fields, missing `fix` field
- `--errors-only` show only ERRORs, `--json` machine-readable
- Default: lints all files in `scanner/`

### New: `yamtam snapshot save/list/diff/delete` — audit snapshots
- `yamtam snapshot save <name>` — save current audit state to `.yamtam/snapshots/`
- `yamtam snapshot list` — show all snapshots with score + risk
- `yamtam snapshot diff <a> <b>` — compare two snapshots (delegates to diff-report)
- `yamtam snapshot show <name>` — print audit JSON
- `yamtam snapshot delete <name>` — remove snapshot
- `--note` add a label, auto-generates timestamp name if omitted

### New: `yamtam policy check [target]` — policy compliance
- Verifies `.claude/settings.json`, `.mcp.json`, `.github/workflows/` match policy templates
- Checks: `dangerouslyAllowAll=false`, deny list present, no bare `Bash(*)`, no root filesystem MCP, permissions block in workflows
- `--policy <name>` check single policy, `--json` output

### New: `yamtam export [target] --format <fmt>` — multi-format export
- `csv` — for Excel, Jira, spreadsheets
- `markdown` — readable report with finding tables by severity
- `junit` — XML for Jenkins / GitHub Actions test reporter
- `json` — raw audit JSON (same as `yamtam audit . --json`)
- `--out <file>` custom path, `--stdout` pipe to another tool

### CLI version bump
- `bin/yamtam` → v0.12.0
- New commands: `lint`, `snapshot`, `policy check`, `export`
- scripts: 74 → 78

---

## v0.10.0 — Init Wizard, Verify, Monitor, Stats
*2026-05-28*

### Status: RELEASED ✅

### New: `yamtam init [target]` — interactive setup wizard
- Guided setup: select AI engine (claude/cursor/aider/copilot/other), risk profile, guards, CI
- Risk profiles: `strict` (minimal tools), `balanced` (default), `minimal` (audit only)
- Generates `.claude/settings.recommended.json`, `.yamtamignore`, `.gitignore` additions
- Optionally installs runtime guards and CI workflow
- Runs initial audit after setup
- `--yes` for non-interactive / CI use

### New: `yamtam verify [target]` — hook wiring check
- Checks 8 core safety hooks: exists on disk + wired in `.claude/settings.json`
- L0 audit, L1 scope, L1.5 validate, L3 truth gate, L3.5 inject, L4 deploy, L4.5 supply chain, L5 destructive
- `--fix` auto-runs `yamtam guard install all`
- `--json` machine-readable output

### New: `yamtam monitor [target]` — real-time log tail
- Tails `.claude/state/audit.log` with color-coded output
- BLOCK (red), WARN (yellow), PASS (green), BUDGET (cyan), SECURITY (red)
- `--filter <pattern>` show only matching lines
- `--lines` initial backlog, `--interval` poll frequency
- Auto-detects log file location across project structures

### New: `yamtam stats [target]` — score trend
- Records audit scores to `.yamtam/history.json` (keeps last 100)
- `--record` run new scan and save to history
- Shows score bar chart, risk level, trend arrow per scan
- Displays best/worst scores with dates
- `--limit` number of entries, `--clear` reset history, `--json` output

### CLI version bump
- `bin/yamtam` → v0.10.0
- New commands: `init`, `verify`, `monitor`, `stats`
- scripts: 70 → 74

---

## v0.9.0 — HTML Report, Scan URL, Rule Import, Upgrade
*2026-05-28*

### Status: RELEASED ✅

### New: `yamtam report html [target]` — standalone HTML report
- Generates self-contained HTML with score bar, risk badge, color-coded findings
- `--out <file>` custom output path (default: `yamtam-report.html`)
- `--open` opens in browser immediately after generation
- `--fail-on`, `--ignore`, `--diff` passthrough to scanner
- No external dependencies — pure inline CSS/HTML

### New: `yamtam scan <url>` — scan GitHub repo by URL
- Clones to temp dir, audits, cleans up — no permanent files left
- Supports any `https://github.com/owner/repo` URL
- `--html <file>` generate HTML report, `--markdown <file>` generate Markdown
- `--branch <name>` scan a specific branch
- `--json` machine-readable output, `--fail-on` CI gate

### New: `yamtam rule import <source>` — import rule pack
- Import from local file or remote URL
- Validates schema before writing (checks/severity/id required)
- Conflict detection: skips existing IDs unless `--force`
- `--name` custom output filename in `scanner/`
- `--dry-run` validate and preview without writing

### New: `yamtam upgrade` — self-update
- Fetches latest release info from GitHub API
- `--check` — show if update available without installing
- `--yes` — skip confirmation prompt
- Syncs `core/`, `bin/`, `scanner/`, `policy/`, `guards/` from latest tag

### Fix
- scripts count: 66 → 70

### CLI version bump
- `bin/yamtam` → v0.9.0
- New commands: `report html`, `scan`, `rule import`, `upgrade`

---

## v0.8.0 — CI Check, Diff Report, Custom Rules, Install
*2026-05-28*

### Status: RELEASED ✅

### New: `yamtam ci-check [target]` — CI/CD pipeline health
- Checks `.github/workflows/` for: missing permissions, unpinned action SHAs, no timeout, auto-merge, pull_request_target risks, missing yamtam audit step
- Levels: FAIL / WARN / INFO / PASS
- `--json` output, `--fail-on` threshold
- Score impact: each WARN/FAIL explains fix inline

### New: `yamtam diff-report <before.json> <after.json>` — audit run comparison
- Compare two `yamtam audit . --json` snapshots
- Shows score delta (▲ +10 / ▼ -20), new findings (+), resolved findings (-)
- Exit 1 if score regressed
- `--json` output for CI integration

### New: `yamtam rule add/list/remove` — custom rule management
- Add project-specific rules to `scanner/custom-checks.yml`
- `yamtam rule add --id CUSTOM001 --severity HIGH --target ".env" --pattern "..."``
- `yamtam rule list` — show all custom rules
- `yamtam rule remove CUSTOM001`
- `--dry-run` preview, supports all match types (regex/json/exists)

### New: `yamtam install [target]` — one-command project setup
- Creates `.yamtamignore`, `.gitignore` additions, `.claude/settings.recommended.json`, `.mcp.recommended.json`, `.github/workflows/yamtam-audit.yml`
- `--dry-run` shows what would be written
- `--guards` also runs `yamtam guard install all`
- `--no-audit` skips initial scan
- Runs initial audit and shows top findings after setup

### Fix: CI drift + score improvement
- `MANIFEST.json` scripts: 47 → 66 (all scripts listed)
- `plugin.json` + `marketplace.json` synced to 66
- `release.yml`: workflow-level permissions + pinned SHA + timeout
- `yamtam-audit.yml`: workflow-level permissions block
- Score: 64/100 HIGH → **77/100 MEDIUM**

### CLI version bump
- `bin/yamtam` → v0.8.0
- New commands: `ci-check`, `diff-report`, `rule`, `install`

---

## v0.7.0 — Score Breakdown, Badge, Watch, Auto-Fix
*2026-05-28*

### Status: RELEASED ✅

### New: `yamtam score [target] --explain` — deduction trail
- Shows every score deduction step: Start 100 → -10 CI007 → -10 CI006 → … → Final
- `yamtam score .` — compact view: score + risk + finding counts
- `yamtam score . --explain` — full breakdown with severity, rule ID, description
- `yamtam score . --json` — machine-readable breakdown array
- `--ignore` and `--diff` flags passthrough to scanner

### New: `yamtam badge .` — shields.io badge generator
- Generates badge URL + Markdown snippet for README
- Color-coded by risk: green (LOW) / amber (MEDIUM) / red (HIGH) / dark-red (CRITICAL)
- `yamtam badge . --url-only` — just the URL (CI/script use)
- `yamtam badge . --json` — JSON with score, risk, badge_url, markdown
- `--style` flag: for-the-badge / flat / flat-square / plastic

### New: `yamtam watch .` — live re-audit on file change
- Polls `.claude/settings.json`, `.mcp.json`, `.github/workflows/`, `scripts/`, `.env*`
- Shows score diff on every change: `64/100 HIGH → 74/100 MEDIUM (+10)`
- Lists new/gone findings with `+/-` diff view
- `--interval` flag (default 2s), `--ignore`, `--fail-on` passthrough
- No external dependencies — pure Python polling

### New: `yamtam fix <rule-id>` — opt-in auto-fix
- Automated fixes: AC002 (remove Bash\*), AC003 (dangerouslyAllowAll→false), CI007 (add permissions block), MCP001 (scope filesystem path)
- Template-based fixes: AC001/AC004 → claude-settings, MCP002/MCP003 → mcp-minimal
- Manual-only block for secrets rules (SE*, AU*, CI004) — never auto-fixed
- `--dry-run` shows changes without writing
- `--yes` skips confirmation prompt

### CLI version bump
- `bin/yamtam` → v0.7.0
- New commands: `score`, `badge`, `watch`, `fix`

---

## v0.6.0 — Explain, Map, Init-Policy, GitHub Action
*2026-05-28*

### Status: RELEASED ✅

### New: `yamtam explain <rule-id>` — rule curriculum
- Plain-language explanation for every finding: what it means, why it's risky, how to fix
- Covers all 70 rules across 7 categories (AC, AU, CI, DB, MCP, SE, SH)
- `yamtam explain CI001` → target, risk reason, fix, detection pattern
- `yamtam explain --list` → full rule catalog by category
- Extended docs from `rules/docs/<ID>.md` if present

### New: `yamtam map .` — Agent Blast Radius Map
- Answers: "What can my AI agent actually reach?"
- Scans `.claude/settings.json` → shell, file read/write, git, network access levels
- Scans `.mcp.json` → MCP servers with risk level (filesystem root = CRITICAL)
- Scans `.github/workflows/` → auto-merge, secrets exposure, pull_request_target risks
- Overall risk rating: CRITICAL / HIGH / MEDIUM / LOW
- `yamtam map . --json` for machine-readable output

### New: `yamtam init-policy <tool>` — safe config generator
- Generates safe config templates without auto-fixing existing files
- `yamtam init-policy claude` → `.claude/settings.recommended.json`
- `yamtam init-policy mcp` → `.mcp.recommended.json`
- `yamtam init-policy github-actions` → `.github/workflows/ai-pr-safe.yml`
- `yamtam init-policy gitignore` → `.gitignore.yamtam`
- `yamtam init-policy env` → `.env.example.yamtam`
- `--dry-run` flag to preview without writing
- `yamtam init-policy list` → list all 5 tools

### New: GitHub Action — `uses: .../actions/audit@v1`
- `.github/actions/audit/action.yml` — composite action
- Inputs: `target`, `fail-on`, `sarif`, `diff`, `markdown`
- Outputs: `score`, `risk`, `findings`
- Auto-uploads SARIF to GitHub Security tab if `sarif` input set
- Zero external dependencies beyond Python + PyYAML

### CLI version bump
- `bin/yamtam` → v0.6.0
- New commands: `explain`, `map`, `init-policy`

---

## v0.5.0 — Runtime: Task Lifecycle & Evals (Rust)
*2026-05-28*

### Status: RELEASED ✅

### New: `yamtam task` — task lifecycle management
- `yamtam task create "description" [--scope "src/"]` — tạo task, sinh UUID
- `yamtam task list` — list tasks với status icon (○ open / ✓ done)
- `yamtam task done <id> --evidence "..."` — mark done + attach evidence
- `yamtam task status <id>` — xem chi tiết task
- `yamtam task drop <id>` — xoá task

### New: `yamtam eval` — evidence validation
- `yamtam eval run <id>` — validate evidence → PASS/FAIL + confidence level
- `yamtam eval schema` — hiển thị Evidence Schema v1 (JSON)

### Evidence parsing (deterministic, no AI)
- Tự động detect: `tests_passed`, `tests_failed`, `build_ok`, `coverage_pct`, `manual_note`
- Confidence: **HIGH** (tests + build) / **MEDIUM** (một trong hai) / **LOW** (manual note)
- Hard fail nếu `tests_failed > 0`
- Warn nếu `coverage_pct < 80%`

### Implementation
- Rust binary `yamtam-rt v0.5.0` — clap 4, serde, uuid, chrono
- State lưu tại `.yamtam/tasks.json` trong project
- `bin/yamtam` delegate `task` + `eval` subcommands sang Rust binary

### Roadmap
| Version | Status |
|---------|--------|
| v0.1 Auditor | ✅ |
| v0.2 CI Gate | ✅ |
| v0.3 Policy Kit | ✅ |
| v0.4 Control Layer | ✅ |
| v0.5 Runtime Evals | ✅ |

---

## v1.7.3 — Full Consistency Sync
*2026-05-25*

### Status: RELEASED ✅

### Skills-lock rebuild
- Rebuilt `core/config/skills-lock.json` from scratch: **387 entries, 0 drift, 0 missing**
- Removed 7 stale `gitnexus-gitnexus-*` keys (nested-path bug)
- Added 44 missing skill entries from recent synthesis imports

### `.claude/` runtime mirror sync
- Added 44 new SKILL.md mirrors to `.claude/skills/`
- Added 6 new hook mirrors to `.claude/hooks/`: `code-quality-gate.sh`, `coverage-gate.sh`, `dependency-safety-gate.sh`, `per-tool-circuit-breaker.sh`, `static-analysis-gate.sh`, `test-runner-gate.sh`

### Count sync
| Metric | v1.7.2 | v1.7.3 |
|---|---|---|
| Skills | 384 | **387** |
| Hooks | 41 | **45** |
| Scripts | 46 | **47** |

### Verification gates
- `verify-skills-lock.sh` → **387 ok / 0 drift / 0 missing** ✅
- `validate-manifest.sh` → **7/7 clean** ✅

---

## v1.7.2 — AI Skill Expansion + Code Quality Gate
*2026-05-25*

### Status: RELEASED ✅

### New skills (32)
| Tier | Count | Skills |
|---|---|---|
| Tier 1 (Core AI) | 6 | agno, autogen, browser-use, crewai, dspy, langgraph |
| Tier 2 (AI Agent) | 6 | crawl4ai, deepeval, instructor-structured-output, langfuse, litellm, ragas |
| Tier 3 (Productivity) | 6 | firecrawl, llamafactory, mem0, modal-serverless, ollama-patterns, qdrant |
| Tier 4 (Emerging) | 6 | n8n-automation, outlines, pixelle-video, portkey, pydantic-ai, vercel-ai-sdk |
| Various | 8 | arxiv-research, codebase-onboard, semantic-scholar, smolagents, stealth-browser-automation, and others |

### New hooks (6, Code Quality Gate)
| Hook | Trigger | Description |
|---|---|---|
| `code-quality-gate.sh` | PostToolUse | Multi-gate quality enforcement |
| `coverage-gate.sh` | PostToolUse | Test coverage threshold guard |
| `dependency-safety-gate.sh` | PostToolUse | Supply chain safety check |
| `per-tool-circuit-breaker.sh` | PostToolUse | Per-tool failure circuit breaker |
| `static-analysis-gate.sh` | PostToolUse | Static analysis integration |
| `test-runner-gate.sh` | PostToolUse | Test runner gate |

### New script
- `decay-memory.sh` — Ebbinghaus forgetting curve for L1 atomic facts (FRESH/FADING/STALE/DECAYED labels)

### Count sync
| Metric | v1.7.1 | v1.7.2 |
|---|---|---|
| Skills | 351 | **384** |
| Hooks | 40 | **41** |
| Scripts | 46 | **46** |

---

## v1.7.1 — Installer + pixelle-video + Hook Fixes
*2026-05-24*

### Status: RELEASED ✅

### New features
- Zero-touch one-line installer: auto-applies `CLAUDE.md` on install
- GitHub API-based release zip detection (no hardcoded filename)
- `docs/index.html` landing page with animated stats
- `docs/install` short URL redirect for GitHub Pages

### New skill
- `pixelle-video` — Topic → AI video via REST API

### Fixes
- Hook count corrected: 36 → 40 (4 hooks were present but undercounted)
- Improved hook listing and telemetry bypass detection commands

### Count sync
| Metric | v1.7.0 | v1.7.1 |
|---|---|---|
| Skills | 350 | **351** |
| Hooks | 36 | **40** |

---

## v1.7.0 — High Priority Safety Hooks (L3.5 / L4.5 / L1.5)
*2026-05-24*

### Status: RELEASED ✅

### New hooks (3)
| Hook | Gate | Description |
|---|---|---|
| `prompt-injection-guard.sh` | L3.5 | Blocks identity override, system prompt extraction, jailbreak triggers; warns on base64-encoded directives and multi-turn manipulation |
| `supply-chain-guard.sh` | L4.5 | Blocks pipe-to-shell (curl\|bash), non-registry URL installs, typosquatting lookalikes, `--ignore-scripts=false`; warns on missing lock file |
| `tool-validator.sh` | L1.5 | Blocks path traversal (../), sensitive system path writes, SSRF (private IPs, cloud metadata), non-http schemes; warns on unknown tools and out-of-project paths |

### Test suite
- 23 new test cases across 3 hooks (block / allow / bypass for each)
- Total: **88/88 PASS**

### Count sync
| Metric | v1.6.1 | v1.7.0 |
|---|---|---|
| Hooks | 36 | **39** |

### Bypass vars
| Hook | Bypass |
|---|---|
| `prompt-injection-guard.sh` | `YAMTAM_PROMPT_INJECT_BYPASS=1` |
| `supply-chain-guard.sh` | `YAMTAM_SUPPLY_OK=1` |
| `tool-validator.sh` | `YAMTAM_TOOL_VALID_BYPASS=1` |

---

## v1.6.1 — Anh's Asset Pack Integration
*2026-05-23*

### Status: RELEASED ✅

### New assets (from uploaded zip)
| Type | File | Description |
|---|---|---|
| Command | `/rollback` | List checkpoints, preview diff, apply rollback |
| Command | `/risk-scan` | Pre-execution risk scan for planned actions |
| Command | `/scope-declare` | Declare file scope before 3+ file edits |
| Agent | `risk-analyst` | Pre-execution risk specialist |
| Agent | `session-historian` | Session wrap-up and audit summarizer |
| Agent | `scope-enforcer` | Scope boundary enforcement specialist |
| Rule | `63-autonomous-session-law` | P1 rule: checkpoint/rollback requirements |
| Rule | `64-scope-drift-law` | P1 rule: scope declaration enforcement |
| Doc | `session-safety-gate.md` | L2.5 Autonomous Session Guard spec |
| Doc | `vscode-adapter.md` | VS Code / Copilot adapter guide |

### Count sync
| Metric | v1.6.0 | v1.6.1 |
|---|---|---|
| Agents | 87 | **90** |
| Commands | 161 | **164** |
| Rules | 58 | **60** |

---

## v1.6.0 — Autonomous Session Safety Layer
*2026-05-23*

### Status: RELEASED ✅

### New commands (5)
| Command | Description |
|---|---|
| `/session-stats` | Hook fires, blocks, trust score for this session |
| `/env-check` | Compare `.env` vs `.env.example`, find missing/empty keys |
| `/tech-debt` | Scan TODO/FIXME/HACK/XXX across codebase |
| `/cost-forecast` | Estimate token cost before starting a task |
| `/session-trace` | ASCII timeline of hook fires, checkpoints, risk events |

### New hooks (5)
| Hook | Type | Description |
|---|---|---|
| `session-checkpoint-hook.sh` | PostToolUse | Auto-trigger checkpoint every N tool calls |
| `confidence-scorer.sh` | PreToolUse | Per-action confidence score 0–100 |
| `intent-inference.sh` | PreToolUse | Detect scope creep, escalation, exfil patterns |
| `self-healing-hooks.sh` | PostToolUse | Bypass audit + hook executable integrity |
| `hook-timeout-guard.sh` | PreToolUse | Kill hooks exceeding 30s, deny with JSON |

### New scripts (8)
| Script | Description |
|---|---|
| `session-checkpoint.sh` | Snapshot git diff + L2 facts + token budget state |
| `session-rollback.sh` | Restore working tree to a checkpoint (sovereign-gated) |
| `rotate-audit-log.sh` | Rotate `audit-chain.log` at 10MB, keep 5 rotations |
| `memory-provenance.sh` | Show source, age, confidence, expiry per L1 fact |
| `resolve-memory-conflict.sh` | Detect contradicting L1 facts, resolve by confidence |
| `deprecate-fact.sh` | Archive L1 fact with deprecation metadata + audit |
| `promote-session-patterns.sh` | Auto-promote repeated error patterns (≥3x) to L1 |
| `sweep-expired-facts.sh` | Archive L1 facts past `expires_at` date |

### Count sync
| Metric | v1.5.0 | v1.6.0 |
|---|---|---|
| Hooks | 29 | **34** |
| Scripts | 41 | **46** |
| Commands | 157 | **161** |
| Tests | 5 | **6** (24/24 v1.6.0 safety + 65/65 hook) |

---

## v1.5.0 — 100% Skill Coverage + Copilot Hard Enforcement
*2026-05-23*

### Status: RELEASED ✅

### New features
- **100% skill trigger coverage** — 350/350 skills covered by `test-skill-triggering.sh`, 678 checks, 0 failures
- **Copilot hard enforcement** — `.github/copilot-instructions.md` Hard Enforcement section; `.vscode/tasks.json` with 6 YAMTAM gate tasks
- **L1 memory expiry sweep** — `sweep-expired-facts.sh`: scan all L1 facts for expired `expires_at`, archive to `memory/L1_atomic/archived/`, `--dry-run` + `--force` flags
- **Cost-report dashboard** — `/cost-report` command: per-tool call counts, circuit state, estimated USD (Sonnet $3/$15 per MTok)

### Count sync
| Metric | v1.4.20 | v1.5.0 |
|---|---|---|
| Commands | 156 | **157** |
| Scripts | 35 | **36** |
| Checks | 472 | **826** (678 skill trigger + 65 hook + 12 audit + 6 smoke + 65 red-team) |
| Skills coverage | 334/350 | **350/350** |


---

## v1.4.20 — Metadata Sync PASS + Cross-Engine Hard Enforcement
*2026-05-23*

### Status: REVIEWED / PASS
Independent review passed after resolving 5 metadata blockers.

### Fixes (metadata sync)
| Item | Trước | Sau |
|---|---|---|
| plugin.json version | 1.3.47 | 1.4.20 |
| plugin.json skills | 139 | 350 |
| plugin.json hooks | 26 | 27 |
| plugin.json scripts | 24 | 35 |
| plugin.json checks | 322 | 472 |
| skills-lock.json coverage | 114/350 | **350/350** |
| validate-manifest | DRIFT | **7/7 CLEAN** |
| Release artifact | v1.3.31 | **v1.4.20-fixed.zip (2MB)** |
| MANIFEST actual_present | partial | **fully synced** |

### New features (v1.4.20)
- **Cross-engine hard enforcement** — `safe-run.sh --engine cursor|aider` blocks elevated-risk commands without TTY
- **switch-engine.sh cursor** → generates `.cursor/rules/yamtam-hard-enforcement.mdc`
- **switch-engine.sh aider** → generates `.aider.conf.yml` with shell proxy
- **Circuit Breaker** in `token-budget-guard.sh` — HARD BLOCK at 5 consecutive tool calls, escalating cooldown (60s → 300s → 1800s), fast-tier Haiku recommendation
- **Rule 43** — `43-prompt-jailbreak-advanced`: memory exfiltration, psychological manipulation, identity spoofing, multi-turn chain detection
- **Rule 44** — `44-supply-chain-vetting`: typosquatting, lock file integrity, OSV scan gate, pipe-to-shell block
- **Identity Gate** — auto-auth from `YAMTAM_SOVEREIGN_NAME` env var, case-insensitive sovereign check

### Count sync
| Metric | v1.4.00 | v1.4.20 |
|---|---|---|
| Skills | 344 | **350** |
| Rules | 56 | **58** |
| Hooks | 24 | **27** |
| Scripts | 35 | 35 |
| Checks | 415 | **472** |

---

## v1.4.00 — 100-Layer Sovereign Anti-Tamper Architecture
*2026-05-23*

### New architecture
- 5 Military Blocks, 10 Fortresses, 56 rules
- Added: `anti-graffiti-guard.js`, `sovereign-interceptor.js`, `swarm-router.js`, `secure-logger.js`, `tool-proxy.sh` Phase 3.5 OverlayFS sandbox
- Skills 335→344, Rules 48→62

---

## v1.3.56 — Chrome DevTools MCP Full Coverage
*2026-05-23*

Skills 330→335 — full Chrome DevTools MCP skill pack.

---

## v1.3.55 — WebAssembly Runtime + Chrome DevTools MCP Skills
*2026-05-23*

Skills 321→330.

---

## v1.3.54 — Agentic AI Patterns
*2026-05-23*

Skills 306→321 — 15 agentic AI patterns from ai-engineering-from-scratch:
ReAct, ReWOO, Reflexion, Self-Refine, MemGPT, Voyager, A2A, sGLang, eval-driven dev.

---

## v1.3.53 — Cloud-Native K8s + Service Mesh + Observability
*2026-05-23*

Skills 291→306 — K8s CRD, Helm, Argo CD, Istio, Envoy, Linkerd, Prometheus, OpenTelemetry, Loki, Jaeger.

---

## v1.3.31 — Caching + Rate Limiting Skills + Full Test Coverage
*2026-05-22*

### New skills (104→106)
| Skill | Mô tả |
|---|---|
| `caching-patterns` | Cache-aside/read-through/write-through strategy, TTL tuning, Redis stampede prevention, invalidation patterns |
| `api-rate-limiting` | Sliding window counter + token bucket (Redis Lua), per-user/IP/endpoint tiers, `X-RateLimit-*` headers |

### Test coverage expansion
- Skill trigger tests: 58 → **183** checks — all 106 skills now covered
- Total checks: 131 → **256** (55 hook + 12 audit + 183 skill trigger + 6 smoke)

### Count sync
| Metric | Trước | Sau |
|---|---|---|
| Skills | 99 | **106** |
| Skill trigger tests | 58 | **183** |
| Total checks | 131 | **256** |

---

## v1.3.30 — 16 New Skills (AI/LLM, Backend, Infra Branches)
*2026-05-21*

### New skills — AI/LLM + Observability + i18n branch (83→89)
| Skill | Mô tả |
|---|---|
| `llm-ui-patterns` | Streaming, skeleton loaders, error states cho AI output |
| `prompt-engineering` | Chain-of-thought, few-shot, structured output patterns |
| `rag-architect` | Chunking strategy, retrieval scoring, hallucination guards |
| `slo-design` | SLI/SLO/SLA definitions, error budget, alerting thresholds |
| `incident-response-runbook` | Runbook template, severity levels, escalation paths |
| `i18n-patterns` | ICU message format, locale fallback, pluralization rules |

### New skills — Backend/Infra/Quality branch (89→99)
| Skill | Mô tả |
|---|---|
| `database-patterns` | Index strategy, N+1 detection, migration safety |
| `auth-patterns` | JWT, OAuth2 PKCE, session management, RBAC |
| `resilience-patterns` | Circuit breaker, retry with backoff, bulkhead, timeout |
| `event-driven-architecture` | Event schema, at-least-once delivery, idempotency |
| `observability-instrumentation` | Structured logs, trace propagation, metric naming |
| `cicd-patterns` | Pipeline stages, deploy strategies, rollback triggers |
| `refactor-patterns` | Strangler fig, branch by abstraction, seam identification |
| `data-privacy` | PII classification, data minimization, retention policy |
| `graphql-patterns` | Schema design, N+1 via DataLoader, pagination |
| `adr-writing` | ADR template, context/decision/consequences format |

### Count sync
| Metric | Trước | Sau |
|---|---|---|
| Skills | 83 | **99** |

---

## v1.3.29 — Design + Performance Branch
*2026-05-21*

### New skills (77→83)
| Skill | Mô tả |
|---|---|
| `multi-agent-handoff` | Context package, trust boundary, handoff protocol |
| `typography-system` | Type scale, font pairing, readability constraints |
| `motion-design` | Easing curves, duration budget, reduced-motion support |
| `ui-states` | Loading/empty/error/success state design patterns |
| `mobile-ux` | Touch targets, thumb zones, native gestures |
| `web-performance` | Core Web Vitals, LCP/CLS/INP targets, ramp-up strategy |

### Fixes
- Release zip: `gates/`, `docs/`, `prompts/` directories now included
- 5 script fixes: `build-release.sh`, `run-security-tools.sh`, `drift-check.sh`, `verify-claude-pack.sh`, MANIFEST `actual_present` gaps

### New docs
| File | Mô tả |
|---|---|
| `docs/multi-agent-failure-modes.md` | Taxonomy of multi-agent failure patterns |

### Count sync
| Metric | Trước | Sau |
|---|---|---|
| Skills | 77 | **83** |

---

## v1.3.28 — UI Expansion + Security Tools Runner
*2026-05-21*

### New skills (73→77)
| Skill | Mô tả |
|---|---|
| `aesthetic-anchor` | 8 visual styles: Swiss, Industrial, Brutalist, Aurora, Chaotic, Retro-Futuristic, Organic, Lo-Fi |
| `accessibility-audit` | WCAG 2.1 AA — 5 categories, severity scoring |
| `design-system-gen` | 5-layer token system per product type |
| `ux-heuristics` | Nielsen 10 heuristics + severity scoring |

### New script
| Script | Mô tả |
|---|---|
| `core/scripts/run-security-tools.sh` | Automated runner: gitleaks, semgrep, trivy, npm audit, bandit, pip-audit, govulncheck, cargo audit |

### Count sync
| Metric | Trước | Sau |
|---|---|---|
| Skills | 73 | **77** |
| Scripts | 21 | **22** |

---

## v1.3.27 — Security Skill Pack + Design/UX Branch + Skill Standard
*2026-05-21*

### New skills (65→73)
| Skill | Mô tả |
|---|---|
| `red-team-check` | Adversarial review — attack surfaces, bypass vectors |
| `blue-team-fix` | Evidence-based remediation checklist |
| `purple-team-report` | Combined red+blue summary format |
| `design-taste-frontend` | Aesthetic evaluation rubric for frontend output |
| `image-to-code` | Faithful UI reproduction from screenshots |
| `ui-redesign` | Visual upgrade without breaking functionality |
| `output-enforcement` | Structural constraints on agent output format |
| `minimalist-ui` | Reduction heuristics — remove before adding |

### New command
| Command | Mô tả |
|---|---|
| `/security-scan` | Run red/blue/purple team skill sequence |

### New hook
| Hook | Mô tả |
|---|---|
| `truth-gate-guard.sh` | Stop hook — blocks unverified claim verbs in security context |

### New gates + docs
| File | Mô tả |
|---|---|
| `gates/anti-fake-pass-gate.md` | Blocks PASS claims without evidence |
| `gates/security-scope-gate.md` | Enforces "own repo/app only" scope rule |
| `gates/ui-quality-gate.md` | Visual quality checklist before UI output |
| `docs/model-routing-strategy.md` | When to use Opus vs Sonnet vs Haiku |
| `docs/third-party-inspiration.md` | Attribution guide for adapted skills |

### Skill standard infrastructure
| File | Mô tả |
|---|---|
| `core/templates/SKILL_TEMPLATE.md` | Canonical skill format |
| `docs/skill-spec.md` | Skill schema specification |
| `docs/skill-writing-guide.md` | Authoring guide |
| `docs/skill-evaluation-rules.md` | Pass/fail evaluation criteria |

### Count sync
| Metric | Trước | Sau |
|---|---|---|
| Commands | 155 | **156** |
| Skills | 65 | **73** |
| Templates | 11 | **12** |

---

## v1.3.26 — Count Sync + Output Budget Layer
*2026-05-19*

### New commands
| Command | Mô tả |
|---|---|
| `/output-budget` | Proxy report: tool calls, reads, writes trong session |
| `/output-raw` | Lấy lại full output bị filter — không cần re-run nếu còn trong context |
| `/session-cost` | Token thật + ước tính USD từ JSONL local — offline, no API |

### New script
| Script | Mô tả |
|---|---|
| `core/scripts/session-cost.sh` | Đọc `~/.claude/projects/*.jsonl`, aggregate input/output/cache tokens, cache hit rate, est. cost |

### New docs
| File | Mô tả |
|---|---|
| `docs/OUTPUT_BUDGET_POLICY.md` | Terminal output filter rules, ALLOW/WARN/BLOCK table, L0/L1/L2 tiered read policy |
| `docs/OUTPUT_BUDGET_INTEGRATION.md` | Guide tích hợp cho Claude Code, Cursor, Gemini |

### Count sync (metadata only)

| File | Trước | Sau |
|---|---|---|
| `MANIFEST.json` commands | count 152, list 141 | count 155, list 155 (đủ 155 file thật) |
| `MANIFEST.json` scripts | count 20, list 20 | count 21, list 21 (+ session-cost.sh) |
| `MANIFEST.json` templates | count 11, list 11 | count 10, list 10 (- TASK_TEMPLATE.md) |
| `MANIFEST.json` rules | list 5 | list 11 (đủ 11 file thật) |
| `MANIFEST.json` version | 1.3.25 | **1.3.26** |
| `.claude-plugin/plugin.json` | version 1.3.25, 152 cmds, 20 scripts | version 1.3.26, 155/21 |
| `.claude-plugin/marketplace.json` | 152 cmds, 20 scripts | 155/21 |
| `README.md` | 152 cmds, 20 scripts, 11 templates | **155/21/10** |
| `AGENTS.md` | 152 commands, v1.3.25 | **155, v1.3.26** |
| `drift-check.sh` | không có count check | TODO comment thêm vào |

### Tests (all pass)
- hook tests: 47/47 PASS
- audit chain: 12/12 PASS
- skill trigger: 58/58 PASS
- command smoke: 6/6 PASS
- drift-check: CLEAN
- skills-lock: PASS

---

## v1.3.25-clean — Metadata Sync + Stale Ref Fixes
*2026-05-19*

### Sync only — no new features

| File | Trước | Sau |
|---|---|---|
| `.claude-plugin/plugin.json` | version 1.3.23, 141 cmds, 83 agents, 49 skills, 108 checks | version 1.3.25, 152/87/64/123 |
| `.claude-plugin/marketplace.json` | stats cũ, latest_release v1.3.23-clean | stats mới, latest v1.3.25-clean |
| `MANIFEST.json` releases | latest → v1.3.23, files có v1.3.22 (đã xóa) | latest → v1.3.25, files [v1.3.24, v1.3.25] |
| `MANIFEST.json` tests | count 3, thiếu smoke test | count 4, có `test-hook-review-smoke.sh` |
| `docs/ARCHITECTURE.md` | 1.3.23-clean | **1.3.25-clean** |
| `docs/HOOK_WIRING.md` | 1.3.23-clean | **1.3.25-clean** |
| `docs/MAINTENANCE_POLICY.md` | 1.3.23-clean, hiện trạng v1.3.22+v1.3.21 | **1.3.25-clean**, hiện trạng v1.3.25+v1.3.24 |
| `docs/CLAUDE_MD_GUIDE.md` | 1.3.23-clean | **1.3.25-clean** |
| `run-hook-tests.sh` banner | v1.3.15 | **v1.3.25** |
| `test-skill-triggering.sh` banner | v1.3.15 | **v1.3.25** |
| `README.md` tree commands | 141 | **152** |
| `core/rules/subagent-policy.md` | Version 1.3.16 | **Version 1.3.25** |
| `core/rules/conflict-resolution.md` | Version 1.3.21 | **Version 1.3.25** |

---

## v1.3.24 — Phase 9 Import: claude-forge + karanb192 patterns
*2026-05-19*

### New Agents (from sangrokjung/claude-forge, MIT)
| Agent | Mô tả |
|---|---|
| `build-error-resolver` | Chẩn đoán + fix build failure (TS/Go/Rust/Python/JS) — fastest path to green |
| `verify-agent` | Fresh-context verification sub-agent — typecheck → lint → build → test |
| `planner` | Tạo implementation plan 3–6 bước trước khi code, read-only |
| `database-reviewer` | PostgreSQL specialist — query optimization, RLS, schema validation |

### New Commands (from sangrokjung/claude-forge, MIT)
`handoff-verify`, `commit-push-pr`, `refactor-clean`, `sync-docs`, `quick-commit`, `worktree-start`, `worktree-cleanup`, `eval`, `suggest-automation`, `learn`, `next-task`

### New Skills (from sangrokjung/claude-forge, MIT)
| Skill | Mô tả |
|---|---|
| `team-orchestrator` | Agent Teams orchestration — team composition, task distribution, dependency management |
| `strategic-compact` | Context optimization — khi nào compact, cách preserve critical context |
| `session-wrap` | Session summarization — wrap up + extract learnings + suggest follow-ups |
| `verification-engine` | QA verification pipeline — typecheck → lint → build → test |
| `skill-factory` | Skill lifecycle management — create, validate, deduplicate skills |
| `security-compliance` | SOC 2 / OWASP / STRIDE compliance framework |
| `security-pipeline` | Security automation — pre-commit checks, vulnerability scanning |
| `stride-analysis-patterns` | Threat modeling với STRIDE framework |
| `debugging-strategies` | Systematic debug patterns — hypothesis, bisect, reproduce |
| `extract-errors` | Error extraction + classification from logs/output |
| `build-system` | Build tool integration — webpack, vite, turbo, nx |
| `cache-components` | Prompt caching patterns — TTL, invalidation, cost optimization |
| `verify-implementation` | Verify that implementation matches spec |

### New Skills (from karanb192/claude-code-hooks patterns, MIT)
| Skill | Mô tả |
|---|---|
| `hook-block-commands` | Pattern guide: 58+ regex để block dangerous shell commands (3 safety levels) |
| `hook-protect-secrets` | Pattern guide: 33 file + 24 bash + 15 exfiltration patterns để protect secrets |

### New Rules (from sangrokjung/claude-forge, MIT)
`golden-principles`, `verification`, `security`, `git-workflow-v2`, `testing`, `agents-v2`

### Stats
- Agents: 83 → **87** (+4)
- Commands: 141 → **152** (+11)
- Skills: 49 → **64** (+15)
- Rules: 5 → **11** (+6)
- Skill trigger tests: 43 → **58** (+15, all passing)

---

## v1.3.23-clean — Metadata Sync + Docs Version + Path Fix
*2026-05-19*

### Metadata sync (no feature changes)

**`.claude-plugin/plugin.json`** — counts updated:
- commands: 32 → 141 | agents: 19 → 83 | skills: 19 → 49
- tests field renamed to `checks: 108` with breakdown object (47 hook + 12 audit + 43 skill + 6 smoke)
- version: 1.3.15 → 1.3.23

**`.claude-plugin/marketplace.json`** — counts + highlights updated:
- stats: same corrections as plugin.json
- highlights: updated 5 bullet points với số thực tế
- latest_release: v1.3.15 → v1.3.23-clean

### Docs version bump

| File | Trước | Sau |
|---|---|---|
| `docs/ARCHITECTURE.md` | 1.3.15 | 1.3.23-clean |
| `docs/HOOK_WIRING.md` | 1.3.15 | 1.3.23-clean |
| `docs/MAINTENANCE_POLICY.md` | 1.3.16 | 1.3.23-clean |
| `docs/CLAUDE_MD_GUIDE.md` | 1.3.16 | 1.3.23-clean |

**`docs/ARCHITECTURE.md`** — "19 agents" → "83 agents across root and domain subfolders"

**`docs/HOOK_WIRING.md`** — hardcoded zip name `v1.3.15-fixed.zip` → `latest.zip`

### README fix

- Tree line: "42 agent definitions" → "83 agent definitions across root and domain subfolders"
- Tag example: `v1.3.19` → `v1.3.23-clean`

### Fix: verify-skills-lock.sh + update-skills-lock.sh path resolution

**Problem:** `localPath` trong skills-lock.json trỏ `.claude/skills/...` nhưng trong repo scaffold skills nằm ở `core/skills/...` — script báo toàn bộ MISSING dù files tồn tại.

**Fix:** Thêm `resolve_skill_path()` với 3-step fallback:
1. `$PROJECT_ROOT/$localPath` (installed pack, works as-is)
2. `.claude/skills/<rel>` → `core/skills/<rel>` (repo scaffold)
3. `.claude/skills/<rel>` → `skills/<rel>` (minimal install)

Cả `verify-skills-lock.sh` và `update-skills-lock.sh` đều áp dụng cùng fallback chain.

### Docs: Release zip policy

**`docs/MAINTENANCE_POLICY.md`** — thêm "Release Zip Policy" section:
- Chỉ giữ latest + 1 previous trong repo
- Bản cũ → GitHub Releases archive
- Hiện trạng: 19 zips (~8MB) chưa xóa, chờ human duyệt

---

## v1.3.22 — Phase 8 Skill Import + hook-review Fix
*2026-05-19*

### New Skills — alirezarezvani/claude-skills (Phase 8 import)
9 skills imported from engineering + research categories:

| Skill | Mô tả |
|---|---|
| `agenthub` | Parallel subagents competing on same task via git worktree isolation |
| `write-a-skill` | Structured 3-phase framework for creating new SKILL.md files |
| `handoff` | Project handoff — summarize state for the next session/engineer |
| `caveman` | Ultra-compressed mode — giảm ~75% token, giữ technical terms |
| `code-tour` | Guided walkthrough of codebase for new contributors |
| `chaos-engineering` | Inject failures and validate system resilience |
| `llm-cost-optimizer` | Audit + reduce LLM API costs (batching, caching, model selection) |
| `pulse` | Multi-source recency research (Reddit, HN, open web) — 7–90 day window |
| `research` | Intelligent research router — dispatches to pulse/litreview/dossier/patent |

### New Skills — YAMTAM-native (from disler patterns)
2 skills created from `disler/claude-code-hooks-mastery` patterns:

| Skill | Mô tả |
|---|---|
| `session-context` | Load git state + context files at session start (graceful degradation) |
| `pre-compact-backup` | Timestamped transcript backup before compaction |

### Fixed
**`core/commands/hook-review.md`** — Step 3 bypass scan: loại bỏ `core/commands/` khỏi grep để tránh hook-review tự tìm thấy chính nó trong kết quả. Sửa lỗi syntax pipe duplicate.

### Stats
- Skills: 38 → **49** (+11)
- Skill trigger tests: 31 → **43** (+12, all passing)

---

## v1.3.21 — Conflict Resolution Policy + Governance Hardening
*2026-05-19*

### New Rules
**`core/rules/conflict-resolution.md`** — Multi-agent edit conflict resolution policy:

- **Phát hiện:** Main agent scan overlap line range sau khi nhận toàn bộ subagent reports
- **Phân loại:** 3 loại conflict — `direct` (xung đột), `overlap` (chồng vùng), `dependency` (vô hiệu hóa nhau)
- **Ưu tiên:** Safety > Correctness > Performance > Style
- **Strategies:** Sequential (không mâu thuẫn) → Merge (bổ sung nhau) → Human escalation (thực sự conflict)
- **Conflict log:** Format chuẩn để audit trail mọi quyết định resolve
- **Red flags:** Bắt buộc escalate với schema migration, public API, xóa file, thiếu evidence
- **Phòng ngừa:** Scope subagent không overlap từ đầu — tốt hơn giải quyết sau

### Updated Docs (Governance Hardening)
**`docs/MAINTENANCE_POLICY.md`** — Thêm tiêu chuẩn metadata bắt buộc cho mọi hook:
```bash
# Version: x.y.z | Status: [active|review|deprecated]
# Description: ... | Last Reviewed: YYYY-MM-DD
```
Thiếu header → `/hook-review` tự động flag `NEEDS ATTENTION`.

**`core/rules/subagent-policy.md`** — Thêm section `Evidence & Reasoning` vào report format:
Subagent phải giải thích *tại sao* đưa ra kết luận và liệt kê những gì đã check nhưng không có vấn đề — main agent có đủ data để quyết định.

### MANIFEST
- Version 1.3.20 → 1.3.21; rules 4 → 5.

---

## v1.3.20 — YAMTAM-Native Governance Skills
*2026-05-19*

### New Skills (+2, total 36 → 38)

**`telemetry-analysis`**
Phân tích dữ liệu telemetry local của YAMTAM: hook activity, token usage pattern,
trust score health, bypass usage. Đọc từ `.claude/state/telemetry.jsonl`,
`audit-chain.log`, `session-trust.json`. Không cần network.
Triggers: "xem log", "hook nào fire", "audit trail", "token usage", "session summary".

**`subagent-dependency`**
Orchestrate multi-agent workflow theo DAG (Directed Acyclic Graph): phân loại
dependency (none/data/exclusive/soft), xác định wave parallel vs sequential,
dispatch template, merge results. Sizing guide theo codebase size.
Triggers: "orchestrate agents", "chạy song song", "parallel agents", "agent pipeline".

### New Tests
- `test-skill-triggering.sh` — +6 trigger cases (2 skills × 3 phrases). Total: 25 → 31.

### MANIFEST
- Version 1.3.19 → 1.3.20; skills 36 → 38.

---

## v1.3.19 — wshobson/commands Import
*2026-05-19*

### New Commands (+45, total 96 → 141)

**Tools (×34):**
`accessibility-audit`, `ai-assistant`, `ai-review`, `api-mock`, `api-scaffold`,
`code-migrate`, `compliance-check`, `config-validate`, `context-restore`, `context-save`,
`cost-optimize`, `data-pipeline`, `data-validation`, `db-migrate`, `debug-trace`,
`deploy-checklist`, `deps-upgrade`, `docker-optimize`, `error-analysis`, `error-trace`,
`issue`, `langchain-agent`, `monitor-setup`, `multi-agent-optimize`, `multi-agent-review`,
`pr-enhance`, `prompt-optimize`, `slo-implement`, `smart-debug`, `tdd-green`, `tdd-red`,
`tdd-refactor`, `tech-debt`, `test-harness`

**Workflows (×11):**
`data-driven-feature`, `full-review`, `full-stack-feature`, `improve-agent`,
`incident-response`, `legacy-modernize`, `ml-pipeline`, `multi-platform`,
`smart-fix`, `tdd-cycle`, `workflow-automate`

Source: wshobson/commands (MIT License)

### MANIFEST
- Version 1.3.18 → 1.3.19; commands 96 → 141.

### Release
- `releases/yamtam-engine-v1.3.19-fixed.zip` — 847K.

---

## v1.3.18 — rohitg00/awesome-claude-code-toolkit + affaan-m/everything-claude-code Import
*2026-05-19*

### New Agents (+41, total 42 → 83)
- **`core-development/`:** `api-designer`, `api-gateway-engineer`, `event-driven-architect`, `fullstack-engineer`, `graphql-architect`, `microservices-architect`, `monorepo-architect`, `websocket-engineer`
- **`quality-assurance/`:** `accessibility-specialist`, `chaos-engineer`, `compliance-auditor`, `penetration-tester`, `qa-automation`, `test-architect`
- **`infrastructure/`:** `database-admin`, `devops-engineer`, `kubernetes-specialist`, `network-engineer`, `platform-engineer`, `security-engineer`, `sre-engineer`, `terraform-engineer`
- **`business/`:** `business-analyst`, `scrum-master`, `ux-researcher`, `technical-writer`
- **`data-ai/`:** `ai-engineer`, `llm-architect`, `ml-engineer`, `data-scientist`, `data-engineer`, `nlp-engineer`
- **`orchestration/`:** `multi-agent-coordinator`, `knowledge-synthesizer`, `workflow-director`
- **`dev-experience/`:** `mcp-developer`, `refactoring-specialist`, `build-engineer`, `git-workflow-manager`
- **`research/`:** `research-analyst`, `competitive-analyst`
- Source: rohitg00/awesome-claude-code-toolkit

### New Commands (+22, total 74 → 96)
- **Git (×5):** `/git-commit`, `/git-pr-create`, `/git-pr-review`, `/git-worktree`, `/git-changelog`
- **DevOps (×3):** `/dockerfile`, `/k8s-manifest`, `/monitor`
- **Architecture (×4):** `/arch-adr`, `/arch-diagram`, `/arch-plan`, `/arch-design-review`
- **Refactoring (×4):** `/refactor-cleanup`, `/refactor-extract`, `/refactor-rename`, `/refactor-simplify`
- **Security (×2):** `/secrets-scan`, `/csp`
- **Testing (×3):** `/snapshot-test`, `/integration-test`, `/test-fix`
- **Workflow (×1):** `/wrap-up`
- Source: rohitg00/awesome-claude-code-toolkit

### New Skills (+12, total 24 → 36)
- `api-design` — REST/GraphQL API design patterns
- `backend-patterns` — backend architecture and patterns
- `coding-standards` — enforce coding standards and conventions
- `deep-research` — comprehensive multi-source research workflow
- `documentation-lookup` — efficient documentation search and retrieval
- `e2e-testing` — end-to-end test authoring workflow
- `security-review` — security audit and vulnerability review
- `tdd-workflow` — test-driven development workflow (step-by-step)
- `verification-loop` — iterative verification before completion
- `agent-introspection-debugging` — debug agent behavior and reasoning
- `frontend-patterns` — frontend architecture and UI patterns
- `mcp-server-patterns` — MCP server design and implementation patterns
- Source: affaan-m/everything-claude-code

### MANIFEST
- Version 1.3.17 → 1.3.18; agents 42→83, commands 74→96, skills 24→36.

### Release
- `releases/yamtam-engine-v1.3.18-fixed.zip` — 348 files.

---

## v1.3.17 — qdhenry/Claude-Command-Suite Import
*2026-05-19*

### New Agents (+23)
- **Root agents:** `architecture-auditor`, `code-auditor`, `dependency-analyzer`, `performance-auditor`, `integration-manager`, `project-architect`, `release-manager`, `strategic-analyst`, `task-commit-manager`, `task-decomposer`, `task-orchestrator`, `test-engineer`, `agent-organizer`
- **`quality-testing/`:** `code-reviewer`, `debugger`, `qa-expert`, `test-automator`, `architect-review`
- **`security-team/`:** `security-auditor`
- **`infrastructure/`:** `cloud-architect`, `deployment-engineer`, `incident-responder`, `performance-engineer`
- Source: qdhenry/Claude-Command-Suite. Total agents: 19 → 42.

### New Commands (+41)
- **Security (×4):** `/security-audit`, `/security-hardening`, `/dependency-audit`, `/add-authentication-system`
- **Dev (×11):** `/code-review`, `/debug-error`, `/refactor-code`, `/ultra-think`, `/fix-issue`, `/explain-code`, `/architecture-scenario-explorer`, `/remove-dead-code`, `/clean-branches`, `/prime`, `/incremental-feature-build`
- **Test (×4):** `/write-tests`, `/generate-test-cases`, `/test-coverage`, `/setup-comprehensive-testing`
- **Performance (×4):** `/performance-audit`, `/optimize-build`, `/optimize-bundle-size`, `/optimize-database-performance`
- **Docs (×5):** `/create-architecture-documentation`, `/doc-api`, `/generate-api-documentation`, `/troubleshooting-guide`, `/create-onboarding-guide`
- **Team (×6):** `/architecture-review`, `/sprint-planning`, `/standup-report`, `/estimate-assistant`, `/retrospective-analyzer`, `/issue-triage`
- **Project (×3):** `/create-feature`, `/project-health-check`, `/add-package`
- **Deploy (×3):** `/prepare-release`, `/ci-setup`, `/containerize-application`
- **Context (×1):** `/optimize-prompt`
- Total commands: 33 → 74.

### New Skills (+4)
- `audit-env-variables` — audit environment variable usage and security patterns
- `remove-dead-code` — detect and safely remove unused code with multi-agent coordination
- `file-watcher` — watch files for changes and trigger actions
- `setup-agent-tail` — tail and monitor agent activity logs
- Total skills: 20 → 24.

### MANIFEST
- Version 1.3.16 → 1.3.17; agents 19→42, commands 33→74, skills 20→24.

### Release
- `releases/yamtam-engine-v1.3.17-fixed.zip` — 254 files, 452K.

---

## v1.3.16 — Claude Code Harness Integration
*2026-05-19*

### New Docs
- `docs/MAINTENANCE_POLICY.md` — hook lifecycle policy: 4 states (active/review/deprecated/removed), trigger conditions for early review, stale hook risk analysis, review history in `docs/reviews/`
- `docs/CLAUDE_MD_GUIDE.md` — CLAUDE.md architecture guide: 4-tier layering (root → subdirectory → subdirectory init → per-dir test scope), checklist before creating new CLAUDE.md

### New Rules
- `core/rules/subagent-policy.md` — subagent read-only policy: permission table (main agent vs subagent), dispatch format, report format, red flag indicators

### New Skills
- `core/skills/lsp-navigation/SKILL.md` — LSP-first symbol navigation: go-to-definition + find-references before grep; grep fallback guidelines to minimize context budget usage

### New Commands
- `core/commands/hook-review.md` — `/hook-review`: hook lifecycle review (read-only report); checks version header, test coverage, execute bit, last touched, bypass indicators, overlap; human-gated execution

### New Tests
- `core/tests/commands/test-hook-review-smoke.sh` — 6 smoke tests verifying hook-review.md file structure and format
- `core/tests/skills/test-skill-triggering.sh` — +3 lsp-navigation trigger cases; total now 25 tests

### Updated Docs
- `docs/HOOK_WIRING.md` — added `/hook-review` entry under Commands section

### MANIFEST
- Version 1.3.15 → 1.3.16; commands 32→33, skills 19→20, rules 3→4; 6 new file entries

---

## v1.3.15 — Executing-Plans, Code Review Skills
*2026-05-18*

### New Skills
- `core/skills/executing-plans/SKILL.md` — structured execution of approved plans; gate checks before each step
- `core/skills/requesting-code-review/SKILL.md` — how to request code review with context and scope
- `core/skills/receiving-code-review/SKILL.md` — how to receive and address review comments
- `core/skills/writing-skills/SKILL.md` — how to author new YAMTAM skill files correctly

### Tests
- +8 skill trigger tests (4 new skills × 2 phrases each) → 22 total

### Release
- `releases/yamtam-engine-v1.3.15-fixed.zip` — 173 files, 260K

---

## v1.3.14 — Checkpoint + Handoff Commands
*2026-05-18*

### New Commands
- `/checkpoint` — save session state mid-task; structured snapshot of current progress, blockers, next steps
- `/handoff` — generate handoff note for context-window boundary; structured for clean agent pickup

### MANIFEST
- Version 1.3.13 → 1.3.14; commands 30→32 (+checkpoint, +handoff)

---

## v1.3.13 — TDD Skill Import
*2026-05-18*

### New Skills
- `core/skills/tdd/SKILL.md` — RED → GREEN → REFACTOR cycle; multi-agent context isolation; external test scripts removed; integrated with verify-before-done and debug-protocol skills
- Source: adapted from glebis/claude-skills (MIT License)

### MANIFEST
- Version 1.3.12 → 1.3.13; skills 14→15 (+tdd)

---

## v1.3.12 — Superpowers Skill Import
*2026-05-18*

### New Skills
- `core/skills/plan-first/SKILL.md` — plan before implement; multi-step task gate
- `core/skills/verify-before-done/SKILL.md` — verify claims before reporting done/fixed
- `core/skills/debug-protocol/SKILL.md` — structured debug loop: reproduce → isolate → fix → verify
- `core/skills/branch-finish/SKILL.md` — branch completion checklist before merge
- `core/skills/worktree-safety/SKILL.md` — safe experiment isolation via git worktree
- Source: adapted from obra/superpowers v5.1.0 (MIT License); content rewritten in YAMTAM style

### New Commands
- `/diff-review` — review staged diff before commit; checks scope, test coverage, doc drift

### MANIFEST
- Version 1.3.11 → 1.3.12; skills 9→14 (+5), commands 26→27 (+diff-review)

---

## v1.3.11-fire — FIRE List 1–5: Audit Hardening, Fact-Check, Session Trust, Tool Router, Skill Loop
*2026-05-18*

### New Scripts
- `core/scripts/verify-audit-chain.sh` — verifies SHA-256 hash chain in audit log; exit 0 = intact, exit 1 = first broken entry printed
- `core/scripts/session-trust.sh` — tracks session trust score (0–100); `get/show/decrement N/reset`; state in `.claude/state/session-trust.json`

### New Commands
- `/fact-check [claim]` — proactive claim verification; agent must show evidence inline and rate confidence: `verified / likely / unverified`
- `/improve-skill [path/to/SKILL.md]` — human-gated skill improvement loop; Executor → Analyst → Mutator → Human; Mutator never edits without approval

### Updated Hooks
- `audit-log.sh` — upgraded from plain text to SHA-256 hash-chained JSONL (`audit-chain.log`); each entry hashes content + previous hash; tamper-evident
- `truth-gate-guard.sh` — now calls `session-trust.sh decrement 10` on each unverified claim warning; score < 50 shows `🔴 LOW TRUST SESSION` banner

### Updated Agents
- `tool-router.md` — added Specialist Routing Table (5 query types → specialist + tool allowlist); Confidence Threshold rule: < 70% → ask user, do not guess; least-privilege enforced

### New Tests
- `core/tests/hooks/test-audit-chain.sh` — 12 test cases: entry format, genesis hash, chain integrity, secret masking, tampering detection
- `core/tests/hooks/run-hook-tests.sh` — added 5 session-trust cases; total now 47 tests

### New Docs
- `docs/ARCHITECTURE.md` — full architecture reference: layer model, hook execution model, memory architecture, agent routing, release process
- `docs/AUDIT_HARDENING.md` — hash-chain audit log design: format, masking rules, verification, limitations

### Bug Fixes
- SC2295: fixed unquoted `$PROJECT_ROOT` inside `${..#..}` in `scope-guard.sh`, `context-gate.sh`, `drift-check.sh`, `search-facts.sh`, `search-session-facts.sh`
- Removed unused `CUTOFF` variable from `drift-check.sh`
- Fixed execute bit on 6 scripts missing `+x`
- Version headers bumped from v1.2.x → v1.3.11 in 5 files

---

## v1.3.11 — gitnexus Upstream Refresh, Wiki Automation, Git Lessons Skill
*2026-05-17*

### New Skills
- `git-lessons` — extract lessons from `fix:` commits via `git log --grep`; pattern recognition
  by area/type/recurrence; promotes critical lessons to L1. No L3 infrastructure needed.

### New Commands
- `/wiki` — generate static docs from gitnexus knowledge graph → `docs/wiki/` (git-tracked);
  agents read `docs/wiki/` instead of scanning code — reduces context window usage.

### New Scripts
- `generate-wiki.sh` — runs `npx gitnexus wiki`, copies output to `docs/wiki/`, optional
  `--commit` flag for auto-commit. Handles output path detection across gitnexus versions.

### Upstream Refresh
- `gitnexus-cli` skill updated to v1.6.5: incremental indexing default, `--embeddings-url`
  HTTP backend flag for self-hosted endpoints, v1.6.0 install bug warning added.

### Docs
- `README.md` — full rewrite: correct counts, Action Gate L0–L5 table, `.out-of-scope/`
  section, `.claude-plugin/` install instructions, GitHub Actions release note.
- `AGENTS.md` — L2 session memory section, skills table, updated enforcement table (L0–L5).

### MANIFEST
- Version 1.3.10 → 1.3.11; commands 25→26 (+wiki); scripts 17→18 (+generate-wiki); skills 8→9 (+git-lessons).

---

## v1.3.10 — .out-of-scope/ Boundary Documents
*2026-05-17*

### New Docs
- `.out-of-scope/README.md` — index of 5 boundary decisions.
- `.out-of-scope/real-time-cost-dashboard.md` — why we don't build a live cost UI.
- `.out-of-scope/multi-agent-coordination.md` — why cross-repo coordination is out of scope.
- `.out-of-scope/enterprise-rbac.md` — why full RBAC is wrong for a personal OS.
- `.out-of-scope/l3-l4-memory-tiers.md` — why L3/L4 memory waits until L1 proves insufficient.
- `.out-of-scope/cloud-console-protection.md` — why cloud console protection belongs at IAM layer.

---

## v1.3.9 — /code-simplify Command
*2026-05-17*

### New Commands
- `/code-simplify [file|dir] [--dry-run]` — static analysis targeting dead code,
  over-abstraction, redundant logic, unnecessary indirection.

---

## v1.3.8 — Security Advisory Templates
*2026-05-17*

### New Docs
- `.github/security-advisories/GHSA-TEMPLATE.md` — standard CVSS/CWE advisory template.
- `.github/security-advisories/GHSA-2026-0001.md` — hook output format bug (cost-guard +
  rbac-guard); CVSS 6.5 Medium, CWE-693; fixed in v1.3.1.

---

## v1.3.7 — GitHub Actions Release Workflow
*2026-05-17*

### Infra
- `.github/workflows/release.yml` — triggers on semver tag push (`v[0-9]+.[0-9]+.[0-9]+`).
  Steps: validate tag → install jq/zip → run hook tests → drift check → build pack →
  update plugin.json/marketplace.json version → create GitHub Release via `softprops/action-gh-release@v2`.

---

## v1.3.6 — .claude-plugin/ Distribution
*2026-05-17*

### New Files
- `.claude-plugin/plugin.json` — schema_version 1; install via zip from GitHub Releases latest.
- `.claude-plugin/marketplace.json` — tagline, highlights, stats, install command.
- `build-release.sh` updated: creates `yamtam-engine-latest.zip` symlink for stable install URL.

---

## v1.3.5 — /memory L2 Integration
*2026-05-17*

### Updated Commands
- `/memory` — bare call now shows L1 + L2 automatically; `--l2` (both layers);
  `--l2-only` (session facts only).

---

## v1.3.4 — L2 Session Memory
*2026-05-17*

### New Memory Tier
- `memory/L2_session/` — ephemeral facts, gitignored, cleared each session.
- `memory/L2_session/SCHEMA.md` — simpler schema: required id/statement/source; optional tags/evidence.

### New Scripts
- `add-session-fact.sh` — non-interactive flag-based writer for agent use.
- `search-session-facts.sh` — keyword + `--tag` filter for L2 facts.
- `clear-session.sh` — wipe L2 with `--force` or confirmation; never deletes SCHEMA.md.

### New Commands
- `/session` — add/search/clear/promote L2 session facts to L1.

### Infra
- `.gitignore` — `memory/L2_session/*.md` ignored, `!memory/L2_session/SCHEMA.md` tracked.

---

## v1.3.3 — Tag Support on Seed Facts + Test Seam for commit-gate
*2026-05-17*

### Memory
- All 4 seed facts tagged: fact-confidence-rule `[memory,confidence,schema]`,
  fact-hook-exit-codes `[hook,exit-code,format]`, fact-scope-boundary `[scope,gate,cross-scope]`,
  fact-truth-gate `[hook,truth-gate,claim-verb]`.

### Tests
- `commit-gate.sh` test seam: `COMMIT_GATE_TEST_STAGED` env var (mirrors `TRUTH_GATE_TEST_TEXT`).
- +8 commit-gate tests → 42 total (was 34).

### Release
- `releases/yamtam-engine-v1.3.3-fixed.zip` — 133 files, 208K.

---

## v1.3.2 — L4 Action Gate: commit-gate + deploy-gate
*2026-05-17*

### New Hooks
- `commit-gate.sh` (PreToolUse, L2 advisory): warns when staged files touch cross-scope paths.
  Bypass: `YAMTAM_SCOPE_OK=1`. Test seam: `COMMIT_GATE_TEST_STAGED`.
- `deploy-gate.sh` (PreToolUse, L4 block): blocks gh workflow run, kubectl apply/rollout,
  docker push, gcloud deploy, fly deploy/launch, heroku releases:promote.
  Bypass: `YAMTAM_DEPLOY_APPROVED=1`.

### Tests
- +8 deploy-gate tests, +8 commit-gate tests → 34 total (was 26).

### Spec Updates
- `gates/action_gate.md` — updated with full L0–L5 coverage table.
- `docs/HOOK_WIRING.md` — v1.3.1, both hooks wired in all presets.

---

## v1.3.1 — Tag Support, Hook Output Format Fix, Regex Fix
*2026-05-17*

### Bug Fixes (Critical)
- **`cost-guard.sh` wrong output format**: `emit()` used `{decision,reason}+exit 0` —
  blocking rules were silent no-ops. Fixed: `block()` uses `hookSpecificOutput+exit 2`,
  `warn()` uses `additionalContext+exit 0`.
- **`rbac-guard.sh` wrong output format**: same class of bug; also used fragile python3
  JSON encoding. Fixed with jq-based hookSpecificOutput + exit 2.
- **`cost-guard.sh` grep regex**: pattern `grep.*(-r).*[[:space:]]+\.` missed
  `grep -r pattern .` (content between flag and path). Fixed: `grep.*(-r).*[[:space:]]\.`.
- **`drift-check.sh` SCHEMA.md not skipped**: would have triggered false stale alert in 2027
  on example date in SCHEMA.md. Fixed: now skips SCHEMA.md alongside INDEX.md.

### New Features
- **Tag support for L1 memory**: `tags` field in SCHEMA.md, `--tag TAG` filter in
  `search-facts.sh`, tag prompt in `add-fact.sh`, `/memory --tag` documented.

### Tests
- +5 cost-guard tests (block/allow/bypass) → 26 total (was 21).

### Security Advisory Filed
- GHSA-2026-0001: hook output format bug affected cost-guard + rbac-guard in all versions
  prior to v1.3.1. CVSS 6.5 Medium (CWE-693).

---

## v1.3.0 — Truth Gate Runtime, Scope Guard, L1 Memory, Drift Detector
*2026-05-17*

### New Hooks
- `truth-gate-guard.sh` (Stop): scans last assistant message for claim verbs
  (done/fixed/deployed…); warns when no evidence patterns or fallback qualifiers
  present. Non-blocking. Bypass: `YAMTAM_TRUTH_GATE_BYPASS=1`.
- `scope-guard.sh` (PreToolUse): warns when Write/Edit targets product dirs
  (`app/ components/ lib/ db/ migrations/ .env* vercel.json`…).
  Advisory only. Bypass: `YAMTAM_SCOPE_OK=1`.

### New Commands
- `/verify` — full health check: git state + hook syntax + test suite + drift report.
  Shows actual command output (Truth Gate compliant).
- `/memory [keyword]` — search and list L1 Atomic Memory facts by keyword,
  type, scope, or confidence.

### New Scripts
- `drift-check.sh` — detects task drift (done with no recent commit), README
  overclaims (feature with no grep hit), and stale L1 facts (expired).
  Exit 0 clean / 1 dirty. Integrated into `/verify`.
- `search-facts.sh` — grep-based L1 fact retrieval. Filters: `--type`, `--scope`,
  `--confidence`, `--expired`, `--all`.
- `add-fact.sh` — interactive fact writer. Enforces scope mandatory, blocks
  secret patterns, defaults confidence to `unverified`.

### L1 Atomic Memory
- `memory/L1_atomic/SCHEMA.md` — field spec: id, type, statement, source,
  confidence, scope, expires_at, forbidden_assumptions, evidence.
- `memory/L1_atomic/INDEX.md` — auto-updated index table.
- File-based only. No network, no server, no npm deps.
- L2 session tier added in v1.3.4. L3/L4 deliberately excluded (see `.out-of-scope/`).

### Spec Updates
- `gates/truth_gate.md` — status updated from "Future Hook" to "Implemented".
- `MANIFEST.json` — hooks 20→22, commands 21→23, scripts 10→13, memory section added.

### Infra
- `.gitignore` — added `.claude/state/` (runtime logs, not committed).
- Hook test suite expanded: +7 truth-gate test cases.

---

## v1.2.9-fixed — Hook Test Suite & Release QA
*2026-05-07*

- Added hook test suite with 13 automated tests across 4 hooks (in pack).
- Test suite reports 13/13 PASS when run from imported pack.
- Added `verify-claude-pack.js` for pack integrity check.
- Documented known limitations explicitly.
- Fixed `RELEASE_CHECKLIST.md` to match v1.2.9 scope (not v1.2 template).
- Cleaned filename encoding issues (`#U2014` → ASCII).
- Updated `MANIFEST.json` to reflect actual file structure.
- Added `README.md` at pack root.

---

## v1.2.8-fixed — PocketOS / API Destruction Guard
*2026-04*

- Added `api-destruct-guard.sh`: blocks raw destructive HTTP/GraphQL calls.
- Defense against PocketOS-style incidents (agent deletes Railway volume autonomously).
- Updated `AGENT_INCIDENT_DEFENSE.md` with PocketOS case analysis.

---

## v1.2.7 — Replit-Incident Defense / Production Protection
*2026-04*

- Strengthened `guard-destructive.sh` following Replit incident analysis.
- Added production command block patterns.
- Updated `AGENT_INCIDENT_DEFENSE.md` with Replit case.

---

## v1.2.6 — Handoff Mode
*2026-04*

- Added checkpoint/handoff protocol for context window limits.
- Agent generates structured handoff note before token exhaustion.

---

## v1.2.5 — E2E Safety
*2026-04*

- Added E2E safety layer to prevent runaway test loops.
- Timeout guards on E2E test runs.

---

## v1.2.4 — Local Audit Log
*2026-03*

- All hook decisions (allow/warn/deny) logged locally.
- Log format: `timestamp | hook | input | decision`.

---

## v1.2.3 — Scope Lock
*2026-03*

- Agent scope bounded to declared task.
- Cross-scope edits require explicit approval.

---

## v1.2.2 — Budget Mode Switch
*2026-03*

- Manual budget mode toggle to reduce API cost during low-priority tasks.

---

## v1.2.1 — Truthful Cost Guard
*2026-03*

- Cost estimation before expensive operations.
- Agent must report estimated cost, not hide it.

---

## v1.0–v1.1 — Foundation
*2026-02/03*

- Initial hook architecture.
- `db-protect.sh`, `token-scope-guard.sh` first versions.
- Basic agent ruleset.
