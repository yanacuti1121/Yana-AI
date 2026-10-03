//! One connection to one MCP server (WS3 T1).
//!
//! `Session` wraps rmcp's client over any async transport, so tests use an
//! in-memory pipe against a real rmcp server and the gateway uses a child
//! process. Every operation has a time limit, results are size-capped, and
//! nothing the server sends is trusted: text is returned to the caller, who
//! must screen it (`capability::untrusted`) before a model sees it.

use crate::capability::CapabilityError;
use rmcp::service::{RoleClient, RunningService, ServiceError};
use rmcp::transport::IntoTransport;
use rmcp::{model::CallToolRequestParams, model::PaginatedRequestParams, ServiceExt};
use serde_json::{Map, Value};
use std::time::Duration;
use tokio::process::Child;

/// Most tools taken from a listing; extra ones are ignored.
pub const MAX_TOOLS: usize = 200;
/// Most listing pages followed.
pub const MAX_PAGES: usize = 10;
/// Largest tool result kept, in bytes; the rest is cut.
pub const MAX_RESULT_BYTES: usize = 64 * 1024;
const MAX_DESCRIPTION_CHARS: usize = 300;
pub use crate::capability::mcp_config::valid_tool_name;

#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub startup: Duration,
    pub call: Duration,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolInfo {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolOutput {
    pub text: String,
    pub truncated: bool,
    /// The server marked the call as failed (`isError`).
    pub is_error: bool,
}

pub struct Session {
    service: RunningService<RoleClient, ()>,
    child: Option<Child>,
    limits: Limits,
    label: String,
}

fn external(label: &str, what: &str) -> CapabilityError {
    // Fixed text: whatever the server said is not copied into our error.
    CapabilityError::External { detail: format!("MCP server '{label}': {what}") }
}

fn service_error(label: &str, error: &ServiceError) -> CapabilityError {
    match error {
        ServiceError::Timeout { .. } => CapabilityError::Timeout { detail: format!("MCP server '{label}'") },
        ServiceError::McpError(_) => external(label, "answered with a protocol error"),
        _ => external(label, "the connection failed or closed"),
    }
}

fn clip(text: &str, max_chars: usize) -> String {
    text.chars().map(|c| if c.is_control() { ' ' } else { c }).take(max_chars).collect()
}

impl Session {
    /// Connect over `transport` and complete the MCP handshake within `limits.startup`.
    pub async fn start<T, E, A>(transport: T, child: Option<Child>, limits: Limits, label: &str) -> Result<Self, CapabilityError>
    where
        T: IntoTransport<RoleClient, E, A>,
        E: std::error::Error + Send + Sync + 'static,
    {
        let mut child = child;
        let handshake = tokio::time::timeout(limits.startup, ().serve(transport)).await;
        let failure = match handshake {
            Ok(Ok(service)) => return Ok(Self { service, child, limits, label: label.to_string() }),
            Ok(Err(_)) => external(label, "the handshake failed (not an MCP server, or it exited)"),
            Err(_) => CapabilityError::Timeout { detail: format!("starting MCP server '{label}'") },
        };
        // A server that never completed the handshake must not be left running.
        if let Some(child) = child.as_mut() {
            kill_tree(child).await;
        }
        Err(failure)
    }

    /// The server's tools (names and short descriptions), at most `MAX_TOOLS`.
    /// Pages are followed up to `MAX_PAGES`; a server that keeps offering more is
    /// cut off rather than followed forever.
    pub async fn list_tools(&self) -> Result<Vec<ToolInfo>, CapabilityError> {
        let walk = async {
            let mut tools: Vec<ToolInfo> = Vec::new();
            let mut cursor = None;
            for _ in 0..MAX_PAGES {
                let page = self.service.list_tools(Some(PaginatedRequestParams::default().with_cursor(cursor))).await?;
                tools.extend(
                    page.tools
                        .into_iter()
                        .filter(|tool| valid_tool_name(&tool.name))
                        .map(|tool| ToolInfo { name: tool.name.to_string(), description: clip(tool.description.as_deref().unwrap_or(""), MAX_DESCRIPTION_CHARS) }),
                );
                cursor = page.next_cursor;
                if cursor.is_none() || tools.len() >= MAX_TOOLS {
                    break;
                }
            }
            tools.truncate(MAX_TOOLS);
            Ok::<_, ServiceError>(tools)
        };
        tokio::time::timeout(self.limits.call, walk)
            .await
            .map_err(|_| CapabilityError::Timeout { detail: format!("listing tools of '{}'", self.label) })?
            .map_err(|e| service_error(&self.label, &e))
    }

    /// Call `tool` with `arguments` (a JSON object, or `null` for none).
    pub async fn call_tool(&self, tool: &str, arguments: &Value) -> Result<ToolOutput, CapabilityError> {
        if !valid_tool_name(tool) {
            return Err(CapabilityError::InvalidInput { detail: format!("tool name {tool:?} is not a plain name") });
        }
        let args: Option<Map<String, Value>> = match arguments {
            Value::Null => None,
            Value::Object(map) => Some(map.clone()),
            _ => return Err(CapabilityError::InvalidInput { detail: "arguments must be a JSON object".into() }),
        };
        let mut request = CallToolRequestParams::new(tool.to_string());
        if let Some(map) = args {
            request = request.with_arguments(map);
        }
        let reply = tokio::time::timeout(self.limits.call, self.service.call_tool(request))
            .await
            .map_err(|_| CapabilityError::Timeout { detail: format!("calling '{tool}' on '{}'", self.label) })?
            .map_err(|e| service_error(&self.label, &e))?;
        Ok(output_of(&reply))
    }

    /// Stop the connection and make sure the child process is gone.
    pub async fn close(mut self) {
        let _ = tokio::time::timeout(Duration::from_secs(2), self.service.close()).await;
        if let Some(child) = self.child.as_mut() {
            kill_tree(child).await;
        }
    }
}

/// Kill the server and everything it started (`npx`, `sh -c` wrappers and the
/// like leave helpers behind), then reap it. The child was put in its own
/// process group when it was spawned, so the group id is its pid.
pub(crate) async fn kill_tree(child: &mut Child) {
    #[cfg(unix)]
    if let Some(pid) = child.id() {
        // SAFETY: plain signal to a process group this module created.
        unsafe {
            let _ = libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
    let _ = child.kill().await;
}

/// The text of a reply. Non-text content is named, not included.
fn output_of(reply: &rmcp::model::CallToolResult) -> ToolOutput {
    let mut parts: Vec<String> = Vec::new();
    for block in &reply.content {
        let value = serde_json::to_value(block).unwrap_or(Value::Null);
        match (value.get("type").and_then(Value::as_str), value.get("text").and_then(Value::as_str)) {
            (Some("text"), Some(text)) => parts.push(text.to_string()),
            (Some(kind), _) => parts.push(format!("[{kind} content omitted]")),
            _ => parts.push("[content omitted]".to_string()),
        }
    }
    if parts.is_empty() {
        if let Some(structured) = &reply.structured_content {
            parts.push(structured.to_string());
        }
    }
    let joined = parts.join("\n");
    let mut end = joined.len().min(MAX_RESULT_BYTES);
    while !joined.is_char_boundary(end) {
        end -= 1;
    }
    ToolOutput { truncated: end < joined.len(), text: joined[..end].to_string(), is_error: reply.is_error.unwrap_or(false) }
}

#[cfg(test)]
mod tests;
