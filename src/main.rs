#![cfg(feature = "cli")]

mod bus;
mod capability;
mod chat;
mod ci;
mod compact;
mod config;
mod cost;
mod design;
mod doctor;
mod evidence;
mod filescan;
mod fix;
mod graph;
mod guard;
mod hunt;
mod init;
mod map;
mod memory;
mod mission;
mod model;
mod observability;
mod os;
mod plugin;
mod provenance;
mod route;
pub mod scanner;
mod score;
mod session_context;
mod skill_quality;
mod spec;
mod task;
mod vault;
mod watch;
mod workspace;
// Program J Phase 9 spike only — gated separately from `cli` because it
// pulls in tokio (see Cargo.toml's `mcp` feature comment). Not part of any
// default build.
#[cfg(feature = "mcp")]
mod mcp;
// Discord Phase (Host-Native OS Program) — gated separately from `cli`,
// see Cargo.toml's `discord` feature comment. Not part of any default
// build; `mod remote;` (session.rs, the id-mapping logic) stays available
// even without the feature so its pure-logic tests still run under plain
// `cargo test --features cli`, matching how `os::platform`'s per-OS
// backends stay compiled everywhere via `cfg(target_os)` rather than a
// separate feature gate.
mod remote;
mod runtime;

use clap::{Parser, Subcommand};
use std::ffi::OsString;

// ── CLI ───────────────────────────────────────────────────────────────────────

#[derive(Parser)]
#[command(name = "yana-rt", version = env!("CARGO_PKG_VERSION"), about = "Yana AI Runtime — full Python CLI parity in Rust")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

fn parse_cli() -> Cli {
    let mut args: Vec<OsString> = std::env::args_os().collect();
    let is_chat_alias = args
        .first()
        .and_then(|arg| std::path::Path::new(arg).file_stem())
        .is_some_and(|stem| stem == "yana-ai-rt");
    if is_chat_alias {
        args.insert(1, OsString::from("chat"));
    }
    Cli::parse_from(args)
}

#[derive(Subcommand)]
enum Commands {
    /// Task lifecycle — create, track, complete with evidence
    Task {
        #[command(subcommand)]
        action: TaskAction,
    },
    /// Evaluate task evidence against schema
    Eval {
        #[command(subcommand)]
        action: EvalAction,
    },
    /// Agent message bus — emit, read, reply, inbox
    Bus {
        #[command(subcommand)]
        action: BusAction,
    },
    /// L3 shared memory — workspace-level facts across sessions
    Memory {
        #[command(subcommand)]
        action: MemoryAction,
    },
    /// Configuration — init/read yana-ai settings for any repo
    /// DOCTOR_DISPATCH_EXEMPT: core/scripts/config_manager.py is canonical —
    /// it has get/reset subcommands this Rust port doesn't (2026-06-21).
    Config {
        #[command(subcommand)]
        action: ConfigAction,
    },
    /// Plugin hooks — register custom guards without forking
    Plugin {
        #[command(subcommand)]
        action: PluginAction,
    },
    /// Cost dashboard — token usage and spend tracking
    Cost {
        #[command(subcommand)]
        action: CostAction,
    },
    /// Audit activity dashboard — read-only summary over audit-chain.log
    /// (tool-call volume, allow/deny/warn rate, busiest tools/hooks). No
    /// new data collection, no new hook — summarizes what audit-log.sh
    /// already writes on every tool call.
    Observability {
        #[command(subcommand)]
        action: observability::ObservabilityAction,
    },
    /// Per-skill outcome ledger — quality from real task verdicts, human-
    /// gated promotion. No new hook, no LLM call: correlates audit-chain.log
    /// (which skill/agent a task's session invoked) with `eval judge`'s
    /// PASS/FAIL verdict. Idea borrowed from HKUDS/OpenSpace, reimplemented
    /// from scratch — no dependency on that project or its cloud.
    SkillQuality {
        #[command(subcommand)]
        action: skill_quality::SkillQualityAction,
    },
    /// Active security scanner — secrets, code vulns, deps, supply-chain
    Hunt {
        #[command(subcommand)]
        action: hunt::HuntAction,
    },
    /// CI/CD workflow health check — secrets, unpinned actions, permissions
    Ci {
        #[command(subcommand)]
        action: ci::CiAction,
    },
    /// Agent blast radius map — what the AI can reach (settings, MCP, workflows)
    Map {
        #[command(subcommand)]
        action: map::MapAction,
    },
    /// Auto-apply safe fixes for known finding IDs
    Fix {
        #[command(subcommand)]
        action: fix::FixAction,
    },
    /// Audit score with optional deduction breakdown
    Score {
        #[command(subcommand)]
        action: score::ScoreAction,
    },
    /// Environment and dependency health checks
    Doctor {
        #[command(subcommand)]
        action: doctor::DoctorAction,
    },
    /// In-process PreToolUse hook ports (destructive-command guard, token
    /// budget + circuit breaker) — no jq/Node subprocess spawn per call
    /// DOCTOR_DISPATCH_EXEMPT: not routed through bin/yana by design — called
    /// directly as `exec yana-rt guard <name>` from core/hooks/*.sh (guard-
    /// destructive.sh, token-budget-guard.sh, guard-blast-radius.sh) as a
    /// fast path that skips the jq subprocess. `yana-ai guard` via bin/yana
    /// is a different command (runs guard_installer.py to set up guards in
    /// a new project), not this variant's check logic.
    Guard {
        #[command(subcommand)]
        action: guard::GuardAction,
    },
    /// Parallel mission orchestrator — create, dispatch, track agent tasks
    Mission {
        #[command(subcommand)]
        action: mission::MissionAction,
    },
    /// Route a task description → simple / complex / external (yana-router)
    Route {
        #[command(subcommand)]
        action: route::RouteAction,
    },
    /// Validate task spec files against the yana-ai schema
    Spec {
        #[command(subcommand)]
        action: spec::SpecAction,
    },
    /// Design token extractor — URL/file → colors, fonts, spacing, CSS vars
    Design {
        #[command(subcommand)]
        action: design::DesignAction,
    },
    /// Knowledge graph — build/show/search/onboard/diff (Rust port of graph_builder.py)
    Graph {
        #[command(subcommand)]
        action: graph::GraphAction,
    },
    /// Vietnamese-first knowledge vault with multilingual translation links
    Vault {
        #[command(subcommand)]
        action: vault::VaultAction,
    },
    /// Yana OS (Program K) — local agent, credential, and resource management.
    Os {
        #[command(subcommand)]
        action: os::OsAction,
    },
    /// Live file watcher — monitor skills/agents/rules for changes
    /// DOCTOR_DISPATCH_EXEMPT: core/scripts/watch.py is canonical for the
    /// "watch" CLI command — it watches config + re-audits with score diff,
    /// a different feature from this Rust action; not a duplicate (2026-06-21).
    Watch {
        #[command(subcommand)]
        action: watch::WatchAction,
    },
    /// Unified local workspace — linked context, memory, inbox, and governed actions
    Workspace {
        #[command(subcommand)]
        action: workspace::WorkspaceAction,
    },
    /// Initialize Yana AI in a new project
    /// DOCTOR_DISPATCH_EXEMPT: core/scripts/init_wizard.py is canonical —
    /// interactive wizard that also drives guard_installer + audit_scanner;
    /// this Rust action is a simpler flag-driven alternative (2026-06-21).
    Init {
        #[command(subcommand)]
        action: init::InitAction,
    },
    /// Verify ported code (core/lib/*_adapted) has vendor source + attribution
    Provenance {
        #[command(subcommand)]
        action: provenance::ProvenanceAction,
    },
    /// Evidence provenance for the Truth Gate — run a command and emit a signed
    /// receipt, or verify pasted evidence is authentic (not model-fabricated).
    Evidence {
        #[command(subcommand)]
        action: evidence::EvidenceAction,
    },
    /// Native Bash-output compaction — replaces the dead, external
    /// `rtk-bridge.sh` bridge with a first-class Yana AI subsystem. Opt-in
    /// (YANA_COMPACT=1), wired through core/hooks/sandbox-wrap.sh (the one
    /// hook in this repo allowed to rewrite Bash commands). Every exact
    /// statistic a matcher reports (commit count, pass/fail count) is
    /// computed from the FULL, untruncated output before any compaction —
    /// see src/compact/mod.rs's module doc for why, including the specific
    /// rtk incident (2026-07-26) this exists to not repeat.
    /// DOCTOR_DISPATCH_EXEMPT: not routed through bin/yana by design — called
    /// directly as `yana-rt compact -- <command>` from `sandbox-wrap.sh`'s
    /// own rewrite (see that hook) and by hand for manual testing, the same
    /// fast-path pattern `Guard` above uses. There is no end-user-facing
    /// `yana-ai compact` command to add — this is invoked by the hook chain
    /// and by a human running `yana-rt` directly, not through `bin/yana`.
    Compact {
        /// Classify only — does this command match a known pattern? Never
        /// executes `command`. Exit 0 = matches, exit 1 = no known pattern.
        #[arg(long)]
        detect: bool,
        #[arg(long)]
        json: bool,
        /// Force raw passthrough for this one call (mirrors YANA_COMPACT_BYPASS=1)
        #[arg(long)]
        raw: bool,
        #[arg(trailing_var_arg = true, required = true)]
        command: Vec<String>,
    },
    /// Canonical capability runtime, one-shot scriptable surface — the
    /// same `crate::capability::*` MCP's 9 tools and chat's read_file/
    /// run_command use, callable from non-Rust clients (Desktop) via argv,
    /// no shell string, no reimplemented sandbox logic.
    /// DOCTOR_DISPATCH_EXEMPT: not routed through bin/yana by design —
    /// called directly as `exec yana-rt capability <name>` from
    /// tools/yana-desktop/list-dir.js (see that file), the same fast-path
    /// pattern `Guard` above uses. `bin/yana` is an end-user CLI wrapper;
    /// Desktop talks to the compiled yana-rt binary directly.
    Capability {
        #[command(subcommand)]
        action: capability::cli::CapabilityAction,
    },
    /// Audit AI agent setup for security risks (replaces audit_scanner.py)
    Scan {
        /// Directory to scan (default: .)
        #[arg(default_value = ".")]
        target: String,
        /// Output as JSON
        #[arg(long)]
        json: bool,
        /// Write Markdown report to file
        #[arg(long, value_name = "FILE")]
        markdown: Option<String>,
        /// Write SARIF 2.1.0 report to file
        #[arg(long, value_name = "FILE")]
        sarif: Option<String>,
        /// Exit non-zero if findings at this severity or above
        #[arg(long, value_name = "LEVEL")]
        fail_on: Option<String>,
        /// Run only one scanner category
        #[arg(long, value_name = "CATEGORY")]
        only: Option<String>,
        /// Suppress a finding ID (repeatable)
        #[arg(long = "ignore", value_name = "ID", action = clap::ArgAction::Append)]
        ignore_ids: Vec<String>,
        /// Only scan files changed since BASE (e.g. origin/main)
        #[arg(long, value_name = "BASE")]
        diff: Option<String>,
        /// Disable ANSI color
        #[arg(long)]
        no_color: bool,
        /// Only print score + risk level
        #[arg(long)]
        quiet: bool,
        /// Scanner rules directory
        #[arg(long, default_value = "scanner")]
        scanner_dir: String,
        /// Also scan the skill-library deep-scan surface: file_patterns_extra
        /// and core/skills/** excludes. Off by default because skill docs and
        /// demo scripts have a high false-positive rate.
        #[arg(long)]
        include_skills: bool,
    },
    /// On-demand malware check for a downloaded file (VirusTotal hash lookup —
    /// no file content uploaded). Not real-time/background protection — see
    /// src/filescan/mod.rs's module doc for why that's a different product.
    Filescan {
        #[command(subcommand)]
        action: filescan::FilescanAction,
    },
    /// Interactive chat REPL — cloud (Anthropic/OpenAI) or local (Ollama).
    /// Supports 2 tools (read_file, run_command) — run_command always
    /// requires interactive human approval before executing, gated by
    /// the same check_command() guard core/hooks/guard-destructive.sh
    /// uses. See src/chat/mod.rs's module doc for the full safety design
    /// (this is a standalone process invisible to Claude Code's own
    /// PreToolUse/PostToolUse hooks, so it builds its own gate in-process
    /// rather than relying on that hook system).
    Chat {
        /// Provider ID from the canonical runtime catalog (`yana-rt models`).
        #[arg(long)]
        provider: Option<String>,
        /// Model name (default: provider's own default; for ollama, first
        /// tries to auto-detect what's actually pulled via the local
        /// daemon's /api/tags before falling back to a static guess)
        #[arg(long)]
        model: Option<String>,
        /// System prompt
        #[arg(long)]
        system: Option<String>,
        /// Resume an existing session by ID — preloads its history as context
        #[arg(long)]
        resume: Option<String>,
        /// Print full upstream error detail instead of a generic message
        #[arg(long)]
        verbose: bool,
        /// Run `run_command` tool calls directly instead of routing them
        /// through core/scripts/sandbox-exec.sh. Human approval is still
        /// required either way — this only controls isolation, an
        /// explicit human opt-out, never a silent fallback.
        #[arg(long)]
        no_sandbox: bool,
        /// Machine-readable stdin/NDJSON adapter used by the Desktop GUI.
        #[arg(long, hide = true)]
        headless: bool,
    },
    /// Program J Phase 9 spike — MCP Server exposing `check_command` over
    /// stdio. NOT wired into any live client (Cursor/Claude Code/etc. do
    /// not call this yet). See docs/programs/PROGRAM-J-SKELETON.md.
    #[cfg(feature = "mcp")]
    Mcp,
    /// Remote interfaces (Host-Native OS Program, Discord Phase). Minimum
    /// slice: authenticated, allowlisted plain chat — no host/tool
    /// capabilities from any remote surface yet ("no capability access,"
    /// not "no writes": this slice does write chat-state to disk —
    /// session metadata, chat history, an evidence trail — it just never
    /// touches `capability::`/`os::service`/any file/git/process
    /// mutation outside that chat-state bookkeeping).
    #[cfg(feature = "discord")]
    Remote {
        #[command(subcommand)]
        action: RemoteAction,
    },
}

// ── Subcommand enums ──────────────────────────────────────────────────────────

#[cfg(feature = "discord")]
#[derive(Subcommand)]
enum RemoteAction {
    /// Discord adapter — minimum vertical slice (no host/tool
    /// capabilities; chat-state writes only — see `RemoteAction`'s doc)
    Discord {
        #[command(subcommand)]
        action: DiscordAction,
    },
}

#[cfg(feature = "discord")]
#[derive(Subcommand)]
enum DiscordAction {
    /// Print the one-time setup steps (Developer Portal, token, allowlist)
    Setup,
    /// Validate DISCORD_BOT_TOKEN against the real API (GET /users/@me).
    /// The live-verification step this program's evidence discipline
    /// requires before the adapter is LIVE VERIFIED rather than LOGIC
    /// TESTED — run this yourself; it needs a real bot token this
    /// development environment does not have.
    Test,
    /// Run the bot (blocking) — connects the gateway and answers allowed
    /// channels with plain chat. No tool/capability access.
    Serve {
        #[arg(long, default_value = ".")]
        dir: String,
        #[arg(long, default_value = "anthropic")]
        provider: String,
        #[arg(long)]
        model: Option<String>,
    },
}

#[derive(Subcommand)]
enum TaskAction {
    /// Create a new task
    Create {
        name: String,
        #[arg(long)]
        scope: Option<String>,
    },
    /// List all tasks
    List,
    /// Mark a task done with evidence
    Done {
        id: String,
        #[arg(long)]
        evidence: String,
    },
    /// Show task details
    Status { id: String },
    /// Remove a task
    Drop { id: String },
}

#[derive(Subcommand)]
enum EvalAction {
    /// Validate task evidence against schema (regex/keyword heuristic)
    Run { id: String },
    /// LLM-judge second opinion on task evidence, with a persisted retry
    /// circuit breaker (5 consecutive FAILs -> escalating cooldown)
    Judge {
        id: String,
        /// anthropic | openai | ollama | kimi (default: ollama, keyless)
        #[arg(long)]
        provider: Option<String>,
        /// Model name (default: provider's own default)
        #[arg(long)]
        model: Option<String>,
    },
    /// Show the evidence schema
    Schema,
}

#[derive(Subcommand)]
enum BusAction {
    /// Emit an event onto the bus
    Emit {
        from: String,
        to: String,
        #[arg(name = "type")]
        event_type: String,
        payload: String,
    },
    /// Read events from the bus
    Read {
        #[arg(long)]
        agent: Option<String>,
        #[arg(long)]
        since: Option<String>,
        #[arg(long)]
        reply_to: Option<String>,
        #[arg(long, default_value_t = 20)]
        last: usize,
    },
    /// Reply to an existing event
    Reply {
        original_id: String,
        from: String,
        payload: String,
    },
    /// Show inbox for an agent
    Inbox { agent: String },
}

#[derive(Subcommand)]
enum MemoryAction {
    /// Store a fact in L3
    Store {
        key: String,
        value: String,
        #[arg(long)]
        tag: Vec<String>,
        #[arg(long)]
        agent: Option<String>,
        #[arg(long, default_value = "medium")]
        confidence: String,
        #[arg(long, default_value = "both")]
        scope: String,
    },
    /// Get a fact by key
    Get { key: String },
    /// List facts
    List {
        #[arg(long)]
        tag: Option<String>,
        #[arg(long)]
        agent: Option<String>,
        #[arg(long, default_value_t = 20)]
        last: usize,
    },
    /// Promote L3 fact → L1 atomic .md file
    Promote {
        key: String,
        #[arg(long, default_value = "memory/L1_atomic")]
        l1_dir: String,
    },
    /// Import L2 session facts into L3
    Import {
        #[arg(long, default_value = "memory/L2_session")]
        l2_dir: String,
    },
}

#[derive(Subcommand)]
enum ConfigAction {
    Show {
        #[arg(long, default_value = ".")]
        dir: String,
    },
    Init {
        #[arg(long, default_value = ".")]
        dir: String,
    },
    Set {
        key: String,
        value: String,
        #[arg(long, default_value = ".")]
        dir: String,
    },
}

#[derive(Subcommand)]
enum PluginAction {
    List,
    Add {
        name: String,
        script: String,
        #[arg(long, default_value = "")]
        description: String,
    },
    Remove {
        name: String,
    },
    Enable {
        name: String,
    },
    Disable {
        name: String,
    },
    Run {
        name: String,
        #[arg(long)]
        input: Option<String>,
    },
}

#[derive(Subcommand)]
enum CostAction {
    Show,
    Log {
        task: String,
        tier: String,
        model: String,
        input_tokens: u64,
        output_tokens: u64,
        #[arg(long)]
        duration_ms: Option<u64>,
    },
    Breakdown {
        #[arg(default_value = "tier")]
        by: String,
    },
}

// ── main ─────────────────────────────────────────────────────────────────────

fn main() {
    // Exit quietly on broken pipe (e.g. `yana-rt mission dispatch | head`)
    // instead of panicking with "failed printing to stdout: Broken pipe"
    std::panic::set_hook(Box::new(|info| {
        let msg = info
            .payload()
            .downcast_ref::<String>()
            .map(|s| s.as_str())
            .or_else(|| info.payload().downcast_ref::<&str>().copied())
            .unwrap_or("");
        if msg.contains("Broken pipe") {
            std::process::exit(0);
        }
        eprintln!("{info}");
        std::process::exit(1);
    }));

    let cli = parse_cli();
    match cli.command {
        Commands::Task { action } => match action {
            TaskAction::Create { name, scope } => task::cmd_task_create(name, scope),
            TaskAction::List => task::cmd_task_list(),
            TaskAction::Done { id, evidence } => task::cmd_task_done(id, evidence),
            TaskAction::Status { id } => task::cmd_task_status(id),
            TaskAction::Drop { id } => task::cmd_task_drop(id),
        },
        Commands::Eval { action } => match action {
            EvalAction::Run { id } => task::cmd_eval_run(id),
            EvalAction::Judge {
                id,
                provider,
                model,
            } => task::cmd_eval_judge(id, provider, model),
            EvalAction::Schema => task::cmd_eval_schema(),
        },
        Commands::Bus { action } => match action {
            BusAction::Emit {
                from,
                to,
                event_type,
                payload,
            } => bus::cmd_bus_emit(from, to, event_type, payload),
            BusAction::Read {
                agent,
                since,
                reply_to,
                last,
            } => bus::cmd_bus_read(agent, since, reply_to, last),
            BusAction::Reply {
                original_id,
                from,
                payload,
            } => bus::cmd_bus_reply(original_id, from, payload),
            BusAction::Inbox { agent } => bus::cmd_bus_inbox(agent),
        },
        Commands::Memory { action } => match action {
            MemoryAction::Store {
                key,
                value,
                tag,
                agent,
                confidence,
                scope,
            } => memory::cmd_memory_store(key, value, tag, agent, confidence, scope),
            MemoryAction::Get { key } => memory::cmd_memory_get(key),
            MemoryAction::List { tag, agent, last } => memory::cmd_memory_list(tag, agent, last),
            MemoryAction::Promote { key, l1_dir } => memory::cmd_memory_promote(key, l1_dir),
            MemoryAction::Import { l2_dir } => memory::cmd_memory_import(l2_dir),
        },
        Commands::Config { action } => match action {
            ConfigAction::Show { dir } => config::cmd_config_show(dir),
            ConfigAction::Init { dir } => config::cmd_config_init(dir),
            ConfigAction::Set { key, value, dir } => config::cmd_config_set(dir, key, value),
        },
        Commands::Plugin { action } => match action {
            PluginAction::List => plugin::cmd_plugin_list(),
            PluginAction::Add {
                name,
                script,
                description,
            } => plugin::cmd_plugin_add(name, script, description),
            PluginAction::Remove { name } => plugin::cmd_plugin_remove(name),
            PluginAction::Enable { name } => plugin::cmd_plugin_toggle(name, true),
            PluginAction::Disable { name } => plugin::cmd_plugin_toggle(name, false),
            PluginAction::Run { name, input } => plugin::cmd_plugin_run(name, input),
        },
        Commands::Scan {
            target,
            json,
            markdown,
            sarif,
            fail_on,
            only,
            ignore_ids,
            diff,
            no_color,
            quiet,
            scanner_dir,
            include_skills,
        } => {
            use std::collections::HashSet;
            let diff_files: Option<HashSet<String>> = diff
                .as_deref()
                .map(|base| scanner::files::get_diff_files(base, &target));
            let report = scanner::run_audit(
                &target,
                &scanner_dir,
                diff_files.as_ref(),
                &ignore_ids,
                only.as_deref(),
                include_skills,
            );
            // SARIF output
            if let Some(ref sarif_path) = sarif {
                let sarif_str = scanner::render::render_sarif(&report);
                std::fs::write(sarif_path, &sarif_str).expect("write SARIF failed");
                eprintln!("[yana-ai] SARIF written to {sarif_path}");
            }
            // Markdown output
            if let Some(ref md_path) = markdown {
                let md = scanner::render::render_markdown(&report);
                std::fs::write(md_path, &md).expect("write markdown failed");
                eprintln!("[yana-ai] Markdown written to {md_path}");
            }
            // Exit code — computed once, shared by the JSON payload's
            // "exit_code" field and the real process exit so the two can
            // never disagree (tests/test_audit_json_mvp.py asserts they match).
            let exit_code: i32 = if let Some(ref level) = fail_on {
                let order = |s: &str| match s {
                    "low" => 3,
                    "medium" => 2,
                    "high" => 1,
                    _ => 0,
                };
                let threshold = order(level);
                let has_fail = report.findings.iter().any(|f| {
                    order(&f.severity.to_lowercase()) <= threshold && f.severity != "INFO"
                });
                if has_fail {
                    if report.summary.critical > 0 {
                        2
                    } else {
                        1
                    }
                } else {
                    0
                }
            } else if report.summary.critical > 0 {
                2
            } else if report.summary.high > 0 || report.summary.medium > 0 {
                1
            } else {
                0
            };
            // Primary output
            if json {
                let status = if report.findings.iter().any(|f| f.severity != "INFO") {
                    "findings"
                } else {
                    "ok"
                };
                println!(
                    "{}",
                    serde_json::to_string_pretty(&scanner::render::build_json_output(
                        &report, &target, exit_code, status
                    ))
                    .unwrap()
                );
            } else {
                println!(
                    "{}",
                    scanner::render::render_console(&report, no_color, quiet)
                );
            }
            std::process::exit(exit_code);
        }
        Commands::Mission { action } => mission::dispatch(action),
        Commands::Route { action } => route::dispatch(action),
        Commands::Hunt { action } => hunt::dispatch(action),
        Commands::Ci { action } => ci::dispatch(action),
        Commands::Map { action } => map::dispatch(action),
        Commands::Fix { action } => fix::dispatch(action),
        Commands::Score { action } => score::dispatch(action),
        Commands::Doctor { action } => doctor::dispatch(action),
        Commands::Filescan { action } => filescan::dispatch(action),
        Commands::Guard { action } => guard::dispatch(action),
        Commands::Spec { action } => spec::dispatch(action),
        Commands::Design { action } => design::dispatch(action),
        Commands::Graph { action } => graph::dispatch(action),
        Commands::Vault { action } => vault::dispatch(action),
        Commands::Os { action } => {
            if let Err(error) = os::dispatch(action) {
                eprintln!("[os] {error:#}");
                std::process::exit(2);
            }
        }
        Commands::Watch { action } => watch::dispatch(action),
        Commands::Workspace { action } => workspace::dispatch(action),
        Commands::Init { action } => init::dispatch(action),
        Commands::Provenance { action } => provenance::dispatch(action),
        Commands::Evidence { action } => evidence::dispatch(action),
        Commands::Compact { detect, json, raw, command } => {
            compact::dispatch(detect, json, raw, command)
        }
        Commands::Capability { action } => capability::cli::dispatch(action),
        Commands::Chat {
            provider,
            model,
            system,
            resume,
            verbose,
            no_sandbox,
            headless,
        } => {
            if headless {
                let provider = provider.unwrap_or_else(|| "ollama".to_string());
                if system.is_some() || resume.is_some() || verbose || no_sandbox {
                    eprintln!(
                        "[chat/headless] pass turn data as stdin JSON; interactive-only flags are not accepted"
                    );
                    std::process::exit(2);
                }
                if let Err(error) = chat::dispatch_headless(provider, model) {
                    println!(
                        "{}",
                        serde_json::json!({ "type": "error", "message": error.to_string() })
                    );
                    std::process::exit(2);
                }
            } else {
                chat::dispatch(provider, model, system, resume, verbose, !no_sandbox)
            }
        }
        #[cfg(feature = "discord")]
        Commands::Remote { action } => match action {
            RemoteAction::Discord { action } => match action {
                DiscordAction::Setup => println!("{}", remote::setup_instructions()),
                DiscordAction::Test => {
                    if let Err(error) = remote::test_connection() {
                        eprintln!("[discord] {error:#}");
                        std::process::exit(2);
                    }
                }
                DiscordAction::Serve {
                    dir,
                    provider,
                    model,
                } => {
                    let root = match std::path::Path::new(&dir).canonicalize() {
                        Ok(root) => root,
                        Err(error) => {
                            eprintln!("[discord] cannot resolve --dir {dir}: {error:#}");
                            std::process::exit(2);
                        }
                    };
                    let model = model.unwrap_or_else(|| {
                        crate::model::catalog::try_select_provider(&provider)
                            .map(|p| p.default_model().to_string())
                            .unwrap_or_else(|_| "default".to_string())
                    });
                    if let Err(error) = remote::serve(&root, &provider, &model) {
                        eprintln!("[discord] {error:#}");
                        std::process::exit(2);
                    }
                }
            },
        },
        Commands::Cost { action } => match action {
            CostAction::Show => cost::cmd_cost_show(),
            CostAction::Log {
                task,
                tier,
                model,
                input_tokens,
                output_tokens,
                duration_ms,
            } => {
                if let Err(error) =
                    cost::cmd_cost_log(task, tier, model, input_tokens, output_tokens, duration_ms)
                {
                    eprintln!("[cost] {error:#}");
                    std::process::exit(2);
                }
            }
            CostAction::Breakdown { by } => cost::cmd_cost_breakdown(by),
        },
        Commands::Observability { action } => match action {
            observability::ObservabilityAction::Show { last, json } => {
                observability::cmd_observability_show(last, json)
            }
            observability::ObservabilityAction::Breakdown { by, last } => {
                observability::cmd_observability_breakdown(by, last)
            }
        },
        Commands::SkillQuality { action } => skill_quality::dispatch(action),
        // Program J Phase 9 spike — the only command in this match that
        // needs an async runtime (rmcp requires tokio). Bridged with a
        // one-off Runtime rather than making `main()` itself async, since
        // every other command here is deliberately synchronous.
        #[cfg(feature = "mcp")]
        Commands::Mcp => {
            let rt = tokio::runtime::Runtime::new()
                .expect("failed to start tokio runtime for MCP server");
            if let Err(e) = rt.block_on(mcp::run_stdio()) {
                eprintln!("yana-rt mcp: {e}");
                std::process::exit(1);
            }
        }
    }
}
