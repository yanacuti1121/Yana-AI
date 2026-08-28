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
//!
//! Atomicity (hardening pass, post-P0): every mutating operation
//! (`grant`/`revoke`/`try_consume_matching`) runs its entire
//! read-modify-write cycle inside one `flock-v1` critical section via
//! [`LeaseStore::with_locked`] — re-reading fresh state *inside* the lock,
//! never reusing a pre-lock snapshot, which is what actually closes the
//! lost-update race (atomic rename alone does not: two concurrent
//! `try_consume_matching` calls against `remaining: Some(1)` can each read
//! 1, each decide to allow, each decrement their own copy to 0, and each
//! write — one write clobbers the other, but *both* callers already
//! returned `Ok(true)`, over-spending the budget, with no lock in the
//! critical section). Matches `mission::with_mission_locked`'s exact
//! pattern for the same class of bug on the same kind of JSON-file store.

use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use uuid::Uuid;

/// Configurable the same way `YANA_MISSION_LOCK_TIMEOUT_SECS` is (see
/// `mission::with_mission_locked`): a heavily-loaded CI runner with many
/// concurrent test processes needs more wait budget than the production
/// default without changing that default.
fn lease_lock_timeout() -> Duration {
    let secs = std::env::var("YANA_LEASE_LOCK_TIMEOUT_SECS")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(10);
    Duration::from_secs(secs)
}

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

/// Token-aware prefix match, matching the milestone doc's own example
/// (`cargo test | cargo fmt | cargo clippy` as prefixes, not a full command
/// grammar): `"cargo test"` in `allow` matches `cargo test --release`.
///
/// Hardening pass: this used to be a raw string prefix
/// (`command_text.starts_with(entry)`), which let `allow: ["cargo test"]`
/// wrongly match `cargo testing-tool --wipe-everything` — same string
/// prefix, a completely different command. Tokenizes both sides with
/// `capability::command::tokenize_command`, the exact same `shell_words`
/// parser real command execution validates against (not a second,
/// independently-written parser that could disagree with it), and requires
/// `entry`'s tokens to be a whole-token prefix of `command_text`'s tokens.
/// Fails closed (no match) if either side fails to tokenize — an
/// unparseable lease scope entry or an unparseable proposed command is
/// never treated as a match.
fn command_matches(entry: &str, command_text: &str) -> bool {
    let (Ok(entry_tokens), Ok(command_tokens)) = (
        super::command::tokenize_command(entry),
        super::command::tokenize_command(command_text),
    ) else {
        return false;
    };
    if entry_tokens.is_empty() || command_tokens.len() < entry_tokens.len() {
        return false;
    }
    command_tokens[..entry_tokens.len()] == entry_tokens[..]
}

pub struct LeaseStore {
    root: PathBuf,
}

impl LeaseStore {
    pub fn for_root(root: &Path) -> Self {
        Self { root: root.to_path_buf() }
    }

    /// Runs `action` as one `flock-v1` critical section scoped to this
    /// store's `repo_root` — every caller of this function must do its
    /// *entire* read-modify-write cycle (read, decide, mutate, write)
    /// inside the closure, not before calling it. A read taken before the
    /// lock is exactly the stale snapshot that reopens the race this
    /// exists to close.
    fn with_locked<T>(&self, action: impl FnOnce() -> Result<T>) -> Result<T> {
        let locked = yana_rt::flock_v1::with_lock(
            "key:lease-store",
            &self.root,
            lease_lock_timeout(),
            action,
        );
        match locked {
            Ok(inner) => inner,
            Err(lock_error) => Err(lock_error.context("could not acquire lease store lock")),
        }
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
        self.with_locked(|| {
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
        })
    }

    pub fn revoke(&self, id: &str) -> Result<()> {
        let id = id.to_string();
        self.with_locked(|| {
            let mut leases = read_leases(&self.root)?;
            let Some(lease) = leases.iter_mut().find(|lease| lease.id == id) else {
                bail!("no lease with id '{id}'");
            };
            lease.revoked = true;
            write_leases(&self.root, &leases)
        })
    }

    pub fn list(&self) -> Result<Vec<Lease>> {
        // Read-only: no lock needed. `write_leases` always replaces the
        // file via a same-directory temp-file + rename, so a concurrent
        // reader only ever observes a complete old or complete new file,
        // never a torn write.
        read_leases(&self.root)
    }

    /// The one method `RuntimeAuthority::capability_decision` calls.
    /// Returns `Ok(true)` only when a matching, currently-valid lease was
    /// found and its budget was consumed; `Ok(false)` otherwise (no
    /// matching lease — the caller falls through to the existing
    /// human-approval path unchanged). Never trusts a caller-held `Lease`
    /// value — always re-reads and re-validates expiry/revocation/budget
    /// against what is on disk right now, inside the lock, so a lease
    /// issued before a HALT or policy change does not survive it and a
    /// budget of 1 can never be consumed by two concurrent callers.
    /// Returns `Ok(Some(lease_id))` on a matched, consumed lease —
    /// `lease_id` lets the caller (authority.rs) record which specific
    /// lease is the evidence behind an `Allow`, per the authority-decision
    /// receipt's requirement to reconstruct *why* an invocation was
    /// permitted, not just that it was. `Ok(None)` means no matching lease
    /// (the caller falls through to the existing human-approval path).
    pub fn try_consume_matching(
        &self,
        subject: &str,
        capability: &str,
        repo_root: &Path,
        command_text: Option<&str>,
    ) -> Result<Option<String>> {
        self.with_locked(|| {
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
                return Ok(None);
            };
            if let Some(remaining) = lease.remaining.as_mut() {
                *remaining -= 1;
            }
            let id = lease.id.clone();
            write_leases(&self.root, &leases)?;
            Ok(Some(id))
        })
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

    /// Matches `os::health`'s (and every other flock-v1 caller's) own test
    /// pattern exactly: write the real protocol marker rather than relying
    /// on `YANA_LOCKING_PROTOCOL_MODE=test`, so these tests exercise the
    /// same `protocol_is_active` path production does.
    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("yana-lease-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let marker = dir.join(yana_rt::flock_v1::PROTOCOL_FILE);
        fs::create_dir_all(marker.parent().unwrap()).unwrap();
        fs::write(&marker, yana_rt::flock_v1::PROTOCOL_VERSION).unwrap();
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
        assert!(ok.is_some());
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
        assert!(ok.is_none());
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
        assert!(ok.is_none());
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
        assert!(ok.is_none());
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
        assert!(ok.is_none());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn exhausted_budget_does_not_match() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        let granted = grant_test_lease(&store, Some(1));
        assert!(store
            .try_consume_matching("agent:test-fixer", "command.execute", &root, Some("cargo test"))
            .unwrap()
            .is_some());
        assert!(store
            .try_consume_matching("agent:test-fixer", "command.execute", &root, Some("cargo test"))
            .unwrap()
            .is_none());
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
        assert!(ok.is_none());
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
        assert!(ok.is_none());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn allow_entry_does_not_match_a_command_that_only_shares_a_string_prefix() {
        // Regression test for the exact false-positive the raw-string
        // `starts_with` implementation had: "cargo test" as a string
        // prefix also matches "cargo testing-tool ...", a completely
        // different, unrelated command. Token-aware matching must reject
        // this even though the character-level prefix is identical.
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        grant_test_lease(&store, None);

        let ok = store
            .try_consume_matching(
                "agent:test-fixer",
                "command.execute",
                &root,
                Some("cargo testing-tool --wipe-everything"),
            )
            .unwrap();
        assert!(
            ok.is_none(),
            "'cargo test' must not match 'cargo testing-tool ...' just because it's a string prefix"
        );
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn command_matches_is_fail_closed_on_unparseable_input() {
        // An unmatched quote makes shell_words::split fail — the match
        // must be `false`, not a panic or a silent `true`.
        assert!(!command_matches("cargo test", "cargo test \"unterminated"));
        assert!(!command_matches("cargo \"unterminated", "cargo test"));
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
        assert!(ok.is_none(), "deny entry must win even though 'cargo' in allow also matches");
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

    // ── Real concurrency (hardening pass) ────────────────────────────────
    //
    // Each test below spawns genuine `std::thread` threads, each doing its
    // own independent `LeaseStore::for_root(root)` and its own independent
    // `open()` of the lock file inside `flock_v1::acquire` — a fresh
    // open-file-description per thread, so `flock()` actually serializes
    // them the same way it would separate OS processes. This is not two
    // sequential calls relabeled as a concurrency test.

    #[test]
    fn budget_of_one_survives_true_concurrent_consumers() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        grant_test_lease(&store, Some(1));

        let barrier = std::sync::Arc::new(std::sync::Barrier::new(8));
        let root = std::sync::Arc::new(root);
        let handles: Vec<_> = (0..8)
            .map(|_| {
                let barrier = std::sync::Arc::clone(&barrier);
                let root = std::sync::Arc::clone(&root);
                std::thread::spawn(move || {
                    barrier.wait(); // maximize actual overlap at the flock() call
                    LeaseStore::for_root(&root)
                        .try_consume_matching(
                            "agent:test-fixer",
                            "command.execute",
                            &root,
                            Some("cargo test"),
                        )
                        .unwrap()
                })
            })
            .collect();

        let successes = handles
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .filter(|result| result.is_some())
            .count();

        assert_eq!(
            successes, 1,
            "budget=1 must allow exactly one of 8 truly concurrent consumers"
        );
        let final_leases = LeaseStore::for_root(&root).list().unwrap();
        assert_eq!(final_leases.len(), 1, "lease store must not be corrupted");
        assert_eq!(
            final_leases[0].remaining,
            Some(0),
            "remaining must land on exactly 0, not go negative or stay at 1"
        );
        fs::remove_dir_all(root.as_path()).ok();
    }

    #[test]
    fn concurrent_grants_lose_none_of_them() {
        let root = std::sync::Arc::new(temp_root());
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(6));
        let handles: Vec<_> = (0..6)
            .map(|index| {
                let barrier = std::sync::Arc::clone(&barrier);
                let root = std::sync::Arc::clone(&root);
                std::thread::spawn(move || {
                    barrier.wait();
                    LeaseStore::for_root(&root)
                        .grant(
                            format!("agent:worker-{index}"),
                            "command.execute".into(),
                            vec!["cargo test".into()],
                            vec![],
                            "human".into(),
                            20,
                            Some(1),
                        )
                        .unwrap()
                })
            })
            .collect();
        for handle in handles {
            handle.join().unwrap();
        }

        let leases = LeaseStore::for_root(&root).list().unwrap();
        assert_eq!(
            leases.len(),
            6,
            "a read-modify-write race on grant must not silently drop concurrent grants"
        );
        let mut subjects: Vec<_> = leases.iter().map(|lease| lease.subject.clone()).collect();
        subjects.sort();
        subjects.dedup();
        assert_eq!(subjects.len(), 6, "every subject must be distinct, none overwritten");
        fs::remove_dir_all(root.as_path()).ok();
    }

    #[test]
    fn revoke_racing_consume_never_lets_a_consume_win_after_its_revoke_is_durable() {
        // Not a race on the *outcome* being deterministic (either order is a
        // legitimate lock-serialized outcome) — the invariant under test is
        // that the store never corrupts and the two operations never
        // interleave (e.g. a revoke and a consume both reading the same
        // pre-image and each writing their own partial update, silently
        // dropping the other's effect).
        let root = std::sync::Arc::new(temp_root());
        let store = LeaseStore::for_root(&root);
        let granted = grant_test_lease(&store, Some(5));

        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let revoke_root = std::sync::Arc::clone(&root);
        let revoke_barrier = std::sync::Arc::clone(&barrier);
        let lease_id = granted.id.clone();
        let revoke_handle = std::thread::spawn(move || {
            revoke_barrier.wait();
            LeaseStore::for_root(&revoke_root).revoke(&lease_id)
        });

        let consume_root = std::sync::Arc::clone(&root);
        let consume_barrier = std::sync::Arc::clone(&barrier);
        let consume_handle = std::thread::spawn(move || {
            consume_barrier.wait();
            LeaseStore::for_root(&consume_root).try_consume_matching(
                "agent:test-fixer",
                "command.execute",
                &consume_root,
                Some("cargo test"),
            )
        });

        revoke_handle.join().unwrap().unwrap();
        consume_handle.join().unwrap().unwrap();

        let leases = LeaseStore::for_root(&root).list().unwrap();
        assert_eq!(leases.len(), 1, "lease store must not be corrupted");
        assert!(leases[0].revoked, "the revoke must always be durable");
        // If the consume observed the lease before the revoke committed, it
        // may have decremented `remaining` — that's a legitimate
        // lock-serialized ordering, not a bug. What must never happen is
        // the revoke being silently lost.
        fs::remove_dir_all(root.as_path()).ok();
    }
}
