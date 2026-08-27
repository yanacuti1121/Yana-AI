//! Local-first research ledger.
//!
//! A research entry is a claim with an inspectable source and the day it was
//! observed. This records evidence; it deliberately does not fetch pages,
//! summarize a source, or turn a URL into a truth claim.

use clap::Subcommand;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::net::ToSocketAddrs;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Subcommand)]
pub enum ResearchAction {
    /// Save a claim with a URL that a human or agent can inspect later
    Add {
        claim: String,
        #[arg(long)]
        source: String,
        #[arg(long)]
        title: Option<String>,
        #[arg(long, default_value = "medium")]
        confidence: String,
        #[arg(long)]
        tag: Vec<String>,
    },
    /// List evidence records, optionally narrowed by lexical query
    List {
        #[arg(long)]
        query: Option<String>,
        #[arg(long)]
        json: bool,
    },
    /// Show a single source-backed claim
    Show { id: String },
    /// Produce a bounded evidence brief; does not synthesize unsupported conclusions
    Brief {
        question: String,
        #[arg(long, default_value_t = 8)]
        limit: usize,
        #[arg(long)]
        json: bool,
    },
    /// Assess whether matching records are fresh enough to support a review
    Assess {
        question: String,
        #[arg(long, default_value_t = 30)]
        max_age_days: i64,
        #[arg(long, default_value_t = 8)]
        limit: usize,
        #[arg(long)]
        json: bool,
    },
    /// Flag source-backed claims whose observation date is older than the threshold
    Audit {
        #[arg(long, default_value_t = 30)]
        max_age_days: i64,
        #[arg(long)]
        json: bool,
    },
    /// Check whether a source URL responds; never changes claim freshness or content
    Probe { id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ResearchRecord {
    pub id: String,
    pub claim: String,
    pub source: String,
    pub title: Option<String>,
    pub confidence: String,
    pub tags: Vec<String>,
    pub observed_at: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct ResearchStore {
    #[serde(default)]
    records: Vec<ResearchRecord>,
}

fn path() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
        .join(".yana-ai").join("research.json")
}

fn load() -> Result<ResearchStore, String> {
    let file = path();
    if !file.exists() { return Ok(ResearchStore::default()); }
    serde_json::from_str(&fs::read_to_string(file).map_err(|e| e.to_string())?)
        .map_err(|e| format!("research ledger is invalid JSON: {e}"))
}

fn save(store: &ResearchStore) -> Result<(), String> {
    let file = path();
    let parent = file.parent().expect("research path has parent");
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let tmp = file.with_extension(format!("json.tmp.{}", std::process::id()));
    fs::write(&tmp, serde_json::to_vec_pretty(store).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    fs::rename(tmp, file).map_err(|e| e.to_string())
}

fn valid_source(value: &str) -> bool {
    let Some((scheme, rest)) = value.split_once("://") else { return false; };
    matches!(scheme, "https" | "http")
        && !rest.is_empty()
        && !rest.starts_with('/')
        && !rest.chars().any(char::is_whitespace)
}

fn is_safe_to_persist(value: &str) -> bool {
    matches!(crate::route::classify_sensitivity(value).0, crate::route::Sensitivity::Public | crate::route::Sensitivity::Internal)
}

fn query_terms(value: &str) -> Vec<String> {
    value.split(|c: char| !c.is_alphanumeric())
        .filter(|term| term.chars().count() >= 2)
        .map(str::to_lowercase)
        .collect()
}

pub fn rank(records: &[ResearchRecord], query: &str, limit: usize) -> Vec<ResearchRecord> {
    let terms = query_terms(query);
    let mut ranked: Vec<(usize, &ResearchRecord)> = records.iter().filter_map(|record| {
        let haystack = format!("{} {} {} {}", record.claim, record.source, record.title.as_deref().unwrap_or(""), record.tags.join(" ")).to_lowercase();
        let score = terms.iter().filter(|term| haystack.contains(term.as_str())).count();
        (score > 0).then_some((score, record))
    }).collect();
    ranked.sort_by(|(left_score, left), (right_score, right)| right_score.cmp(left_score)
        .then_with(|| right.observed_at.cmp(&left.observed_at))
        .then_with(|| left.id.cmp(&right.id)));
    ranked.into_iter().take(limit).map(|(_, item)| item.clone()).collect()
}

pub fn dispatch(action: ResearchAction) {
    let result = match action {
        ResearchAction::Add { claim, source, title, confidence, tag } => cmd_add(claim, source, title, confidence, tag),
        ResearchAction::List { query, json } => cmd_list(query.as_deref(), json),
        ResearchAction::Show { id } => cmd_show(&id),
        ResearchAction::Brief { question, limit, json } => cmd_brief(&question, limit, json),
        ResearchAction::Assess { question, max_age_days, limit, json } => cmd_assess(&question, max_age_days, limit, json),
        ResearchAction::Audit { max_age_days, json } => cmd_audit(max_age_days, json),
        ResearchAction::Probe { id } => cmd_probe(&id),
    };
    if let Err(error) = result {
        eprintln!("yana-rt research: {error}");
        std::process::exit(2);
    }
}

fn cmd_add(claim: String, source: String, title: Option<String>, confidence: String, tags: Vec<String>) -> Result<(), String> {
    if claim.trim().is_empty() { return Err("claim cannot be empty".into()); }
    if !valid_source(&source) { return Err("source must be an http(s) URL without whitespace".into()); }
    if !is_safe_to_persist(&format!("{claim} {source} {}", title.as_deref().unwrap_or(""))) {
        return Err("refusing to persist confidential or sovereign research content".into());
    }
    let mut store = load()?;
    let record = ResearchRecord {
        id: Uuid::new_v4().to_string(), claim, source, title, confidence, tags,
        observed_at: Utc::now().format("%Y-%m-%d").to_string(),
    };
    store.records.push(record.clone());
    save(&store)?;
    println!("stored research:{}\n  observed: {}\n  source: {}", &record.id[..8], record.observed_at, record.source);
    Ok(())
}

fn cmd_list(query: Option<&str>, json: bool) -> Result<(), String> {
    let store = load()?;
    let records = query.map(|query| rank(&store.records, query, usize::MAX)).unwrap_or(store.records);
    if json { println!("{}", serde_json::to_string_pretty(&records).map_err(|e| e.to_string())?); return Ok(()); }
    if records.is_empty() { println!("No research records."); return Ok(()); }
    for record in records { println!("{}  [{}] {}\n  {}", &record.id[..8], record.observed_at, record.claim, record.source); }
    Ok(())
}

fn cmd_show(prefix: &str) -> Result<(), String> {
    let store = load()?;
    let matches: Vec<_> = store.records.iter().filter(|record| record.id.starts_with(prefix)).collect();
    if matches.len() != 1 { return Err(format!("expected one research record matching '{prefix}', found {}", matches.len())); }
    println!("{}", serde_json::to_string_pretty(matches[0]).map_err(|e| e.to_string())?);
    Ok(())
}

fn cmd_brief(question: &str, limit: usize, json: bool) -> Result<(), String> {
    let records = rank(&load()?.records, question, limit);
    if json {
        println!("{}", serde_json::to_string_pretty(&serde_json::json!({"question": question, "sources": records})).map_err(|e| e.to_string())?);
        return Ok(());
    }
    println!("Research evidence for: {question}");
    if records.is_empty() { println!("No matching source-backed claims."); }
    for record in records { println!("- [{} | {}] {}\n  Source: {}", record.confidence, record.observed_at, record.claim, record.source); }
    Ok(())
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
struct AssessedResearchRecord {
    record: ResearchRecord,
    age_days: i64,
    freshness: &'static str,
    confidence_recognized: bool,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
struct ResearchAssessment {
    question: String,
    max_age_days: i64,
    verdict: &'static str,
    caveat: &'static str,
    records: Vec<AssessedResearchRecord>,
}

fn recognized_confidence(value: &str) -> bool {
    matches!(value.trim().to_ascii_lowercase().as_str(), "low" | "medium" | "high")
}

fn assess_records(records: &[ResearchRecord], today: chrono::NaiveDate, max_age_days: i64) -> Vec<AssessedResearchRecord> {
    records.iter().map(|record| {
        let age_days = chrono::NaiveDate::parse_from_str(&record.observed_at, "%Y-%m-%d")
            .map(|observed| (today - observed).num_days())
            .unwrap_or(i64::MAX);
        let confidence_recognized = recognized_confidence(&record.confidence);
        let freshness = if age_days > max_age_days { "stale" } else if !confidence_recognized { "unrated" } else { "fresh" };
        AssessedResearchRecord { record: record.clone(), age_days, freshness, confidence_recognized }
    }).collect()
}

fn assessment_verdict(records: &[AssessedResearchRecord]) -> &'static str {
    if records.is_empty() || !records.iter().any(|record| record.freshness == "fresh") {
        "insufficient-fresh-evidence"
    } else if records.iter().any(|record| record.freshness != "fresh") {
        "needs-review"
    } else {
        "ready-for-review"
    }
}

fn cmd_assess(question: &str, max_age_days: i64, limit: usize, json: bool) -> Result<(), String> {
    if max_age_days < 0 { return Err("max-age-days must be non-negative".into()); }
    let ranked = rank(&load()?.records, question, limit);
    let records = assess_records(&ranked, Utc::now().date_naive(), max_age_days);
    let assessment = ResearchAssessment {
        question: question.into(),
        max_age_days,
        verdict: assessment_verdict(&records),
        caveat: "Fresh source-backed records support review only; they do not establish that a claim is true.",
        records,
    };
    if json {
        println!("{}", serde_json::to_string_pretty(&assessment).map_err(|error| error.to_string())?);
        return Ok(());
    }
    println!("Evidence assessment for: {}\nVerdict: {}", assessment.question, assessment.verdict);
    if assessment.records.is_empty() { println!("No matching source-backed records."); }
    for item in assessment.records {
        println!("- {} · {} days · {}\n  Source: {}", item.freshness, item.age_days, item.record.claim, item.record.source);
    }
    println!("Caveat: {}", assessment.caveat);
    Ok(())
}

#[derive(Debug, Serialize, PartialEq, Eq)]
struct ResearchAuditItem {
    record: ResearchRecord,
    age_days: i64,
}

fn stale_records(records: &[ResearchRecord], today: chrono::NaiveDate, max_age_days: i64) -> Vec<ResearchAuditItem> {
    records.iter().filter_map(|record| {
        let observed = chrono::NaiveDate::parse_from_str(&record.observed_at, "%Y-%m-%d").ok()?;
        let age_days = (today - observed).num_days();
        (age_days > max_age_days).then(|| ResearchAuditItem { record: record.clone(), age_days })
    }).collect()
}

fn cmd_audit(max_age_days: i64, json: bool) -> Result<(), String> {
    if max_age_days < 0 { return Err("max-age-days must be non-negative".into()); }
    let today = Utc::now().date_naive();
    let stale = stale_records(&load()?.records, today, max_age_days);
    if json {
        println!("{}", serde_json::to_string_pretty(&serde_json::json!({"today": today, "max_age_days": max_age_days, "stale": stale})).map_err(|e| e.to_string())?);
        return Ok(());
    }
    println!("Research freshness audit — older than {max_age_days} days");
    if stale.is_empty() { println!("No stale records. This is freshness only, not a validation of the claims."); }
    for item in stale { println!("- {} days · {}\n  Source: {}", item.age_days, item.record.claim, item.record.source); }
    Ok(())
}

fn public_https_host(source: &str) -> Result<String, String> {
    if !source.starts_with("https://") { return Err("probe accepts https sources only".into()); }
    let host = crate::design::extract_url_host(source).ok_or_else(|| "cannot extract source host".to_string())?;
    if host.is_empty() { return Err("source host cannot be empty".into()); }
    let resolved: Vec<_> = format!("{host}:443").to_socket_addrs()
        .map_err(|error| format!("DNS resolution failed for '{host}': {error}"))?.collect();
    if resolved.is_empty() { return Err(format!("DNS returned no addresses for '{host}'")); }
    if resolved.iter().any(|address| crate::design::is_private_ip(address.ip())) {
        return Err(format!("source host '{host}' resolves to a private or internal address"));
    }
    Ok(host.into())
}

fn cmd_probe(prefix: &str) -> Result<(), String> {
    let store = load()?;
    let matches: Vec<_> = store.records.iter().filter(|record| record.id.starts_with(prefix)).collect();
    if matches.len() != 1 { return Err(format!("expected one research record matching '{prefix}', found {}", matches.len())); }
    let record = matches[0];
    let host = public_https_host(&record.source)?;
    // Redirects are deliberately disabled: every destination would require a
    // fresh DNS/private-address check before contacting it.
    let config = ureq::Agent::config_builder()
        .max_redirects(0)
        .timeout_connect(Some(std::time::Duration::from_secs(10)))
        .timeout_recv_response(Some(std::time::Duration::from_secs(15)))
        .http_status_as_error(false)
        .build();
    let agent = ureq::Agent::new_with_config(config);
    let response = agent.head(&record.source)
        .header("User-Agent", "yana-rt research-probe")
        .call()
        .map_err(|error| format!("source probe failed for '{host}': {error}"))?;
    let status = response.status().as_u16();
    println!("source reachable: HTTP {status}\n  host: {host}\n  claim freshness unchanged — re-review the claim before changing observed_at");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(id: &str, claim: &str, source: &str, tags: &[&str]) -> ResearchRecord {
        ResearchRecord { id: id.into(), claim: claim.into(), source: source.into(), title: None, confidence: "medium".into(), tags: tags.iter().map(|tag| (*tag).into()).collect(), observed_at: "2026-08-27".into() }
    }

    #[test]
    fn only_accepts_non_whitespace_http_sources() {
        assert!(valid_source("https://example.com/report"));
        assert!(valid_source("http://localhost:3000/a"));
        assert!(!valid_source("file:///tmp/report"));
        assert!(!valid_source("https://example.com/a b"));
        assert!(!valid_source("example.com/report"));
    }

    #[test]
    fn ranks_claim_and_tags_transparently() {
        let records = vec![record("a", "GLM coding benchmark", "https://a.test", &["model"]), record("b", "Calendar update", "https://b.test", &["calendar"])];
        assert_eq!(rank(&records, "model benchmark", 1)[0].id, "a");
    }

    #[test]
    fn refuses_sensitive_content() {
        assert!(!is_safe_to_persist("client M&A confidential roadmap"));
        assert!(is_safe_to_persist("public Rust release notes"));
    }

    #[test]
    fn audit_only_flags_records_older_than_threshold() {
        let records = vec![
            ResearchRecord { observed_at: "2026-07-01".into(), ..record("old", "Old model release", "https://old.test", &[]) },
            ResearchRecord { observed_at: "2026-08-25".into(), ..record("recent", "Recent note", "https://recent.test", &[]) },
        ];
        let today = chrono::NaiveDate::from_ymd_opt(2026, 8, 27).unwrap();
        let stale = stale_records(&records, today, 10);
        assert_eq!(stale.len(), 1);
        assert_eq!(stale[0].record.id, "old");
    }

    #[test]
    fn assessment_requires_at_least_one_fresh_rated_record() {
        let today = chrono::NaiveDate::from_ymd_opt(2026, 8, 27).unwrap();
        let stale = ResearchRecord { observed_at: "2026-07-01".into(), ..record("old", "GLM pricing changed", "https://example.com/pricing", &["glm"]) };
        let unrated = ResearchRecord { confidence: "reported".into(), ..record("new", "GLM pricing changed", "https://example.com/pricing", &["glm"]) };
        let assessed = assess_records(&[stale, unrated], today, 30);
        assert_eq!(assessed.iter().map(|item| item.freshness).collect::<Vec<_>>(), vec!["stale", "unrated"]);
        assert_eq!(assessment_verdict(&assessed), "insufficient-fresh-evidence");
    }

    #[test]
    fn assessment_marks_mixed_freshness_for_review() {
        let today = chrono::NaiveDate::from_ymd_opt(2026, 8, 27).unwrap();
        let fresh = record("fresh", "Rust support", "https://example.com/rust", &["rust"]);
        let stale = ResearchRecord { observed_at: "2026-07-01".into(), ..record("old", "Rust support", "https://example.com/rust", &["rust"]) };
        let assessed = assess_records(&[fresh, stale], today, 30);
        assert_eq!(assessment_verdict(&assessed), "needs-review");
    }

    #[test]
    fn probe_rejects_plain_http_before_any_network_request() {
        assert!(public_https_host("http://example.com/claim").is_err());
    }
}
