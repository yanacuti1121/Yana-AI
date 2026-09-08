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
    /// Authority Hardening item #6 (delegated leases): the lease this one
    /// was delegated from, if any. A coordinator holding `parent_lease_id`
    /// grants a narrower lease to a subagent it dispatches — see
    /// `try_consume_matching`'s ancestor-chain check for how the
    /// `child authority ⊆ parent authority` invariant is actually
    /// enforced (at every consume, not just at grant time). `#[serde(
    /// default)]` so a `leases.json` written before this field existed
    /// still deserializes (as `None`, i.e. a root lease, the correct
    /// reading of "this lease predates delegation").
    #[serde(default)]
    pub parent_lease_id: Option<String>,
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
///
/// `pub(crate)` (not private): reused as-is by
/// `runtime::authority::narrow_by_intent` (Authority Hardening item #7)
/// so a declared intent's scope entries are matched with the exact same
/// token-boundary semantics a lease's own `allow` list already uses —
/// not a second, independently-written matcher that could disagree
/// with this one.
pub(crate) fn command_matches(entry: &str, command_text: &str) -> bool {
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

    #[allow(clippy::too_many_arguments)]
    pub fn grant(
        &self,
        subject: String,
        capability: String,
        allow: Vec<String>,
        deny: Vec<String>,
        issued_by: String,
        expires_in_minutes: u64,
        invocation_budget: Option<u32>,
        parent_lease_id: Option<String>,
    ) -> Result<Lease> {
        if subject.trim().is_empty() {
            bail!("lease subject must not be empty");
        }
        if subject.trim() == "*" {
            bail!("lease subject must name one agent; wildcard '*' is not allowed");
        }
        if capability.trim().is_empty() {
            bail!("lease capability must not be empty");
        }
        self.with_locked(|| {
            let mut leases = read_leases(&self.root)?;
            // Grant-time check (item #6): the parent must actually exist.
            // This is a fail-fast UX check, not the safety boundary itself
            // — the real `child ⊆ parent` invariant is enforced at every
            // consume via the ancestor-chain walk in
            // `try_consume_matching`, not by proving allow/deny subset
            // containment here (a much harder, easier-to-get-wrong
            // problem for prefix-matched command lists — see that
            // function's own doc comment for why AND-composition at
            // consume time is the actual mechanism).
            if let Some(parent_id) = &parent_lease_id {
                if !leases.iter().any(|lease| &lease.id == parent_id) {
                    bail!("parent lease '{parent_id}' does not exist");
                }
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
                parent_lease_id,
            };
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
    /// Returns `Ok(Some(lease_id))` only when a matching, currently-valid
    /// lease was found and its budget (and, if delegated, its whole
    /// ancestor chain's budget) was consumed; `Ok(None)` otherwise — the
    /// caller falls through to the existing human-approval path
    /// unchanged. Never trusts a caller-held `Lease` value — always
    /// re-reads and re-validates expiry/revocation/budget against what is
    /// on disk right now, inside the lock, so a lease issued before a
    /// HALT or policy change does not survive it and a budget of 1 can
    /// never be consumed by two concurrent callers.
    ///
    /// Delegated leases (Authority Hardening item #6): `child authority ⊆
    /// parent authority` is enforced here, at every consume, not by
    /// trying to statically prove allow/deny list containment at grant
    /// time. A lease with `parent_lease_id` set only matches if its OWN
    /// scope matches AND every ancestor up the `parent_lease_id` chain
    /// independently still matches too (not revoked, not expired, budget
    /// available, and — if this call has a command to check — the
    /// ancestor's own allow/deny also permits it). This AND-composition
    /// is what makes the invariant hold for arbitrary chain depth without
    /// needing to prove "is this allow list a subset of that one," a much
    /// harder problem for prefix-matched command lists: a child granted a
    /// broader `allow` than its parent simply can never successfully
    /// consume past what the parent's own policy would also allow, and a
    /// revoked/expired/exhausted parent silently cuts off every
    /// descendant with no cascade-revoke logic needed (the parent link in
    /// the chain just stops matching). A cycle in `parent_lease_id`
    /// (malformed or malicious) fails closed via a bounded chain-length
    /// walk rather than looping forever.
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
            let Some(leaf_index) = leases.iter().position(|lease| {
                !lease.revoked
                    && lease.subject == subject
                    && lease.capability == capability
                    && lease.repo_root == repo_root
                    && lease.expires_at > now
                    && lease.remaining.is_none_or(|remaining| remaining > 0)
                    && lease_scope_allows(lease, command_text)
            }) else {
                return Ok(None);
            };
            let Some(chain) = ancestor_chain_indices(&leases, leaf_index, command_text, now)
            else {
                return Ok(None);
            };
            for &index in &chain {
                if let Some(remaining) = leases[index].remaining.as_mut() {
                    *remaining -= 1;
                }
            }
            let id = leases[leaf_index].id.clone();
            write_leases(&self.root, &leases)?;
            Ok(Some(id))
        })
    }
}

/// `true` if `lease`'s own allow/deny scope permits `command_text` (or
/// there is no command to check, e.g. a non-`command.execute`
/// capability). Extracted out of the leaf-match predicate so the
/// ancestor-chain walk below can apply the exact same scope check to
/// every ancestor, not a second, hand-duplicated version of it.
fn lease_scope_allows(lease: &Lease, command_text: Option<&str>) -> bool {
    match command_text {
        Some(text) => {
            !lease.deny.iter().any(|entry| command_matches(entry, text))
                && lease.allow.iter().any(|entry| command_matches(entry, text))
        }
        None => true,
    }
}

/// Maximum delegation depth walked before failing closed on a cycle or a
/// pathologically long chain — generous for any real coordinator ->
/// subagent -> sub-subagent structure this system actually spawns (depth
/// capped at 3 by `agent-excessive-agency-law.md`'s own sub-agent
/// delegation limit), tight enough that a malformed `parent_lease_id`
/// cycle cannot loop the lock-holding thread indefinitely.
const MAX_DELEGATION_CHAIN_DEPTH: usize = 8;

/// Walks `leases[leaf_index]`'s `parent_lease_id` chain, returning the
/// full chain of indices (leaf first, then each ancestor) if every link —
/// the leaf included — is currently valid (not revoked, not expired,
/// budget available, scope permits `command_text`). Returns `None` if any
/// link in the chain fails any of those checks, or if the chain does not
/// terminate within `MAX_DELEGATION_CHAIN_DEPTH` hops (covers both a
/// cycle and an implausibly deep chain — both treated as fail-closed, not
/// distinguished, since neither should ever occur from this system's own
/// `grant()` call path).
fn ancestor_chain_indices(
    leases: &[Lease],
    leaf_index: usize,
    command_text: Option<&str>,
    now: DateTime<Utc>,
) -> Option<Vec<usize>> {
    let mut chain = vec![leaf_index];
    let mut current = &leases[leaf_index];
    while let Some(parent_id) = &current.parent_lease_id {
        if chain.len() >= MAX_DELEGATION_CHAIN_DEPTH {
            return None;
        }
        let parent_index = leases.iter().position(|lease| &lease.id == parent_id)?;
        let parent = &leases[parent_index];
        let parent_valid = !parent.revoked
            && parent.expires_at > now
            && parent.remaining.is_none_or(|remaining| remaining > 0)
            && lease_scope_allows(parent, command_text);
        if !parent_valid {
            return None;
        }
        chain.push(parent_index);
        current = parent;
    }
    Some(chain)
}

// ── CLI-facing wrappers ──────────────────────────────────────────────────────
// Mirror `cost.rs`'s `cmd_cost_*` convention exactly: resolve the project
// root from the current directory, do the work, print plain text or `--json`.

#[allow(clippy::too_many_arguments)]
pub fn cmd_lease_grant(
    subject: String,
    capability: String,
    allow: Vec<String>,
    deny: Vec<String>,
    expires_in_minutes: u64,
    invocation_budget: Option<u32>,
    parent_lease_id: Option<String>,
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
        parent_lease_id,
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
        if let Some(parent_id) = &lease.parent_lease_id {
            println!("  delegated from: #{parent_id}");
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
                None,
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
    fn grant_rejects_a_wildcard_subject() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);

        let error = store
            .grant(
                "*".into(),
                "command.execute".into(),
                vec!["cargo test".into()],
                vec![],
                "human".into(),
                20,
                Some(1),
                None,
            )
            .unwrap_err();

        assert!(error.to_string().contains("wildcard '*' is not allowed"));
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
            parent_lease_id: None,
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

    // Authority Hardening item #8: a symlinked lease store is exactly the
    // attack cost.rs's own `strict_reader_rejects_symlink` test already
    // covers for the cost ledger -- an attacker (or a misconfigured
    // deployment) replacing .yana-ai/leases.json with a symlink pointing
    // outside the project could otherwise make a read follow it to an
    // arbitrary file. read_leases already guards this (symlink_metadata +
    // is_symlink() check, mirroring cost.rs's read_cost_policy exactly);
    // this test proves the guard is real, not just present in the code.
    #[cfg(unix)]
    #[test]
    fn symlinked_lease_store_is_rejected_not_followed() {
        use std::os::unix::fs::symlink;

        let root = temp_root();
        let path = leases_path(&root);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let target = root.join("outside-lease-store");
        fs::write(&target, "[]").unwrap();
        symlink(&target, &path).unwrap();

        let error = LeaseStore::for_root(&root).list().unwrap_err().to_string();
        assert!(
            error.contains("must be a regular file") || error.to_lowercase().contains("symlink"),
            "expected a symlink-rejection error, got: {error}"
        );
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
                            None,
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

    // ── Delegated leases (Authority Hardening item #6) ──────────────────
    // The invariant under test throughout this section: child authority
    // never exceeds parent authority, no matter what the child's OWN
    // allow/deny/budget/expiry claims — because try_consume_matching's
    // ancestor-chain walk re-validates every ancestor at consume time,
    // not because grant() proved subset containment up front.

    #[test]
    fn child_lease_cannot_escape_parents_deny_even_when_childs_own_allow_permits_it() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        let parent = store
            .grant(
                "agent:coordinator".into(),
                "command.execute".into(),
                vec!["cargo".into()],
                vec!["cargo publish".into()],
                "human".into(),
                20,
                None,
                None,
            )
            .unwrap();
        store
            .grant(
                "agent:worker-1".into(),
                "command.execute".into(),
                vec!["cargo publish".into()], // broader than the parent's own effective policy
                vec![],
                "agent:coordinator".into(),
                20,
                None,
                Some(parent.id.clone()),
            )
            .unwrap();

        let ok = store
            .try_consume_matching("agent:worker-1", "command.execute", &root, Some("cargo publish"))
            .unwrap();
        assert!(
            ok.is_none(),
            "child must not be able to do what the parent's own deny forbids, even though the child's own allow list permits it"
        );
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn child_lease_within_parent_scope_succeeds_and_decrements_both_budgets() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        let parent = store
            .grant(
                "agent:coordinator".into(),
                "command.execute".into(),
                vec!["cargo test".into()],
                vec![],
                "human".into(),
                20,
                Some(5),
                None,
            )
            .unwrap();
        let child = store
            .grant(
                "agent:worker-1".into(),
                "command.execute".into(),
                vec!["cargo test".into()],
                vec![],
                "agent:coordinator".into(),
                20,
                Some(3),
                Some(parent.id.clone()),
            )
            .unwrap();

        let consumed = store
            .try_consume_matching("agent:worker-1", "command.execute", &root, Some("cargo test"))
            .unwrap();
        assert_eq!(consumed, Some(child.id.clone()));

        let leases = store.list().unwrap();
        let parent_after = leases.iter().find(|l| l.id == parent.id).unwrap();
        let child_after = leases.iter().find(|l| l.id == child.id).unwrap();
        assert_eq!(
            parent_after.remaining,
            Some(4),
            "consuming a delegated child must also spend one unit of the parent's own budget"
        );
        assert_eq!(child_after.remaining, Some(2));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn revoked_parent_cuts_off_child_automatically_with_no_cascade_logic() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        let parent = store
            .grant(
                "agent:coordinator".into(),
                "command.execute".into(),
                vec!["cargo test".into()],
                vec![],
                "human".into(),
                20,
                None,
                None,
            )
            .unwrap();
        store
            .grant(
                "agent:worker-1".into(),
                "command.execute".into(),
                vec!["cargo test".into()],
                vec![],
                "agent:coordinator".into(),
                20,
                None,
                Some(parent.id.clone()),
            )
            .unwrap();
        store.revoke(&parent.id).unwrap();

        let ok = store
            .try_consume_matching("agent:worker-1", "command.execute", &root, Some("cargo test"))
            .unwrap();
        assert!(ok.is_none(), "revoking the parent must cut off the child with no explicit cascade-revoke needed");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn expired_parent_cuts_off_child_even_though_the_child_itself_has_not_expired() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        let now = Utc::now();
        let mut leases = vec![
            Lease {
                id: "parent1".into(),
                subject: "agent:coordinator".into(),
                capability: "command.execute".into(),
                repo_root: root.clone(),
                allow: vec!["cargo test".into()],
                deny: vec![],
                issued_by: "human".into(),
                issued_at: now - chrono::Duration::minutes(30),
                expires_at: now - chrono::Duration::minutes(10), // already expired
                invocation_budget: None,
                remaining: None,
                revoked: false,
                parent_lease_id: None,
            },
            Lease {
                id: "child1".into(),
                subject: "agent:worker-1".into(),
                capability: "command.execute".into(),
                repo_root: root.clone(),
                allow: vec!["cargo test".into()],
                deny: vec![],
                issued_by: "agent:coordinator".into(),
                issued_at: now,
                expires_at: now + chrono::Duration::minutes(20), // still valid on its own
                invocation_budget: None,
                remaining: None,
                revoked: false,
                parent_lease_id: Some("parent1".into()),
            },
        ];
        write_leases(&root, &mut leases.drain(..).collect::<Vec<_>>()).unwrap();

        let ok = store
            .try_consume_matching("agent:worker-1", "command.execute", &root, Some("cargo test"))
            .unwrap();
        assert!(
            ok.is_none(),
            "an expired parent must cut off an otherwise-still-valid child"
        );
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn exhausted_parent_budget_cuts_off_child_even_if_child_still_has_budget() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        let parent = store
            .grant(
                "agent:coordinator".into(),
                "command.execute".into(),
                vec!["cargo test".into()],
                vec![],
                "human".into(),
                20,
                Some(1),
                None,
            )
            .unwrap();
        store
            .grant(
                "agent:worker-1".into(),
                "command.execute".into(),
                vec!["cargo test".into()],
                vec![],
                "agent:coordinator".into(),
                20,
                Some(5),
                Some(parent.id.clone()),
            )
            .unwrap();
        // Coordinator spends the parent's only unit of budget directly.
        let direct = store
            .try_consume_matching("agent:coordinator", "command.execute", &root, Some("cargo test"))
            .unwrap();
        assert!(direct.is_some());

        let ok = store
            .try_consume_matching("agent:worker-1", "command.execute", &root, Some("cargo test"))
            .unwrap();
        assert!(
            ok.is_none(),
            "child must not consume once the parent's own budget is exhausted, even with budget of its own remaining"
        );
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn grant_rejects_a_nonexistent_parent_lease_id() {
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        let result = store.grant(
            "agent:worker-1".into(),
            "command.execute".into(),
            vec!["cargo test".into()],
            vec![],
            "agent:coordinator".into(),
            20,
            None,
            Some("does-not-exist".into()),
        );
        assert!(result.is_err());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn cyclic_parent_chain_fails_closed_within_bounded_time() {
        // A malformed/malicious pair of leases pointing at each other as
        // parent must never be constructible via grant() (see the
        // rejects_a_nonexistent_parent_lease_id test — grant()'s own
        // fail-fast check would catch the second half of this cycle
        // being created), but the consume path must still fail closed
        // and terminate if a store is ever hand-edited into this shape.
        let root = temp_root();
        let store = LeaseStore::for_root(&root);
        let mut leases = vec![
            Lease {
                id: "a".into(),
                subject: "agent:worker-1".into(),
                capability: "command.execute".into(),
                repo_root: root.clone(),
                allow: vec!["cargo test".into()],
                deny: vec![],
                issued_by: "human".into(),
                issued_at: Utc::now(),
                expires_at: Utc::now() + chrono::Duration::minutes(20),
                invocation_budget: None,
                remaining: None,
                revoked: false,
                parent_lease_id: Some("b".into()),
            },
            Lease {
                id: "b".into(),
                subject: "agent:coordinator".into(),
                capability: "command.execute".into(),
                repo_root: root.clone(),
                allow: vec!["cargo test".into()],
                deny: vec![],
                issued_by: "human".into(),
                issued_at: Utc::now(),
                expires_at: Utc::now() + chrono::Duration::minutes(20),
                invocation_budget: None,
                remaining: None,
                revoked: false,
                parent_lease_id: Some("a".into()),
            },
        ];
        write_leases(&root, &mut leases.drain(..).collect::<Vec<_>>()).unwrap();

        let started = std::time::Instant::now();
        let ok = store
            .try_consume_matching("agent:worker-1", "command.execute", &root, Some("cargo test"))
            .unwrap();
        assert!(ok.is_none(), "a cyclic parent chain must fail closed, never allow");
        assert!(
            started.elapsed() < std::time::Duration::from_secs(1),
            "the bounded chain-depth walk must terminate quickly, not hang on a cycle"
        );
        fs::remove_dir_all(&root).ok();
    }
}
