//! `mcp.call`: the one door to every external MCP tool (WS3 T1,
//! docs/contracts/ws3-tools.md 4 and 13).
//!
//! The call text is `"<server>"` (list that server's tools) or
//! `"<server> <tool>"` (call one), with exactly one ASCII space. That exact text
//! is what a lease's `allow` and `deny` entries are matched against, token by
//! token: `allow: ["github"]` covers the whole server, `["github search"]` one
//! tool. The grammar is strict on purpose: authority tokenizes with
//! `shell_words`, this module must read the SAME tokens, and any text the two
//! could split differently (other kinds of whitespace, quotes) is refused here.
//!
//! This module does NOT authorize. The caller must have passed the capability
//! through `YanaAuthorityChain` (human approval per call, or a matching lease)
//! BEFORE calling `mcp_call`, and must pass the [`Disclosure`] the approver was
//! shown: `mcp_call` runs only if the server's configuration still matches it.
//! Output is untrusted: it is screened and wrapped by `capability::untrusted`.

use super::config::{find_server, valid_server_name, ServerConfig};
use super::session::{valid_tool_name, Session, ToolInfo, ToolOutput};
use super::spawn::spawn_session;
use crate::capability::untrusted::guard;
use crate::capability::CapabilityError;
use serde_json::{json, Value};
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

/// What an approver must see before an external program runs: which server, the
/// exact command line, and which environment variable NAMES it receives. It is
/// also the proof of what was approved: `mcp_call` compares against it.
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

    pub fn summary(&self) -> String {
        let what = self.tool.as_deref().map_or("list its tools".to_string(), |t| format!("call its tool '{t}'"));
        let env = if self.env_names.is_empty() { "no extra variables".to_string() } else { format!("variables {}", self.env_names.join(", ")) };
        format!("MCP: start external program `{}` (server '{}', {env} passed) and {what}", self.command_line(), self.server)
    }
}

fn disclosure_of(config: &ServerConfig, tool: Option<String>) -> Disclosure {
    Disclosure {
        server: config.name.clone(),
        tool,
        command: config.command.clone(),
        args: config.args.clone(),
        env_names: config.env.clone(),
        timeout_secs: config.timeout().as_secs(),
    }
}

/// Read-only: no process is started and no secret value is read.
pub fn disclose(root: &Path, command: &str) -> Result<Disclosure, CapabilityError> {
    let (server, tool) = parse_command(command)?;
    Ok(disclosure_of(&find_server(root, &server)?, tool))
}

enum Outcome {
    Tools(Vec<ToolInfo>),
    Result(ToolOutput),
}

async fn run(config: ServerConfig, root: &Path, tool: Option<&str>, arguments: &Value) -> Result<Outcome, CapabilityError> {
    let session: Session = spawn_session(&config, root).await?;
    let outcome = match tool {
        None => session.list_tools().await.map(Outcome::Tools),
        Some(name) => session.call_tool(name, arguments).await.map(Outcome::Result),
    };
    session.close().await;
    outcome
}

/// Run on a thread of its own, so this works whether or not the caller is
/// already inside an async runtime. Worst case it takes about twice the
/// server's `timeout_secs` (start, then the call) plus a couple of seconds to stop it.
fn run_blocking(config: ServerConfig, root: &Path, tool: Option<&str>, arguments: &Value) -> Result<Outcome, CapabilityError> {
    std::thread::scope(|scope| {
        scope
            .spawn(|| {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| CapabilityError::Io { detail: format!("could not start the MCP runtime: {e}") })?;
                runtime.block_on(run(config, root, tool, arguments))
            })
            .join()
            .unwrap_or_else(|_| Err(CapabilityError::Io { detail: "the MCP call stopped unexpectedly".into() }))
    })
}

fn render_tools(tools: &[ToolInfo]) -> String {
    if tools.is_empty() {
        return "(no tools)".to_string();
    }
    tools.iter().map(|t| if t.description.is_empty() { t.name.clone() } else { format!("{}: {}", t.name, t.description) }).collect::<Vec<_>>().join("\n")
}

/// List a server's tools or call one. The caller must already have authorized it,
/// and passes the `approved` disclosure the approver saw. The server's
/// configuration is read ONCE here and run only if it equals `approved`: a file
/// that changed since approval (an edit, a `git pull`) runs nothing.
pub fn mcp_call(root: &Path, command: &str, arguments: &Value, approved: &Disclosure) -> Result<String, CapabilityError> {
    let (server, tool) = parse_command(command)?;
    let config = find_server(root, &server)?;
    if &disclosure_of(&config, tool.clone()) != approved {
        return Err(CapabilityError::External {
            detail: format!("the configuration of MCP server '{server}' is not what was approved; nothing was started"),
        });
    }
    let source = match &tool {
        Some(t) => format!("mcp:{server}/{t}"),
        None => format!("mcp:{server}"),
    };
    let (text, truncated, failed) = match run_blocking(config, root, tool.as_deref(), arguments)? {
        Outcome::Tools(tools) => (render_tools(&tools), false, false),
        Outcome::Result(out) => (out.text, out.truncated, out.is_error),
    };
    let wrapped = guard(&source, &text)?;
    if failed {
        return Err(CapabilityError::External { detail: format!("the tool reported an error:\n{wrapped}") });
    }
    let data = json!({"server": server, "tool": tool, "content": wrapped});
    serde_json::to_string(&json!({"capability": "mcp.call", "data": data, "truncated": truncated}))
        .map_err(|e| CapabilityError::Serialize { detail: e.to_string() })
}
