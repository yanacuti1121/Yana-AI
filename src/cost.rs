use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const MAX_LEDGER_ENTRY_BYTES: usize = 64 * 1024;
const DEFAULT_DAILY_BUDGET_USD: f64 = 5.0;

/// Project-local spend limits. A zero daily amount and an absent (or zero)
/// monthly amount mean that respective ceiling is not enforced.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct CostPolicy {
    pub daily_budget_usd: f64,
    #[serde(default)]
    pub monthly_budget_usd: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CostEntry {
    pub id: String,
    pub ts: String,
    pub task: String,
    pub tier: String,
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_usd: f64,
    pub duration_ms: Option<u64>,
}

/// Deterministic advice for choosing a model lane before a call is made.
/// It is intentionally advisory: provider selection remains an explicit
/// runtime action and this command never sends a prompt or spends money.
#[derive(Debug, Serialize, PartialEq)]
pub struct CostRecommendation {
    pub task: String,
    pub route: String,
    pub sensitivity: String,
    pub model_scope: String,
    pub recommended_tier: String,
    pub daily_spend_usd: f64,
    pub daily_budget_usd: f64,
    pub budget_remaining_usd: f64,
    pub requires_confirmation: bool,
    pub reason: String,
}

/// A concrete provider suggestion, never an invocation. `readiness` is kept
/// honest: a local runtime is unprobed, while a cloud provider is selectable
/// only when its environment variable is present in this process.
#[derive(Debug, Serialize, PartialEq)]
pub struct ProviderPlan {
    pub recommendation: CostRecommendation,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub readiness: String,
    pub fallback_providers: Vec<String>,
}

/// A preflight decision based on the recorded spend and a caller-supplied
/// estimate. It does not invoke a model or alter the ledger. The estimate is
/// intentionally required at the CLI boundary rather than fabricated from a
/// provider price table that could be stale or incomplete.
#[derive(Debug, Serialize, PartialEq)]
pub struct CostGuardDecision {
    pub task: String,
    pub daily_spend_usd: f64,
    pub daily_budget_usd: f64,
    pub estimated_cost_usd: f64,
    pub projected_spend_usd: f64,
    pub budget_remaining_after_usd: Option<f64>,
    pub monthly_spend_usd: f64,
    pub monthly_budget_usd: Option<f64>,
    pub monthly_projected_spend_usd: f64,
    pub monthly_budget_remaining_after_usd: Option<f64>,
    pub status: String,
    pub requires_confirmation: bool,
    pub reason: String,
}

#[derive(Debug, Deserialize)]
struct AccountingEntry {
    ts: String,
    cost_usd: f64,
}

fn tier_rates(tier: &str) -> (f64, f64) {
    match tier {
        "fast" => (0.00025, 0.00125),
        "standard" => (0.003, 0.015),
        "strong" => (0.015, 0.075),
        _ => (0.003, 0.015),
    }
}

fn ledger_path() -> PathBuf {
    let base = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    ledger_path_for(&base)
}

pub(crate) fn ledger_path_for(root: &Path) -> PathBuf {
    root.join(".yana-ai").join("ledger.jsonl")
}

fn policy_path_for(root: &Path) -> PathBuf {
    root.join(".yana-ai").join("cost-policy.json")
}

fn default_policy() -> CostPolicy {
    CostPolicy { daily_budget_usd: DEFAULT_DAILY_BUDGET_USD, monthly_budget_usd: None }
}

fn validate_policy(policy: &CostPolicy) -> Result<()> {
    if !policy.daily_budget_usd.is_finite() || policy.daily_budget_usd < 0.0 {
        bail!("daily budget must be a non-negative number");
    }
    if policy.monthly_budget_usd.is_some_and(|value| !value.is_finite() || value < 0.0) {
        bail!("monthly budget must be a non-negative number");
    }
    Ok(())
}

/// Strictly reads the small policy file for decisions. A malformed policy must
/// never silently relax a user-configured spending ceiling.
fn read_cost_policy(root: &Path) -> Result<Option<CostPolicy>> {
    let path = policy_path_for(root);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error).with_context(|| format!("cannot inspect cost policy {}", path.display())),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        bail!("cost policy must be a regular file: {}", path.display());
    }
    let raw = fs::read_to_string(&path).with_context(|| format!("cannot read cost policy {}", path.display()))?;
    let policy: CostPolicy = serde_json::from_str(&raw).with_context(|| format!("cost policy is invalid JSON: {}", path.display()))?;
    validate_policy(&policy)?;
    Ok(Some(policy))
}

fn write_cost_policy(root: &Path, policy: &CostPolicy) -> Result<()> {
    validate_policy(policy)?;
    let path = policy_path_for(root);
    let parent = path.parent().expect("cost policy path has parent");
    fs::create_dir_all(parent).with_context(|| format!("cannot create cost policy directory {}", parent.display()))?;
    let temporary = path.with_extension(format!("json.tmp.{}", std::process::id()));
    fs::write(&temporary, serde_json::to_vec_pretty(policy)?).with_context(|| format!("cannot write temporary cost policy {}", temporary.display()))?;
    fs::rename(&temporary, &path).with_context(|| format!("cannot replace cost policy {}", path.display()))
}

fn effective_policy(root: &Path, daily_budget_override: Option<f64>) -> Result<CostPolicy> {
    let mut policy = read_cost_policy(root)?.unwrap_or_else(default_policy);
    if let Some(daily_budget_usd) = daily_budget_override {
        policy.daily_budget_usd = daily_budget_usd;
    }
    validate_policy(&policy)?;
    Ok(policy)
}

/// Strict reader for policy and health decisions. Unlike the legacy summary
/// view, this never drops malformed entries or substitutes an empty ledger for
/// an I/O error.
fn read_ledger_strict(root: &Path) -> Result<Vec<AccountingEntry>> {
    let path = ledger_path_for(root);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(error)
                .with_context(|| format!("cannot inspect cost ledger {}", path.display()))
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        bail!("cost ledger must be a regular file: {}", path.display());
    }
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    options.custom_flags(libc::O_NOFOLLOW);
    let mut file = options
        .open(&path)
        .with_context(|| format!("cannot open cost ledger {}", path.display()))?;
    let mut text = String::new();
    file.read_to_string(&mut text)
        .with_context(|| format!("cannot read cost ledger {}", path.display()))?;
    text.lines()
        .enumerate()
        .filter(|(_, line)| !line.trim().is_empty())
        .map(|(index, line)| {
            let entry: AccountingEntry = serde_json::from_str(line).with_context(|| {
                format!("invalid cost ledger entry {}:{}", path.display(), index + 1)
            })?;
            if !entry.cost_usd.is_finite() || entry.cost_usd < 0.0 {
                bail!("invalid cost value at {}:{}", path.display(), index + 1);
            }
            Ok(entry)
        })
        .collect()
}

pub(crate) fn daily_cost_usd(root: &Path, now: DateTime<Utc>) -> Result<f64> {
    let date = now.format("%Y-%m-%d").to_string();
    let total: f64 = read_ledger_strict(root)?
        .into_iter()
        .filter(|entry| entry.ts.starts_with(&date))
        .map(|entry| entry.cost_usd)
        .sum();
    Ok(if total == 0.0 { 0.0 } else { total })
}

pub(crate) fn monthly_cost_usd(root: &Path, now: DateTime<Utc>) -> Result<f64> {
    let month = now.format("%Y-%m").to_string();
    let total: f64 = read_ledger_strict(root)?
        .into_iter()
        .filter(|entry| entry.ts.starts_with(&month))
        .map(|entry| entry.cost_usd)
        .sum();
    Ok(if total == 0.0 { 0.0 } else { total })
}

pub fn recommend(task: &str, daily_spend_usd: f64, daily_budget_usd: f64) -> CostRecommendation {
    use crate::route::{Route, Sensitivity};

    let decision = crate::route::classify(task);
    let route = match decision.route { Route::Simple => "simple", Route::Complex => "complex", Route::External => "external" };
    let sensitivity = match decision.sensitivity {
        Sensitivity::Public => "public",
        Sensitivity::Internal => "internal",
        Sensitivity::Confidential => "confidential",
        Sensitivity::Sovereign => "sovereign",
    };
    let budget_remaining_usd = (daily_budget_usd - daily_spend_usd).max(0.0);
    let budget_exhausted = daily_budget_usd > 0.0 && daily_spend_usd >= daily_budget_usd;
    let lower = task.to_lowercase();
    let high_reasoning = ["architecture", "architect", "security", "bảo mật", "audit", "review", "debug", "thiết kế"]
        .iter().any(|signal| lower.contains(signal));

    let (recommended_tier, reason) = match decision.sensitivity {
        Sensitivity::Sovereign => ("local", "sovereign context: local-only model lane"),
        Sensitivity::Confidential => ("standard", "confidential context: redact before any cloud model; use local when redaction is not possible"),
        _ if budget_exhausted && matches!(decision.route, Route::Simple) => ("fast", "daily budget exhausted: keep only low-risk, read-only work on the economical lane"),
        _ if budget_exhausted => ("defer", "daily budget exhausted: preserve quality; defer complex work or approve an explicit budget exception"),
        _ if matches!(decision.route, Route::Simple) => ("fast", "read-only/explanatory task: economical lane is sufficient"),
        _ if high_reasoning => ("strong", "complex task with high-reasoning signals: reserve strong lane for this decision"),
        _ if matches!(decision.route, Route::External) => ("strong", "external action needs a careful plan and human confirmation"),
        _ => ("standard", "complex implementation: start on standard lane and escalate only when evidence requires it"),
    };

    CostRecommendation {
        task: task.to_string(), route: route.into(), sensitivity: sensitivity.into(),
        model_scope: decision.model_scope.into(), recommended_tier: recommended_tier.into(),
        daily_spend_usd, daily_budget_usd, budget_remaining_usd,
        requires_confirmation: matches!(decision.route, Route::External) || recommended_tier == "defer",
        reason: reason.into(),
    }
}

pub fn cmd_cost_recommend(task: String, daily_budget_override: Option<f64>, json: bool) -> Result<()> {
    let root = std::env::current_dir().context("cannot resolve project root")?;
    let daily_budget_usd = effective_policy(&root, daily_budget_override)?.daily_budget_usd;
    let daily_spend_usd = daily_cost_usd(&root, Utc::now())?;
    let recommendation = recommend(&task, daily_spend_usd, daily_budget_usd);
    if json {
        println!("{}", serde_json::to_string_pretty(&recommendation)?);
    } else {
        println!("Recommended lane: {}", recommendation.recommended_tier);
        println!("  route: {} · sensitivity: {} · scope: {}", recommendation.route, recommendation.sensitivity, recommendation.model_scope);
        println!("  today: ${:.4} / ${:.4} · remaining: ${:.4}", recommendation.daily_spend_usd, recommendation.daily_budget_usd, recommendation.budget_remaining_usd);
        println!("  reason: {}", recommendation.reason);
        if recommendation.requires_confirmation { println!("  action: confirmation required before proceeding"); }
    }
    Ok(())
}

fn provider_preferences(tier: &str) -> &'static [&'static str] {
    match tier {
        // GLM is intentionally first: when the user has its economical
        // offering configured, this saves premium-model budget. This makes no
        // quality/price assertion; the policy is explicit and editable here.
        "fast" => &["glm", "groq", "ollama"],
        "standard" => &["glm", "deepseek", "openrouter", "ollama"],
        "strong" => &["anthropic", "openai", "gemini", "glm", "ollama"],
        "local" => &["ollama", "lmstudio", "llamacpp", "turbofieldfare", "airllm"],
        _ => &[],
    }
}

fn configured_provider(preferences: &[&str], configured: impl Fn(&str) -> bool) -> Option<String> {
    preferences.iter().find(|name| configured(name)).map(|name| (*name).to_string())
}

pub fn provider_plan(recommendation: CostRecommendation, configured: impl Fn(&str) -> bool) -> ProviderPlan {
    let preferences = provider_preferences(&recommendation.recommended_tier);
    let provider = configured_provider(preferences, configured);
    let readiness = match (&provider, recommendation.recommended_tier.as_str()) {
        (Some(name), _) if provider_preferences("local").contains(&name.as_str()) => "local runtime unprobed".into(),
        (Some(_), _) => "credential present in environment".into(),
        (_, "defer") => "confirmation required before choosing a provider".into(),
        _ => "no preferred provider credential is present in environment".into(),
    };
    ProviderPlan {
        recommendation,
        provider,
        model: None,
        readiness,
        fallback_providers: preferences.iter().map(|name| (*name).to_string()).collect(),
    }
}

pub fn cmd_cost_plan(task: String, daily_budget_override: Option<f64>, json: bool) -> Result<()> {
    let root = std::env::current_dir().context("cannot resolve project root")?;
    let daily_budget_usd = effective_policy(&root, daily_budget_override)?.daily_budget_usd;
    let recommendation = recommend(&task, daily_cost_usd(&root, Utc::now())?, daily_budget_usd);
    let catalog = crate::model::catalog::provider_catalog();
    let plan = provider_plan(recommendation, |name| {
        catalog.iter().find(|provider| provider.name == name)
            .is_some_and(|provider| !provider.requires_key || provider.env_var.as_deref().is_some_and(|key| std::env::var(key).is_ok_and(|value| !value.is_empty())))
    });
    let model = plan.provider.as_ref()
        .and_then(|name| crate::model::catalog::try_select_provider(name).ok())
        .map(|provider| crate::model::provider::ChatProvider::default_model(provider.as_ref()).to_string());
    let plan = ProviderPlan { model, ..plan };
    if json { println!("{}", serde_json::to_string_pretty(&plan)?); }
    else {
        println!("Recommended lane: {}", plan.recommendation.recommended_tier);
        println!("  provider: {}", plan.provider.as_deref().unwrap_or("none configured"));
        if let Some(model) = &plan.model { println!("  model: {model}"); }
        println!("  readiness: {}", plan.readiness);
        println!("  fallbacks: {}", plan.fallback_providers.join(" → "));
        println!("  note: this command does not invoke a model");
    }
    Ok(())
}

/// Evaluates one spend ceiling. `budget` is `None` (or `Some(0.0)`) when that
/// ceiling isn't configured — never enforced. Returns the remaining budget
/// after the projected spend (capped at 0 on block) and a severity level:
/// 0 = unbounded, 1 = allow, 2 = warn (>= 80%), 3 = block (over).
fn evaluate_ceiling(budget: Option<f64>, projected_spend_usd: f64) -> (Option<f64>, u8) {
    match budget {
        None => (None, 0),
        Some(budget) if budget == 0.0 => (None, 0),
        Some(budget) if projected_spend_usd > budget => (Some(0.0), 3),
        Some(budget) if projected_spend_usd >= budget * 0.8 => (Some(budget - projected_spend_usd), 2),
        Some(budget) => (Some(budget - projected_spend_usd), 1),
    }
}

/// Gates a proposed call against BOTH the daily and (optional) monthly
/// ceiling. Either ceiling can independently block or warn; the more severe
/// of the two determines the overall status, and its reason is what's
/// reported (a tie between two `block`s or two `warn`s reports daily, since
/// daily is checked first — the reason string always names which ceiling
/// actually triggered, so this never misattributes a monthly-only trip to
/// daily and vice versa).
pub fn budget_guard(
    task: &str,
    daily_spend_usd: f64,
    daily_budget_usd: f64,
    estimated_cost_usd: f64,
    monthly_spend_usd: f64,
    monthly_budget_usd: Option<f64>,
) -> CostGuardDecision {
    let projected_spend_usd = daily_spend_usd + estimated_cost_usd;
    let monthly_projected_spend_usd = monthly_spend_usd + estimated_cost_usd;

    let daily_budget_opt = if daily_budget_usd == 0.0 { None } else { Some(daily_budget_usd) };
    let (budget_remaining_after_usd, daily_level) = evaluate_ceiling(daily_budget_opt, projected_spend_usd);
    let (monthly_budget_remaining_after_usd, monthly_level) =
        evaluate_ceiling(monthly_budget_usd, monthly_projected_spend_usd);

    let daily_is_at_least_as_severe = daily_level >= monthly_level;
    let (status, requires_confirmation, reason) = match daily_level.max(monthly_level) {
        0 => ("unbounded", false, "no daily or monthly budget configured; this check cannot enforce a spending ceiling"),
        3 if daily_is_at_least_as_severe => ("block", true, "projected daily spend exceeds the daily budget; lower the estimate, defer, or approve a budget exception"),
        3 => ("block", true, "projected monthly spend exceeds the monthly budget; lower the estimate, defer, or approve a budget exception"),
        2 if daily_is_at_least_as_severe => ("warn", true, "projected daily spend reaches at least 80% of the daily budget; confirm before continuing"),
        2 => ("warn", true, "projected monthly spend reaches at least 80% of the monthly budget; confirm before continuing"),
        _ => ("allow", false, "projected spend remains below the 80% warning threshold for both configured ceilings"),
    };

    CostGuardDecision {
        task: task.into(),
        daily_spend_usd,
        daily_budget_usd,
        estimated_cost_usd,
        projected_spend_usd,
        budget_remaining_after_usd,
        monthly_spend_usd,
        monthly_budget_usd,
        monthly_projected_spend_usd,
        monthly_budget_remaining_after_usd,
        status: status.into(),
        requires_confirmation,
        reason: reason.into(),
    }
}

/// Returns false only for a hard budget block so command dispatch can use a
/// distinct nonzero exit code without misrepresenting it as an I/O failure.
/// Reads the persisted `CostPolicy` (daily + monthly) — `daily_budget_override`
/// only overrides the daily figure for this one call, matching `recommend`/
/// `plan`'s existing override semantics; the monthly ceiling always comes
/// from the saved policy (set it via `cost set-policy`).
pub fn cmd_cost_guard(
    task: String,
    daily_budget_override: Option<f64>,
    estimated_cost_usd: f64,
    json: bool,
) -> Result<bool> {
    if !estimated_cost_usd.is_finite() || estimated_cost_usd < 0.0 {
        bail!("estimated cost must be a non-negative number");
    }
    let root = std::env::current_dir().context("cannot resolve project root")?;
    let policy = effective_policy(&root, daily_budget_override)?;
    let now = Utc::now();
    let daily_spend_usd = daily_cost_usd(&root, now)?;
    let monthly_spend_usd = monthly_cost_usd(&root, now)?;
    let decision = budget_guard(
        &task,
        daily_spend_usd,
        policy.daily_budget_usd,
        estimated_cost_usd,
        monthly_spend_usd,
        policy.monthly_budget_usd,
    );
    if json {
        println!("{}", serde_json::to_string_pretty(&decision)?);
    } else {
        println!("Budget guard: {}", decision.status);
        println!("  today: ${:.4} + estimated: ${:.4} = projected: ${:.4}", decision.daily_spend_usd, decision.estimated_cost_usd, decision.projected_spend_usd);
        match decision.budget_remaining_after_usd {
            Some(remaining) => println!("  daily budget: ${:.4} · after call: ${remaining:.4}", decision.daily_budget_usd),
            None => println!("  daily budget: not enforced"),
        }
        match decision.monthly_budget_usd {
            Some(monthly_budget) => {
                println!(
                    "  this month: ${:.4} + estimated: ${:.4} = projected: ${:.4}",
                    decision.monthly_spend_usd, decision.estimated_cost_usd, decision.monthly_projected_spend_usd
                );
                match decision.monthly_budget_remaining_after_usd {
                    Some(remaining) => println!("  monthly budget: ${monthly_budget:.4} · after call: ${remaining:.4}"),
                    None => println!("  monthly budget: not enforced"),
                }
            }
            None => println!("  monthly budget: not configured"),
        }
        println!("  reason: {}", decision.reason);
    }
    Ok(decision.status != "block")
}

/// Persists daily/monthly spend ceilings to `.yana-ai/cost-policy.json`.
/// Only the fields explicitly supplied are changed — omitted fields keep
/// whatever was previously saved (or the default), so this is safe to call
/// repeatedly with a single override at a time. `clear_monthly_budget`
/// removes any configured monthly ceiling; it takes precedence over a
/// simultaneously-supplied `monthly_budget_usd` (mutually exclusive intents,
/// caller error to pass both — clearing wins rather than silently ignoring it).
pub fn cmd_cost_set_policy(
    daily_budget_usd: Option<f64>,
    monthly_budget_usd: Option<f64>,
    clear_monthly_budget: bool,
    json: bool,
) -> Result<()> {
    let root = std::env::current_dir().context("cannot resolve project root")?;
    let mut policy = read_cost_policy(&root)?.unwrap_or_else(default_policy);
    if let Some(daily) = daily_budget_usd {
        policy.daily_budget_usd = daily;
    }
    if clear_monthly_budget {
        policy.monthly_budget_usd = None;
    } else if let Some(monthly) = monthly_budget_usd {
        policy.monthly_budget_usd = Some(monthly);
    }
    write_cost_policy(&root, &policy)?;
    if json {
        println!("{}", serde_json::to_string_pretty(&policy)?);
    } else {
        println!("Cost policy updated:");
        println!("  daily budget: ${:.4}", policy.daily_budget_usd);
        match policy.monthly_budget_usd {
            Some(monthly) => println!("  monthly budget: ${monthly:.4}"),
            None => println!("  monthly budget: not enforced"),
        }
    }
    Ok(())
}

fn read_ledger() -> Vec<CostEntry> {
    let path = ledger_path();
    if !path.exists() {
        return vec![];
    }
    fs::read_to_string(&path)
        .unwrap_or_default()
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

fn append_entry_at(root: &Path, entry: &CostEntry) -> Result<()> {
    let path = ledger_path_for(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("cannot create cost ledger directory {}", parent.display()))?;
    }
    let mut line = serde_json::to_vec(entry).context("cannot serialize cost ledger entry")?;
    line.push(b'\n');
    if line.len() > MAX_LEDGER_ENTRY_BYTES {
        bail!(
            "cost ledger entry exceeds {} byte limit",
            MAX_LEDGER_ENTRY_BYTES
        );
    }
    let mut options = fs::OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    let mut file = options
        .open(&path)
        .with_context(|| format!("cannot open cost ledger {}", path.display()))?;
    if !file.metadata()?.is_file() {
        bail!("cost ledger must be a regular file: {}", path.display());
    }
    let written = file
        .write(&line)
        .with_context(|| format!("cannot append cost ledger {}", path.display()))?;
    if written != line.len() {
        bail!(
            "short cost ledger append at {}: wrote {written} of {} bytes",
            path.display(),
            line.len()
        );
    }
    Ok(())
}

/// Called by runtime event producers when real token counts are present.
/// Returns `Ok(false)` when the payload has no complete token pair.
pub fn track_from_payload(event_type: &str, payload: &serde_json::Value) -> Result<bool> {
    let input_tokens = match payload.get("input_tokens").and_then(|v| v.as_u64()) {
        Some(n) => n,
        None => return Ok(false),
    };
    let output_tokens = match payload.get("output_tokens").and_then(|v| v.as_u64()) {
        Some(n) => n,
        None => return Ok(false),
    };
    let task = payload
        .get("task")
        .and_then(|v| v.as_str())
        .unwrap_or(event_type)
        .to_string();
    let tier = payload
        .get("tier")
        .and_then(|v| v.as_str())
        .unwrap_or("standard")
        .to_string();
    let model = payload
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let dur = payload.get("duration_ms").and_then(|v| v.as_u64());

    let (rate_in, rate_out) = tier_rates(&tier);
    let cost_usd =
        (input_tokens as f64 / 1000.0) * rate_in + (output_tokens as f64 / 1000.0) * rate_out;
    let cost_usd = (cost_usd * 1_000_000.0).round() / 1_000_000.0;

    let entry = CostEntry {
        id: Uuid::new_v4().to_string(),
        ts: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        task,
        tier,
        model,
        input_tokens,
        output_tokens,
        cost_usd,
        duration_ms: dur,
    };
    let root = std::env::current_dir().context("cannot resolve cost ledger project root")?;
    append_entry_at(&root, &entry)?;
    Ok(true)
}

pub fn cmd_cost_log(
    task: String,
    tier: String,
    model: String,
    input_tokens: u64,
    output_tokens: u64,
    duration_ms: Option<u64>,
) -> Result<()> {
    let (rate_in, rate_out) = tier_rates(&tier);
    let cost_usd =
        (input_tokens as f64 / 1000.0) * rate_in + (output_tokens as f64 / 1000.0) * rate_out;
    let cost_usd = (cost_usd * 1_000_000.0).round() / 1_000_000.0;
    let entry = CostEntry {
        id: Uuid::new_v4().to_string(),
        ts: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        task,
        tier,
        model,
        input_tokens,
        output_tokens,
        cost_usd,
        duration_ms,
    };
    let root = std::env::current_dir().context("cannot resolve cost ledger project root")?;
    append_entry_at(&root, &entry)?;
    println!(
        "✓ logged  ${cost_usd:.6}  ({} in + {} out)",
        entry.input_tokens, entry.output_tokens
    );
    Ok(())
}

pub fn cmd_cost_show() -> Result<()> {
    let root = std::env::current_dir().context("cannot resolve project root")?;
    let policy = read_cost_policy(&root)?.unwrap_or_else(default_policy);
    print!("Cost policy — daily: ${:.4}", policy.daily_budget_usd);
    match policy.monthly_budget_usd {
        Some(monthly) => println!(" · monthly: ${monthly:.4}"),
        None => println!(" · monthly: not enforced"),
    }

    let entries = read_ledger();
    if entries.is_empty() {
        println!("No cost data.\nLog with: yana-rt cost log <task> <tier> <model> <in> <out>");
        return Ok(());
    }
    let total_cost: f64 = entries.iter().map(|e| e.cost_usd).sum();
    let total_tok: u64 = entries
        .iter()
        .map(|e| e.input_tokens + e.output_tokens)
        .sum();

    println!("Cost Summary  ({} calls)", entries.len());
    println!("{}", "─".repeat(54));
    for tier in &["fast", "standard", "strong"] {
        let te: Vec<&CostEntry> = entries.iter().filter(|e| e.tier == *tier).collect();
        if te.is_empty() {
            continue;
        }
        let tc: f64 = te.iter().map(|e| e.cost_usd).sum();
        let tt: u64 = te.iter().map(|e| e.input_tokens + e.output_tokens).sum();
        println!(
            "  {:<10}  {:>4} calls  {:>9} tok  ${tc:.6}",
            tier,
            te.len(),
            tt
        );
    }
    println!("{}", "─".repeat(54));
    println!(
        "  TOTAL       {:>4} calls  {:>9} tok  ${total_cost:.6}",
        entries.len(),
        total_tok
    );
    Ok(())
}

pub fn cmd_cost_breakdown(by: String) {
    let entries = read_ledger();
    if entries.is_empty() {
        println!("No cost data.");
        return;
    }

    let mut groups: HashMap<String, (u64, u64, u64, f64)> = HashMap::new();
    for e in &entries {
        let key = match by.as_str() {
            "model" => e.model.clone(),
            "task" => e.task.clone(),
            _ => e.tier.clone(),
        };
        let rec = groups.entry(key).or_insert((0, 0, 0, 0.0));
        rec.0 += 1;
        rec.1 += e.input_tokens;
        rec.2 += e.output_tokens;
        rec.3 += e.cost_usd;
    }
    let mut rows: Vec<(String, u64, u64, u64, f64)> = groups
        .into_iter()
        .map(|(k, (calls, tin, tout, cost))| (k, calls, tin, tout, cost))
        .collect();
    rows.sort_by(|a, b| b.4.partial_cmp(&a.4).unwrap_or(std::cmp::Ordering::Equal));

    println!("Breakdown by {by}");
    println!(
        "{:<26} {:>6} {:>11} {:>12}",
        "NAME", "CALLS", "TOKENS", "COST USD"
    );
    println!("{}", "─".repeat(58));
    for (name, calls, tin, tout, cost) in &rows {
        println!("{:<26} {:>6} {:>11} ${cost:.6}", name, calls, tin + tout);
    }
    let total: f64 = rows.iter().map(|r| r.4).sum();
    println!("{}", "─".repeat(58));
    println!(
        "{:<26} {:>6} {:>11} ${total:.6}",
        "TOTAL",
        rows.iter().map(|r| r.1).sum::<u64>(),
        rows.iter().map(|r| r.2 + r.3).sum::<u64>()
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> PathBuf {
        std::env::temp_dir().join(format!("yana-cost-{}", Uuid::new_v4()))
    }

    /// f64 subtraction of decimal literals (e.g. 5.0 - 3.70 - 0.40) rarely
    /// lands on an exact binary representation of the "obvious" result —
    /// asserting with `==` against a literal is fragile for that reason, not
    /// a real behavior bug. Compare within a tolerance tighter than anything
    /// this module ever displays (`${:.4}`).
    fn assert_close(actual: Option<f64>, expected: f64, msg: &str) {
        match actual {
            Some(value) => assert!((value - expected).abs() < 1e-9, "{msg}: expected ~{expected}, got {value}"),
            None => panic!("{msg}: expected Some(~{expected}), got None"),
        }
    }

    fn entry(ts: &str, cost_usd: f64) -> CostEntry {
        CostEntry {
            id: Uuid::new_v4().to_string(),
            ts: ts.to_string(),
            task: "test".to_string(),
            tier: "standard".to_string(),
            model: "mock".to_string(),
            input_tokens: 1,
            output_tokens: 1,
            cost_usd,
            duration_ms: None,
        }
    }

    #[test]
    fn strict_daily_cost_uses_only_requested_day() {
        let root = root();
        let path = ledger_path_for(&root);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let lines = [
            serde_json::to_string(&entry("2026-08-11T01:00:00Z", 0.25)).unwrap(),
            serde_json::to_string(&entry("2026-08-10T23:00:00Z", 9.0)).unwrap(),
            serde_json::to_string(&entry("2026-08-11T02:00:00Z", 0.75)).unwrap(),
        ];
        fs::write(&path, format!("{}\n", lines.join("\n"))).unwrap();
        let now = DateTime::parse_from_rfc3339("2026-08-11T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        assert_eq!(daily_cost_usd(&root, now).unwrap(), 1.0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn strict_reader_rejects_corruption() {
        let root = root();
        let path = ledger_path_for(&root);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "not-json\n").unwrap();
        let error = read_ledger_strict(&root).unwrap_err().to_string();
        assert!(error.contains("invalid cost ledger entry"));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn strict_reader_rejects_symlink() {
        use std::os::unix::fs::symlink;

        let root = root();
        let path = ledger_path_for(&root);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let target = root.join("outside-ledger");
        fs::write(&target, "").unwrap();
        symlink(&target, &path).unwrap();
        let error = read_ledger_strict(&root).unwrap_err().to_string();
        assert!(error.contains("must be a regular file"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn concurrent_appends_preserve_every_json_line() {
        use std::sync::Arc;

        let root = Arc::new(root());
        for round in 0..10 {
            let handles: Vec<_> = (0..32)
                .map(|worker| {
                    let root = Arc::clone(&root);
                    std::thread::spawn(move || {
                        let mut item = entry("2026-08-11T12:00:00Z", 0.001);
                        item.id = format!("{round}-{worker}");
                        append_entry_at(&root, &item).unwrap();
                    })
                })
                .collect();
            for handle in handles {
                handle.join().unwrap();
            }
        }
        let text = fs::read_to_string(ledger_path_for(&root)).unwrap();
        let parsed: Vec<CostEntry> = text
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert_eq!(parsed.len(), 320);
        let ids: std::collections::HashSet<_> = parsed.iter().map(|item| &item.id).collect();
        assert_eq!(ids.len(), 320);
        fs::remove_dir_all(root.as_ref()).unwrap();
    }

    #[test]
    fn recommendation_uses_fast_lane_for_simple_work() {
        let recommendation = recommend("explain this Rust module", 0.10, 5.0);
        assert_eq!(recommendation.recommended_tier, "fast");
        assert!(!recommendation.requires_confirmation);
    }

    #[test]
    fn recommendation_defers_complex_work_when_daily_budget_is_exhausted() {
        let recommendation = recommend("implement a memory router", 5.0, 5.0);
        assert_eq!(recommendation.recommended_tier, "defer");
        assert!(recommendation.requires_confirmation);
    }

    #[test]
    fn recommendation_never_sends_sovereign_context_to_cloud() {
        let recommendation = recommend("chỉ model local xử lý ghi chú này", 0.0, 5.0);
        assert_eq!(recommendation.recommended_tier, "local");
        assert_eq!(recommendation.model_scope, "local-only");
    }

    #[test]
    fn provider_plan_prefers_glm_for_fast_when_configured() {
        let recommendation = recommend("summarize this note", 0.0, 5.0);
        let plan = provider_plan(recommendation, |provider| provider == "glm");
        assert_eq!(plan.provider.as_deref(), Some("glm"));
        assert_eq!(plan.readiness, "credential present in environment");
    }

    #[test]
    fn sovereign_provider_plan_never_selects_cloud_candidate() {
        let recommendation = recommend("chỉ model local xử lý ghi chú này", 0.0, 5.0);
        let plan = provider_plan(recommendation, |provider| provider == "anthropic");
        assert!(plan.provider.is_none());
        assert_eq!(plan.fallback_providers[0], "ollama");
    }

    #[test]
    fn keyless_ollama_is_honestly_marked_unprobed() {
        let recommendation = recommend("explain a Rust module", 0.0, 5.0);
        let plan = provider_plan(recommendation, |provider| provider == "ollama");
        assert_eq!(plan.provider.as_deref(), Some("ollama"));
        assert_eq!(plan.readiness, "local runtime unprobed");
    }

    #[test]
    fn budget_guard_blocks_a_projected_overrun() {
        let decision = budget_guard("review a PR", 4.90, 5.0, 0.20, 0.0, None);
        assert_eq!(decision.status, "block");
        assert!(decision.requires_confirmation);
        assert_eq!(decision.budget_remaining_after_usd, Some(0.0));
    }

    #[test]
    fn budget_guard_warns_before_but_not_over_the_limit() {
        let decision = budget_guard("review a PR", 3.70, 5.0, 0.40, 0.0, None);
        assert_eq!(decision.status, "warn");
        assert!(decision.requires_confirmation);
        assert_close(decision.budget_remaining_after_usd, 0.9, "daily remaining");
    }

    #[test]
    fn budget_guard_is_honest_when_no_budget_is_configured() {
        let decision = budget_guard("review a PR", 30.0, 0.0, 1.0, 0.0, None);
        assert_eq!(decision.status, "unbounded");
        assert_eq!(decision.budget_remaining_after_usd, None);
    }

    #[test]
    fn budget_guard_blocks_on_a_monthly_overrun_even_when_daily_is_fine() {
        // Daily: well under budget. Monthly: this call would exceed it.
        let decision = budget_guard("review a PR", 0.50, 5.0, 0.10, 99.95, Some(100.0));
        assert_eq!(decision.status, "block");
        assert!(decision.requires_confirmation);
        assert!(decision.reason.contains("monthly"));
        assert_eq!(decision.monthly_budget_remaining_after_usd, Some(0.0));
        // Daily ceiling is untouched by the monthly trip.
        assert_eq!(decision.budget_remaining_after_usd, Some(4.40));
    }

    #[test]
    fn budget_guard_warns_on_monthly_approaching_limit() {
        let decision = budget_guard("review a PR", 0.10, 5.0, 0.10, 82.0, Some(100.0));
        assert_eq!(decision.status, "warn");
        assert_close(decision.monthly_budget_remaining_after_usd, 17.90, "monthly remaining");
    }

    #[test]
    fn budget_guard_treats_unset_monthly_budget_as_unenforced() {
        // Daily unbounded (0.0) and monthly not configured (None) -> fully unbounded.
        let decision = budget_guard("review a PR", 30.0, 0.0, 1.0, 500.0, None);
        assert_eq!(decision.status, "unbounded");
        assert_eq!(decision.monthly_budget_remaining_after_usd, None);
    }

    #[test]
    fn budget_guard_allows_when_both_ceilings_have_headroom() {
        let decision = budget_guard("review a PR", 1.0, 5.0, 0.10, 10.0, Some(100.0));
        assert_eq!(decision.status, "allow");
        assert!(!decision.requires_confirmation);
        assert_eq!(decision.budget_remaining_after_usd, Some(3.90));
        assert_eq!(decision.monthly_budget_remaining_after_usd, Some(89.90));
    }

    #[test]
    fn write_then_read_cost_policy_round_trips() {
        let root = root();
        let policy = CostPolicy { daily_budget_usd: 12.5, monthly_budget_usd: Some(200.0) };
        write_cost_policy(&root, &policy).unwrap();
        let read_back = read_cost_policy(&root).unwrap().expect("policy should exist after write");
        assert_eq!(read_back, policy);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn effective_policy_override_changes_only_the_daily_figure() {
        let root = root();
        let policy = CostPolicy { daily_budget_usd: 12.5, monthly_budget_usd: Some(200.0) };
        write_cost_policy(&root, &policy).unwrap();

        // No override -> persisted values untouched.
        assert_eq!(effective_policy(&root, None).unwrap(), policy);

        // Override changes only daily; monthly stays whatever was persisted.
        let overridden = effective_policy(&root, Some(1.0)).unwrap();
        assert_eq!(overridden.daily_budget_usd, 1.0);
        assert_eq!(overridden.monthly_budget_usd, Some(200.0));

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn effective_policy_falls_back_to_default_when_nothing_is_persisted() {
        let root = root();
        let policy = effective_policy(&root, None).unwrap();
        assert_eq!(policy.daily_budget_usd, DEFAULT_DAILY_BUDGET_USD);
        assert_eq!(policy.monthly_budget_usd, None);
    }

    #[test]
    fn write_cost_policy_rejects_a_negative_daily_budget() {
        let root = root();
        let policy = CostPolicy { daily_budget_usd: -1.0, monthly_budget_usd: None };
        let error = write_cost_policy(&root, &policy).unwrap_err().to_string();
        assert!(error.contains("non-negative"));
        // Must not have written a malformed policy file.
        assert!(read_cost_policy(&root).unwrap().is_none());
    }

    #[test]
    fn read_cost_policy_rejects_an_invalid_hand_edited_file() {
        let root = root();
        let path = policy_path_for(&root);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, br#"{"daily_budget_usd": -5.0}"#).unwrap();
        let error = read_cost_policy(&root).unwrap_err().to_string();
        assert!(error.contains("non-negative"));
        fs::remove_dir_all(&root).unwrap();
    }
}
