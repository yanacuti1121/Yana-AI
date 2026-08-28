//! Capability Lease (Milestone "Authority Depth", P0): a time-boxed,
//! scope-boxed, budget-boxed delegation that lets a subagent satisfy a
//! `HumanApprovalPerCall` capability's approval gate without a human
//! clicking every single call.
//!
//! Locked invariant: a lease is evidence supplied *to*
//! [`crate::runtime::authority`], never a cached authority decision.
//! [`LeaseStore::try_consume_matching`] re-checks expiry, revocation, and
//! budget on every call — a lease issued before a HALT or policy change
//! does not survive it, because the caller (`capability_decision`) always
//! runs its own HALT/registry/availability checks first, unconditionally,
//! regardless of what this module returns.

use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Lease {
    pub id: String,
    pub subject: String,
    pub capability: String,
    pub repo_root: PathBuf,
    pub allow: Vec<String>,
    pub deny: Vec<String>,
    pub issued_by: String,
    pub issued_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub invocation_budget: Option<u32>,
    pub remaining: Option<u32>,
    pub revoked: bool,
}

fn leases_path(root: &Path) -> PathBuf {
    root.join(".yana-ai").join("leases.json")
}

/// Mirrors `cost.rs`'s `read_cost_policy`: a missing file is an empty
/// list, but a malformed file is a hard error — a corrupt lease store must
/// never silently degrade into "no leases exist" in either direction
/// (that would either strand an operator's real leases or, worse, make an
/// authority check believe leases are exhausted when the file just failed
/// to parse).
fn read_leases(root: &Path) -> Result<Vec<Lease>> {
    let path = leases_path(root);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(error).with_context(|| format!("cannot inspect lease store {}", path.display()))
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        bail!("lease store must be a regular file: {}", path.display());
    }
    let raw = fs::read_to_string(&path)
        .with_context(|| format!("cannot read lease store {}", path.display()))?;
    let leases: Vec<Lease> = serde_json::from_str(&raw)
        .with_context(|| format!("lease store is invalid JSON: {}", path.display()))?;
    Ok(leases)
}

fn write_leases(root: &Path, leases: &[Lease]) -> Result<()> {
    let path = leases_path(root);
    let parent = path.parent().expect("lease store path has parent");
    fs::create_dir_all(parent)
        .with_context(|| format!("cannot create lease store directory {}", parent.display()))?;
    let temporary = path.with_extension(format!("json.tmp.{}", std::process::id()));
    fs::write(&temporary, serde_json::to_vec_pretty(leases)?)
        .with_context(|| format!("cannot write temporary lease store {}", temporary.display()))?;
    fs::rename(&temporary, &path)
        .with_context(|| format!("cannot replace lease store {}", path.display()))
}

/// Prefix match on the trimmed command text, matching the milestone doc's
/// own example (`cargo test | cargo fmt | cargo clippy` as prefixes, not a
/// full command grammar): `"cargo test"` in `allow` matches `cargo test
/// --release`, not only the exact string.
fn command_matches(entry: &str, command_text: &str) -> bool {
    command_text.trim().starts_with(entry.trim())
}

pub struct LeaseStore {
    root: PathBuf,
}

impl LeaseStore {
    pub fn for_root(root: &Path) -> Self {
        Self { root: root.to_path_buf() }
    }

    pub fn grant(
        &self,
        subject: String,
        capability: String,
        allow: Vec<String>,
        deny: Vec<String>,
        issued_by: String,
        expires_in_minutes: u64,
        invocation_budget: Option<u32>,
    ) -> Result<Lease> {
        if subject.trim().is_empty() {
            bail!("lease subject must not be empty");
        }
        if capability.trim().is_empty() {
            bail!("lease capability must not be empty");
        }
        let now = Utc::now();
        let lease = Lease {
            id: Uuid::new_v4().simple().to_string()[..8].to_string(),
            subject,
            capability,
            repo_root: self.root.clone(),
            allow,
            deny,
            issued_by,
            issued_at: now,
            expires_at: now + chrono::Duration::minutes(expires_in_minutes as i64),
            invocation_budget,
            remaining: invocation_budget,
            revoked: false,
        };
        let mut leases = read_leases(&self.root)?;
        leases.push(lease.clone());
        write_leases(&self.root, &leases)?;
        Ok(lease)
    }

    pub fn revoke(&self, id: &str) -> Result<()> {
        let mut leases = read_leases(&self.root)?;
        let Some(lease) = leases.iter_mut().find(|lease| lease.id == id) else {
            bail!("no lease with id '{id}'");
        };
        lease.revoked = true;
        write_leases(&self.root, &leases)
    }

    pub fn list(&self) -> Result<Vec<Lease>> {
        read_leases(&self.root)
    }

    /// The one method `RuntimeAuthority::capability_decision` calls.
    /// Returns `Ok(true)` only when a matching, currently-valid lease was
    /// found and its budget was consumed; `Ok(false)` otherwise (no
    /// matching lease — the caller falls through to the existing
    /// human-approval path unchanged). Never trusts a caller-held `Lease`
    /// value — always re-reads and re-validates expiry/revocation/budget
    /// against what is on disk right now.
    pub fn try_consume_matching(
        &self,
        subject: &str,
        capability: &str,
        repo_root: &Path,
        command_text: Option<&str>,
    ) -> Result<bool> {
        let mut leases = read_leases(&self.root)?;
        let now = Utc::now();
        let Some(lease) = leases.iter_mut().find(|lease| {
            !lease.revoked
                && lease.subject == subject
                && lease.capability == capability
                && lease.repo_root == repo_root
                && lease.expires_at > now
                && lease.remaining.is_none_or(|remaining| remaining > 0)
                && match command_text {
                    Some(text) => {
                        !lease.deny.iter().any(|entry| command_matches(entry, text))
                            && lease.allow.iter().any(|entry| command_matches(entry, text))
                    }
                    None => true,
                }
        }) else {
            return Ok(false);
        };
        if let Some(remaining) = lease.remaining.as_mut() {
            *remaining -= 1;
        }
        write_leases(&self.root, &leases)?;
        Ok(true)
    }
}

// ── CLI-facing wrappers ──────────────────────────────────────────────────────
// Mirror `cost.rs`'s `cmd_cost_*` convention exactly: resolve the project
// root from the current directory, do the work, print plain text or `--json`.

pub fn cmd_lease_grant(
    subject: String,
    capability: String,
    allow: Vec<String>,
    deny: Vec<String>,
    expires_in_minutes: u64,
    invocation_budget: Option<u32>,
    json: bool,
) -> Result<()> {
    let root = std::env::current_dir().context("cannot resolve project root")?;
    let lease = LeaseStore::for_root(&root).grant(
        subject,
        capability,
        allow,
        deny,
        "human".into(),
        expires_in_minutes,
        invocation_budget,
    )?;
    if json {
        println!("{}", serde_json::to_string_pretty(&lease)?);
    } else {
        println!("Lease #{} granted:", lease.id);
        println!("  subject:    {}", lease.subject);
        println!("  capability: {}", lease.capability);
        println!("  allow:      {}", lease.allow.join(", "));
        if !lease.deny.is_empty() {
            println!("  deny:       {}", lease.deny.join(", "));
        }
        println!("  expires at: {}", lease.expires_at);
        match lease.invocation_budget {
            Some(budget) => println!("  budget:     {budget} invocations"),
            None => println!("  budget:     unlimited"),
        }
    }
    Ok(())
}

pub fn cmd_lease_list(json: bool) -> Result<()> {
    let root = std::env::current_dir().context("cannot resolve project root")?;
    let leases = LeaseStore::for_root(&root).list()?;
    if json {
        println!("{}", serde_json::to_string_pretty(&leases)?);
        return Ok(());
    }
    if leases.is_empty() {
        println!("No leases.");
        return Ok(());
    }
    let now = Utc::now();
    for lease in &leases {
        let status = if lease.revoked {
            "revoked"
        } else if lease.expires_at <= now {
            "expired"
        } else if lease.remaining == Some(0) {
            "budget exhausted"
        } else {
            "active"
        };
        println!(
            "#{}  {}  {} → {}  [{status}]",
            lease.id, lease.subject, lease.capability, lease.allow.join(", ")
        );
    }
    Ok(())
}

pub fn cmd_lease_revoke(id: String, json: bool) -> Result<()> {
    let root = std::env::current_dir().context("cannot resolve project root")?;
    LeaseStore::for_root(&root).revoke(&id)?;
    if json {
        println!("{}", serde_json::json!({ "revoked": id }));
    } else {
        println!("Lease #{id} revoked.");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yana-lease-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn grant_test_lease(store: &LeaseStore, budget: Option<u32>) -> Lease {
        store
            .grant(
                "agent:test-fixer".into(),
                "command.execute".into(),
                vec!["cargo test".into(), "cargo clippy".into()],
                vec!["git push".into()],
                "human".into(),
                20,
                budget,
            )
            .unwrap()
    }

    #[test]
    fn grant_and_list_round_trip() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        let granted = grant_test_lease(&store, Some(10));
        let listed = store.list().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, granted.id);
        assert_eq!(listed[0].remaining, Some(10));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn matching_lease_is_consumed_and_decrements_budget() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        grant_test_lease(&store, Some(2));

        let ok = store
            .try_consume_matching("agent:test-fixer", "command.execute", &root, Some("cargo test --release"))
            .unwrap();
        assert!(ok);
        assert_eq!(store.list().unwrap()[0].remaining, Some(1));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn wrong_subject_does_not_match() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        grant_test_lease(&store, None);

        let ok = store
            .try_consume_matching("agent:someone-else", "command.execute", &root, Some("cargo test"))
            .unwrap();
        assert!(!ok);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn wrong_capability_does_not_match() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        grant_test_lease(&store, None);

        let ok = store
            .try_consume_matching("agent:test-fixer", "repo.search", &root, None)
            .unwrap();
        assert!(!ok);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn wrong_repo_root_does_not_match() {
        let root = temp_root();
        let other_root = temp_root();
        let store = LeaseStore::for_root(&root);
        grant_test_lease(&store, None);

        let ok = store
            .try_consume_matching("agent:test-fixer", "command.execute", &other_root, Some("cargo test"))
            .unwrap();
        assert!(!ok);
        fs::remove_dir_all(&root).ok();
        fs::remove_dir_all(&other_root).ok();
    }

    #[test]
    fn expired_lease_does_not_match() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        let mut leases = vec![Lease {
            id: "expired1".into(),
            subject: "agent:test-fixer".into(),
            capability: "command.execute".into(),
            repo_root: root.clone(),
            allow: vec!["cargo test".into()],
            deny: vec![],
            issued_by: "human".into(),
            issued_at: Utc::now() - chrono::Duration::minutes(30),
            expires_at: Utc::now() - chrono::Duration::minutes(10),
            invocation_budget: None,
            remaining: None,
            revoked: false,
        }];
        write_leases(&root, &mut leases.drain(..).collect::<Vec<_>>()).unwrap();

        let ok = store
            .try_consume_matching("agent:test-fixer", "command.execute", &root, Some("cargo test"))
            .unwrap();
        assert!(!ok);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn exhausted_budget_does_not_match() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        let granted = grant_test_lease(&store, Some(1));
        assert!(store
            .try_consume_matching("agent:test-fixer", "command.execute", &root, Some("cargo test"))
            .unwrap());
        assert!(!store
            .try_consume_matching("agent:test-fixer", "command.execute", &root, Some("cargo test"))
            .unwrap());
        assert_eq!(store.list().unwrap()[0].id, granted.id);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn revoked_lease_does_not_match() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        let granted = grant_test_lease(&store, None);
        store.revoke(&granted.id).unwrap();

        let ok = store
            .try_consume_matching("agent:test-fixer", "command.execute", &root, Some("cargo test"))
            .unwrap();
        assert!(!ok);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn command_not_in_allow_list_does_not_match() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        grant_test_lease(&store, None);

        let ok = store
            .try_consume_matching("agent:test-fixer", "command.execute", &root, Some("rm -rf /"))
            .unwrap();
        assert!(!ok);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn deny_wins_even_when_command_also_matches_allow() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        store
            .grant(
                "agent:test-fixer".into(),
                "command.execute".into(),
                vec!["cargo".into()],
                vec!["cargo publish".into()],
                "human".into(),
                20,
                None,
            )
            .unwrap();

        let ok = store
            .try_consume_matching("agent:test-fixer", "command.execute", &root, Some("cargo publish --dry-run"))
            .unwrap();
        assert!(!ok, "deny entry must win even though 'cargo' in allow also matches");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn corrupt_lease_store_is_a_hard_error_not_a_silent_empty_list() {
        let root = temp_root();
        fs::create_dir_all(root.join(".yana-ai")).unwrap();
        fs::write(leases_path(&root), b"not valid json").unwrap();

        let result = LeaseStore::for_root(&root).list();
        assert!(result.is_err());
        fs::remove_dir_all(&root).ok();
    }
}
