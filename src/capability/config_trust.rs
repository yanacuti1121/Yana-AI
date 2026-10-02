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

/// SHA-256 (hex) of the configuration file's exact bytes.
pub fn fingerprint(root: &Path, kind: ConfigKind) -> Result<String, CapabilityError> {
    let path = kind.path(root);
    let bytes = fs::read(&path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => CapabilityError::Unsupported {
            detail: format!("{} is not configured: there is no .yana-ai/{} in this repository", kind.human(), kind.file_name()),
        },
        _ => CapabilityError::Io { detail: format!("read {}: {e}", kind.file_name()) },
    })?;
    Ok(Sha256::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect())
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

/// Ok only if a person confirmed exactly this content of `kind`'s file in this repository.
pub fn require_in(store: &Path, root: &Path, kind: ConfigKind) -> Result<(), CapabilityError> {
    let now = fingerprint(root, kind)?;
    check_store_outside(store, root)?;
    match read_record(store, root).entries.get(kind.file_name()) {
        None => Err(not_trusted(kind, "never confirmed here")),
        Some(recorded) if *recorded == now => Ok(()),
        Some(_) => Err(not_trusted(kind, "its content changed since it was confirmed")),
    }
}

pub fn require(root: &Path, kind: ConfigKind) -> Result<(), CapabilityError> {
    match store_dir() {
        Ok(store) => require_in(&store, root, kind),
        Err(_) => Err(not_trusted(kind, "no trust store available")),
    }
}

pub fn is_trusted(root: &Path, kind: ConfigKind) -> bool {
    require(root, kind).is_ok()
}

/// Record a person's confirmation of `kind`'s current content. Does not ask
/// anyone: the caller (`cmd_trust_allow`) must have. Returns whether the
/// confirmed content differs from what was recorded before (so leases were revoked).
pub fn allow_in(store: &Path, root: &Path, kind: ConfigKind) -> Result<bool, CapabilityError> {
    let hash = fingerprint(root, kind)?;
    check_store_outside(store, root)?;
    let mut record = read_record(store, root);
    let changed = record.entries.get(kind.file_name()) != Some(&hash);
    record.repo = root.canonicalize().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    record.entries.insert(kind.file_name().to_string(), hash);
    write_record(store, root, &record)?;
    if changed {
        revoke_leases(root, kind);
    }
    Ok(changed)
}

/// Forget the confirmation (and the leases that depended on it).
pub fn revoke_in(store: &Path, root: &Path, kind: ConfigKind) -> Result<(), CapabilityError> {
    check_store_outside(store, root)?;
    let mut record = read_record(store, root);
    if record.entries.remove(kind.file_name()).is_some() {
        write_record(store, root, &record)?;
    }
    revoke_leases(root, kind);
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
/// configuration that is no longer the confirmed one.
fn revoke_leases(root: &Path, kind: ConfigKind) {
    let store = super::lease::LeaseStore::for_root(root);
    if let Ok(leases) = store.list() {
        for lease in leases.iter().filter(|l| !l.revoked && l.capability == kind.lease_capability()) {
            let _ = store.revoke(&lease.id);
        }
    }
}

// ── Command line (`yana-rt trust ...`) ───────────────────────────────────────

use anyhow::{bail, Context, Result};
use std::io::{BufRead, IsTerminal, Write};

/// Most of the file shown for review. A longer file is refused rather than shown cut off.
const MAX_REVIEW_BYTES: usize = 8 * 1024;

fn parse_kind(text: &str) -> Result<ConfigKind> {
    ConfigKind::parse(text).with_context(|| format!("unknown configuration {text:?}; use web-search or mcp-servers"))
}

/// Control characters shown as `?`: what is printed must not rewrite the terminal.
fn printable(text: &str) -> String {
    text.chars().map(|c| if c.is_control() && c != '\n' { '?' } else { c }).collect()
}

fn project_root() -> Result<PathBuf> {
    std::env::current_dir().context("cannot resolve project root")
}

pub fn cmd_trust_status() -> Result<()> {
    let root = project_root()?;
    for kind in ConfigKind::ALL {
        let state = match require(&root, kind) {
            Ok(()) => "trusted".to_string(),
            Err(CapabilityError::Unsupported { .. }) => "not present".to_string(),
            Err(error) => format!("NOT trusted: {error}"),
        };
        println!("{:<12} {state}", kind.label());
    }
    Ok(())
}

fn review_text(root: &Path, kind: ConfigKind) -> Result<String> {
    let hash = fingerprint(root, kind)?;
    let bytes = fs::read(kind.path(root)).with_context(|| format!("read {}", kind.file_name()))?;
    if bytes.len() > MAX_REVIEW_BYTES {
        bail!("{} is larger than {MAX_REVIEW_BYTES} bytes; it is too long to review here", kind.file_name());
    }
    let text = printable(&String::from_utf8_lossy(&bytes));
    Ok(format!("{}:\n{text}\n\nsha256 {hash}", kind.path(root).display()))
}

pub fn cmd_trust_show(kind: &str) -> Result<()> {
    println!("{}", review_text(&project_root()?, parse_kind(kind)?)?);
    Ok(())
}

/// The confirmation itself, with its input and output passed in so it can be tested.
/// Refuses unless a person is at a terminal and types `yes`: an agent that runs
/// this command through `run_command` has no terminal to type into.
pub fn confirm_and_allow(
    store: &Path,
    root: &Path,
    kind: ConfigKind,
    interactive: bool,
    input: &mut dyn BufRead,
    output: &mut dyn Write,
) -> Result<bool> {
    if !interactive {
        bail!("confirming a configuration must be done by a person in a terminal (stdin is not one)");
    }
    writeln!(output, "{}\n", review_text(root, kind)?)?;
    write!(output, "Trust this exact content for {}? Type 'yes' to confirm: ", kind.file_name())?;
    output.flush()?;
    let mut answer = String::new();
    input.read_line(&mut answer)?;
    if answer.trim() != "yes" {
        bail!("not confirmed; nothing was recorded");
    }
    Ok(allow_in(store, root, kind)?)
}

pub fn cmd_trust_allow(kind: &str) -> Result<()> {
    let (root, kind) = (project_root()?, parse_kind(kind)?);
    let store = store_dir()?;
    let interactive = std::io::stdin().is_terminal() && std::io::stdout().is_terminal();
    let changed = confirm_and_allow(&store, &root, kind, interactive, &mut std::io::stdin().lock(), &mut std::io::stdout())?;
    println!("\nTrusted. {}", if changed { "Leases for this capability were revoked; grant them again if needed." } else { "Content was already trusted." });
    Ok(())
}

pub fn cmd_trust_revoke(kind: &str) -> Result<()> {
    let (root, kind) = (project_root()?, parse_kind(kind)?);
    revoke_in(&store_dir()?, &root, kind)?;
    println!("Trust for {} revoked.", kind.file_name());
    Ok(())
}

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
            allow_in(&store, root, kind).expect("trust a test configuration");
        }
    }
}

#[cfg(test)]
mod tests;
