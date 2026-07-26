//! `yana-rt skill-quality` — per-skill outcome ledger, built entirely from
//! two signals Yana AI already produces: `.claude/state/audit-chain.log`
//! (which skill/agent a task's session actually invoked — `audit-log.sh`
//! writes this on every tool call, see `observability.rs`'s `AuditEntry`
//! for the same schema verified against live entries) and `eval judge`'s
//! PASS/FAIL verdict (`task::cmd_eval_judge`). Adds no new hook, no new
//! LLM call, no new dependency — this only correlates two things that
//! already exist.
//!
//! Idea borrowed from HKUDS/OpenSpace's "quality from real task outcomes,
//! promote provisional -> trusted only after real success" model
//! (researched 2026-07-25). Reimplemented from scratch in Rust with no
//! dependency on that project, its Python package, or its cloud — see the
//! approved plan for the full rationale. Deliberately simpler than
//! OpenSpace's FIX/DERIVED/CAPTURED evolution pipeline: this only
//! *observes* quality and gates promotion behind an explicit human
//! command, it never rewrites skill content. Demotion (Trusted back to
//! Provisional) IS automatic on a fresh FAIL streak — see
//! `DEMOTE_THRESHOLD` — since revoking standing is safe to run unattended
//! in a way granting it isn't.
//!
//! Known v1 limitations, accepted rather than silently ignored (external
//! review, 2026-07-25):
//! - `record.outcomes` grows unbounded — no pruning/archiving yet. Same
//!   accepted-debt shape as `cost.rs`'s `ledger.jsonl`, which already grows
//!   unbounded in this codebase; revisit if a real ledger ever gets large
//!   enough for it to matter.
//! - Task/skill attribution is time-window-based, not identity-based —
//!   see `skills_invoked_between`'s doc comment for the precise gap and
//!   why closing it fully needs a hook change out of scope here.

use chrono::{DateTime, Utc};
use clap::Subcommand;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

fn now() -> String { Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string() }

/// Parses a Yana AI timestamp (`%Y-%m-%dT%H:%M:%SZ`, always UTC — the same
/// format `audit-log.sh`'s `date -u` and `task.rs`'s `now()` both emit).
/// This *is* valid RFC3339, so `DateTime::parse_from_rfc3339` handles it
/// directly — same parser `task.rs`'s judge-breaker logic already uses for
/// the same reason: comparing by parsed instant, not by string, so a
/// future format change (offset instead of `Z`, added milliseconds) can't
/// silently break comparisons the way a raw string `<`/`>` would.
fn parse_ts(s: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s).ok().map(|dt| dt.with_timezone(&Utc))
}

// ── Data model ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Verdict { Pass, Fail }

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillOutcome {
    pub task_id: String,
    pub verdict: Verdict,
    pub ts: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TrustState {
    #[default]
    Provisional,
    Trusted,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SkillRecord {
    #[serde(default)]
    pub trust: TrustState,
    #[serde(default)]
    pub outcomes: Vec<SkillOutcome>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct SkillQualityStore {
    #[serde(default)]
    pub skills: HashMap<String, SkillRecord>,
}

/// Flat threshold, not OpenSpace's FIX/DERIVED/CAPTURED lineage (v1 scope
/// per the approved plan): this many consecutive PASS outcomes with zero
/// FAIL since makes a skill *eligible* for promotion. `promote` still
/// requires an explicit human command — never automatic.
const PROMOTION_THRESHOLD: usize = 5;

/// Trust is earned slowly, lost quickly: unlike promotion, demotion *is*
/// automatic (record_outcome applies it) — reverting a skill from Trusted
/// back to Provisional only lowers its standing, it never grants anything,
/// so it doesn't need the same human gate promotion does. Lower than
/// `PROMOTION_THRESHOLD` on purpose: a skill that regressed after being
/// trusted should lose that status faster than it took to earn it.
const DEMOTE_THRESHOLD: usize = 3;

// ── Storage ───────────────────────────────────────────────────────────────────
// Same convention as task.rs's tasks.json — project-local, gitignored.

fn store_path() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join(".yana-ai").join("skill_quality.json")
}

fn load_store() -> SkillQualityStore {
    let path = store_path();
    if !path.exists() { return SkillQualityStore::default(); }
    serde_json::from_str(&fs::read_to_string(&path).unwrap_or_default()).unwrap_or_default()
}

fn save_store(store: &SkillQualityStore) {
    let path = store_path();
    if let Some(p) = path.parent() { fs::create_dir_all(p).ok(); }
    fs::write(&path, serde_json::to_string_pretty(store).expect("serialize failed"))
        .expect("write failed");
}

// ── Audit-chain correlation ───────────────────────────────────────────────────

/// Subset of audit-log.sh's real JSONL schema (see observability.rs's
/// `AuditEntry` for the fuller field list verified against live entries).
/// This view additionally needs `input` — that's where the skill/agent
/// identifier lives for `Skill`/`Task`/`Agent` tool calls.
#[derive(Debug, Deserialize)]
struct AuditEntry {
    ts: String,
    tool: String,
    #[serde(default)]
    input: String,
}

fn audit_log_path() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join(".claude").join("state").join("audit-chain.log")
}

/// Best-effort extraction of a `"key":"value"` pair out of a (possibly
/// truncated to 300 chars by audit-log.sh) JSON-as-string `input` field.
/// Not a JSON parse of `input` itself: `input` is already a string, not
/// nested JSON, and may be cut mid-object. A targeted string search
/// tolerates that truncation; round-tripping through serde_json would just
/// fail outright on a cut-off object.
fn extract_field(input: &str, key: &str) -> Option<String> {
    let needle = format!("\"{key}\":\"");
    let start = input.find(&needle)? + needle.len();
    let rest = &input[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

/// Identifiers of skills/agents invoked in `[since, until]`, read from
/// `audit-chain.log`. Skips entries whose `input` doesn't contain a
/// recognizable identifier (a Bash/Edit call, or a Skill/Agent call
/// truncated before the identifying field) rather than guessing.
///
/// KNOWN LIMITATION (flagged in review, not silently claimed solved):
/// `audit-chain.log` carries no task/session identifier of its own, so
/// this can only bound the window by *time*, not by which task a call
/// actually belonged to. Two tasks worked on close together in the same
/// session can still have their skill calls cross-attributed if their
/// windows overlap. The real fix is tagging each audit-log entry with the
/// active task/session id at write time — that touches `audit-log.sh`
/// (core/hooks/**), which per `54-bft-consensus-law.md` needs its own
/// dispatched review, not a drive-by change bundled into this ledger.
/// Narrowing `until` to the task's own last-state-change timestamp
/// (instead of "now", which could be long after other tasks started) is
/// the mitigation available without touching the hook.
fn skills_invoked_between(since: &str, until: &str) -> Vec<String> {
    let (Some(since_dt), Some(until_dt)) = (parse_ts(since), parse_ts(until)) else { return vec![] };
    if until_dt < since_dt { return vec![]; }
    let path = audit_log_path();
    if !path.exists() { return vec![]; }
    let content = fs::read_to_string(&path).unwrap_or_default();
    let mut found = Vec::new();
    for line in content.lines().filter(|l| !l.trim().is_empty()) {
        let Ok(entry) = serde_json::from_str::<AuditEntry>(line) else { continue };
        let Some(entry_ts) = parse_ts(&entry.ts) else { continue };
        if entry_ts < since_dt || entry_ts > until_dt { continue; }
        let id = match entry.tool.as_str() {
            "Skill" => extract_field(&entry.input, "skill"),
            "Task" | "Agent" => extract_field(&entry.input, "subagent_type"),
            _ => None,
        };
        if let Some(id) = id {
            if !found.contains(&id) { found.push(id); }
        }
    }
    found
}

// ── Promotion ─────────────────────────────────────────────────────────────────

fn consecutive_pass_streak(outcomes: &[SkillOutcome]) -> usize {
    outcomes.iter().rev().take_while(|o| o.verdict == Verdict::Pass).count()
}

fn consecutive_fail_streak(outcomes: &[SkillOutcome]) -> usize {
    outcomes.iter().rev().take_while(|o| o.verdict == Verdict::Fail).count()
}

fn is_eligible_for_promotion(record: &SkillRecord) -> bool {
    record.trust == TrustState::Provisional
        && consecutive_pass_streak(&record.outcomes) >= PROMOTION_THRESHOLD
}

/// Auto-demotion is one-directional and safe to run unattended: it only
/// ever revokes standing on fresh FAIL evidence, never grants it — the
/// asymmetry `DEMOTE_THRESHOLD`'s doc comment describes.
fn maybe_auto_demote(record: &mut SkillRecord) {
    if record.trust == TrustState::Trusted && consecutive_fail_streak(&record.outcomes) >= DEMOTE_THRESHOLD {
        record.trust = TrustState::Provisional;
    }
}

// ── Recording — called from task::cmd_eval_judge ─────────────────────────────

/// Appends one outcome per skill/agent invoked during the task's own work
/// window — `[task_created_at, task_window_end]` — to the skill-quality
/// ledger. `task_window_end` should be the task's `updated_at` as of just
/// before `eval judge` touched it (i.e. the `task done` timestamp in the
/// normal flow), NOT "now": judging can happen long after the work itself,
/// by which point unrelated tasks may have invoked other skills. Bounding
/// the window like this is the mitigation `skills_invoked_between`'s doc
/// comment describes — narrower than before, still not a full fix (that
/// needs task/session tagging in the hook itself). Called right after
/// `eval judge` produces a verdict — no new trigger, colocated with the
/// judge call already firing. A no-op when no `Skill`/`Task`/`Agent` tool
/// call was found in that window.
pub fn record_outcome(task_id: &str, task_created_at: &str, task_window_end: &str, pass: bool) {
    let ids = skills_invoked_between(task_created_at, task_window_end);
    if ids.is_empty() { return; }
    let verdict = if pass { Verdict::Pass } else { Verdict::Fail };
    let ts = now();
    let mut store = load_store();
    for id in ids {
        let record = store.skills.entry(id).or_default();
        record.outcomes.push(SkillOutcome { task_id: task_id.to_string(), verdict, ts: ts.clone() });
        maybe_auto_demote(record);
    }
    save_store(&store);
}

// ── CLI ───────────────────────────────────────────────────────────────────────

#[derive(Subcommand, Debug)]
pub enum SkillQualityAction {
    /// Per-skill outcome history and current trust state
    Show {
        /// Show detail for one skill instead of the summary table
        #[arg(long)]
        skill: Option<String>,
        #[arg(long)]
        json: bool,
    },
    /// Promote a skill from provisional to trusted. Always explicit —
    /// never runs automatically, even once a skill is eligible.
    Promote { skill: String },
}

pub fn dispatch(action: SkillQualityAction) {
    match action {
        SkillQualityAction::Show { skill, json } => cmd_show(skill, json),
        SkillQualityAction::Promote { skill } => cmd_promote(skill),
    }
}

fn cmd_show(skill: Option<String>, json: bool) {
    let store = load_store();

    if let Some(name) = skill {
        let Some(record) = store.skills.get(&name) else {
            println!("No outcomes recorded yet for '{name}'.");
            return;
        };
        if json {
            let obj = serde_json::json!({ "skill": name, "trust": record.trust, "outcomes": record.outcomes });
            println!("{}", serde_json::to_string_pretty(&obj).unwrap());
            return;
        }
        let pass = record.outcomes.iter().filter(|o| o.verdict == Verdict::Pass).count();
        let fail = record.outcomes.iter().filter(|o| o.verdict == Verdict::Fail).count();
        println!("Skill: {name}");
        println!("  trust:    {:?}", record.trust);
        println!("  outcomes: {} total ({pass} pass, {fail} fail)", record.outcomes.len());
        println!("  streak:   {} consecutive PASS", consecutive_pass_streak(&record.outcomes));
        if is_eligible_for_promotion(record) {
            println!("  -> eligible for promotion: yana-ai skill-quality promote {name}");
        }
        return;
    }

    if store.skills.is_empty() {
        println!(
            "No skill-quality data yet. Recorded automatically after `yana-ai eval judge`, \
             if the task's session invoked a Skill/Agent tool call."
        );
        return;
    }
    if json {
        println!("{}", serde_json::to_string_pretty(&store).unwrap());
        return;
    }

    println!("{:<40} {:<12} {:>6} {:>6} {:>8}", "SKILL", "TRUST", "PASS", "FAIL", "STREAK");
    println!("{}", "─".repeat(76));
    let mut names: Vec<&String> = store.skills.keys().collect();
    names.sort();
    let mut any_eligible = false;
    for name in names {
        let record = &store.skills[name];
        let pass = record.outcomes.iter().filter(|o| o.verdict == Verdict::Pass).count();
        let fail = record.outcomes.iter().filter(|o| o.verdict == Verdict::Fail).count();
        let streak = consecutive_pass_streak(&record.outcomes);
        let eligible = is_eligible_for_promotion(record);
        any_eligible |= eligible;
        let flag = if eligible { " *" } else { "" };
        println!("{name:<40} {:<12?} {pass:>6} {fail:>6} {streak:>8}{flag}", record.trust);
    }
    println!("{}", "─".repeat(76));
    if any_eligible {
        println!("* eligible for promotion — yana-ai skill-quality promote <skill>");
    }
}

fn cmd_promote(skill: String) {
    let mut store = load_store();
    let Some(record) = store.skills.get_mut(&skill) else {
        eprintln!("error: no outcomes recorded for '{skill}' — nothing to promote");
        std::process::exit(1);
    };
    if record.trust == TrustState::Trusted {
        println!("'{skill}' is already trusted.");
        return;
    }
    let streak = consecutive_pass_streak(&record.outcomes);
    if streak < PROMOTION_THRESHOLD {
        eprintln!(
            "error: '{skill}' has {streak} consecutive PASS outcome(s), needs {PROMOTION_THRESHOLD} — not eligible yet"
        );
        std::process::exit(1);
    }
    record.trust = TrustState::Trusted;
    save_store(&store);
    println!("✓ '{skill}' promoted: provisional -> trusted");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn outcome(verdict: Verdict) -> SkillOutcome {
        SkillOutcome { task_id: "t".into(), verdict, ts: now() }
    }

    #[test]
    fn extract_field_reads_value_from_truncated_json_string() {
        let input = r#"{"skill":"idea-loop","args":"foo bar baz...(cut off"#;
        assert_eq!(extract_field(input, "skill").as_deref(), Some("idea-loop"));
    }

    #[test]
    fn extract_field_none_when_key_absent() {
        let input = r#"{"file_path":"README.md"}"#;
        assert_eq!(extract_field(input, "skill"), None);
    }

    #[test]
    fn extract_field_none_when_truncated_before_value_closes() {
        // The 300-char audit-log.sh truncation can cut mid-value.
        let input = r#"{"skill":"idea-loop-with-a-name-so-long-it-never-closes"#;
        assert_eq!(extract_field(input, "skill"), None);
    }

    #[test]
    fn consecutive_pass_streak_counts_only_the_trailing_run() {
        let outcomes = vec![outcome(Verdict::Fail), outcome(Verdict::Pass), outcome(Verdict::Pass)];
        assert_eq!(consecutive_pass_streak(&outcomes), 2);
    }

    #[test]
    fn consecutive_pass_streak_zero_when_last_outcome_failed() {
        let outcomes = vec![outcome(Verdict::Pass), outcome(Verdict::Fail)];
        assert_eq!(consecutive_pass_streak(&outcomes), 0);
    }

    #[test]
    fn eligible_for_promotion_requires_threshold_and_provisional() {
        let mut record = SkillRecord::default();
        for _ in 0..PROMOTION_THRESHOLD {
            record.outcomes.push(outcome(Verdict::Pass));
        }
        assert!(is_eligible_for_promotion(&record));

        record.trust = TrustState::Trusted;
        assert!(!is_eligible_for_promotion(&record), "already-trusted skills aren't 'eligible' again");
    }

    #[test]
    fn not_eligible_below_threshold() {
        let mut record = SkillRecord::default();
        for _ in 0..PROMOTION_THRESHOLD - 1 {
            record.outcomes.push(outcome(Verdict::Pass));
        }
        assert!(!is_eligible_for_promotion(&record));
    }

    /// A `skill_quality.json` written before `trust` existed (or with an
    /// unrecognized/missing field) must still deserialize — same
    /// backward-compat contract task.rs documents for `eval_judge_attempts`.
    #[test]
    fn store_missing_optional_fields_deserializes_with_defaults() {
        let json = r#"{"skills":{"idea-loop":{"outcomes":[]}}}"#;
        let store: SkillQualityStore = serde_json::from_str(json).unwrap();
        let record = &store.skills["idea-loop"];
        assert_eq!(record.trust, TrustState::Provisional);
        assert!(record.outcomes.is_empty());
    }

    #[test]
    fn empty_store_deserializes_from_empty_object() {
        let store: SkillQualityStore = serde_json::from_str("{}").unwrap();
        assert!(store.skills.is_empty());
    }

    #[test]
    fn parse_ts_accepts_yana_ai_format() {
        assert!(parse_ts("2026-07-25T13:39:13Z").is_some());
    }

    #[test]
    fn parse_ts_rejects_garbage() {
        assert_eq!(parse_ts("not-a-timestamp"), None);
    }

    #[test]
    fn parse_ts_orders_correctly_by_instant_not_by_string() {
        // A string comparison would get this wrong purely by character
        // ordering coincidence in a different-but-plausible format; a
        // parsed-instant comparison must not.
        let earlier = parse_ts("2026-07-25T09:00:00Z").unwrap();
        let later = parse_ts("2026-07-25T13:39:13Z").unwrap();
        assert!(earlier < later);
    }

    #[test]
    fn consecutive_fail_streak_counts_only_the_trailing_run() {
        let outcomes = vec![outcome(Verdict::Pass), outcome(Verdict::Fail), outcome(Verdict::Fail)];
        assert_eq!(consecutive_fail_streak(&outcomes), 2);
    }

    #[test]
    fn auto_demote_reverts_trusted_skill_after_fail_streak() {
        let mut record = SkillRecord { trust: TrustState::Trusted, outcomes: vec![] };
        for _ in 0..DEMOTE_THRESHOLD - 1 {
            record.outcomes.push(outcome(Verdict::Fail));
            maybe_auto_demote(&mut record);
            assert_eq!(record.trust, TrustState::Trusted, "not yet at threshold");
        }
        record.outcomes.push(outcome(Verdict::Fail));
        maybe_auto_demote(&mut record);
        assert_eq!(record.trust, TrustState::Provisional, "threshold reached -> demoted");
    }

    #[test]
    fn auto_demote_is_a_no_op_on_provisional_skills() {
        // Demotion only ever reverts standing that exists — a Provisional
        // skill has none to revoke.
        let mut record = SkillRecord::default();
        for _ in 0..DEMOTE_THRESHOLD {
            record.outcomes.push(outcome(Verdict::Fail));
        }
        maybe_auto_demote(&mut record);
        assert_eq!(record.trust, TrustState::Provisional);
    }

    #[test]
    fn auto_demote_does_not_trigger_on_a_single_recent_fail() {
        let mut record = SkillRecord { trust: TrustState::Trusted, outcomes: vec![outcome(Verdict::Fail)] };
        maybe_auto_demote(&mut record);
        assert_eq!(record.trust, TrustState::Trusted);
    }
}
