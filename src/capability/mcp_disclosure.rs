//! What an approver must see before an external MCP program runs (WS3 T1).
//!
//! Lives in `capability`, not in the `mcp`-feature client, because the chat
//! approval prompt and the remote/durable approval record need it in every
//! build. It reads the configuration (after the first-use trust check) and
//! starts nothing.
//!
//! The call text is `"<server>"` (list that server's tools) or
//! `"<server> <tool>"` (call one), with exactly one ASCII space. That exact text
//! is what a lease's `allow` and `deny` entries are matched against, token by
//! token: `allow: ["github"]` covers the whole server, `["github search"]` one
//! tool. The grammar is strict on purpose: authority tokenizes with
//! `shell_words`, the gateway must read the SAME tokens, and any text the two
//! could split differently (other kinds of whitespace, quotes) is refused here.

use super::error::CapabilityError;
use super::mcp_config::{find_server, valid_server_name, valid_tool_name, ServerConfig};
use std::path::Path;

fn invalid(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::InvalidInput { detail: detail.into() }
}

/// `"server"` or `"server tool"`: single ASCII spaces only, nothing else.
pub fn parse_command(command: &str) -> Result<(String, Option<String>), CapabilityError> {
    let mut words = command.split(' ');
    let server = words.next().unwrap_or("");
    let tool = words.next();
    if words.next().is_some() {
        return Err(invalid("command must be \"<server>\" or \"<server> <tool>\""));
    }
    if !valid_server_name(server) {
        return Err(invalid(format!("{server:?} is not a valid server name")));
    }
    if let Some(tool) = tool.filter(|t| !valid_tool_name(t)) {
        return Err(invalid(format!("{tool:?} is not a plain tool name")));
    }
    Ok((server.to_string(), tool.map(str::to_string)))
}

/// The server, the exact command line, and the environment variable NAMES it
/// receives. Also the proof of what was approved: execution compares against it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Disclosure {
    pub server: String,
    pub tool: Option<String>,
    pub command: String,
    pub args: Vec<String>,
    pub env_names: Vec<String>,
    pub timeout_secs: u64,
}

impl Disclosure {
    /// The command line, quoted, exactly as it will run.
    pub fn command_line(&self) -> String {
        shell_words::join(std::iter::once(self.command.as_str()).chain(self.args.iter().map(String::as_str)))
    }

    /// The variable names passed on, or `none`.
    pub fn env_note(&self) -> String {
        if self.env_names.is_empty() {
            "none".to_string()
        } else {
            self.env_names.join(", ")
        }
    }

    pub fn summary(&self) -> String {
        let what = self.tool.as_deref().map_or("list its tools".to_string(), |t| format!("call its tool '{t}'"));
        let env = if self.env_names.is_empty() { "no extra variables".to_string() } else { format!("variables {}", self.env_names.join(", ")) };
        format!("MCP: start external program `{}` (server '{}', {env} passed, timeout {}s) and {what}", self.command_line(), self.server, self.timeout_secs)
    }

    /// The model's arguments as an approver reads them: compact JSON with control
    /// and invisible characters masked, quoted, and cut to a length that fits.
    pub fn arguments_note(arguments: &serde_json::Value) -> String {
        const MAX: usize = 200;
        let raw = arguments.to_string();
        let mut shown: String = raw.chars().map(|c| if c.is_control() || crate::capability::untrusted::is_invisible_format_char(c) { '?' } else { c }).take(MAX).collect();
        if raw.chars().count() > MAX {
            shown.push_str("...");
        }
        format!("{shown:?}")
    }
}

pub fn disclosure_of(config: &ServerConfig, tool: Option<String>) -> Disclosure {
    Disclosure {
        server: config.name.clone(),
        tool,
        command: config.command.clone(),
        args: config.args.clone(),
        env_names: config.env.clone(),
        timeout_secs: config.timeout().as_secs(),
    }
}

/// Read-only: no process is started and no secret value is read. Refuses a
/// configuration nobody confirmed (`yana-rt trust allow mcp-servers`).
pub fn disclose(root: &Path, command: &str) -> Result<Disclosure, CapabilityError> {
    let (server, tool) = parse_command(command)?;
    Ok(disclosure_of(&find_server(root, &server)?, tool))
}
