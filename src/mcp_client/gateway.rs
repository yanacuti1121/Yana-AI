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
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tokio::sync::Mutex as AsyncMutex;

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

type Key = (PathBuf, String);

/// A kept-alive connection and the configuration it was started with. A changed configuration never reuses it.
type Kept = (ServerConfig, Session);

static KEPT_RUNTIME: OnceLock<Result<tokio::runtime::Runtime, String>> = OnceLock::new();
static KEPT: OnceLock<AsyncMutex<HashMap<Key, Kept>>> = OnceLock::new();

/// One background runtime keeps the connections of kept-alive servers running between calls. It has a worker of its
/// own so a server's reader keeps being polled while no call is in progress.
fn kept_runtime() -> Result<&'static tokio::runtime::Runtime, CapabilityError> {
    KEPT_RUNTIME
        .get_or_init(|| {
            tokio::runtime::Builder::new_multi_thread().worker_threads(1).thread_name("mcp-kept").enable_all().build().map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(|detail| CapabilityError::Io { detail: format!("could not start the MCP runtime: {detail}") })
}

fn kept_sessions() -> &'static AsyncMutex<HashMap<Key, Kept>> {
    KEPT.get_or_init(|| AsyncMutex::new(HashMap::new()))
}

async fn use_session(session: &Session, tool: Option<&str>, arguments: &Value) -> Result<Outcome, CapabilityError> {
    match tool {
        None => session.list_tools().await.map(Outcome::Tools),
        Some(name) => session.call_tool(name, arguments).await.map(Outcome::Result),
    }
}

/// Calls go through one at a time. A session that ended, or whose configuration changed, is replaced; one whose call
/// failed or timed out is closed, so the next call starts clean instead of talking to a server in an unknown state.
async fn run_kept(config: ServerConfig, root: &Path, tool: Option<&str>, arguments: &Value) -> Result<Outcome, CapabilityError> {
    let key: Key = (root.to_path_buf(), config.name.clone());
    let mut sessions = kept_sessions().lock().await;
    if sessions.get(&key).is_some_and(|(started_with, session)| *started_with != config || session.is_closed()) {
        if let Some((_, stale)) = sessions.remove(&key) {
            stale.close().await;
        }
    }
    if !sessions.contains_key(&key) {
        let session = spawn_session(&config, root).await?;
        sessions.insert(key.clone(), (config, session));
    }
    let outcome = match sessions.get(&key) {
        Some((_, session)) => use_session(session, tool, arguments).await,
        None => Err(CapabilityError::Io { detail: "the kept MCP session disappeared".into() }),
    };
    if outcome.is_err() {
        if let Some((_, broken)) = sessions.remove(&key) {
            broken.close().await;
        }
    }
    outcome
}

fn run_kept_blocking(config: ServerConfig, root: &Path, tool: Option<&str>, arguments: &Value) -> Result<Outcome, CapabilityError> {
    let runtime = kept_runtime()?;
    // From a thread of its own, like `run_blocking`: `block_on` must not be called from inside another runtime.
    std::thread::scope(|scope| {
        scope
            .spawn(|| runtime.block_on(run_kept(config, root, tool, arguments)))
            .join()
            .unwrap_or_else(|_| Err(CapabilityError::Io { detail: "the MCP call stopped unexpectedly".into() }))
    })
}

fn shutdown_where(selected: impl Fn(&Key) -> bool + Sync) {
    let (Some(sessions), Ok(runtime)) = (KEPT.get(), kept_runtime()) else { return };
    std::thread::scope(|scope| {
        let _ = scope
            .spawn(|| {
                runtime.block_on(async {
                    let mut sessions = sessions.lock().await;
                    let keys: Vec<Key> = sessions.keys().filter(|key| selected(key)).cloned().collect();
                    for key in keys {
                        if let Some((_, session)) = sessions.remove(&key) {
                            session.close().await;
                        }
                    }
                })
            })
            .join();
    });
}

/// Stops every kept-alive server started for `root`. A no-op for a repository with none.
pub fn shutdown_persistent_in(root: &Path) {
    shutdown_where(|key| key.0 == root);
}

/// Stops every kept-alive server. Call once when a yana-rt run ends.
pub fn shutdown_persistent() {
    shutdown_where(|_| true);
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
    let outcome = if config.keep_alive {
        run_kept_blocking(config, root, tool.as_deref(), arguments)?
    } else {
        run_blocking(config, root, tool.as_deref(), arguments)?
    };
    let (text, truncated, failed) = match outcome {
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
