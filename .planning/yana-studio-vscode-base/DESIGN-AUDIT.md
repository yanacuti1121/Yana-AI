# Stitch design audit (drop of 2026-10-12, 21 designs)

Source: `docs/stitch_yana_studio_ide_evolution/*/code.html` (all 21 read as text; 10
screen.png valid, 11 are HTML error pages). Each feature is classified against the code
in `tools/yana-ide/` and the installed `yana-rt` 1.5.0.

Legend: **Built** = in the IDE today · **Now** = buildable with real data, no runtime
change · **Runtime** = needs a new yana-rt capability first · **Fiction** = invented,
do not build.

## A. Built (design confirms what exists)

| Feature | Designs that show it | IDE today |
|---|---|---|
| Yana control-plane tree: Conversations, Models & Runtime (Local/Cloud, key ✓), Project (Memory, Pinned 3/9), Tasks, Governance, Tools, System | canvas_in_editor_tab, model_orchestration_code_oss | features/conversations, models, project, tasks, governance, tools, system |
| Chat panel: runtime badge, CONNECTED · LOCAL RUNTIME, model + KEY, Supervised with Auto/Plan-Only disabled, operator intent, tool trace, amber approval card, tokens footer | almost all | extension.js + media/panel.js |
| Status bar: Yana Runtime v1.5.0, Policy SUPERVISED [ALLOW: read · REQUIRE: run], Audit 500✓ | canvas_in_editor_tab, native_fork, model_orchestration | features/statusbar.js |
| Yana Settings 9 tabs, Models & Runtime card, local scan, provider library, auxiliary roadmap, usage, external tools, commands, privacy | models_runtime_settings | features/settings*.js |
| Design Canvas as editor tab: isolated sandbox, model picker, New/Variant/Refine chat, Desktop/Phone, Stop, Another variant, Export HTML, live preview | canvas_in_editor_tab | features/canvas*.js |

## B. Buildable now with real data

| # | Feature | From design | Real data source | Size |
|---|---|---|---|---|
| B1 | Canvas polish: live header (model + KB received + progress), "Keychain Verified" when a key is saved, sandbox notice card, compare variants side by side | canvas_in_editor_tab | stream length, SecretStorage, saved screens | S |
| B2 | Welcome / launcher editor: Open folder, Clone repo, New Design Canvas, recent workspaces, local AI status, runtime version, policy summary | welcome_launcher_hub, empty_editor | IDE recent list, local scan, yana-rt --version | M |
| B3 | Model Orchestration page: Auto model (which provider/model and why), title model (main or cheap), Mixture of Agents presets + test run with per-step time | model_orchestration_code_oss, modern_model_orchestrator | old host/model-orchestration.cjs, mixture-of-agents.cjs, chat-turns.cjs | L |
| B4 | Governance center: lease table with live expiry countdown and Revoke, Grant lease form (subject, capability, allow/deny, minutes, budget), audit log stream with ALLOW/DENY/WARN filter and export | governance_actiongate_center | `yana-rt lease list/grant/revoke --json`, `.claude/state/audit-chain.log` | M |
| B5 | Chat model picker grouped by provider with model suggestions and key state | full_vs_code_ide, main_workspace | catalog + SecretStorage (no prices, no t/s) | S |
| B6 | Code blocks in replies: Copy, Insert at cursor | integrated_sidebar | reply Markdown | S |
| B7 | Tasks board (editor tab): columns Open / In progress / Blocked / Done, task inspector with evidence | tasks_board, tasks_kanban | `yana-rt task list --json` | M |
| B8 | "Yana Runtime" output channel: every runtime event of a turn, readable after the fact | full_architecture, main_workspace | headless NDJSON events | S |
| B9 | Rabbit emblem as the Yana icon (activity bar, panel header, app icon later) | yana_ai_emblem_logo | design asset (needs an SVG export) | S |
| B10 | Hunt / Scan / CI findings in the Problems panel | governance, pty_matrix | `yana-rt hunt/scan --json` (check flags first) | M |
| B11 | Blast radius map view | antigravity_swarm (heatmap) | `yana-rt map show` (check JSON) | M |
| B12 | Suggested prompts in empty chat (doctor, scan…) wired to real commands | welcome_launcher_hub | Tools commands | S |

## C. Needs runtime work first (do not fake in the UI)

| Feature | Why it needs yana-rt |
|---|---|
| Auto (L1) and Plan-Only modes | yana-rt always requires approval for run_command; no mode flag |
| File-edit proposals with diff + Accept & Apply | yana-rt chat has no governed write_file / diff event today |
| Thinking / reasoning trace | not emitted by the headless protocol |
| `yana-rt models --json` as the single provider catalog | 1.5.0 has no `models` subcommand |
| Task decomposition by agents, sub-tasks | no runtime support |
| Continuity memory (what Yana remembers across chats) | old Studio did it in node:sqlite; check availability in the extension host before porting |

## D. Fiction (never build; listed in STITCH-BRIEF as forbidden)

Daemon PID / port / unix socket / "IPC connected"; gVisor, microVM, eBPF egress filter,
cgroups; Metal MPS telemetry, VRAM, tok/s, latency ping; "41 providers" and providers
not in the runtime (Mistral, Cohere, Perplexity, AI21, Qwen, ERNIE, Together, Fireworks,
Anyscale, Replicate, DeepInfra, Lepton, OctoAI, Hyperbolic, Bedrock, Azure, Cloudflare,
Cerebras, SambaNova, vLLM, Jan); per-model price and speed tables; Tree-sitter invariant
guard, consensus %, deterministic seed; ECDSA / FIDO2 / dual-key signatures, Secure
Enclave; agent swarms and topology graphs, velocity, sub-agent hierarchy; Fork / Deploy
title-bar buttons (would need a core patch and have no backing feature); version labels
v2.4 / v2.6.4 (runtime is 1.5.0); "Ghost-text inline refinement" (no inline completion
provider yet; possible later as a real feature, not a mock).

## Suggested order

B1 → B9 → B2 → B4 → B3 → B7 → B5/B6/B8/B12 → B10/B11. Each item: build, test without
launching the app where possible, one app restart per batch, report.
