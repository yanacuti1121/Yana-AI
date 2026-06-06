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
    PathBuf::from(".yamtam/missions")
}

fn mission_path(id: &str) -> PathBuf {
    missions_dir().join(format!("{id}.json"))
}

fn ensure_dir() {
    std::fs::create_dir_all(missions_dir()).ok();
}

fn save(m: &Mission) {
    ensure_dir();
    let json = serde_json::to_string_pretty(m).expect("serialize");
    std::fs::write(mission_path(&m.id), json).expect("write mission");
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
    let mut m = match resolve(&prefix) {
        Ok(m) => m,
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    };
    // Reject duplicate task name
    if m.tasks.iter().any(|t| t.name == name) {
        eprintln!("error: task '{}' already exists in mission '{}'", name, m.name);
        std::process::exit(1);
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
    save(&m);
    println!("task '{}' added to mission '{}'", name, m.name);
}

fn cmd_dispatch(prefix: String, max_parallel: usize) {
    let mut m = match resolve(&prefix) {
        Ok(m) => m,
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    };

    // Count already-running tasks (cap total in-flight)
    let running = m.tasks.iter().filter(|t| t.status == TaskStatus::Running).count();
    let slots = max_parallel.saturating_sub(running);
    if slots == 0 {
        eprintln!("⚠ {running}/{max_parallel} slots in use — wait for tasks to finish");
        std::process::exit(0);
    }

    // Clone ready tasks before mutating mission
    let ready: Vec<Task> = m.tasks.iter()
        .filter(|t| is_ready(t, &m))
        .take(slots)
        .cloned()
        .collect();

    if ready.is_empty() {
        let pending = m.tasks.iter().filter(|t| t.status == TaskStatus::Pending).count();
        if pending == 0 {
            println!("✓ all tasks done");
        } else {
            eprintln!("⚠ {pending} pending task(s) but none are ready — check consumes dependencies");
        }
        std::process::exit(0);
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
        instructions: build_instructions(task, &m),
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
    save(&m);

    println!("{}", serde_json::to_string_pretty(&briefs).unwrap());
}

fn cmd_done(prefix: String, task_name: String, evidence: String) {
    let mut m = match resolve(&prefix) {
        Ok(m) => m,
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    };
    let task = match m.tasks.iter_mut().find(|t| t.name == task_name) {
        Some(t) => t,
        None => { eprintln!("error: task '{task_name}' not found"); std::process::exit(1); }
    };
    task.status   = TaskStatus::Done;
    task.evidence = Some(evidence.clone());
    task.updated_at = now();

    // Recompute mission status
    m.status = compute_mission_status(&m.tasks);
    m.updated_at = now();
    save(&m);
    println!("✓ task '{}' marked done  evidence: {}", task_name, evidence);
}

fn cmd_fail(prefix: String, task_name: String, reason: String) {
    let mut m = match resolve(&prefix) {
        Ok(m) => m,
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    };
    let task = match m.tasks.iter_mut().find(|t| t.name == task_name) {
        Some(t) => t,
        None => { eprintln!("error: task '{task_name}' not found"); std::process::exit(1); }
    };
    task.status      = TaskStatus::Failed;
    task.fail_reason = Some(reason.clone());
    task.updated_at  = now();
    m.status    = MissionStatus::Blocked;
    m.updated_at     = now();
    save(&m);
    eprintln!("✗ task '{}' failed: {}", task_name, reason);
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
        println!("no missions yet — create one with: yamtam-rt mission create <name>");
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
    let mut m = match resolve(&prefix) {
        Ok(m) => m,
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    };
    let task = match m.tasks.iter_mut().find(|t| t.name == task_name) {
        Some(t) => t,
        None => { eprintln!("error: task '{task_name}' not found"); std::process::exit(1); }
    };
    if task.status != TaskStatus::Running {
        eprintln!("error: task '{}' is {:?} — only Running tasks can be cancelled", task_name, task.status);
        std::process::exit(1);
    }
    task.status     = TaskStatus::Pending;
    task.updated_at = now();
    m.updated_at    = now();
    save(&m);
    println!("↺ task '{}' cancelled → pending", task_name);
}

fn cmd_retry(prefix: String, task_name: String) {
    let mut m = match resolve(&prefix) {
        Ok(m) => m,
        Err(e) => { eprintln!("error: {e}"); std::process::exit(1); }
    };
    let task = match m.tasks.iter_mut().find(|t| t.name == task_name) {
        Some(t) => t,
        None => { eprintln!("error: task '{task_name}' not found"); std::process::exit(1); }
    };
    if task.status != TaskStatus::Failed {
        eprintln!("error: task '{}' is {:?} — only Failed tasks can be retried", task_name, task.status);
        std::process::exit(1);
    }
    task.status      = TaskStatus::Pending;
    task.fail_reason = None;
    task.updated_at  = now();
    // Recompute mission status — may lift a Blocked mission
    m.status     = compute_mission_status(&m.tasks);
    m.updated_at = now();
    save(&m);
    println!("↺ task '{}' retried → pending", task_name);
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
