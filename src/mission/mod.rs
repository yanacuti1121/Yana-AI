use clap::Subcommand;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

// ── Public CLI surface ────────────────────────────────────────────────────────

#[derive(Subcommand)]
pub enum MissionAction {
    /// Create a new mission
    Create {
        /// Mission name
        name: String,
        /// Optional harness directory
        #[arg(long)]
        harness: Option<String>,
    },
    /// Add a task to a mission
    Task {
        /// Mission ID (or prefix)
        mission: String,
        /// Task name
        name: String,
        /// Files/globs this task owns (may modify)
        #[arg(long = "owns", value_delimiter = ',')]
        owns: Vec<String>,
        /// Files this task produces (output artifacts)
        #[arg(long = "produces", value_delimiter = ',')]
        produces: Vec<String>,
        /// Files/artifacts that must exist before this task runs
        #[arg(long = "consumes", value_delimiter = ',')]
        consumes: Vec<String>,
        /// Suggested agent (e.g. backend-developer)
        #[arg(long)]
        agent: Option<String>,
        /// Pass criteria: shell command that exits 0 on success
        #[arg(long, value_name = "CMD")]
        pass: Option<String>,
        /// Custom agent instructions (overrides auto-generated brief)
        #[arg(long)]
        instructions: Option<String>,
    },
    /// Print JSON briefs for ready tasks (Yana dispatches these)
    Dispatch {
        /// Mission ID (or prefix)
        mission: String,
        /// Max parallel tasks to dispatch at once (ECC2: default 3)
        #[arg(long, default_value_t = 3)]
        max_parallel: usize,
    },
    /// Mark a task done with evidence
    Done {
        /// Mission ID (or prefix)
        mission: String,
        /// Task name
        task: String,
        /// Path to evidence artifact (file, report, test output)
        #[arg(long)]
        evidence: String,
    },
    /// Mark a task failed with reason
    Fail {
        /// Mission ID (or prefix)
        mission: String,
        /// Task name
        task: String,
        /// Failure reason
        #[arg(long)]
        reason: String,
    },
    /// Cancel a running task and reset it to pending
    Cancel {
        /// Mission ID (or prefix)
        mission: String,
        /// Task name
        task: String,
    },
    /// Retry a failed task (reset to pending)
    Retry {
        /// Mission ID (or prefix)
        mission: String,
        /// Task name
        task: String,
    },
    /// Show mission status table
    Status {
        /// Mission ID (or prefix) — omit to list all missions
        mission: Option<String>,
    },
    /// Full mission report (JSON)
    Report {
        /// Mission ID (or prefix)
        mission: String,
    },
    /// List all missions
    List,
}

pub fn dispatch(action: MissionAction) {
    match action {
        MissionAction::Create { name, harness }         => cmd_create(name, harness),
        MissionAction::Task { mission, name, owns, produces, consumes, agent, pass, instructions } =>
            cmd_add_task(mission, name, owns, produces, consumes, agent, pass, instructions),
        MissionAction::Dispatch { mission, max_parallel } => cmd_dispatch(mission, max_parallel),
        MissionAction::Done { mission, task, evidence }  => cmd_done(mission, task, evidence),
        MissionAction::Fail { mission, task, reason }    => cmd_fail(mission, task, reason),
        MissionAction::Cancel { mission, task }          => cmd_cancel(mission, task),
        MissionAction::Retry  { mission, task }          => cmd_retry(mission, task),
        MissionAction::Status { mission }               => cmd_status(mission),
        MissionAction::Report { mission }               => cmd_report(mission),
        MissionAction::List                             => cmd_list(),
    }
}

// ── Data model ────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MissionStatus { Active, Done, Blocked }

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus { Pending, Running, Done, Failed }

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Task {
    pub id:            String,
    pub name:          String,
    pub owns:          Vec<String>,
    pub consumes:      Vec<String>,
    pub produces:      Vec<String>,
    pub agent:         Option<String>,
    pub pass_criteria: Option<String>,
    pub status:        TaskStatus,
    pub instructions:  Option<String>,
    pub evidence:      Option<String>,
    pub fail_reason:   Option<String>,
    pub created_at:    String,
    pub updated_at:    String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Mission {
    pub id:           String,
    pub name:         String,
    pub status:       MissionStatus,
    pub harness_path: Option<String>,
    pub tasks:        Vec<Task>,
    pub created_at:   String,
    pub updated_at:   String,
}

/// What Yana receives when dispatching a task
#[derive(Serialize)]
pub struct TaskBrief {
    pub mission_id:     String,
    pub mission_name:   String,
    pub task_id:        String,
    pub task_name:      String,
    pub agent:          String,
    pub scope:          BriefScope,
    pub pass_criteria:  Option<String>,
    pub instructions:   String,
    pub subagent_policy: &'static str,
}

#[derive(Serialize)]
pub struct BriefScope {
    pub owns:     Vec<String>,
    pub consumes: Vec<String>,
    pub produces: Vec<String>,
}

// ── Storage ───────────────────────────────────────────────────────────────────

fn missions_dir() -> PathBuf {
    PathBuf::from(".yana-ai/missions")
}

fn mission_path(id: &str) -> PathBuf {
    missions_dir().join(format!("{id}.json"))
}

fn ensure_dir() {
    std::fs::create_dir_all(missions_dir()).ok();
}

/// Atomic write (temp file in the same directory, then `rename`), not a
/// direct `fs::write`. Found necessary live: `fs::write` truncates the
/// target file before writing the new content — not atomic — so
/// `resolve()`'s deliberately-unlocked directory scan (see its own doc
/// comment) could occasionally `read_to_string` this file mid-truncation
/// and see empty/partial JSON, making a mission that genuinely exists
/// report as "no mission matching" purely from read timing. `with_lock`
/// (ADR-008) closes writer-vs-writer races; it does nothing for a reader
/// that never takes the lock at all, which `resolve()` intentionally
/// doesn't — so the write itself has to be atomic instead. `rename()` on
/// the same filesystem is atomic on every platform this repo targets, so
/// any concurrent reader always sees either the fully-old or fully-new
/// file, never a torn one — regardless of whether that reader holds any
/// lock. Reproduced live: 8 concurrent `mission done` processes racing
/// `resolve()` against `save()`, ~1-in-8 to 1-in-15 runs under real
/// system load (never in isolation) hit "no mission matching" before
/// this fix; 30+ consecutive runs clean after it.
fn save(m: &Mission) {
    ensure_dir();
    let json = serde_json::to_string_pretty(m).expect("serialize");
    let final_path = mission_path(&m.id);
    let tmp_path = final_path.with_extension(format!("json.tmp.{}", std::process::id()));
    std::fs::write(&tmp_path, json).expect("write mission (temp)");
    std::fs::rename(&tmp_path, &final_path).expect("atomically publish mission");
}

fn load(id: &str) -> Option<Mission> {
    let data = std::fs::read_to_string(mission_path(id)).ok()?;
    serde_json::from_str(&data).ok()
}

/// Resolve a mission by full ID or prefix
fn resolve(prefix: &str) -> Result<Mission, String> {
    ensure_dir();
    let entries = std::fs::read_dir(missions_dir()).map_err(|e| e.to_string())?;
    let mut matches = Vec::new();
    for entry in entries.flatten() {
        let fname = entry.file_name().to_string_lossy().to_string();
        if fname.starts_with(prefix) && fname.ends_with(".json") {
            let id = fname.trim_end_matches(".json").to_string();
            if let Some(m) = load(&id) {
                matches.push(m);
            }
        }
    }
    match matches.len() {
        0 => Err(format!("no mission matching '{prefix}'")),
        1 => Ok(matches.remove(0)),
        _ => Err(format!("{} missions match '{prefix}' — be more specific", matches.len())),
    }
}

/// ADR-008 — resolve `prefix` to an exact mission ID (unlocked; this is
/// just directory-prefix matching, not the race this closes), then run
/// `mutate` on a FRESH reload of that mission with the lock held for the
/// entire reload -> mutate -> save unit. `cmd_dispatch` hands out up to
/// `max_parallel` tasks for genuinely parallel agents to work, each of
/// which eventually calls `mission done`/`fail`/`cancel`/`retry` as a
/// separate process — locking only `save()` (the original shape of these
/// four handlers) leaves the gap between `resolve()`'s read and this call's
/// eventual write wide open; a concurrent process's completed-task update
/// landing in that window gets silently overwritten. Re-loading fresh
/// *inside* the lock (not reusing `resolve`'s pre-lock snapshot) is what
/// actually closes it — reusing the snapshot would still race even with a
/// lock held only around the write.
fn with_mission_locked(
    prefix: &str,
    mutate: impl FnOnce(&mut Mission) -> Result<(), String>,
) -> Result<Mission, String> {
    let id = resolve(prefix)?.id;
    let lock_name = crate::guard::lock::lock_name_for(&mission_path(&id).to_string_lossy());
    // Configurable (default 10s) so a heavily-loaded CI runner — many
    // parallel test processes all spawning their own subprocesses — can
    // give this a larger wait budget without changing the production
    // default. Found necessary live: the regression test in
    // tests/integration_runtime.rs that races 8 concurrent `mission done`
    // processes intermittently hit this timeout (~17% of runs) only when
    // run alongside ~60 other integration tests under `--test-threads=4`,
    // never in isolation — genuine system contention, not a locking bug
    // (confirmed by re-running the same 8-process race in isolation 8/8
    // times with zero failures).
    let timeout_secs = std::env::var("YANA_MISSION_LOCK_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);
    let locked = crate::guard::lock::with_lock(
        &lock_name,
        std::time::Duration::from_secs(timeout_secs),
        || -> Result<Mission, String> {
            let mut m = load(&id)
                .ok_or_else(|| format!("mission '{id}' disappeared while waiting for its lock"))?;
            mutate(&mut m)?;
            save(&m);
            Ok(m)
        },
    );
    match locked {
        Ok(inner) => inner,
        Err(lock_err) => Err(format!("could not acquire mission lock for '{id}': {lock_err:#}")),
    }
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

// ── Readiness check ───────────────────────────────────────────────────────────

/// A task is ready to dispatch when:
///   1. status is Pending
///   2. All consumes either exist as files on disk
///      OR are produced by a Done task in this mission
fn is_ready(task: &Task, mission: &Mission) -> bool {
    if task.status != TaskStatus::Pending {
        return false;
    }
    let done_produces: Vec<&str> = mission.tasks.iter()
        .filter(|t| t.status == TaskStatus::Done)
        .flat_map(|t| t.produces.iter().map(|p| p.as_str()))
        .collect();

    task.consumes.iter().all(|c| {
        Path::new(c).exists() || done_produces.contains(&c.as_str())
    })
}

/// Conservative overlap check between two tasks' `owns` lists: exact match,
/// or one entry is a path-prefix of the other (so "src/" conflicts with
/// "src/auth.ts", but "src/auth.ts" and "src/db.ts" do not). This is a
/// heuristic, not full glob-intersection — e.g. it won't catch "src/*.ts"
/// vs "src/auth.ts" overlapping — but it catches the common real cases
/// (shared directory, or the literal same file) without pulling in a glob
/// dependency for path matching specifically.
///
/// Added 2026-07-08 audit fix: previously nothing checked this at all —
/// `cmd_dispatch` only looked at `consumes` before co-dispatching tasks in
/// the same wave, so two tasks with overlapping `owns` (the exact race
/// condition `owns` exists to prevent) could be handed to two agents in
/// parallel with only a prompt-text instruction — not a technical
/// constraint — keeping them apart.
fn owns_conflict(a: &[String], b: &[String]) -> bool {
    for pa in a {
        for pb in b {
            if pa == pb {
                return true;
            }
            let (shorter, longer) = if pa.len() <= pb.len() { (pa, pb) } else { (pb, pa) };
            let prefix = if shorter.ends_with('/') { shorter.clone() } else { format!("{shorter}/") };
            if longer.starts_with(&prefix) {
                return true;
            }
        }
    }
    false
}

/// Build the plain-English brief Yana pastes into agent dispatch
fn build_instructions(task: &Task, mission: &Mission) -> String {
    if let Some(ref custom) = task.instructions {
        return custom.clone();
    }
    let agent = task.agent.as_deref().unwrap_or("fullstack-engineer");
    let mut lines = vec![
        format!("You are acting as: **{}**", agent),
        format!("Mission: {}", mission.name),
        format!("Task: {}", task.name),
        String::new(),
        "## Scope".into(),
        format!("- owns (you may modify):  {}", task.owns.join(", ")),
        format!("- produces (you must create): {}", task.produces.join(", ")),
    ];
    if !task.consumes.is_empty() {
        lines.push(format!("- consumes (available input): {}", task.consumes.join(", ")));
    }
    if let Some(ref p) = task.pass_criteria {
        lines.push(String::new());
        lines.push("## Pass criteria".into());
        lines.push(format!("Run this command — it must exit 0: `{p}`"));
    }
    lines.push(String::new());
    lines.push("## Rules".into());
    lines.push("- Do NOT modify files outside `owns` list.".into());
    lines.push("- Do NOT run git commit or git push.".into());
    lines.push("- Return a plain-text report with evidence paths. No file edits.".into());
    lines.join("\n")
}

// ── Commands ──────────────────────────────────────────────────────────────────

fn cmd_create(name: String, harness: Option<String>) {
    let m = Mission {
        id:           new_id(),
        name:         name.clone(),
        status:       MissionStatus::Active,
        harness_path: harness,
        tasks:        vec![],
        created_at:   now(),
        updated_at:   now(),
    };
    save(&m);
    println!("mission created");
    println!("  id:   {}", m.id);
    println!("  name: {}", m.name);
}

fn cmd_add_task(
    prefix: String, name: String,
    owns: Vec<String>, produces: Vec<String>, consumes: Vec<String>,
    agent: Option<String>, pass: Option<String>, instructions: Option<String>,
) {
    // Migrated under ADR-008 (2026-07-23 follow-up): the duplicate-name
    // check MUST run against the freshly-reloaded, lock-held state, not a
    // pre-lock `resolve()` snapshot — two concurrent `mission add-task`
    // calls with the same name racing the old unlocked resolve->check->
    // push->save shape could both pass the duplicate check before either
    // saved, producing two tasks with the same name. See
    // `with_mission_locked`'s doc comment for why reload-inside-lock (not
    // lock-only-the-write) is what actually closes this.
    let result = with_mission_locked(&prefix, |m| {
        if m.tasks.iter().any(|t| t.name == name) {
            return Err(format!("task '{}' already exists in mission '{}'", name, m.name));
        }
        let task = Task {
            id:            new_id(),
            name:          name.clone(),
            owns, consumes, produces,
            agent,
            pass_criteria: pass,
            instructions,
            status:        TaskStatus::Pending,
            evidence:      None,
            fail_reason:   None,
            created_at:    now(),
            updated_at:    now(),
        };
        m.tasks.push(task);
        m.updated_at = now();
        Ok(())
    });
    match result {
        Ok(m) => println!("task '{}' added to mission '{}'", name, m.name),
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    }
}

/// Outcome of one `cmd_dispatch` attempt, computed and decided entirely
/// inside the mission lock (see `with_mission_locked`'s doc comment) —
/// carried out of the closure via the `outcome` slot below rather than
/// returned directly, since `with_mission_locked`'s `mutate` signature is
/// fixed at `Result<(), String>` and is shared by all five migrated
/// handlers.
enum DispatchOutcome {
    NoSlots { running: usize, max_parallel: usize },
    NoneReady { pending: usize },
    Dispatched { briefs: Vec<TaskBrief>, deferred: Vec<String> },
}

fn cmd_dispatch(prefix: String, max_parallel: usize) {
    // Migrated under ADR-008 (2026-07-23 follow-up): readiness (`is_ready`)
    // and owns-conflict decisions MUST be made against the freshly-
    // reloaded, lock-held mission state, not a pre-lock `resolve()`
    // snapshot — deciding "ready" outside the lock and only locking the
    // final `save()` (the original shape of this handler) leaves the same
    // TOCTOU gap open that `with_mission_locked` exists to close: two
    // concurrent dispatches could each decide the same task is ready and
    // hand it to two different agents. All of readiness filtering, owns-
    // conflict filtering, and the Running-status flip now happen inside
    // one lock-held reload -> decide -> mutate -> save unit.
    let mut outcome: Option<DispatchOutcome> = None;
    let result = with_mission_locked(&prefix, |m| {
        // Count already-running tasks (cap total in-flight)
        let running = m.tasks.iter().filter(|t| t.status == TaskStatus::Running).count();
        let slots = max_parallel.saturating_sub(running);
        if slots == 0 {
            outcome = Some(DispatchOutcome::NoSlots { running, max_parallel });
            return Ok(());
        }

        // Candidates whose `consumes` are satisfied — may exceed `slots`, and
        // may conflict with each other or with already-Running tasks on `owns`
        // (filtered below, not just truncated).
        let candidates: Vec<Task> = m.tasks.iter()
            .filter(|t| is_ready(t, m))
            .cloned()
            .collect();

        let running_owns: Vec<Vec<String>> = m.tasks.iter()
            .filter(|t| t.status == TaskStatus::Running)
            .map(|t| t.owns.clone())
            .collect();

        let mut ready: Vec<Task> = Vec::new();
        let mut deferred: Vec<String> = Vec::new();
        for cand in candidates {
            if ready.len() >= slots {
                break;
            }
            let conflicts_running = running_owns.iter().any(|o| owns_conflict(&cand.owns, o));
            let conflicts_this_wave = ready.iter().any(|r| owns_conflict(&cand.owns, &r.owns));
            if conflicts_running || conflicts_this_wave {
                deferred.push(cand.name.clone());
                continue;
            }
            ready.push(cand);
        }

        if ready.is_empty() {
            let pending = m.tasks.iter().filter(|t| t.status == TaskStatus::Pending).count();
            outcome = Some(DispatchOutcome::NoneReady { pending });
            return Ok(());
        }

        let briefs: Vec<TaskBrief> = ready.iter().map(|task| TaskBrief {
            mission_id:   m.id.clone(),
            mission_name: m.name.clone(),
            task_id:      task.id.clone(),
            task_name:    task.name.clone(),
            agent:        task.agent.clone().unwrap_or_else(|| "fullstack-engineer".into()),
            scope: BriefScope {
                owns:     task.owns.clone(),
                consumes: task.consumes.clone(),
                produces: task.produces.clone(),
            },
            pass_criteria: task.pass_criteria.clone(),
            instructions: build_instructions(task, m),
            subagent_policy: "report-only — do not write files, return findings as plain text",
        }).collect();

        // Mark dispatched tasks as Running so next dispatch won't re-issue them
        let dispatched_ids: Vec<String> = ready.iter().map(|t| t.id.clone()).collect();
        for t in m.tasks.iter_mut() {
            if dispatched_ids.contains(&t.id) {
                t.status     = TaskStatus::Running;
                t.updated_at = now();
            }
        }
        m.updated_at = now();
        outcome = Some(DispatchOutcome::Dispatched { briefs, deferred });
        Ok(())
    });

    if let Err(e) = result {
        eprintln!("error: {e}");
        std::process::exit(1);
    }

    match outcome.expect("with_mission_locked returned Ok without setting outcome") {
        DispatchOutcome::NoSlots { running, max_parallel } => {
            eprintln!("⚠ {running}/{max_parallel} slots in use — wait for tasks to finish");
        }
        DispatchOutcome::NoneReady { pending } => {
            if pending == 0 {
                println!("✓ all tasks done");
            } else {
                eprintln!("⚠ {pending} pending task(s) but none are ready — check consumes dependencies");
            }
        }
        DispatchOutcome::Dispatched { briefs, deferred } => {
            if !deferred.is_empty() {
                eprintln!(
                    "⚠ deferred (owns overlaps a running or already-selected task this wave): {}",
                    deferred.join(", ")
                );
            }
            println!("{}", serde_json::to_string_pretty(&briefs).unwrap());
        }
    }
}

fn cmd_done(prefix: String, task_name: String, evidence: String) {
    // Verify the evidence path actually exists before trusting the
    // completion claim — a `done` call with a nonexistent evidence path is
    // exactly the kind of unverified SUMMARY.md-style claim the project's
    // own Truth Gate / spec-verifier philosophy says not to trust elsewhere.
    // Added 2026-07-08 audit fix: previously `evidence` was stored as-is
    // with zero validation, from any caller, for any path. Checked before
    // acquiring the lock — this is a static check on `evidence` itself,
    // not something that depends on the mission's current state.
    if !Path::new(&evidence).exists() {
        eprintln!(
            "error: evidence path '{evidence}' does not exist — refusing to mark '{task_name}' done. \
             If the agent's actual output is elsewhere, pass the real path; if it produced nothing \
             checkable, use 'mission fail' with a reason instead."
        );
        std::process::exit(1);
    }
    let result = with_mission_locked(&prefix, |m| {
        let task = m.tasks.iter_mut().find(|t| t.name == task_name)
            .ok_or_else(|| format!("task '{task_name}' not found"))?;
        task.status = TaskStatus::Done;
        task.evidence = Some(evidence.clone());
        task.updated_at = now();
        m.status = compute_mission_status(&m.tasks);
        m.updated_at = now();
        Ok(())
    });
    match result {
        Ok(_) => println!("✓ task '{}' marked done  evidence: {}", task_name, evidence),
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    }
}

fn cmd_fail(prefix: String, task_name: String, reason: String) {
    let result = with_mission_locked(&prefix, |m| {
        let task = m.tasks.iter_mut().find(|t| t.name == task_name)
            .ok_or_else(|| format!("task '{task_name}' not found"))?;
        task.status = TaskStatus::Failed;
        task.fail_reason = Some(reason.clone());
        task.updated_at = now();
        m.status = MissionStatus::Blocked;
        m.updated_at = now();
        Ok(())
    });
    match result {
        Ok(_) => eprintln!("✗ task '{}' failed: {}", task_name, reason),
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    }
}

fn cmd_status(prefix: Option<String>) {
    match prefix {
        Some(p) => {
            let m = match resolve(&p) {
                Ok(m) => m,
                Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
            };
            print_mission_table(&m);
        }
        None => cmd_list(),
    }
}

fn cmd_report(prefix: String) {
    let m = match resolve(&prefix) {
        Ok(m) => m,
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    };
    println!("{}", serde_json::to_string_pretty(&m).unwrap());
}

fn cmd_list() {
    ensure_dir();
    let mut missions: Vec<Mission> = std::fs::read_dir(missions_dir())
        .unwrap_or_else(|_| { eprintln!("no missions dir"); std::process::exit(0); })
        .flatten()
        .filter_map(|e| {
            let fname = e.file_name().to_string_lossy().to_string();
            if fname.ends_with(".json") {
                let id = fname.trim_end_matches(".json").to_string();
                load(&id)
            } else {
                None
            }
        })
        .collect();

    if missions.is_empty() {
        println!("no missions yet — create one with: yana-rt mission create <name>");
        return;
    }

    missions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    println!("{:<38} {:<20} {:<10} tasks", "ID", "NAME", "STATUS");
    println!("{}", "─".repeat(75));
    for m in &missions {
        let done  = m.tasks.iter().filter(|t| t.status == TaskStatus::Done).count();
        let total = m.tasks.len();
        let st = match m.status {
            MissionStatus::Active  => "active",
            MissionStatus::Done    => "done",
            MissionStatus::Blocked => "blocked",
        };
        println!("{:<38} {:<20} {:<10} {}/{}", m.id, truncate(&m.name, 20), st, done, total);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn compute_mission_status(tasks: &[Task]) -> MissionStatus {
    if tasks.iter().any(|t| t.status == TaskStatus::Failed) {
        return MissionStatus::Blocked;
    }
    if tasks.iter().all(|t| t.status == TaskStatus::Done) {
        return MissionStatus::Done;
    }
    MissionStatus::Active
}

fn print_mission_table(m: &Mission) {
    let st = match m.status {
        MissionStatus::Active  => "ACTIVE",
        MissionStatus::Done    => "DONE  ",
        MissionStatus::Blocked => "BLOCKED",
    };
    println!("Mission: {} [{}]  id: {}", m.name, st, m.id);
    if let Some(ref h) = m.harness_path {
        println!("Harness: {h}");
    }
    println!();
    println!("{:<24} {:<10} {:<28} evidence", "TASK", "STATUS", "PRODUCES");
    println!("{}", "─".repeat(80));
    for t in &m.tasks {
        let st = match t.status {
            TaskStatus::Pending => "pending",
            TaskStatus::Running => "running",
            TaskStatus::Done    => "done   ",
            TaskStatus::Failed  => "FAILED ",
        };
        let prod = t.produces.first().map(|s| s.as_str()).unwrap_or("-");
        let ev   = t.evidence.as_deref().unwrap_or("-");
        println!("{:<24} {:<10} {:<28} {}", truncate(&t.name, 24), st, truncate(prod, 28), ev);
        if let Some(ref r) = t.fail_reason {
            println!("  ↳ fail: {r}");
        }
        if !t.consumes.is_empty() {
            let done_produces: Vec<&str> = m.tasks.iter()
                .filter(|dt| dt.status == TaskStatus::Done)
                .flat_map(|dt| dt.produces.iter().map(|p| p.as_str()))
                .collect();
            let waiting: Vec<&str> = t.consumes.iter()
                .filter(|c| !Path::new(c.as_str()).exists() && !done_produces.contains(&c.as_str()))
                .map(|s| s.as_str())
                .collect();
            if !waiting.is_empty() {
                println!("  ↳ waiting: {}", waiting.join(", "));
            }
        }
    }
}

fn cmd_cancel(prefix: String, task_name: String) {
    let result = with_mission_locked(&prefix, |m| {
        let task = m.tasks.iter_mut().find(|t| t.name == task_name)
            .ok_or_else(|| format!("task '{task_name}' not found"))?;
        if task.status != TaskStatus::Running {
            return Err(format!(
                "task '{}' is {:?} — only Running tasks can be cancelled",
                task_name, task.status
            ));
        }
        task.status = TaskStatus::Pending;
        task.updated_at = now();
        m.updated_at = now();
        Ok(())
    });
    match result {
        Ok(_) => println!("↺ task '{}' cancelled → pending", task_name),
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    }
}

fn cmd_retry(prefix: String, task_name: String) {
    let result = with_mission_locked(&prefix, |m| {
        let task = m.tasks.iter_mut().find(|t| t.name == task_name)
            .ok_or_else(|| format!("task '{task_name}' not found"))?;
        if task.status != TaskStatus::Failed {
            return Err(format!(
                "task '{}' is {:?} — only Failed tasks can be retried",
                task_name, task.status
            ));
        }
        task.status = TaskStatus::Pending;
        task.fail_reason = None;
        task.updated_at = now();
        // Recompute mission status — may lift a Blocked mission
        m.status = compute_mission_status(&m.tasks);
        m.updated_at = now();
        Ok(())
    });
    match result {
        Ok(_) => println!("↺ task '{}' retried → pending", task_name),
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max.saturating_sub(1)])
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_task(name: &str, consumes: Vec<&str>, produces: Vec<&str>) -> Task {
        Task {
            id: new_id(), name: name.into(),
            owns: vec![], consumes: consumes.into_iter().map(String::from).collect(),
            produces: produces.into_iter().map(String::from).collect(),
            agent: None, pass_criteria: None, instructions: None,
            status: TaskStatus::Pending,
            evidence: None, fail_reason: None,
            created_at: now(), updated_at: now(),
        }
    }

    #[test]
    fn ready_no_deps() {
        let m = Mission {
            id: new_id(), name: "test".into(), status: MissionStatus::Active,
            harness_path: None, tasks: vec![], created_at: now(), updated_at: now(),
        };
        let t = make_task("backend", vec![], vec!["src/auth.ts"]);
        assert!(is_ready(&t, &m));
    }

    #[test]
    fn blocked_on_missing_file() {
        let m = Mission {
            id: new_id(), name: "test".into(), status: MissionStatus::Active,
            harness_path: None, tasks: vec![], created_at: now(), updated_at: now(),
        };
        let t = make_task("tests", vec!["/nonexistent/file.ts"], vec![]);
        assert!(!is_ready(&t, &m));
    }

    #[test]
    fn unblocked_by_done_task() {
        let mut producer = make_task("backend", vec![], vec!["src/auth.ts"]);
        producer.status = TaskStatus::Done;
        let m = Mission {
            id: new_id(), name: "test".into(), status: MissionStatus::Active,
            harness_path: None,
            tasks: vec![producer],
            created_at: now(), updated_at: now(),
        };
        let t = make_task("tests", vec!["src/auth.ts"], vec![]);
        assert!(is_ready(&t, &m));
    }

    #[test]
    fn mission_done_when_all_tasks_done() {
        let mut t = make_task("t1", vec![], vec![]);
        t.status = TaskStatus::Done;
        assert_eq!(compute_mission_status(&[t]), MissionStatus::Done);
    }

    // ── owns_conflict — 2026-07-08 audit fix ─────────────────────────────────

    #[test]
    fn owns_conflict_exact_same_file() {
        assert!(owns_conflict(&["src/auth.ts".into()], &["src/auth.ts".into()]));
    }

    #[test]
    fn owns_conflict_directory_prefix_either_direction() {
        assert!(owns_conflict(&["src/".into()], &["src/auth.ts".into()]));
        assert!(owns_conflict(&["src/auth.ts".into()], &["src/".into()]));
    }

    #[test]
    fn owns_no_conflict_different_files_same_dir() {
        assert!(!owns_conflict(&["src/auth.ts".into()], &["src/db.ts".into()]));
    }

    #[test]
    fn owns_no_conflict_unrelated_dirs() {
        assert!(!owns_conflict(&["src/auth.ts".into()], &["tests/auth.test.ts".into()]));
    }

    #[test]
    fn owns_conflict_empty_lists_never_conflict() {
        assert!(!owns_conflict(&[], &["src/auth.ts".into()]));
        assert!(!owns_conflict(&[], &[]));
    }

    #[test]
    fn mission_blocked_on_fail() {
        let mut t = make_task("t1", vec![], vec![]);
        t.status = TaskStatus::Failed;
        assert_eq!(compute_mission_status(&[t]), MissionStatus::Blocked);
    }

    #[test]
    fn running_task_not_redispatched() {
        let mut t = make_task("backend", vec![], vec![]);
        t.status = TaskStatus::Running;
        let m = Mission {
            id: new_id(), name: "test".into(), status: MissionStatus::Active,
            harness_path: None, tasks: vec![t], created_at: now(), updated_at: now(),
        };
        let task = m.tasks.first().unwrap();
        assert!(!is_ready(task, &m), "Running task must not be re-dispatched");
    }

    #[test]
    fn retry_lifts_blocked_mission() {
        let mut t = make_task("t1", vec![], vec![]);
        t.status = TaskStatus::Failed;
        t.fail_reason = Some("timeout".into());
        let mut tasks = vec![t];
        assert_eq!(compute_mission_status(&tasks), MissionStatus::Blocked);
        // Simulate retry
        tasks[0].status = TaskStatus::Pending;
        tasks[0].fail_reason = None;
        assert_eq!(compute_mission_status(&tasks), MissionStatus::Active);
    }

    #[test]
    fn custom_instructions_used_in_brief() {
        let mut t = make_task("custom", vec![], vec![]);
        t.instructions = Some("do exactly this".into());
        let m = Mission {
            id: new_id(), name: "test".into(), status: MissionStatus::Active,
            harness_path: None, tasks: vec![], created_at: now(), updated_at: now(),
        };
        assert_eq!(build_instructions(&t, &m), "do exactly this");
    }
}
