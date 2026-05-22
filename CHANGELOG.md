# YAMTAM ENGINE — Changelog

All notable changes to YAMTAM ENGINE release packs are documented here.

> **Note:** This changelog tracks **release pack** events. This scaffold repo
> does not enforce any release item at runtime until the pack's `hooks/`,
> `scripts/`, and `tests/` are imported into `core/`.

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
