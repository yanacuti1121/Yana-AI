//! `mcp.call`: the one door to every external MCP tool (WS3 T1,
//! docs/contracts/ws3-tools.md 4, 13 and 14).
//!
//! The call grammar and the [`Disclosure`] an approver is shown live in
//! `capability::mcp_disclosure` (the chat prompt needs them in every build);
//! they are re-exported here.
//!
//! This module does NOT authorize. The caller must have passed the capability
//! through `YanaAuthorityChain` (human approval per call, or a matching lease)
//! BEFORE calling `mcp_call`, and must pass the [`Disclosure`] the approver was
//! shown: `mcp_call` runs only if the server's configuration still matches it.
//! Output is untrusted: it is screened and wrapped by `capability::untrusted`.

#[allow(unused_imports)] // re-exported for callers and tests; not every build uses each name
pub use crate::capability::mcp_disclosure::{disclose, disclosure_of, parse_command, Disclosure};

use super::config::{find_server, ServerConfig};
use super::session::{Session, ToolInfo, ToolOutput};
use super::spawn::spawn_session;
use crate::capability::untrusted::guard;
use crate::capability::CapabilityError;
use serde_json::{json, Value};
use std::path::Path;

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
