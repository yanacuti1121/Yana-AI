//! Which external MCP servers exist (WS3 T1, docs/contracts/ws3-tools.md 4).
//!
//! The list comes only from `<repo>/.yana-ai/mcp-servers.json`. A model cannot
//! add or change an entry: governed file writes refuse that path (see
//! `capability::file_mutation`). A repository you cloned can still ship its own
//! file, which is why every call is approved per call and the approval must
//! show the command line (`gateway::disclose`).

use crate::capability::CapabilityError;
use serde::Deserialize;
use crate::capability::config_trust::{self, ConfigKind};
use crate::capability::program_path;
use std::path::Path;

const CONFIG_PATH: &str = ".yana-ai/mcp-servers.json";
const MAX_SERVERS: usize = 32;
const MAX_ARGS: usize = 64;
const MAX_ENV_NAMES: usize = 32;
const MAX_NAME_CHARS: usize = 32;
/// Used when a server does not say how long a call may take.
pub const DEFAULT_TIMEOUT_SECS: u64 = 30;
const MAX_TIMEOUT_SECS: u64 = 120;

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct ServerConfig {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    /// NAMES of environment variables to pass on, in addition to `PATH`. The
    /// child gets nothing else from this process's environment.
    #[serde(default)]
    pub env: Vec<String>,
    #[serde(default)]
    pub timeout_secs: Option<u64>,
}

#[derive(Deserialize)]
struct File {
    servers: Vec<ServerConfig>,
}

fn invalid(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::InvalidInput { detail: detail.into() }
}

/// Only printable ASCII may appear in anything an approver reads: no control,
/// invisible or direction-changing characters, and a character is exactly one
/// terminal column, so the length limits below are the width the prompt must show.
fn has_control(text: &str) -> bool {
    text.chars().any(|c| !(c.is_ascii_graphic() || c == ' '))
}

/// Variables that change how a program loads code or finds programs. A listed
/// name is passed through with the user's own value, so these are refused: they
/// are the loader/interpreter hooks `env-integrity-policy` treats as Tier A or B.
fn is_loader_variable(name: &str) -> bool {
    const EXACT: [&str; 14] = [
        "PATH", "NODE_OPTIONS", "NODE_PATH", "PYTHONPATH", "PYTHONSTARTUP", "PYTHONINSPECT", "BASH_ENV", "ENV", "IFS",
        "PERL5LIB", "RUBYLIB", "JAVA_TOOL_OPTIONS", "CLASSPATH", "SHELLOPTS",
    ];
    EXACT.contains(&name) || name.starts_with("LD_") || name.starts_with("DYLD_")
}

const MAX_TOOL_NAME_CHARS: usize = 64;
/// What an approval prompt can show whole: the program and arguments, and the
/// variable names passed on. A configuration that needs more is refused instead
/// of being shown cut off.
pub const MAX_COMMAND_LINE_CHARS: usize = 160;
pub const MAX_ENV_LIST_CHARS: usize = 120;

/// A tool name is passed to a lease matcher as one token, so only plain
/// characters are accepted.
pub fn valid_tool_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= MAX_TOOL_NAME_CHARS && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | ':'))
}

/// Lower-case letters, digits, `-`, `_`. Server names become part of the text a
/// lease is matched against, so they must stay a single plain token.
pub fn valid_server_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= MAX_NAME_CHARS && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '-' | '_'))
}

pub(crate) fn validate(server: &ServerConfig) -> Result<(), CapabilityError> {
    let name = &server.name;
    if !valid_server_name(name) {
        return Err(invalid(format!("server name {name:?} must be 1 to {MAX_NAME_CHARS} characters of a-z, 0-9, '-' or '_'")));
    }
    if server.command.trim().is_empty() || has_control(&server.command) {
        return Err(invalid(format!("server '{name}': command is empty or has control characters")));
    }
    if server.args.len() > MAX_ARGS || server.args.iter().any(|a| has_control(a)) {
        return Err(invalid(format!("server '{name}': too many arguments, or an argument has control characters")));
    }
    let bad_env = |v: &String| v.is_empty() || !v.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_');
    if server.env.len() > MAX_ENV_NAMES || server.env.iter().any(bad_env) {
        return Err(invalid(format!("server '{name}': env must list up to {MAX_ENV_NAMES} upper-case variable NAMES")));
    }
    if let Some(loader) = server.env.iter().find(|v| is_loader_variable(v)) {
        return Err(invalid(format!("server '{name}': {loader} changes how programs load code and cannot be passed on")));
    }
    if server.command_line().chars().count() > MAX_COMMAND_LINE_CHARS {
        return Err(invalid(format!("server '{name}': the command line is longer than {MAX_COMMAND_LINE_CHARS} characters, too long to show an approver")));
    }
    if server.env.join(", ").chars().count() > MAX_ENV_LIST_CHARS {
        return Err(invalid(format!("server '{name}': the variable names are longer than {MAX_ENV_LIST_CHARS} characters together")));
    }
    if server.timeout_secs.is_some_and(|t| t == 0 || t > MAX_TIMEOUT_SECS) {
        return Err(invalid(format!("server '{name}': timeout_secs must be 1 to {MAX_TIMEOUT_SECS}")));
    }
    Ok(())
}

impl ServerConfig {
    pub fn timeout(&self) -> std::time::Duration {
        std::time::Duration::from_secs(self.timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS))
    }

    /// The command line as an approver should read it, quoted so that
    /// `a "b c"` and `a b c` cannot look the same.
    pub fn command_line(&self) -> String {
        shell_words::join(std::iter::once(self.command.as_str()).chain(self.args.iter().map(String::as_str)))
    }
}

/// All configured servers, read without any trust check (listing only). A missing file is an empty list.
pub fn load_servers(root: &Path) -> Result<Vec<ServerConfig>, CapabilityError> {
    match config_trust::read_config(root, ConfigKind::McpServers) {
        Ok((bytes, _)) => parse_servers(&bytes),
        Err(CapabilityError::Unsupported { .. }) => Ok(Vec::new()),
        Err(error) => Err(error),
    }
}

fn parse_servers(bytes: &[u8]) -> Result<Vec<ServerConfig>, CapabilityError> {
    let file: File = serde_json::from_slice(bytes).map_err(|e| invalid(format!("{CONFIG_PATH} is not valid: {e}")))?;
    if file.servers.len() > MAX_SERVERS {
        return Err(invalid(format!("{CONFIG_PATH} lists more than {MAX_SERVERS} servers")));
    }
    let mut seen = std::collections::BTreeSet::new();
    for server in &file.servers {
        validate(server)?;
        if !seen.insert(server.name.as_str()) {
            return Err(invalid(format!("server name '{}' appears twice", server.name)));
        }
    }
    Ok(file.servers)
}

/// The one server called `name`. The file may have come with a cloned repository:
/// nothing in it is used until a person confirmed this exact content
/// (`yana-rt trust allow mcp-servers`), and what is parsed here is the very bytes
/// that were checked.
pub fn find_server(root: &Path, name: &str) -> Result<ServerConfig, CapabilityError> {
    find_server_with_path(root, name, std::env::var_os("PATH").as_deref())
}

pub(crate) fn find_server_with_path(root: &Path, name: &str, path_var: Option<&std::ffi::OsStr>) -> Result<ServerConfig, CapabilityError> {
    let bytes = config_trust::trusted_bytes(root, ConfigKind::McpServers)?;
    let mut server = parse_servers(&bytes)?.into_iter().find(|s| s.name == name).ok_or_else(|| CapabilityError::NotFound {
        requested: format!("MCP server '{name}' (not listed in {CONFIG_PATH})"),
    })?;
    // A bare name ("npx") is resolved here, outside the repository, so the approver is shown and
    // the gateway runs the real program, not one the repository could place on a relative PATH
    // entry. An absolute or explicitly relative ("./x") command is already what it says.
    if program_path::is_bare_name(&server.command) {
        server.command = program_path::resolve_program_in(&server.command, root, path_var)?;
    }
    Ok(server)
}
