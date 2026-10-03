//! First-use confirmation for repo-supplied configuration (WS3, like `direnv allow`).
//!
//! `.yana-ai/web-search.json` and `.yana-ai/mcp-servers.json` live inside the
//! repository, so a repository you only cloned can ship them: one names a host
//! that receives your search queries, the other names a program that will be
//! run. Neither is used until a person has confirmed THIS content. The
//! confirmation is the SHA-256 of the whole file, recorded OUTSIDE the
//! repository (a governed write cannot reach it); change a byte and it must be
//! confirmed again. Everything fails closed: no record, a different hash, an
//! unreadable or deleted store, a store placed inside the repository: all mean
//! "not trusted".
//!
//! Confirming a configuration whose content differs from the recorded one (or
//! that had no record) revokes the leases for its capability, because a lease
//! was granted against a configuration that is gone.

use super::error::CapabilityError;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConfigKind {
    WebSearch,
    McpServers,
}

impl ConfigKind {
    pub const ALL: [ConfigKind; 2] = [ConfigKind::WebSearch, ConfigKind::McpServers];

    pub fn file_name(self) -> &'static str {
        match self {
            Self::WebSearch => "web-search.json",
            Self::McpServers => "mcp-servers.json",
        }
    }

    /// The name used on the command line: `yana-rt trust allow web-search`.
    pub fn label(self) -> &'static str {
        match self {
            Self::WebSearch => "web-search",
            Self::McpServers => "mcp-servers",
        }
    }

    pub fn parse(text: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|kind| kind.label() == text)
    }

    fn human(self) -> &'static str {
        match self {
            Self::WebSearch => "web search",
            Self::McpServers => "MCP servers",
        }
    }

    /// The capability whose leases depend on this configuration.
    fn lease_capability(self) -> &'static str {
        match self {
            Self::WebSearch => "web.search",
            Self::McpServers => "mcp.call",
        }
    }

    fn path(self, root: &Path) -> PathBuf {
        root.join(".yana-ai").join(self.file_name())
    }

    /// Whether the repository ships this configuration at all (a regular file).
    pub fn exists_in(self, root: &Path) -> bool {
        self.path(root).is_file()
    }
}

fn refuse(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::InvalidInput { detail: detail.into() }
}

fn not_trusted(kind: ConfigKind, why: &str) -> CapabilityError {
    CapabilityError::InvalidInput {
        detail: format!(
            "{} is not trusted ({why}); a person must review it and run `yana-rt trust allow {}` in a terminal",
            kind.file_name(),
            kind.label()
        ),
    }
}

#[cfg(test)]
thread_local! {
    /// Tests give each test thread its own store, so they never share state or touch a real home.
    static TEST_STORE: std::cell::RefCell<Option<PathBuf>> = const { std::cell::RefCell::new(None) };
}

/// Where confirmations are kept: `$YANA_TRUST_DIR`, else `$HOME/.yana-ai/trust/<profile>`
/// (profile from `$YANA_PROFILE`, default `default`).
pub fn store_dir() -> Result<PathBuf, CapabilityError> {
    #[cfg(test)]
    if let Some(dir) = TEST_STORE.with(|cell| cell.borrow().clone()) {
        return Ok(dir);
    }
    if let Some(dir) = std::env::var_os("YANA_TRUST_DIR").filter(|v| !v.is_empty()) {
        return Ok(PathBuf::from(dir));
    }
    let home = std::env::var_os("HOME").filter(|v| !v.is_empty()).ok_or_else(|| refuse("no home directory to keep trust records in"))?;
    let profile = std::env::var("YANA_PROFILE").ok().filter(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')).unwrap_or_else(|| "default".into());
    Ok(PathBuf::from(home).join(".yana-ai").join("trust").join(profile))
}

/// Largest configuration file read at all. The MCP loader allows 64 KiB; anything
/// larger is "not trusted" without being read into memory.
const MAX_CONFIG_BYTES: u64 = 64 * 1024;

fn hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

/// The configuration file's bytes and their SHA-256 (hex), from ONE bounded read of
/// a regular file (a FIFO, device or huge file is refused, not read). Callers that
/// parse the file parse THESE bytes, so what was hashed is what is used.
pub fn read_config(root: &Path, kind: ConfigKind) -> Result<(Vec<u8>, String), CapabilityError> {
    use std::io::Read;
    let path = kind.path(root);
    let io = |e: std::io::Error| match e.kind() {
        std::io::ErrorKind::NotFound => CapabilityError::Unsupported {
            detail: format!("{} is not configured: there is no .yana-ai/{} in this repository", kind.human(), kind.file_name()),
        },
        _ => CapabilityError::Io { detail: format!("read {}: {e}", kind.file_name()) },
    };
    if !fs::metadata(&path).map_err(io)?.is_file() {
        return Err(CapabilityError::Io { detail: format!("{} is not a regular file", kind.file_name()) });
    }
    let mut bytes = Vec::new();
    fs::File::open(&path).map_err(io)?.take(MAX_CONFIG_BYTES + 1).read_to_end(&mut bytes).map_err(io)?;
    if bytes.len() as u64 > MAX_CONFIG_BYTES {
        return Err(CapabilityError::InvalidInput { detail: format!("{} is larger than {MAX_CONFIG_BYTES} bytes", kind.file_name()) });
    }
    let hash = hex(&bytes);
    Ok((bytes, hash))
}

/// SHA-256 (hex) of the configuration file's exact bytes.
pub fn fingerprint(root: &Path, kind: ConfigKind) -> Result<String, CapabilityError> {
    read_config(root, kind).map(|(_, hash)| hash)
}

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
struct Record {
    repo: String,
    entries: BTreeMap<String, String>,
}

fn record_path(store: &Path, root: &Path) -> Result<PathBuf, CapabilityError> {
    let repo = root.canonicalize().map_err(|e| CapabilityError::Io { detail: format!("resolve repository: {e}") })?;
    let name: String = Sha256::digest(repo.to_string_lossy().as_bytes()).iter().take(16).map(|b| format!("{b:02x}")).collect();
    Ok(store.join(format!("{name}.json")))
}

/// Never trusts on an unreadable or malformed record: that is "no record".
fn read_record(store: &Path, root: &Path) -> Record {
    record_path(store, root)
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// A trust store inside the repository could be rewritten by a repository
/// write; refuse to use one.
fn check_store_outside(store: &Path, root: &Path) -> Result<(), CapabilityError> {
    let root = root.canonicalize().map_err(|e| CapabilityError::Io { detail: format!("resolve repository: {e}") })?;
    // The store may not exist yet: resolve its nearest existing ancestor.
    let mut existing = store;
    while !existing.exists() {
        existing = existing.parent().ok_or_else(|| refuse("trust store has no existing parent"))?;
    }
    let resolved = existing.canonicalize().map_err(|e| CapabilityError::Io { detail: format!("resolve trust store: {e}") })?;
    if resolved.starts_with(&root) {
        return Err(refuse("the trust store must be outside the repository"));
    }
    Ok(())
}

/// The file's bytes, if a person confirmed exactly this content of `kind`'s file in
/// this repository. One read: what was checked is what the caller gets to parse.
pub fn trusted_bytes_in(store: &Path, root: &Path, kind: ConfigKind) -> Result<Vec<u8>, CapabilityError> {
    let (bytes, now) = read_config(root, kind)?;
    check_store_outside(store, root)?;
    match read_record(store, root).entries.get(kind.file_name()) {
        None => Err(not_trusted(kind, "never confirmed here")),
        Some(recorded) if *recorded == now => Ok(bytes),
        Some(_) => Err(not_trusted(kind, "its content changed since it was confirmed")),
    }
}

#[cfg(test)]
pub fn require_in(store: &Path, root: &Path, kind: ConfigKind) -> Result<(), CapabilityError> {
    trusted_bytes_in(store, root, kind).map(|_| ())
}

/// See [`trusted_bytes_in`], with the store from the environment.
pub fn trusted_bytes(root: &Path, kind: ConfigKind) -> Result<Vec<u8>, CapabilityError> {
    match store_dir() {
        Ok(store) => trusted_bytes_in(&store, root, kind),
        Err(_) => Err(not_trusted(kind, "no trust store available")),
    }
}

pub fn require(root: &Path, kind: ConfigKind) -> Result<(), CapabilityError> {
    trusted_bytes(root, kind).map(|_| ())
}

pub fn is_trusted(root: &Path, kind: ConfigKind) -> bool {
    require(root, kind).is_ok()
}

/// Record a person's confirmation of the content whose hash is `shown`: the hash
/// they were shown, not whatever the file holds by now. Fails if the file differs.
/// Leases for the capability are revoked FIRST and any failure stops the
/// confirmation, so a trusted configuration never keeps a lease granted against
/// another. Returns whether the confirmed content differs from the one recorded before.
pub fn allow_hash_in(store: &Path, root: &Path, kind: ConfigKind, shown: &str) -> Result<bool, CapabilityError> {
    if fingerprint(root, kind)? != shown {
        return Err(refuse(format!("{} changed after it was shown; nothing was recorded", kind.file_name())));
    }
    check_store_outside(store, root)?;
    let mut record = read_record(store, root);
    let changed = record.entries.get(kind.file_name()).map(String::as_str) != Some(shown);
    if changed {
        revoke_leases(root, kind)?;
    }
    record.repo = root.canonicalize().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    record.entries.insert(kind.file_name().to_string(), shown.to_string());
    write_record(store, root, &record)?;
    Ok(changed)
}

/// Confirm the content that is in the file right now (for callers that did not show it).
#[cfg(test)]
pub fn allow_in(store: &Path, root: &Path, kind: ConfigKind) -> Result<bool, CapabilityError> {
    let hash = fingerprint(root, kind)?;
    allow_hash_in(store, root, kind, &hash)
}

/// Forget the confirmation (and the leases that depended on it).
pub fn revoke_in(store: &Path, root: &Path, kind: ConfigKind) -> Result<(), CapabilityError> {
    check_store_outside(store, root)?;
    revoke_leases(root, kind)?;
    let mut record = read_record(store, root);
    if record.entries.remove(kind.file_name()).is_some() {
        write_record(store, root, &record)?;
    }
    Ok(())
}

fn write_record(store: &Path, root: &Path, record: &Record) -> Result<(), CapabilityError> {
    let io = |what: &str, e: std::io::Error| CapabilityError::Io { detail: format!("{what}: {e}") };
    fs::create_dir_all(store).map_err(|e| io("create the trust store", e))?;
    let path = record_path(store, root)?;
    let temp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(record).map_err(|e| CapabilityError::Serialize { detail: e.to_string() })?;
    fs::write(&temp, text).map_err(|e| io("write the trust record", e))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&temp, fs::Permissions::from_mode(0o600));
    }
    fs::rename(&temp, &path).map_err(|e| io("store the trust record", e))
}

/// Leases for the capability this configuration drives were granted against a
/// configuration that is no longer the confirmed one. Errors are reported, not hidden.
fn revoke_leases(root: &Path, kind: ConfigKind) -> Result<usize, CapabilityError> {
    let store = super::lease::LeaseStore::for_root(root);
    let lease_err = |e: anyhow::Error| CapabilityError::Io { detail: format!("lease store: {e}") };
    let leases = store.list().map_err(lease_err)?;
    let mut revoked = 0;
    for lease in leases.iter().filter(|l| !l.revoked && l.capability == kind.lease_capability()) {
        store.revoke(&lease.id).map_err(lease_err)?;
        revoked += 1;
    }
    Ok(revoked)
}

mod cli;
pub use cli::*;

// ── Test support ─────────────────────────────────────────────────────────────

/// This test thread's private, initially empty store (so a test never reads a real home).
#[cfg(test)]
pub(crate) fn empty_store_in_test() -> PathBuf {
    TEST_STORE.with(|cell| {
        let mut slot = cell.borrow_mut();
        slot.get_or_insert_with(|| tempfile::tempdir().expect("temp trust store").keep()).clone()
    })
}

/// Give this test thread a private store and confirm every configuration file that exists in `root`.
#[cfg(test)]
pub(crate) fn trust_in_test(root: &Path) {
    let store = empty_store_in_test();
    for kind in ConfigKind::ALL {
        if kind.path(root).is_file() {
            // An unconfirmable file (over the size cap, not a regular file) stays untrusted, as it would for a person.
            let _ = allow_in(&store, root, kind);
        }
    }
}

#[cfg(test)]
mod tests;
