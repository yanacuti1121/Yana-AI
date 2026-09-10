# Yana AI — Deep System Architecture (Re-audit, September 2026)

**Trạng thái:** Tài liệu tham chiếu từ anh Tâm, gửi 2026-09-10, sau khi anh
tự đào lại `main` hiện tại (không chỉ dựa trí nhớ cũ). Mục đích: cho Claude
hiểu "Yana AI hiện thực sự là hệ thống gì từ tầng sâu nhất lên đến sản
phẩm" — TRƯỚC bản origin story (`YANA-BUILD-JOURNEY-DRAFT.md`). Thứ tự đọc
đúng theo ý anh: **Deep Architecture → Origin/History → audit repo → mới
thiết kế homepage.**

Tài liệu này cố tình phân biệt 3 mức độ thật: **LIVE**, **IMPLEMENTED BUT
UNWIRED**, **ADAPTER-BASED**, **DEFERRED** — để không lấy concept rồi
quảng cáo như feature production.

## Spot-verification đã làm (2026-09-10, trước khi lưu file này)

Không chấp nhận nguyên văn không kiểm — đã grep/đọc trực tiếp source code
đối chiếu các claim quan trọng nhất trước khi lưu tài liệu này làm tham
chiếu:

| Claim trong tài liệu | Kiểm bằng | Kết quả |
|---|---|---|
| §14/§16 `file.write`/`config.write` capability có thật | `ls src/capability/` | ✅ `file_mutation.rs`, `config_write.rs` tồn tại thật |
| §4/§19 `YanaAuthorityChain` là cơ chế thật, không phải tên gọi suông | `grep -rl "YanaAuthorityChain" src/` | ✅ Có thật, dùng trong `src/runtime/authority.rs`, `receipt.rs`, `chat/tui/approval.rs`, `chat/headless.rs` và hơn — đúng là cross-cutting, không phải 1 file lẻ |
| §8–§10 Provider gateway/catalog/circuit breaker | `ls src/model/` | ✅ `gateway.rs`, `provider.rs`, `catalog.rs`, `circuit_breaker.rs` đều tồn tại riêng file |
| §32–33 Task dependency graph | `find src -iname "task*"` | ✅ `src/task.rs` tồn tại |
| §47–48 `ProjectWorkspace` tách biệt khỏi `workspace` cũ, **merged UNWIRED** | `grep project_workspace src/main.rs src/cli.rs src/mcp.rs` | ✅ CHÍNH XÁC: `src/main.rs:27: mod project_workspace;` có compile vào binary, nhưng **KHÔNG** xuất hiện trong `cli.rs` hay `mcp.rs` — không có subcommand/MCP tool nào gọi tới nó. Đúng 100% với claim "unwired". `src/workspace/` (module khác, `main.rs:39`) vẫn tồn tại riêng — xác nhận đây là 2 khái niệm khác nhau, không phải 1 |
| §38 Project Memory nối vào Studio thật | `grep -rl "project-memory\|projectMemory" tools/yana-studio/` | ✅ Có thật trong `host/project-memory.cjs`, `host/main.cjs`, `host/preload.cjs`, `renderer/WorkspaceInspector.tsx` — không chỉ là khái niệm trên giấy |

**Chưa kiểm sâu (không đủ thời gian trong 1 lượt, không nên coi là đã xác
nhận):** §29 Merkle audit chain code thật, §57–61 chi tiết Studio Composer
(file attachment/quick-open/model-selector), §80 plugin hardening chi tiết,
toàn bộ 94 mục còn lại chỉ được đọc, không grep từng cái. Việc audit sâu
hơn — theo đúng yêu cầu của anh ở mục 94 dưới đây — vẫn là bước bắt buộc
trước khi viết bất kỳ copy public nào, tài liệu này không thay thế bước đó.

---

## Nguyên văn anh Tâm gửi (2026-09-10)

> Đúng. Bản lịch sử ở trên giải thích "Yana sinh ra thế nào"; còn Claude bây
> giờ cần một tài liệu khác: "Yana AI hiện thực sự là hệ thống gì từ tầng
> sâu nhất lên đến sản phẩm".
>
> Tôi vừa đào lại main hiện tại, không dựa riêng vào trí nhớ cũ. Có khá
> nhiều thứ đã thay đổi so với lần chúng ta mổ kiến trúc trước: TurnEngine
> thống nhất, authority hierarchy đã được ADR hóa, file/config mutation
> governance, task dependency graph, provider gateway/state, Project
> Workspace Service, Project Memory, capability leases, Studio Wave 1/2…
> Trong README hiện tại, chính repo cũng đã chuyển positioning sang "One
> Runtime. Any AI. Human-Governed." và mô tả Yana như persistent control
> plane quanh các model/agent tạm thời.
>
> Dưới đây là bản tôi sẽ gửi Claude. Nó cố tình phân biệt LIVE, IMPLEMENTED
> BUT UNWIRED, ADAPTER-BASED, DEFERRED, để Claude không lấy concept rồi
> quảng cáo như feature production.

### 0. The highest-level model

Conceptually:

```
                         HUMAN
                           │
                           ▼
                      GIÁM THỊ
                  root safety authority
                           │
                           ▼
                YANA CONTROL PLANE
       identity · policy · approval · autonomy
         audit · evidence · capability authority
                           │
                           ▼
                   CANONICAL RUNTIME
                     Rust TurnEngine
                  /                  \
                 /                    \
        MODEL / PROVIDER          CAPABILITY
            PLANE                 EXECUTION
              │                      PLANE
              │                       │
              ▼                       ▼
       AI intelligence         bounded powers
              │                       │
              └──────────┬────────────┘
                         ▼
                 REAL ENVIRONMENT
             files · Git · processes
            repositories · tools · OS
```

At the sides of this system are interfaces: Terminal, Desktop, Packaged
Web, Discord, MCP, and external/native AI harnesses: Claude Code, Codex,
Cursor, Antigravity.

### 1. Human — final authority

Human authority sits above model intelligence. A sufficiently capable
model does not gain more authority merely because it is smarter. A model
cannot legitimately: grant itself capabilities, increase its autonomy
ceiling, manufacture human approval, disable HALT, reinterpret an approval
as permanent permission, allow its own destructive action, give a
subagent authority the human never granted.

The architecture is therefore NOT `AI → tools → computer`. It is:
`AI → proposal → Yana authority → capability → approval/policy → bounded
execution`.

### 2. Giám Thị — root safety authority

Giám Thị is above the normal Yana runtime authority — not merely another
configurable policy module, closer to a root supervisor / emergency
authority. Current runtime hierarchy treats
`.claude/state/GIAMTHI_HALT.lock` as a root HALT state, checked before
provider execution. Existence means HALT; inability to safely verify HALT
state fails closed; normal Yana policy, providers, and agents cannot
override it. Conceptually: `Human → Giám Thị → Yana → Runtime →
Execution`, not `Yana { Giám Thị, everything else }`.

### 3. Yana control plane

Conceptual center of the ecosystem. Owns identity, capability authority,
policy, approval semantics, autonomy, governance, evidence, audit, state,
resource boundaries — decides what intelligence is allowed to become
action. A model proposal string itself has zero authority; Yana must map
it to a canonical capability before permission semantics apply.

### 4. Runtime authority

`model proposal → tool/capability name → canonical Manifest lookup →
availability check → risk/approval policy → ALLOW / DENY / AWAIT HUMAN
APPROVAL`. `AwaitingApproval` is NOT equivalent to `Allow` — no client
should silently promote one to the other without an explicit human event.
Approved mutation receives another authority check immediately before
execution, protecting against approval-at-T / state-changes / stale-
execution-later.

### 5. Canonical Rust turn runtime

Major evolution: unified Rust `TurnEngine` instead of separate Terminal/
Desktop/Web/Discord runtimes. Owns a client-neutral contract:
`TurnRequest`, `RuntimeEvent`, provider invocation, streaming, tool
proposals, cancellation, approval pauses, capability execution. Supports
a bounded provider/tool loop. Does NOT turn providers into execution
authorities.

### 6. Typed runtime events

Clients should not infer system state from random text. Typed events
distinguish: model output, partial stream, tool proposal, capability
request, approval required, execution result, usage, provider failure,
cancellation, terminal state. Important for Studio: it should visualize
runtime state, not recreate authority logic in React.

### 7. Cancellation semantics

First-class runtime concern. Stopping a turn should not lose everything
before it. Partial output preserved during cancellation — matters because
an operation can span model stream → tool request → execution → another
turn. Cancellation belongs to orchestration/runtime semantics, not just a
UI Stop button.

### 8. Model / provider plane

Providers provide INTELLIGENCE, not AUTHORITY. Rust side has a shared
provider catalog covering local and cloud providers — current public
architecture describes a 19-provider catalog (local runtimes, cloud/API
providers, OpenAI-compatible services, native protocol-family
implementations where needed). Examples: OpenAI, Anthropic, Gemini, Groq,
DeepSeek, OpenRouter, Ollama, LM Studio, llama.cpp, and others via the
provider catalog. Design direction: `protocol family → provider
registrations` — adding an OpenAI-compatible provider should normally be
identity/configuration/endpoint/model-catalog, not a whole new streaming
client.

### 9. Provider gateway — newer architecture

Newer addition merged in September unifies provider concepts historically
spread among catalog identity / runtime classification / circuit breaker
state. A provider can conceptually contain: identity, runtime type,
configuration, health, circuit state, quota information, statistics.
Newer state: `ProviderQuota` (RPM limit/used, quota remaining, cost),
`ProviderStats` (calls, failures, timestamps) — persisted stats live
separately from volatile circuit state. **Status: exists, but parts of
the new gateway helpers are not yet the live dispatch path for every
provider call** — do not describe every provider turn as already passing
through the new unified Provider record until wiring is verified.

### 10. Circuit breaker / provider health

Distinguishes: 429/5xx → transient/service failure; 401/403 → bad
credentials/provider-disabled; other 4xx → should not necessarily poison
the circuit. "Provider unavailable" / "credentials invalid" / "quota
exhausted" / "request malformed" are NOT the same system state.

### 11. Local-first does not mean local-only

Local execution matters, but Yana is not exclusively an Ollama wrapper.
Supports local AND cloud intelligence under the same authority model.
Changing inference location may change latency/privacy/cost/credentials/
network destination but never who owns capability authority.

### 12. Canonical capability plane

A CAPABILITY represents actual power (read/write a file, execute a
process, interact with Git, operate on workspace state, modify
configuration). A descriptor can encode risk, mutation status, approval
requirement, availability, scope. Hard distinction: SKILL ("what does an
agent know how to do?") vs CAPABILITY ("what power does the system permit
it to exercise?").

### 13. Skills != capabilities

Thousands of skills existing does NOT mean thousands of privileged
execution paths exist. Skills can expand freely as operating knowledge;
capabilities must remain much smaller and more carefully governed — a
security scalability property. Knowledge surface can grow; trusted
execution surface should grow much more slowly.

### 14. File mutation governance — new

Previously the canonical model capability surface could read files and
execute commands, but did not contain a real `write_file`-shaped
capability. Now there is a `file.write` capability: `PROPOSE → compute/
read diff without mutating → GUARD → HUMAN APPROVAL → BACKUP → ATOMIC
WRITE → VERIFY (re-read+hash) → EVIDENCE`. Yana is not supposed to treat
"model produced new text" as equivalent to "file successfully changed."
Current first increment covers create/overwrite; rename/delete/copy
belong to later increments.

### 15. File write TOCTOU protection

The diff shown to a human is not assumed to remain valid forever. Before
approved file mutation executes, Yana recomputes the diff — human sees
Diff A, another process edits the file, old approval should not
automatically authorize Diff B. Good detail to show Yana as an
engineering system rather than a generic "AI safety" slogan.

### 16. Config governance — new

`config.write` reuses file mutation mechanics with stricter constraints:
only `core/config/`, flat path scope, valid JSON required before proposal
progresses, path escape rejected, symlink target write rejected,
`core-lock.json` excluded from model config mutation (controlled through
its own dedicated reviewed update path). Configuration is not "just
another text file."

### 17. Command execution

Passes through deterministic validation — destructive-operation guards
around `rm -rf`, force push, `git reset --hard`, `git clean -f`, publish/
deploy classes, dangerous shell transformations, additional policy
checks. Fundamental principle: do not ask an LLM whether a shell command
is dangerous inside the authority decision path — use deterministic
checks where possible.

### 18. Hook governance layer

Yana also operates inside external coding harnesses through hooks
(`PreToolUse`, `PostToolUse`, `Stop`) implementing destructive command
checks, HALT checks, token/loop guards, verification, audit behavior, and
other engine-specific policy. Recent lesson: a guard is useless if the
wrapper silently fails to invoke it — missing/unreadable guarded hooks
now FAIL LOUDLY instead of silently returning success.

### 19. Token / loop guard

Not only dollar accounting — also protects against runaway tool loops. A
recent bug: Claude Code sends `tool_name` via hook stdin JSON; the guard
had relied on an environment variable, collapsing all calls into an
"unknown" tool bucket, which could incorrectly trip the circuit after
unrelated tool calls. Corrected; a post-tool reset hook was introduced.
Lesson: budget/loop governance needs correct execution identity, not
merely counters.

### 20. Project adapter layer

Not every AI client executes inside TurnEngine — deliberate. Major
external coding harnesses (Claude Code, Codex, Cursor, Antigravity) are
treated as native runtimes, integrated through generated adapters, hooks,
rules, gates, project-local operating material — not pretending these
external programs execute inside Yana's Rust process.

### 21. Enforcement strength is not identical across harnesses

Critical for truthful public copy: integration mechanisms differ, some
harnesses expose stronger hook enforcement than others. Do NOT write
"Yana hard-blocks every dangerous command in every supported AI coding
agent." Say instead: Yana materializes a common governance contract
across supported harnesses, with enforcement strength dependent on the
host integration. Current documentation explicitly acknowledges this.

### 22. Canonical `core/`

```
core/
├── agents/
├── skills/
├── commands/
├── rules/
├── hooks/
├── scripts/
├── gates/
├── config/
├── memory/
└── tests/
```

Operating knowledge/governance layer materialized into supported AI
harnesses. Prevents each integration from becoming an independent
ecosystem — Claude Code should not require one hand-maintained operating
system, Codex another, Cursor another. Canonical core remains the source
adapter-specific surfaces derive from.

### 23. Agents

Broad set of specialist agent definitions (architecture, backend, CI/CD,
code audit, configuration, context synthesis, business, data/AI,
full-stack, API design, event-driven systems, microservices, monorepos,
and more). Workers/roles — NOT roots of authority.

### 24. Skills

Roughly 2,025 skills — workflow/knowledge definitions across a broad
engineering surface. Skill count is not permission count.

### 25. Rules

Roughly 71 rules — security, correctness, Git behavior, UI, TypeScript/
API conventions, core integrity, verification, review requirements,
Yana-specific governance.

### 26. Hooks / commands / scripts

Current main has approximately 100 agents, 2,025 skills, 71 rules, 66
hooks, 170 commands, and the script count has continued evolving. **Do
not hard-code ecosystem counts into marketing copy unless generated from
the current repository source of truth at build time** — these counts
have changed repeatedly.

### 27. Core lock

SHA-256 manifest pins protected files (rules, hooks, gates, scripts). The
exact pinned count changes as the repo evolves; the idea matters more
than the number — unaudited drift in trusted governance files should be
detectable.

### 28. Skills lock

Skills also have content integrity tracking — distinguishes intentional
change from silent drift inside a very large knowledge library.

### 29. Merkle / hash-chain audit

Tamper-detectable audit chain — actions represented as hash-linked JSONL
entries, editing an earlier entry breaks recomputation. **Important
nuance: tamper-detectable != magically tamper-proof — use the correct
wording.**

### 30. Reviewed infrastructure writes

Sensitive core modifications receive extra review semantics — independent
review roles for certain high-impact infrastructure areas. Real mechanism
is review of sensitive changes with blocking severity levels, not
decorative "multi-agent consensus." Old documentation contained concepts
that sounded stronger than the implementation (fictional BFT-like
mechanisms) — explicitly removed from current architecture documentation.
**Do not resurrect them on the website.**

### 31. Evidence

Cross-cutting concept. Not "did the AI say it finished?" but "what
actually happened, what was changed, what command ran, what result came
back, why was it permitted, what state did it leave, was it verified?"
File mutation already follows this pattern end to end.

### 32. Task system

First-class tasks. Newer update added typed dependency edges: `blocks`,
`related`, `parent-child`, `discovered-from`. Only true blocking
dependencies affect task readiness — readiness is increasingly DERIVED
state, not a manually assigned label.

### 33. Task dependency graph — new

Task A `blocks` Task B → B derives `blocked=true, blocked_by=A`; when A
becomes done, B becomes ready automatically. Groundwork for mission
graphs, multi-agent work, worktree-per-task execution, dependency-aware
scheduling.

### 34. Missions

Tasks participate in larger mission-level work (mission → tasks →
dependencies). Mission orchestration belongs to continuity/control-plane
concerns, not one model conversation — one reason Yana is more than a
chatbot wrapper.

### 35. Router

Native runtime includes routing capabilities — classify work, decide an
execution/workflow path. Treats different jobs differently rather than
sending every task through one giant agent prompt.

### 36. Event bus / event-driven state

Parts of Yana use event-oriented state/orchestration models. Be precise:
do not invent a globally durable Kafka-like distributed event system.
Some state is event-oriented/event-sourced. A future Studio Wave for
stronger typed RPC/event replay is explicitly deferred. Describe only
what exists.

### 37. Memory

Exists outside individual model intelligence. Canonical core historically
distinguishes L1 permanent / L2 session tiers. Larger principle: model
session != system memory — lets the intelligence worker disappear while
useful operational state continues to exist.

### 38. Project memory — new Studio layer

Studio has project-scoped memory (`.yana-ai/project-memory.md`) — not
only a notes panel. Recent Studio work wires project memory into the
system context supplied to chat turns, giving a repository/workspace a
persistent human-readable memory layer.

### 39. Context

Should be a controlled resource: what files, memory, repository state,
design state, task, tool outputs, history are actually entering an AI
turn. Studio's Context surface should eventually expose this more
transparently. Context is not authority, but poor context can lead
intelligence to make bad proposals.

### 40. Yana OS

NOT a replacement OS for macOS/Linux/Windows — Yana's local AI management
plane, concerned with AGENT LIFECYCLE rather than individual shell
syntax. Responsibilities: identity, agent lifecycle, autonomy, resources,
health, monitoring, supervision, leases, governor behavior, quarantine,
HALT. Important distinction: Yana OS is NOT supposed to become a second
capability executor — execution remains behind canonical capability
boundaries.

### 41. Autonomy

Different autonomy levels — higher autonomy increases how much workflow
proceeds without constant micromanagement. Should NOT automatically
bypass hard safety authority. Autonomy and authority are distinct axes.

### 42. Capability leases

Scoped lease model — much safer than "auto accept everything." A lease
grants bounded authority under defined conditions. Recent Studio
Permissions work exposes scoped capability lease granting rather than a
global auto-accept toggle.

### 43. Resource / lease locking

Locking infrastructure around shared state — cross-platform locking
actively hardened. Recent work added Windows support to the real
exclusive-lock primitive used by capability lease mutation, because
authorization state itself is shared mutable state and cannot safely
rely on optimistic "probably nobody else is writing it."

### 44. Health / supervision

Health is not "process exists = healthy" — provider circuits, agent
lifecycle, runtime availability, state integrity, operational failures
all contribute to system health.

### 45. Quarantine

Stronger control than normal policy denial: `normal operation →
suspicious/unhealthy state → quarantine → restricted execution →
human/operator resolution`. Fits Yana OS supervisory concerns.

### 46. HALT

Stronger than a normal failed task — stops execution regardless of
provider/model intent, belongs at the authority hierarchy level. Must
never be presented merely as another chat command.

### 47. Project Workspace Service — new

Newer Rust service: `ProjectWorkspace` — deliberately NOT the same as the
pre-existing `crate::workspace` concept. A headless developer-project
filesystem service: cheap tree listing, per-file stat separation,
selection, refresh diff, added/removed file detection, large-change flood
indication, symlink-loop protection (real filesystem identity checks on
Unix). **Status: implemented and tested, merged UNWIRED — not
automatically a live capability, CLI operation, or MCP tool simply
because the module exists.** Studio may consume it later.

### 48. Another "workspace" already exists

Do not collapse every "workspace" into the filesystem service — the repo
already contains another shipped workspace concept with different
semantics. The new filesystem-oriented service was intentionally named
`ProjectWorkspace` to avoid lying about equivalence. Naming is
architecture, not cosmetic.

### 49. MCP

MCP-related runtime work behind an opt-in feature. Intends to expose
canonical governed operations, not a separate authority universe — cannot
manufacture human approval. Important truth boundary: a recent Studio
audit explicitly refused to build an MCP configuration UI because the
relevant MCP work remained an unwired Program J spike for the Studio
flow. **Do NOT present Studio MCP configuration as a current complete
feature.**

### 50. Terminal

Native execution surface. Interactive terminal chat currently provides
the trusted interactive continuation path for per-call human approval of
mutating capabilities — not just a decorative shell panel. Recent Desktop
work also improved xterm rendering, Unicode width, WebGL, links, search,
multiple sessions, PTY sizing.

### 51. Headless mode

Desktop and packaged Web use a local stdin/NDJSON contract around
`yana-rt chat --headless` — intentionally conservative, currently exposes
NO mutation capabilities from this chat path because there is not yet a
trusted remote approval-continuation protocol. **Do not assume "Desktop
UI has Permissions" therefore "Desktop model chat already has
unrestricted governed write capability" — different architecture
layers.**

### 52. Electron Desktop

User-facing interface over Yana combining chat/models/workspace/terminal/
permissions/runtime state/project tooling — but authority stays below the
UI. Electron is not the safety boundary.

### 53. Packaged Web

Production runs with a bundled Rust runtime, required runtime mode — if
the required Rust runtime is missing or unsupported, production should
fail visibly, not silently fall back to a weaker provider-only JS path.

### 54. Development / legacy Web

Legacy JS provider gateway exists for dev/compatibility. Modes: required/
prefer/legacy. Compatibility mode must not be marketed as equivalent to
the canonical governed Rust runtime — failing loudly is preferable to
pretending a weaker runtime is governed.

### 55. Discord

Remote chat adapter, authenticated allowlists, deliberately exposes NO
host/tool capabilities. Discord is NOT a remote root shell for Yana — an
intentional safety boundary.

### 56. Yana Studio

Visual workspace/control surface within the ecosystem — NOT synonymous
with Yana AI. Contains/developing: Workspace, Conversation, Files/
Editing, Design, Tasks, Devices, Permissions, Terminal, AI Models,
Inspector, Context, Git/worktrees, Activity. Should eventually become the
visual operator plane for Yana, not a separate replacement runtime.

### 57. Studio Composer — new

Recent Studio Wave 1: file attachments, ⌘P quick open, per-provider model
selector, terminal clickable file links, terminal search, full activity
timeline. Deepen operator workflow, don't change Yana's root authority.

### 58. Studio governance telemetry — new

Surfaces tool-call count, approved/denied operations, context window
usage — deliberately framed as governance telemetry rather than merely
token-cost telemetry. That framing is correct: Studio is supposed to show
how AI is being governed.

### 59. Studio inline diff review — new

Inline diff-comment workflow: AI proposes changes → human inspects →
human comments/reviews → capability/agent continues. Not "AI edits repo
invisibly."

### 60. Pinned run commands — new

Operator productivity tools with keyboard access — should eventually
still route through appropriate authority boundaries when executed by
AI.

### 61. Activity timeline

No longer intentionally capped to a few events — can evolve to connect
runtime events, task state, agent actions, Git changes, permissions,
evidence, not merely UI notifications.

### 62. Future Studio Wave 3 — not built yet

Deferred: worktree-per-task, Kanban-style multi-agent orchestration.
Sensible next direction given tasks/dependency edges/worktrees/agents/
evidence/capability governance already exist, but **not already
implemented** — do not claim otherwise.

### 63. Future Studio Wave 4 — not built yet

Also deferred: typed RPC layer, event-sourced replay, remote execution.
Architecturally plausible != currently shipped.

### 64. Git / worktree layer

Both a developer tool and a containment primitive — worktrees give
independent tasks/agents isolated filesystem views (attractive for future
worktree-per-task). Git is not itself Yana's security model — a worktree
does not replace capability policy.

### 65. Evidence + Git

Git changes can become one evidence source. Complete execution record may
connect: task → agent/model → capability request → approval → file diff
→ command → tests → resulting Git state. Direction Yana's architecture
naturally converges toward.

### 66. Provider / model is replaceable

Central philosophy: Claude is not Yana. Codex is not Yana. Gemini is not
Yana. Ollama is not Yana. Any model can be a worker — Yana persists
around it.

### 67. Agent is also replaceable

An individual agent process/session is temporary. What survives it:
mission state, memory, workspace state, audit, evidence, permissions,
identity, capability policy. Why Yana increasingly resembles an
operating/control system around agents.

### 68. Continuity plane

Missions, tasks, dependencies, memory, project memory, workspace state,
checkpoints/history where applicable — lets work outlive a single model
turn.

### 69. Governance plane

Giám Thị, HALT, authority, capabilities, approvals, leases, autonomy,
hooks, rules, core-lock, quarantine — determines how far intelligence may
go.

### 70. Intelligence plane

Models, providers, agents, specialist roles, skills — decide or help
decide WHAT to do. They do not decide WHAT POWER THEY HAVE.

### 71. Execution plane

Bounded interaction with filesystem, commands/processes, Git, workspace,
configuration, host resources — intentionally downstream from authority.

### 72. Evidence / accountability plane

Audit chain, evidence, verification, runtime events, provider stats,
cost/usage, Git diff, test/build results — answers what happened, why,
with what authority, what changed, did it succeed.

### 73. Interface plane

Terminal, Yana Studio/Desktop, Packaged Web, Discord, MCP consumers,
external coding harnesses. A UI is not an authority boundary. A transport
is not an authority boundary. A provider API is not an authority
boundary.

### 74. Distribution

Multiple independently versioned/distributed pieces: Python `yana-ai`,
Rust `yana-rt`, Product/Desktop version. Do not assume one version number
describes every artifact — multiple version axes, intentional.

### 75. Python package role

`pip install yana-ai` → `yana-ai install` → `yana-ai doctor .` — related
to materializing/configuring Yana's project-local governance and
integration surfaces. Not simply a Python rewrite of the Rust runtime.

### 76. Rust `yana-rt` role

Native runtime — owns an increasingly large set of system functions:
runtime turns, provider handling, capabilities, routing, missions, tasks,
workspace-related systems, OS supervision, health, chat, scan/security
tooling, other native operations.

### 77. CLI

Direct operator/developer surface over Yana's system, beyond chat.
Families: route, mission, task, workspace, os, doctor, scan, hunt, fix,
graph, vault, chat, and others.

### 78. Security scanning / hunt / fix

Native runtime also contains security/developer tooling: scan, hunt,
fix. Operational capabilities/services, not the central identity of Yana
— **do not build the homepage as if Yana is mainly a vulnerability
scanner.**

### 79. Graph / vault

Knowledge graph / skill discovery / vault-related capabilities support
operating knowledge/context — subsystems under the wider control plane,
not independent definitions of Yana.

### 80. Plugin system

Plugin-related execution/integration. Recent hardening ensured plugin
scripts no longer bypass the command validation layer simply because
they originated from a plugin. Plugin extensibility must not create a
shadow execution path around authority.

### 81. Cross-platform system

Targets macOS, Linux, Windows — semantics not automatically equivalent.
Locking, paths, process behavior, packaging, code signing, PTY handling,
filesystem identity all have OS-specific details.

### 82. Desktop packaging is part of the system

Repeatedly demonstrated: source builds != working packaged product. Past
issues around bundled server dependencies showed a successful source
build could still ship an app opening with no window because runtime
dependencies were absent. Yana has to verify the packaged artifact, not
merely the source tree.

### 83. Release pipeline

CI/release infrastructure is part of operational architecture — GitHub
Actions for CI, CodeQL, dependency review, Desktop builds, release,
pages, specialized validation workflows. **Do not say "cross-platform
works" based only on one green OS.**

### 84. Truthfulness as an architectural property

TRUTHFUL SYSTEM STATE: missing hook should not silently become success;
provider failure should not masquerade as "zero models"; missing runtime
should not silently drop to an ungoverned runtime in production; test
skipped should not be represented as test passed; implemented-but-unwired
module should not be marketed as live feature. Not merely documentation
discipline — part of system design.

### 85. What Yana is NOT

Not primarily: a chatbot, an IDE clone, a Figma clone, a model, a model
trainer, a Claude wrapper, a Codex wrapper, an Ollama frontend, a
multi-agent demo, a shell guard script, a desktop app. All of those can
exist as components, workers, or interfaces.

### 86. What Yana is becoming

Yana is the persistent system around AI workers, supplying three things
model intelligence does not naturally provide: AUTHORITY, CONTINUITY,
BOUNDED EXECUTION — and increasingly a fourth: EVIDENCE.

### 87. Current system map

```
┌──────────────────────────────────────────────────────────────┐
│                         HUMAN                                │
│                    final authority                           │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                       GIÁM THỊ                               │
│ HALT · root supervision · fail-closed emergency authority   │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                   YANA CONTROL PLANE                         │
│                                                              │
│ Identity      Policy        Autonomy       Approval           │
│ Capabilities Leases        Governance     Audit               │
│ Evidence      Resources     Health         Quarantine          │
└────────────┬───────────────────────┬───────────────────────────┘
             │                       │
             ▼                       ▼
┌───────────────────────┐   ┌───────────────────────────────┐
│   CONTINUITY PLANE    │   │      RUNTIME AUTHORITY       │
│                       │   │                               │
│ Missions              │   │ Manifest                      │
│ Tasks                 │   │ risk                          │
│ Dependencies          │   │ availability                  │
│ Memory                │   │ approval semantics            │
│ Project Memory        │   │ approved execution contract   │
│ Workspace state       │   │ re-validation                 │
└──────────┬────────────┘   └──────────────┬────────────────┘
           │                               │
           └──────────────┬────────────────┘
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                    RUST TurnEngine                           │
│ typed turns · typed events · streaming · cancellation       │
│ provider/tool loop · pause/resume authority semantics       │
└───────────────┬────────────────────────────┬─────────────────┘
                │                            │
                ▼                            ▼
┌────────────────────────────┐   ┌────────────────────────────┐
│ MODEL / PROVIDER PLANE     │   │ CAPABILITY PLANE           │
│                            │   │                            │
│ local models               │   │ file.read                  │
│ cloud APIs                 │   │ file.write                 │
│ provider catalog           │   │ config.write               │
│ provider gateway           │   │ command/process            │
│ health/circuit             │   │ Git/workspace/host         │
│ quota/stats                │   │ governed operations        │
└──────────────┬─────────────┘   └──────────────┬─────────────┘
               │                                │
               └──────────────┬─────────────────┘
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    BOUNDED EXECUTION                         │
│ backup · atomicity · validation · verification · evidence   │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                     REAL ENVIRONMENT                         │
│ files · repos · Git · processes · OS · tools · network      │
└──────────────────────────────────────────────────────────────┘
```

### 88. Parallel adapter path

```
Claude Code ─┐
Codex ───────┤
Cursor ──────┼── adapter → hooks/rules/gates → governed project
Antigravity ─┘
```

Integration mechanism differs; authority philosophy remains consistent.

### 89. User surfaces

```
                        YANA
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
    Terminal           Studio             Web
       │                  │                  │
       └──────────── canonical runtime ──────┘
Discord   → read-only/plain governed remote chat
MCP       → opt-in canonical operation transport
Coding harnesses → adapters / hooks / project governance
```

### 90. Product hierarchy (for the website)

```
YANA AI
│
├── Yana Runtime
│   ├── TurnEngine
│   ├── Model Plane
│   ├── Capability Plane
│   ├── Tasks / Missions
│   └── native system services
│
├── Yana Governance
│   ├── Giám Thị
│   ├── Authority
│   ├── Rules
│   ├── Hooks
│   ├── Leases
│   ├── HALT
│   ├── Audit
│   └── Evidence
│
├── Yana OS
│   ├── agent lifecycle
│   ├── autonomy
│   ├── health
│   ├── resources
│   ├── supervision
│   └── quarantine
│
├── Yana Knowledge / Core
│   ├── Agents
│   ├── Skills
│   ├── Commands
│   ├── Rules
│   ├── Scripts
│   └── Memory
│
├── Yana Integrations
│   ├── Claude Code
│   ├── Codex
│   ├── Cursor
│   ├── Antigravity
│   ├── Discord
│   └── MCP
│
├── Yana Studio
│   └── visual operator/developer workspace
│
└── Developer / Distribution
    ├── yana-ai Python package
    ├── yana-rt Rust crate
    ├── CLI
    ├── Desktop builds
    └── documentation
```

**DO NOT treat every bullet as a separately branded commercial product —
this is an architecture map first.**

### 91. Live vs not-yet-live

**LIVE / REAL ARCHITECTURE:** Giám Thị authority hierarchy · unified Rust
TurnEngine · local/cloud model catalog · canonical capability authority ·
Terminal interactive approvals · file.write governance · config.write
governance · tasks/missions · typed task dependency graph · project
adapters for supported coding harnesses · rules/hooks/core integrity ·
audit/evidence foundations · Desktop/Web runtime integration · Discord
restricted chat · Studio Wave 1/2 features.

**IMPLEMENTED BUT NOT FULLY WIRED:** newer Provider gateway helpers into
every live call path · ProjectWorkspace filesystem service.

**OPT-IN / LIMITED:** MCP.

**DEFERRED:** Studio worktree-per-task Kanban orchestration · full
multi-agent Mission Control UI · typed RPC replay architecture · remote
execution · remote mutation approval continuation for headless chat ·
simultaneous multi-tool approval UX.

### 92. Website consequence

Homepage should NOT say "Meet Yana Studio, your AI coding workspace" —
makes one branch appear to be the whole system. Instead:

> AI systems are becoming powerful enough to operate computers. But
> intelligence is not authority. Yana is the persistent control plane
> around those systems.

Then show `MODEL/AGENT → YANA → CAPABILITY → EXECUTION`, then reveal the
ecosystem: Runtime, Governance, Yana OS, Adapters, Studio, Developer
tooling.

### 93. The deepest positioning

> Yana turns replaceable AI intelligence into a persistent, governed
> system. Models reason. Agents work. Yana controls authority, continuity
> and bounded execution. Humans retain final control.

Alternative concise line: **INTELLIGENCE IS REPLACEABLE. AUTHORITY IS
NOT.**

### 94. Before writing website copy

Audit the actual current main branch again. Especially inspect:
`README.md`, `docs/reference/architecture.md`,
`docs/adr/ADR-014-unified-runtime-authority-hierarchy.md`, `src/runtime/`,
`src/capability/`, `src/model/`, `src/os/`, `src/task*`, `src/mission*`,
`src/workspace*`, `src/project_workspace*`, `core/`, `tools/yana-desktop/`,
`tools/yana-web/`, Studio sources, recent PRs #317–#324.

**Do not rely on this context as permission to fabricate implementation
details. This document explains the architecture. The repository remains
source of truth.**

---

## Ghi chú thêm của anh Tâm (cùng tin nhắn, ngoài khối gốc)

> Mấy thay đổi quan trọng so với lần chúng ta đào trước: Yana đã bớt giống
> "safety layer quanh coding agents" và rõ hình dạng control plane hơn
> nhiều. README hiện tại mô tả ba trục Intelligence/Continuity/Governance,
> sau đó đi qua canonical capabilities tới bounded execution; đồng thời
> nói rõ model/agent có thể là worker tạm thời, còn Yana là persistent
> system bao quanh chúng.
>
> Authority hierarchy cũng đã được đóng đinh thành kiến trúc thật trong
> ADR-014: Giám Thị → Yana control plane → canonical TurnEngine → provider
> plane + capability plane; providers và agents là execution components,
> không phải authority. ADR còn xác định rõ Desktop/Web headless hiện
> không có mutation capabilities, Discord không có host/tool capabilities,
> MCP không được tự tạo approval, còn Claude/Codex/Cursor/Antigravity đi
> qua native adapters thay vì giả vờ chạy trong TurnEngine.
>
> Một thay đổi đặc biệt đáng đưa lên website sau này là governed file
> mutation: propose diff → approval → backup → atomic write → verify →
> evidence, cộng với config.write có phạm vi hẹp hơn. Đây là feature nói
> được rất nhiều về Yana chỉ bằng một animation nhỏ. PR #319 xác nhận
> capability này đã đi qua YanaAuthorityChain thật và có E2E cho approved/
> denied writes.
>
> Còn Studio mới cũng đã tiến thêm: Project Memory thực sự được đưa vào
> system context mỗi turn, scoped capability leases thay vì "auto accept",
> governance telemetry, diff comments, quick open và activity timeline.
> Nhưng worktree-per-task multi-agent Kanban và typed RPC/event replay
> vẫn đang deferred, rất quan trọng để Claude không vẽ trang chủ rồi
> tuyên bố chúng đã ship.
>
> Một điểm nữa tôi rất thích ở repo hiện tại: tài liệu architecture đã tự
> xóa các cơ chế từng được mô tả quá tay nhưng không tồn tại thật, như BFT
> voting/message-bus/replay/freeze-agents kiểu cũ. Nghĩa là "truthfulness"
> của Yana giờ không chỉ là khẩu hiệu của mình nữa mà đã bắt đầu phản ánh
> vào chính documentation architecture.
>
> Bản này nên gửi Claude trước bản lịch sử. Thứ tự hợp lý sẽ là: Deep
> Architecture → Origin/History → yêu cầu Claude audit repo → rồi mới
> thiết kế homepage. Như vậy Claude hiểu Yana là gì trước, sau đó mới hiểu
> vì sao nó trở thành như vậy. Đây là hai tài liệu khác nhau và ghép chúng
> lại mới đủ context.

---

## Việc cần làm tiếp

1. Audit sâu hơn theo đúng danh sách §94 trước khi viết bất kỳ copy public
   nào (chưa làm hết — mới spot-check các claim quan trọng nhất, xem bảng
   ở đầu file).
2. Hợp nhất tài liệu này với `YANA-ECOSYSTEM-MAP.md` — hierarchy ở §90 của
   tài liệu này chi tiết và mới hơn map cũ, cần cập nhật map theo đúng cấu
   trúc: Yana Runtime / Yana Governance / Yana OS / Yana Knowledge-Core /
   Yana Integrations / Yana Studio / Developer-Distribution.
3. Giữ nguyên phân loại LIVE / IMPLEMENTED BUT UNWIRED / OPT-IN / DEFERRED
   (§91) khi viết bất kỳ dòng copy nào cho web — không quảng cáo unwired
   hoặc deferred như đã ship.
4. Đọc tài liệu này TRƯỚC `YANA-BUILD-JOURNEY-DRAFT.md` khi cần ngữ cảnh
   đầy đủ, theo đúng thứ tự anh Tâm yêu cầu.
