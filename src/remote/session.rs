//! Discord Phase (master-prompt-driven evolution, Aizen research pass complete —
//! see `.yana-ai/program-discord-adapter-checkpoint.md`): canonical session
//! ownership for remote interfaces.
//!
//! Aizen's own "lane" concept (`hostbot::lane::LaneRegistry`, keyed by
//! `(route, chat)`) is a CONCURRENCY primitive, not an IDENTITY one — it
//! exists so two conversations don't block each other, and answers nothing
//! about whether the same human continuing from Discord to a desktop client
//! should be treated as one conversation. That question has no ready answer
//! to adopt from Aizen (recorded DEFER in the research report); this module
//! is Yana's own design for it.
//!
//! The canonical session identity is `chat::history::SessionMetadata`'s
//! `session_id` — the SAME one every other Yana interface already uses, not
//! a new parallel concept. A remote channel/thread only ever STORES A
//! MAPPING to one of these ids; it never becomes the identity itself. This
//! is what lets a conversation started on Discord later resume unchanged
//! from a desktop client that reads the same `session_id`.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::os::identity::{Actor, ActorId};

const MAPPING_RELATIVE_PATH: &str = ".yana-ai/os/remote-sessions.json";
const SCHEMA_VERSION: u32 = 1;

/// One remote channel/thread's mapping to a Yana session — never the
/// session's content itself, only which `chat::history` session_id it
/// currently continues.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteSessionLink {
    pub session_id: String,
    pub actor_id: String,
    pub created_at: String,
    pub last_activity_at: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct MappingFile {
    #[serde(default)]
    schema_version: u32,
    #[serde(default)]
    links: HashMap<String, RemoteSessionLink>,
}

fn mapping_path(root: &Path) -> PathBuf {
    root.join(MAPPING_RELATIVE_PATH)
}

/// One remote conversation's stable key: `"<platform>:<channel-or-thread>"`
/// — e.g. `"discord:123456789"`. Not the Discord snowflake alone: a future
/// second platform (Telegram, per the master prompt's own interface list)
/// must not collide with a Discord channel id that happens to share the
/// same numeric value.
pub fn remote_key(platform: &str, chat: &str) -> String {
    format!("{platform}:{chat}")
}

/// This remote user's stable Yana actor identity: `"<platform>:<user-id>"`,
/// scoped globally per user (not per-channel, not per-guild) — the same
/// Discord account is the same actor no matter which server messaged
/// through. Channel/user AUTHORIZATION (who may talk to the bot at all) is
/// the adapter's allowlist, a separate concern from actor IDENTITY here.
pub fn remote_actor_id(platform: &str, user: &str) -> ActorId {
    ActorId::from(remote_key(platform, user).as_str())
}

/// Build the normalized `Actor` for a remote request, bound to the
/// resolved session id for this turn. `Actor::human` plus a direct field
/// set rather than `Actor::from_chat_session` deliberately: that
/// constructor ties the actor's OWN id to the session id (fine for a
/// single ephemeral CLI/TUI session), which would mean a Discord user's
/// identity changes every time they get a new session — wrong for a human
/// who should be one stable actor across many conversations over time.
pub fn remote_actor(platform: &str, user: &str, session_id: &str) -> Actor {
    let mut actor = Actor::human(remote_actor_id(platform, user).to_string());
    actor.session_id = Some(session_id.to_string());
    actor
}

fn load_mapping(root: &Path) -> Result<MappingFile> {
    let path = mapping_path(root);
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text)
            .with_context(|| format!("invalid remote session mapping at {}", path.display())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(MappingFile {
            schema_version: SCHEMA_VERSION,
            links: HashMap::new(),
        }),
        Err(error) => Err(error).with_context(|| format!("reading {}", path.display())),
    }
}

fn save_mapping(root: &Path, mapping: &MappingFile) -> Result<()> {
    let path = mapping_path(root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("creating {}", parent.display()))?;
    }
    let bytes = serde_json::to_vec_pretty(mapping)?;
    let nonce = std::process::id();
    let temp = path.with_extension(format!("tmp.{nonce}"));
    std::fs::write(&temp, &bytes).with_context(|| format!("writing {}", temp.display()))?;
    std::fs::rename(&temp, &path).with_context(|| format!("replacing {}", path.display()))
}

/// The Yana `session_id` this remote conversation continues — an existing
/// one if this `(platform, chat)` has been seen before, freshly created
/// (and durably recorded) otherwise. `now` is injected so this stays
/// testable without a real clock dependency.
pub fn resolve_session<F>(
    root: &Path,
    platform: &str,
    chat: &str,
    actor_id: &ActorId,
    now: F,
    create_session: impl FnOnce(&str) -> Result<()>,
) -> Result<String>
where
    F: Fn() -> String,
{
    let key = remote_key(platform, chat);
    let mut mapping = load_mapping(root)?;
    if let Some(link) = mapping.links.get_mut(&key) {
        link.last_activity_at = now();
        let session_id = link.session_id.clone();
        save_mapping(root, &mapping)?;
        return Ok(session_id);
    }
    let session_id = uuid::Uuid::new_v4().to_string();
    create_session(&session_id)?;
    let timestamp = now();
    mapping.schema_version = SCHEMA_VERSION;
    mapping.links.insert(
        key,
        RemoteSessionLink {
            session_id: session_id.clone(),
            actor_id: actor_id.to_string(),
            created_at: timestamp.clone(),
            last_activity_at: timestamp,
        },
    );
    save_mapping(root, &mapping)?;
    Ok(session_id)
}

const REQUEST_LOG_RELATIVE_PATH: &str = ".yana-ai/os/remote-requests.jsonl";

#[derive(Debug, Serialize)]
struct RequestLogEntry<'a> {
    timestamp: String,
    actor: String,
    platform: &'a str,
    chat: &'a str,
    session_id: &'a str,
}

/// Append-only evidence trail for remote-triggered requests — deliberately
/// SEPARATE from `os::supervisor`'s safety-event hash chain, the same
/// discipline PR #204 established for `evidence-degraded.jsonl`: routine,
/// high-frequency traffic (every chat message) must not be mixed into the
/// receipt chain built and hardened for safety-critical events
/// (halt/unlock/quarantine). Best-effort — a logging failure here must
/// never fail the turn it is recording, so errors are swallowed, not
/// propagated.
pub fn record_request(root: &Path, actor: &Actor, platform: &str, chat: &str, session_id: &str) {
    let entry = RequestLogEntry {
        timestamp: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        actor: actor.as_receipt_actor(),
        platform,
        chat,
        session_id,
    };
    let path = root.join(REQUEST_LOG_RELATIVE_PATH);
    let Some(parent) = path.parent() else { return };
    if std::fs::create_dir_all(parent).is_err() {
        return;
    }
    let Ok(line) = serde_json::to_string(&entry) else {
        return;
    };
    use std::io::Write;
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .append(true)
        .create(true)
        .open(&path)
    {
        let _ = writeln!(file, "{line}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn root() -> PathBuf {
        std::env::temp_dir().join(format!("yana-remote-session-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn remote_actor_id_is_scoped_globally_per_user_not_per_channel() {
        let a = remote_actor_id("discord", "42");
        let b = remote_actor_id("discord", "42");
        assert_eq!(a, b, "same platform+user must resolve to the same actor id");
        let c = remote_actor_id("telegram", "42");
        assert_ne!(
            a, c,
            "same numeric user id on a different platform must not collide"
        );
    }

    #[test]
    fn remote_actor_binds_kind_human_and_the_given_session() {
        let actor = remote_actor("discord", "42", "sess-abc");
        assert_eq!(actor.kind, crate::os::identity::ActorKind::Human);
        assert_eq!(actor.id, remote_actor_id("discord", "42"));
        assert_eq!(actor.session_id.as_deref(), Some("sess-abc"));
    }

    #[test]
    fn resolve_session_creates_once_and_reuses_on_the_second_call() {
        let root = root();
        std::fs::create_dir_all(&root).unwrap();
        let actor_id = remote_actor_id("discord", "42");
        let created = AtomicUsize::new(0);

        let first = resolve_session(
            &root,
            "discord",
            "chan-1",
            &actor_id,
            || "t1".into(),
            |_sid| {
                created.fetch_add(1, Ordering::SeqCst);
                Ok(())
            },
        )
        .unwrap();
        let second = resolve_session(
            &root,
            "discord",
            "chan-1",
            &actor_id,
            || "t2".into(),
            |_sid| {
                created.fetch_add(1, Ordering::SeqCst);
                Ok(())
            },
        )
        .unwrap();

        assert_eq!(
            first, second,
            "the same channel must resume the same session"
        );
        assert_eq!(
            created.load(Ordering::SeqCst),
            1,
            "a session must be created exactly once, not on every message"
        );
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn resolve_session_gives_different_channels_different_sessions() {
        let root = root();
        std::fs::create_dir_all(&root).unwrap();
        let actor_id = remote_actor_id("discord", "42");

        let a = resolve_session(
            &root,
            "discord",
            "chan-a",
            &actor_id,
            || "t".into(),
            |_| Ok(()),
        )
        .unwrap();
        let b = resolve_session(
            &root,
            "discord",
            "chan-b",
            &actor_id,
            || "t".into(),
            |_| Ok(()),
        )
        .unwrap();

        assert_ne!(a, b, "different channels must not share a session");
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn resolve_session_survives_a_missing_mapping_file() {
        let root = root();
        // Deliberately do NOT create the directory — proves the "no prior
        // mapping" path (NotFound) is handled, not just the empty-map path.
        let actor_id = remote_actor_id("discord", "1");
        let session_id = resolve_session(
            &root,
            "discord",
            "chan",
            &actor_id,
            || "t".into(),
            |_| Ok(()),
        )
        .unwrap();
        assert!(!session_id.is_empty());
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn load_mapping_rejects_malformed_json_rather_than_silently_starting_over() {
        let root = root();
        std::fs::create_dir_all(root.join(".yana-ai/os")).unwrap();
        std::fs::write(mapping_path(&root), b"not json").unwrap();
        let actor_id = remote_actor_id("discord", "1");
        let result = resolve_session(
            &root,
            "discord",
            "chan",
            &actor_id,
            || "t".into(),
            |_| Ok(()),
        );
        assert!(
            result.is_err(),
            "a corrupted mapping file must error, not silently discard the existing links"
        );
        std::fs::remove_dir_all(root).ok();
    }
}
