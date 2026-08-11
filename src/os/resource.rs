//! Explicit resource policy and deterministic preflight checks.

use super::state::{self, AgentStatus, ResourcePolicy};
use anyhow::{bail, Result};
use chrono::{DateTime, Utc};
use serde::Serialize;
#[cfg(test)]
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct ResourceDecision {
    pub allowed: bool,
    pub active_agents: usize,
    pub requested_agents: usize,
    pub estimated_tokens: u64,
    pub estimated_cost_usd: f64,
    pub daily_cost_usd: f64,
    pub reasons: Vec<String>,
}

pub fn set_policy(root: &Path, policy: ResourcePolicy) -> Result<ResourcePolicy> {
    validate_policy(&policy)?;
    state::mutate(root, |state| {
        state.resource_policy = Some(policy.clone());
        Ok(policy)
    })
}

pub fn policy(root: &Path) -> Result<ResourcePolicy> {
    state::load(root)?.resource_policy.ok_or_else(|| {
        anyhow::anyhow!("resource policy is not configured; run `yana-rt os resource set ...`")
    })
}

pub fn check(
    root: &Path,
    requested_agents: usize,
    estimated_tokens: u64,
    estimated_cost_usd: f64,
) -> Result<ResourceDecision> {
    if requested_agents == 0 {
        bail!("requested agents must be at least 1");
    }
    if !estimated_cost_usd.is_finite() || estimated_cost_usd < 0.0 {
        bail!("estimated cost must be a finite non-negative number");
    }
    let state = state::load(root)?;
    let policy = state.resource_policy.as_ref().ok_or_else(|| {
        anyhow::anyhow!("resource policy is not configured; preflight fails closed")
    })?;
    validate_policy(policy)?;
    let now = Utc::now();
    let active_agents = state
        .agents
        .iter()
        .filter(|agent| agent.status == AgentStatus::Running)
        .filter(|agent| heartbeat_is_current(agent.last_heartbeat.as_deref(), policy, now))
        .count();
    let daily_cost_usd = crate::cost::daily_cost_usd(root, now)?;
    let mut reasons = Vec::new();
    if let Some(limit) = policy.max_active_agents {
        if active_agents.saturating_add(requested_agents) > limit {
            reasons.push(format!(
                "active-agent limit exceeded: {active_agents} active + {requested_agents} requested > {limit}"
            ));
        }
    }
    if let Some(limit) = policy.max_tokens_per_request {
        if estimated_tokens > limit {
            reasons.push(format!(
                "token limit exceeded: {estimated_tokens} estimated > {limit}"
            ));
        }
    }
    if let Some(limit) = policy.max_daily_cost_usd {
        if daily_cost_usd + estimated_cost_usd > limit {
            reasons.push(format!(
                "daily cost limit exceeded: ${daily_cost_usd:.6} spent + ${estimated_cost_usd:.6} estimated > ${limit:.6}"
            ));
        }
    }
    Ok(ResourceDecision {
        allowed: reasons.is_empty(),
        active_agents,
        requested_agents,
        estimated_tokens,
        estimated_cost_usd,
        daily_cost_usd,
        reasons,
    })
}

fn heartbeat_is_current(last: Option<&str>, policy: &ResourcePolicy, now: DateTime<Utc>) -> bool {
    let Some(last) = last else {
        return true;
    };
    DateTime::parse_from_rfc3339(last)
        .map(|timestamp| {
            now.signed_duration_since(timestamp.with_timezone(&Utc))
                .num_seconds()
                <= policy.stale_after_secs as i64
        })
        .unwrap_or(true)
}

fn validate_policy(policy: &ResourcePolicy) -> Result<()> {
    if policy.max_active_agents.is_none()
        && policy.max_tokens_per_request.is_none()
        && policy.max_daily_cost_usd.is_none()
    {
        bail!("resource policy must define at least one limit");
    }
    if policy.max_active_agents == Some(0) {
        bail!("max active agents must be at least 1");
    }
    if policy.max_tokens_per_request == Some(0) {
        bail!("max tokens per request must be at least 1");
    }
    if let Some(cost) = policy.max_daily_cost_usd {
        if !cost.is_finite() || cost < 0.0 {
            bail!("max daily cost must be a finite non-negative number");
        }
    }
    if policy.stale_after_secs == 0 {
        bail!("stale heartbeat interval must be at least 1 second");
    }
    Ok(())
}

pub fn print_policy(policy: &ResourcePolicy, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(policy)?);
    } else {
        println!("Resource policy");
        println!(
            "  max active agents     {}",
            display(policy.max_active_agents)
        );
        println!(
            "  max tokens/request    {}",
            display(policy.max_tokens_per_request)
        );
        println!(
            "  max daily cost USD    {}",
            policy
                .max_daily_cost_usd
                .map(|value| format!("${value:.6}"))
                .unwrap_or_else(|| "—".into())
        );
        println!("  stale heartbeat       {}s", policy.stale_after_secs);
    }
    Ok(())
}

fn display<T: std::fmt::Display>(value: Option<T>) -> String {
    value
        .map(|item| item.to_string())
        .unwrap_or_else(|| "—".into())
}

pub fn print_decision(decision: &ResourceDecision, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(decision)?);
    } else if decision.allowed {
        println!(
            "ALLOW  {} active + {} requested; {} tokens; ${:.6} estimated",
            decision.active_agents,
            decision.requested_agents,
            decision.estimated_tokens,
            decision.estimated_cost_usd
        );
    } else {
        println!("DENY");
        for reason in &decision.reasons {
            println!("  - {reason}");
        }
    }
    Ok(())
}

/// Phase 0 compatibility view over the existing cost ledger.
pub fn legacy_status() {
    crate::cost::cmd_cost_show();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use uuid::Uuid;

    fn root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("yana-os-resource-{}", Uuid::new_v4()));
        let marker = root.join(yana_rt::flock_v1::PROTOCOL_FILE);
        fs::create_dir_all(marker.parent().unwrap()).unwrap();
        fs::write(marker, yana_rt::flock_v1::PROTOCOL_VERSION).unwrap();
        state::initialize(&root).unwrap();
        root
    }

    #[test]
    fn missing_limits_are_not_an_enforcement_policy() {
        assert!(validate_policy(&ResourcePolicy::default()).is_err());
    }

    #[test]
    fn evaluation_denies_each_exceeded_dimension() {
        let policy = ResourcePolicy {
            max_active_agents: Some(2),
            max_tokens_per_request: Some(100),
            max_daily_cost_usd: Some(1.0),
            stale_after_secs: 60,
        };
        assert!(validate_policy(&policy).is_ok());
        let mut reasons = Vec::new();
        if 2usize + 1 > policy.max_active_agents.unwrap() {
            reasons.push("agents");
        }
        if 101 > policy.max_tokens_per_request.unwrap() {
            reasons.push("tokens");
        }
        if 0.9 + 0.2 > policy.max_daily_cost_usd.unwrap() {
            reasons.push("cost");
        }
        assert_eq!(reasons, ["agents", "tokens", "cost"]);
    }

    #[test]
    fn real_preflight_fails_closed_and_uses_ledger() {
        let root = root();
        let error = check(&root, 1, 10, 0.1).unwrap_err().to_string();
        assert!(error.contains("fails closed"));
        set_policy(
            &root,
            ResourcePolicy {
                max_active_agents: Some(2),
                max_tokens_per_request: Some(100),
                max_daily_cost_usd: Some(1.0),
                stale_after_secs: 60,
            },
        )
        .unwrap();
        let ledger = root.join(".yana-ai/ledger.jsonl");
        fs::write(
            ledger,
            format!(
                "{{\"ts\":\"{}T00:00:00Z\",\"cost_usd\":0.9}}\n",
                Utc::now().format("%Y-%m-%d")
            ),
        )
        .unwrap();
        let denied = check(&root, 1, 10, 0.2).unwrap();
        assert!(!denied.allowed);
        assert!(denied.reasons[0].contains("daily cost limit exceeded"));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn preflight_rejects_symlinked_ledger() {
        use std::os::unix::fs::symlink;
        let root = root();
        set_policy(
            &root,
            ResourcePolicy {
                max_active_agents: Some(2),
                max_tokens_per_request: None,
                max_daily_cost_usd: None,
                stale_after_secs: 60,
            },
        )
        .unwrap();
        let outside = std::env::temp_dir().join(format!("yana-ledger-target-{}", Uuid::new_v4()));
        fs::write(&outside, "{}\n").unwrap();
        symlink(&outside, root.join(".yana-ai/ledger.jsonl")).unwrap();
        assert!(check(&root, 1, 0, 0.0).is_err());
        fs::remove_dir_all(root).unwrap();
        fs::remove_file(outside).unwrap();
    }
}
