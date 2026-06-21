mod bus;
mod config;
mod cost;
mod memory;
mod plugin;
pub mod scanner;
mod task;
mod ci;
mod design;
mod score;
mod doctor;
mod fix;
mod graph;
mod hunt;
mod map;
mod mission;
mod route;
mod spec;
mod vault;
mod watch;
mod init;
mod provenance;

use clap::{Parser, Subcommand};

// ── CLI ───────────────────────────────────────────────────────────────────────

#[derive(Parser)]
#[command(name = "yana-rt", version = "1.3.0", about = "Yana AI Runtime — full Python CLI parity in Rust")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Task lifecycle — create, track, complete with evidence
    Task   { #[command(subcommand)] action: TaskAction },
    /// Evaluate task evidence against schema
    Eval   { #[command(subcommand)] action: EvalAction },
    /// Agent message bus — emit, read, reply, inbox
    Bus    { #[command(subcommand)] action: BusAction },
    /// L3 shared memory — workspace-level facts across sessions
    Memory { #[command(subcommand)] action: MemoryAction },
    /// Configuration — init/read yana-ai settings for any repo
    /// DOCTOR_DISPATCH_EXEMPT: core/scripts/config_manager.py is canonical —
    /// it has get/reset subcommands this Rust port doesn't (2026-06-21).
    Config { #[command(subcommand)] action: ConfigAction },
    /// Plugin hooks — register custom guards without forking
    Plugin { #[command(subcommand)] action: PluginAction },
    /// Cost dashboard — token usage and spend tracking
    Cost   { #[command(subcommand)] action: CostAction },
    /// Active security scanner — secrets, code vulns, deps, supply-chain
    Hunt   { #[command(subcommand)] action: hunt::HuntAction },
    /// CI/CD workflow health check — secrets, unpinned actions, permissions
    Ci     { #[command(subcommand)] action: ci::CiAction },
    /// Agent blast radius map — what the AI can reach (settings, MCP, workflows)
    Map    { #[command(subcommand)] action: map::MapAction },
    /// Auto-apply safe fixes for known finding IDs
    Fix    { #[command(subcommand)] action: fix::FixAction },
    /// Audit score with optional deduction breakdown
    Score  { #[command(subcommand)] action: score::ScoreAction },
    /// Environment and dependency health checks
    Doctor { #[command(subcommand)] action: doctor::DoctorAction },
    /// Parallel mission orchestrator — create, dispatch, track agent tasks
    Mission { #[command(subcommand)] action: mission::MissionAction },
    /// Route a task description → simple / complex / external (yana-router)
    Route  { #[command(subcommand)] action: route::RouteAction },
    /// Validate task spec files against the yana-ai schema
    Spec   { #[command(subcommand)] action: spec::SpecAction },
    /// Design token extractor — URL/file → colors, fonts, spacing, CSS vars
    Design { #[command(subcommand)] action: design::DesignAction },
    /// Knowledge graph — build/show/search/onboard/diff (Rust port of graph_builder.py)
    Graph  { #[command(subcommand)] action: graph::GraphAction },
    /// Vietnamese-first knowledge vault with multilingual translation links
    Vault  { #[command(subcommand)] action: vault::VaultAction },
    /// Live file watcher — monitor skills/agents/rules for changes
    /// DOCTOR_DISPATCH_EXEMPT: core/scripts/watch.py is canonical for the
    /// "watch" CLI command — it watches config + re-audits with score diff,
    /// a different feature from this Rust action; not a duplicate (2026-06-21).
    Watch  { #[command(subcommand)] action: watch::WatchAction },
    /// Initialize Yana AI in a new project
    /// DOCTOR_DISPATCH_EXEMPT: core/scripts/init_wizard.py is canonical —
    /// interactive wizard that also drives guard_installer + audit_scanner;
    /// this Rust action is a simpler flag-driven alternative (2026-06-21).
    Init   { #[command(subcommand)] action: init::InitAction },
    /// Verify ported code (core/lib/*_adapted) has vendor source + attribution
    Provenance { #[command(subcommand)] action: provenance::ProvenanceAction },
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
        /// Also scan the skill-library deep-scan surface (file_patterns_extra
        /// + core/skills/** excludes) — off by default: high false-positive
        /// rate from skill docs/demo scripts, not production code.
        #[arg(long)]
        include_skills: bool,
    },
}

// ── Subcommand enums ──────────────────────────────────────────────────────────

#[derive(Subcommand)]
enum TaskAction {
    /// Create a new task
    Create { name: String, #[arg(long)] scope: Option<String> },
    /// List all tasks
    List,
    /// Mark a task done with evidence
    Done { id: String, #[arg(long)] evidence: String },
    /// Show task details
    Status { id: String },
    /// Remove a task
    Drop { id: String },
}

#[derive(Subcommand)]
enum EvalAction {
    /// Validate task evidence against schema
    Run { id: String },
    /// Show the evidence schema
    Schema,
}

#[derive(Subcommand)]
enum BusAction {
    /// Emit an event onto the bus
    Emit { from: String, to: String, #[arg(name = "type")] event_type: String, payload: String },
    /// Read events from the bus
    Read {
        #[arg(long)] agent: Option<String>,
        #[arg(long)] since: Option<String>,
        #[arg(long)] reply_to: Option<String>,
        #[arg(long, default_value_t = 20)] last: usize,
    },
    /// Reply to an existing event
    Reply { original_id: String, from: String, payload: String },
    /// Show inbox for an agent
    Inbox { agent: String },
}

#[derive(Subcommand)]
enum MemoryAction {
    /// Store a fact in L3
    Store {
        key: String, value: String,
        #[arg(long)] tag: Vec<String>,
        #[arg(long)] agent: Option<String>,
        #[arg(long, default_value = "medium")] confidence: String,
        #[arg(long, default_value = "both")] scope: String,
    },
    /// Get a fact by key
    Get { key: String },
    /// List facts
    List {
        #[arg(long)] tag: Option<String>,
        #[arg(long)] agent: Option<String>,
        #[arg(long, default_value_t = 20)] last: usize,
    },
    /// Promote L3 fact → L1 atomic .md file
    Promote { key: String, #[arg(long, default_value = "memory/L1_atomic")] l1_dir: String },
    /// Import L2 session facts into L3
    Import { #[arg(long, default_value = "memory/L2_session")] l2_dir: String },
}

#[derive(Subcommand)]
enum ConfigAction {
    Show { #[arg(long, default_value = ".")] dir: String },
    Init { #[arg(long, default_value = ".")] dir: String },
    Set  { key: String, value: String, #[arg(long, default_value = ".")] dir: String },
}

#[derive(Subcommand)]
enum PluginAction {
    List,
    Add     { name: String, script: String, #[arg(long, default_value = "")] description: String },
    Remove  { name: String },
    Enable  { name: String },
    Disable { name: String },
    Run     { name: String, #[arg(long)] input: Option<String> },
}

#[derive(Subcommand)]
enum CostAction {
    Show,
    Log {
        task: String, tier: String, model: String,
        input_tokens: u64, output_tokens: u64,
        #[arg(long)] duration_ms: Option<u64>,
    },
    Breakdown { #[arg(default_value = "tier")] by: String },
}

// ── main ─────────────────────────────────────────────────────────────────────

fn main() {
    // Exit quietly on broken pipe (e.g. `yana-rt mission dispatch | head`)
    // instead of panicking with "failed printing to stdout: Broken pipe"
    std::panic::set_hook(Box::new(|info| {
        let msg = info.payload()
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

    let cli = Cli::parse();
    match cli.command {
        Commands::Task { action } => match action {
            TaskAction::Create { name, scope }    => task::cmd_task_create(name, scope),
            TaskAction::List                       => task::cmd_task_list(),
            TaskAction::Done { id, evidence }     => task::cmd_task_done(id, evidence),
            TaskAction::Status { id }             => task::cmd_task_status(id),
            TaskAction::Drop { id }               => task::cmd_task_drop(id),
        },
        Commands::Eval { action } => match action {
            EvalAction::Run { id } => task::cmd_eval_run(id),
            EvalAction::Schema     => task::cmd_eval_schema(),
        },
        Commands::Bus { action } => match action {
            BusAction::Emit { from, to, event_type, payload } =>
                bus::cmd_bus_emit(from, to, event_type, payload),
            BusAction::Read { agent, since, reply_to, last } =>
                bus::cmd_bus_read(agent, since, reply_to, last),
            BusAction::Reply { original_id, from, payload } =>
                bus::cmd_bus_reply(original_id, from, payload),
            BusAction::Inbox { agent } => bus::cmd_bus_inbox(agent),
        },
        Commands::Memory { action } => match action {
            MemoryAction::Store { key, value, tag, agent, confidence, scope } =>
                memory::cmd_memory_store(key, value, tag, agent, confidence, scope),
            MemoryAction::Get { key }                   => memory::cmd_memory_get(key),
            MemoryAction::List { tag, agent, last }     => memory::cmd_memory_list(tag, agent, last),
            MemoryAction::Promote { key, l1_dir }       => memory::cmd_memory_promote(key, l1_dir),
            MemoryAction::Import { l2_dir }             => memory::cmd_memory_import(l2_dir),
        },
        Commands::Config { action } => match action {
            ConfigAction::Show { dir }            => config::cmd_config_show(dir),
            ConfigAction::Init { dir }            => config::cmd_config_init(dir),
            ConfigAction::Set { key, value, dir } => config::cmd_config_set(dir, key, value),
        },
        Commands::Plugin { action } => match action {
            PluginAction::List                          => plugin::cmd_plugin_list(),
            PluginAction::Add { name, script, description } =>
                plugin::cmd_plugin_add(name, script, description),
            PluginAction::Remove  { name }              => plugin::cmd_plugin_remove(name),
            PluginAction::Enable  { name }              => plugin::cmd_plugin_toggle(name, true),
            PluginAction::Disable { name }              => plugin::cmd_plugin_toggle(name, false),
            PluginAction::Run { name, input }           => plugin::cmd_plugin_run(name, input),
        },
        Commands::Scan { target, json, markdown, sarif, fail_on, only, ignore_ids, diff, no_color, quiet, scanner_dir, include_skills } => {
            use std::collections::HashSet;
            let diff_files: Option<HashSet<String>> = diff.as_deref()
                .map(|base| scanner::files::get_diff_files(base, &target));
            let report = scanner::run_audit(
                &target, &scanner_dir,
                diff_files.as_ref(), &ignore_ids, only.as_deref(), include_skills,
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
                let order = |s: &str| match s { "low" => 3, "medium" => 2, "high" => 1, _ => 0 };
                let threshold = order(level);
                let has_fail = report.findings.iter().any(|f| order(&f.severity.to_lowercase()) <= threshold && f.severity != "INFO");
                if has_fail { if report.summary.critical > 0 { 2 } else { 1 } } else { 0 }
            } else if report.summary.critical > 0 { 2 } else if report.summary.high > 0 || report.summary.medium > 0 { 1 } else { 0 };
            // Primary output
            if json {
                let status = if report.findings.iter().any(|f| f.severity != "INFO") { "findings" } else { "ok" };
                println!("{}", serde_json::to_string_pretty(&scanner::render::build_json_output(&report, &target, exit_code, status)).unwrap());
            } else {
                println!("{}", scanner::render::render_console(&report, no_color, quiet));
            }
            std::process::exit(exit_code);
        }
        Commands::Mission { action } => mission::dispatch(action),
        Commands::Route  { action } => route::dispatch(action),
        Commands::Hunt   { action } => hunt::dispatch(action),
        Commands::Ci     { action } => ci::dispatch(action),
        Commands::Map    { action } => map::dispatch(action),
        Commands::Fix    { action } => fix::dispatch(action),
        Commands::Score  { action } => score::dispatch(action),
        Commands::Doctor { action } => doctor::dispatch(action),
        Commands::Spec   { action } => spec::dispatch(action),
        Commands::Design { action } => design::dispatch(action),
        Commands::Graph  { action } => graph::dispatch(action),
        Commands::Vault { action } => vault::dispatch(action),
        Commands::Watch { action } => watch::dispatch(action),
        Commands::Init  { action } => init::dispatch(action),
        Commands::Provenance { action } => provenance::dispatch(action),
        Commands::Cost { action } => match action {
            CostAction::Show                            => cost::cmd_cost_show(),
            CostAction::Log { task, tier, model, input_tokens, output_tokens, duration_ms } =>
                cost::cmd_cost_log(task, tier, model, input_tokens, output_tokens, duration_ms),
            CostAction::Breakdown { by }               => cost::cmd_cost_breakdown(by),
        },
    }
}
