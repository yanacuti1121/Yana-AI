//! Persisted actor-lease store. Deferred from Phase 12 specifically until
//! this phase: a real caller (`os::autonomy::evaluate_for_actor`) and a
//! concrete scope taxonomy (`lease::LeaseScope::permits`) now exist to
//! design the store around, rather than guessing a format in the
//! abstract. Same atomic-write, symlink-refusal pattern as
//! `os::resource::reservation` — not reinvented.

use super::actor::ActorId;
use super::lease::{self, grant, ActorLease, GrantRequest};
use anyhow::{bail, Context, Result};
use std::fs::{self, OpenOptions};
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const STORE_RELATIVE_PATH: &str = ".yana-ai/os/actor-leases.json";

/// Reserved scope this store refuses to load, matching `lease::grant`'s
/// own rejection exactly. Duplicated as a literal rather than made public
/// from `lease.rs`, the same way `ITEM_NOT_FOUND_EXIT_CODE`-style
/// small, file-local constants have stayed local elsewhere in this
/// program rather than being threaded through a shared constants module
/// for a single reuse.
const SOVEREIGN_SCOPE: &str = "sovereign";

fn store_path(root: &Path) -> PathBuf {
    root.join(STORE_RELATIVE_PATH)
}

pub fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn load_store(root: &Path) -> Result<Vec<ActorLease>> {
    let path = store_path(root);
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    options.custom_flags(libc::O_NOFOLLOW);
    let mut file = match options.open(&path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error).with_context(|| format!("opening {}", path.display())),
    };
    if !file.metadata()?.is_file() {
        bail!(
            "actor lease store must be a regular file: {}",
            path.display()
        );
    }
    let mut text = String::new();
    std::io::Read::read_to_string(&mut file, &mut text)?;
    if text.trim().is_empty() {
        return Ok(Vec::new());
    }
    let leases: Vec<ActorLease> = serde_json::from_str(&text)
        .with_context(|| format!("invalid actor lease store {}", path.display()))?;
    // Re-validate every loaded lease against grant()'s own sovereign-scope
    // rejection -- #[derive(Deserialize)] bypasses that check entirely
    // (see ActorLease's own doc comment in lease.rs). This is where that
    // gap actually gets closed for this type: on every read, not only at
    // the moment a lease was originally granted through grant().
    for stored in &leases {
        if stored.scope().0.eq_ignore_ascii_case(SOVEREIGN_SCOPE) {
            bail!(
                "actor lease store contains a lease with the rejected scope '{SOVEREIGN_SCOPE}' (id {}) -- refusing to load a tampered or hand-edited store",
                stored.id()
            );
        }
    }
    Ok(leases)
}

fn persist_store(root: &Path, leases: &[ActorLease]) -> Result<()> {
    let path = store_path(root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => bail!(
            "refusing to replace non-regular actor lease store: {}",
            path.display()
        ),
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error).with_context(|| format!("inspecting {}", path.display())),
    }
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = path.with_extension(format!("tmp.{}.{}", std::process::id(), nonce));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    let mut file = options.open(&temporary)?;
    let result = (|| -> Result<()> {
        serde_json::to_writer_pretty(&mut file, leases)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        #[cfg(target_os = "windows")]
        if path.exists() {
            fs::remove_file(&path)?;
        }
        fs::rename(&temporary, &path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

/// Grants a lease and persists it. Expired leases already in the store
/// are dropped first — a plain `issue()` must have no side effect of
/// resurrecting stale entries into the freshly-written file.
pub fn issue(root: &Path, request: GrantRequest) -> Result<ActorLease> {
    let now = now_unix_secs();
    let mut store = load_store(root)?;
    store.retain(|stored| lease::is_active(stored, now));
    let issued = grant(request)?;
    store.push(issued.clone());
    persist_store(root, &store)?;
    Ok(issued)
}

pub fn revoke(root: &Path, id: &str) -> Result<()> {
    let mut store = load_store(root)?;
    let before = store.len();
    store.retain(|stored| stored.id() != id);
    if store.len() == before {
        bail!("no actor lease with id {id}");
    }
    persist_store(root, &store)
}

/// Active leases only — expired entries are filtered, not mutated out of
/// the store; a plain list must have no persistence side effect.
pub fn list(root: &Path) -> Result<Vec<ActorLease>> {
    let now = now_unix_secs();
    let mut store = load_store(root)?;
    store.retain(|stored| lease::is_active(stored, now));
    Ok(store)
}

/// Active leases belonging to one actor — the shape
/// `os::autonomy::evaluate_for_actor` actually needs, rather than making
/// every caller filter `list()`'s output itself.
pub fn active_for_actor(root: &Path, actor: &ActorId) -> Result<Vec<ActorLease>> {
    Ok(list(root)?
        .into_iter()
        .filter(|stored| stored.actor() == actor)
        .collect())
}

pub fn print_list(leases: &[ActorLease], json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(leases)?);
        return Ok(());
    }
    if leases.is_empty() {
        println!("No active actor leases.");
        return Ok(());
    }
    println!("Actor leases");
    for stored in leases {
        println!(
            "  {}  actor={}  scope={}  issued_by={}  expires_at_unix_secs={}  reason={}",
            stored.id(),
            stored.actor(),
            stored.scope(),
            stored.issued_by(),
            stored.expires_at_unix_secs(),
            stored.reason()
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use lease::LeaseScope;

    fn root() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    fn request(scope: &str, ttl_secs: u64) -> GrantRequest {
        GrantRequest {
            actor: ActorId("agent-1".into()),
            scope: LeaseScope(scope.into()),
            issued_by: ActorId("supervisor".into()),
            issued_at_unix_secs: now_unix_secs(),
            ttl_secs,
            reason: "test".into(),
        }
    }

    #[test]
    fn issue_then_list_round_trips_through_disk() {
        let root = root();
        let issued = issue(root.path(), request("repo.read", 60)).unwrap();
        let listed = list(root.path()).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id(), issued.id());
    }

    #[test]
    fn revoke_removes_the_matching_lease_and_only_that_one() {
        let root = root();
        let first = issue(root.path(), request("repo.read", 60)).unwrap();
        let second = issue(root.path(), request("repo.write:src/**", 60)).unwrap();
        revoke(root.path(), first.id()).unwrap();
        let remaining = list(root.path()).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id(), second.id());
    }

    #[test]
    fn revoke_rejects_an_unknown_id() {
        let root = root();
        let error = revoke(root.path(), "does-not-exist").unwrap_err();
        assert!(error.to_string().contains("no actor lease"));
    }

    #[test]
    fn issue_drops_already_expired_leases_from_the_persisted_store() {
        let root = root();
        // issued_at in the past, ttl 0 -> already expired the moment it's
        // written.
        let mut expired_request = request("repo.read", 0);
        expired_request.issued_at_unix_secs = now_unix_secs().saturating_sub(1000);
        issue(root.path(), expired_request).unwrap();
        issue(root.path(), request("repo.write:src/**", 60)).unwrap();
        assert_eq!(list(root.path()).unwrap().len(), 1);
    }

    #[test]
    fn active_for_actor_filters_by_actor_and_excludes_others() {
        let root = root();
        issue(root.path(), request("repo.read", 60)).unwrap();
        let mut other = request("repo.read", 60);
        other.actor = ActorId("agent-2".into());
        issue(root.path(), other).unwrap();
        let mine = active_for_actor(root.path(), &ActorId("agent-1".into())).unwrap();
        assert_eq!(mine.len(), 1);
        assert_eq!(mine[0].actor(), &ActorId("agent-1".into()));
    }

    #[test]
    fn load_rejects_a_hand_edited_store_containing_a_sovereign_scope() {
        // Proves the Deserialize-bypass gap documented on ActorLease is
        // actually closed here: writes a store file directly (never
        // through grant()/issue(), which would refuse this) and confirms
        // list() still refuses to load it.
        let root = root();
        let path = store_path(root.path());
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        let tampered = format!(
            r#"[{{"id":"x","actor":"agent-1","scope":"sovereign","issued_by":"supervisor","issued_at_unix_secs":0,"expires_at_unix_secs":{},"reason":"tampered"}}]"#,
            u64::MAX
        );
        fs::write(&path, tampered).unwrap();
        let error = list(root.path()).unwrap_err();
        assert!(error.to_string().contains("sovereign"));
    }

    #[test]
    fn print_list_does_not_panic_on_an_empty_or_populated_list() {
        let issued = grant(request("repo.read", 60)).unwrap();
        print_list(&[], true).unwrap();
        print_list(&[issued], false).unwrap();
    }
}
