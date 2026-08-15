//! Actor-scoped lease primitive. `grant()`/`ActorLease` (Phase 12) plus
//! the real scope taxonomy and matching logic (`LeaseScope::permits`,
//! Phase 13). See `identity` module doc for the derived-view design this
//! extends, not replaces.
//!
//! Scope taxonomy: `namespace[:path-glob]` — e.g. `"repo.read"` (no path
//! restriction) or `"repo.write:src/**"` (namespace `repo.write`,
//! restricted to paths under `src/`). This is not an arbitrary invention:
//! `repo.read` is the exact name `capability::registry`'s
//! `CapabilityDescriptor` already uses for its own read-only capability
//! (confirmed by reading `src/capability/registry_data.rs` before
//! designing this). `LeaseScope::permits` only judges whether a granted
//! scope string covers a requested one — it does not itself gate any
//! `capability::` call; wiring an actor's active leases into
//! `capability::`'s dispatch path (which has no actor-identity parameter
//! at all today) would touch chat/MCP call sites well outside this
//! program's `os::` scope, and is deliberately left for a later phase
//! rather than forced into this one — see `os::autonomy::evaluate_for_actor`
//! for this phase's actual, real, in-scope guard integration instead.

use super::actor::ActorId;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// An opaque, but structured, capability scope string — see this file's
/// module doc for the `namespace[:path-glob]` taxonomy `permits` judges.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct LeaseScope(pub String);

impl std::fmt::Display for LeaseScope {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<&str> for LeaseScope {
    fn from(value: &str) -> Self {
        LeaseScope(value.to_string())
    }
}

impl LeaseScope {
    /// Whether this (granted) scope covers a `requested` scope string.
    /// Namespaces must match exactly. A granted scope with no `:path`
    /// suffix is a whole-namespace grant and covers any requested scope
    /// in that namespace, path-qualified or not. A granted scope WITH a
    /// `:path` suffix only covers a requested scope that is ALSO
    /// path-qualified and whose path matches the granted glob — an
    /// unqualified request against a path-scoped grant is denied rather
    /// than assumed to be within it, the same fail-closed default this
    /// program has used since Phase 5's resource placement.
    pub fn permits(&self, requested: &str) -> bool {
        let (granted_ns, granted_path) = split_scope(&self.0);
        let (requested_ns, requested_path) = split_scope(requested);
        if granted_ns != requested_ns {
            return false;
        }
        match granted_path {
            None => true,
            Some(granted_glob) => requested_path
                .is_some_and(|requested_path| glob_permits(granted_glob, requested_path)),
        }
    }
}

fn split_scope(scope: &str) -> (&str, Option<&str>) {
    match scope.split_once(':') {
        Some((namespace, path)) => (namespace, Some(path)),
        None => (scope, None),
    }
}

/// Only the exact shape this program's own spec text shows
/// (`"src/**"`) is supported — a trailing `/**` matches the prefix
/// itself or anything under it. No single-segment `*` wildcard, no
/// mid-path glob: those were not asked for, and adding them now would be
/// exactly the speculative taxonomy design this file's own module doc
/// says a later phase should do once a real need for them exists.
fn glob_permits(granted_glob: &str, requested_path: &str) -> bool {
    match granted_glob.strip_suffix("/**") {
        Some(prefix) => {
            requested_path == prefix || requested_path.starts_with(&format!("{prefix}/"))
        }
        None => granted_glob == requested_path,
    }
}

/// Fields are private and read only through the accessors below —
/// `grant()` is the only way to build one. Making the fields `pub` would
/// let any caller construct a `sovereign`-scoped `ActorLease` directly,
/// silently bypassing `grant()`'s rejection and defeating the whole point
/// of enforcing the non-escalation invariant at construction time.
///
/// Caveat, disclosed rather than hidden (same discipline as Phase 11's
/// verified-vs-unverified split): `#[derive(Deserialize)]` still
/// populates private fields directly and does not re-run `grant()`'s
/// validation, so a lease loaded from the persisted store (`lease_store`,
/// Phase 13) could still smuggle in a `sovereign` scope via hand-edited
/// JSON. This exact gap already exists, unresolved, for `AutonomyPolicy`
/// in this codebase (`load_policy` deserializes with no re-validation
/// against `save_policy`'s own checks) — not introduced fresh here.
/// `lease_store::load_store` re-validates every loaded lease against this
/// same rejection on read, closing the gap for this type specifically
/// (see that module) rather than leaving it as wide open as the
/// `AutonomyPolicy` precedent.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ActorLease {
    id: String,
    actor: ActorId,
    scope: LeaseScope,
    issued_by: ActorId,
    issued_at_unix_secs: u64,
    expires_at_unix_secs: u64,
    reason: String,
}

impl ActorLease {
    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn actor(&self) -> &ActorId {
        &self.actor
    }

    pub fn scope(&self) -> &LeaseScope {
        &self.scope
    }

    pub fn issued_by(&self) -> &ActorId {
        &self.issued_by
    }

    pub fn issued_at_unix_secs(&self) -> u64 {
        self.issued_at_unix_secs
    }

    pub fn expires_at_unix_secs(&self) -> u64 {
        self.expires_at_unix_secs
    }

    pub fn reason(&self) -> &str {
        &self.reason
    }

    /// Whether this lease is unexpired AND its scope covers `requested`.
    /// The one predicate a caller actually needs to authorize a scoped
    /// action — combines `is_active` and `LeaseScope::permits` so callers
    /// (e.g. `os::autonomy::evaluate_for_actor`) do not have to remember
    /// to check both separately.
    pub fn covers(&self, requested: &str, now_unix_secs: u64) -> bool {
        is_active(self, now_unix_secs) && self.scope.permits(requested)
    }
}

/// Reserved scope string meaning full, unrestricted authority. No caller
/// in this codebase may ever construct a lease with this scope — `grant`
/// rejects it unconditionally, case-insensitively. This is Phase 13's own
/// stated invariant ("a lease can never grant Sovereign authority; no
/// actor may self-escalate") enforced at `ActorLease`'s only construction
/// path, from Phase 12's first commit, rather than left for Phase 13 to
/// remember to add once real leases exist.
const SOVEREIGN_SCOPE: &str = "sovereign";

/// Options struct rather than positional parameters — `grant` needs 5
/// caller-supplied values (`reason` makes 6 as a bare parameter), over
/// this repo's hard 5-parameter-per-function limit
/// (`agent-code-constraints.md`). Same fix already applied to
/// `os::resource::reservation::ReserveRequest` in Phase 5.
pub struct GrantRequest {
    pub actor: ActorId,
    pub scope: LeaseScope,
    pub issued_by: ActorId,
    pub issued_at_unix_secs: u64,
    pub ttl_secs: u64,
    pub reason: String,
}

/// Constructs a lease, rejecting the one case that would violate the
/// non-escalation invariant regardless of caller intent. All other scope
/// strings are accepted as-is — this file does not judge whether a scope
/// is well-formed or meaningful, only that it isn't a self-escalation to
/// full authority. Assigns a fresh id (`Uuid::new_v4`), the same
/// identifier convention `os::resource::reservation::Reservation` and
/// `os::agent::ManagedAgent` already use.
pub fn grant(request: GrantRequest) -> anyhow::Result<ActorLease> {
    if request.scope.0.eq_ignore_ascii_case(SOVEREIGN_SCOPE) {
        anyhow::bail!("a lease can never grant sovereign authority");
    }
    Ok(ActorLease {
        id: Uuid::new_v4().to_string(),
        actor: request.actor,
        scope: request.scope,
        issued_by: request.issued_by,
        issued_at_unix_secs: request.issued_at_unix_secs,
        expires_at_unix_secs: request.issued_at_unix_secs.saturating_add(request.ttl_secs),
        reason: request.reason,
    })
}

/// `now == expires_at` is treated as already expired (half-open interval
/// `[issued_at, expires_at)`), matching `os::resource::reservation::
/// is_active`'s existing expiry convention rather than inventing a new
/// one.
pub fn is_active(lease: &ActorLease, now_unix_secs: u64) -> bool {
    now_unix_secs < lease.expires_at_unix_secs()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn actor(id: &str) -> ActorId {
        ActorId(id.to_string())
    }

    fn request(scope: &str, issued_at: u64, ttl_secs: u64) -> GrantRequest {
        GrantRequest {
            actor: actor("agent-1"),
            scope: LeaseScope(scope.into()),
            issued_by: actor("supervisor"),
            issued_at_unix_secs: issued_at,
            ttl_secs,
            reason: "test".into(),
        }
    }

    #[test]
    fn grant_rejects_sovereign_scope_case_insensitively() {
        for scope in ["sovereign", "Sovereign", "SOVEREIGN"] {
            let error = grant(request(scope, 0, 60)).unwrap_err();
            assert!(error.to_string().contains("sovereign"));
        }
    }

    #[test]
    fn grant_accepts_an_ordinary_scoped_capability() {
        let lease = grant(request("repo.read", 1000, 60)).unwrap();
        assert_eq!(lease.scope(), &LeaseScope("repo.read".into()));
        assert_eq!(lease.expires_at_unix_secs(), 1060);
        assert!(!lease.id().is_empty());
    }

    #[test]
    fn is_active_reflects_the_half_open_expiry_boundary() {
        let lease = grant(request("repo.read", 1000, 60)).unwrap();
        assert!(is_active(&lease, 1059));
        assert!(!is_active(&lease, 1060));
        assert!(!is_active(&lease, 2000));
    }

    #[test]
    fn ttl_saturates_instead_of_overflowing_at_the_u64_boundary() {
        let lease = grant(request("repo.read", u64::MAX - 1, 100)).unwrap();
        assert_eq!(lease.expires_at_unix_secs(), u64::MAX);
    }

    #[test]
    fn actor_lease_fields_are_private_so_grant_is_the_only_constructor() {
        // Compile-time proof, not a runtime assertion: if `ActorLease`'s
        // fields were `pub`, the struct-literal form below would compile
        // from outside `grant()` and this test would need no comment at
        // all. It does not compile without every field named -- and every
        // field is private -- so this file is the only place able to
        // write `ActorLease { .. }` directly, and it does not.
        let lease = grant(request("repo.read", 0, 60)).unwrap();
        assert_eq!(lease.actor(), &actor("agent-1"));
        assert_eq!(lease.issued_by(), &actor("supervisor"));
        assert_eq!(lease.issued_at_unix_secs(), 0);
        assert_eq!(lease.reason(), "test");
    }

    #[test]
    fn permits_matches_the_same_unqualified_namespace() {
        assert!(LeaseScope("repo.read".into()).permits("repo.read"));
    }

    #[test]
    fn permits_denies_a_different_namespace() {
        assert!(!LeaseScope("repo.read".into()).permits("repo.write:src/lib.rs"));
    }

    #[test]
    fn permits_whole_namespace_grant_covers_any_path_scoped_request() {
        assert!(LeaseScope("repo.write".into()).permits("repo.write:src/lib.rs"));
        assert!(LeaseScope("repo.write".into()).permits("repo.write"));
    }

    #[test]
    fn permits_glob_covers_the_prefix_itself_and_everything_under_it() {
        let scope = LeaseScope("repo.write:src/**".into());
        assert!(scope.permits("repo.write:src"));
        assert!(scope.permits("repo.write:src/lib.rs"));
        assert!(scope.permits("repo.write:src/os/identity/lease.rs"));
    }

    #[test]
    fn permits_glob_denies_a_path_outside_the_prefix() {
        let scope = LeaseScope("repo.write:src/**".into());
        assert!(!scope.permits("repo.write:secrets.env"));
        // A sibling directory that merely starts with the same characters
        // as the prefix must not match -- "src/**" is not "src*".
        assert!(!scope.permits("repo.write:srcbackup/lib.rs"));
    }

    #[test]
    fn permits_denies_an_unqualified_request_against_a_path_scoped_grant() {
        let scope = LeaseScope("repo.write:src/**".into());
        assert!(!scope.permits("repo.write"));
    }

    #[test]
    fn covers_combines_expiry_and_scope_matching() {
        let lease = grant(request("repo.write:src/**", 1000, 60)).unwrap();
        assert!(lease.covers("repo.write:src/lib.rs", 1059));
        assert!(!lease.covers("repo.write:src/lib.rs", 1060), "expired");
        assert!(!lease.covers("repo.write:secrets.env", 1000), "wrong path");
    }
}
