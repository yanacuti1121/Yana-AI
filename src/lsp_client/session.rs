//! One question to one language server, start to finish (WS3, contract section 17).
//!
//! Everything about the repository is checked BEFORE the program is started: the
//! file must be a readable file inside the repository and the line must exist. The
//! program then gets the T1 treatment (empty environment plus what was listed, its
//! own process group, bounded output) and the whole process tree is killed when the
//! question is answered, fails, or runs out of time.

use super::connection::Connection;
use super::codec::MAX_BODY_BYTES;
use super::operation::{check_target, file_uri, request_params, Query};
use crate::capability::CapabilityError;
use crate::mcp_client::bounded::{BoundedReader, MAX_TOTAL_BYTES};
use crate::mcp_client::config::ServerConfig;
use crate::mcp_client::session::kill_tree;
use crate::mcp_client::spawn::command_for;
use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;
use tokio::io::BufReader;
use tokio::time::Instant;

use crate::capability::lsp_config::DEFAULT_TIMEOUT_SECS;
/// The longest a question may be given, whatever the configuration or caller says.
const MAX_BUDGET: Duration = Duration::from_secs(300);
/// A little over the largest message body: the reader's line limit counts a body
/// (which has no newline) together with the header line that follows it.
const READER_LINE_LIMIT: usize = MAX_BODY_BYTES + 4096;
/// How long a server gets to say goodbye before it is killed anyway.
const GOODBYE: Duration = Duration::from_secs(2);

/// Everything read from the repository for one question.
pub struct Prepared {
    root_uri: String,
    document_uri: String,
    language_id: String,
    text: String,
    line_text: String,
}

fn language_id(path: &str) -> String {
    let extension = Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    match extension.as_str() {
        "rs" => "rust",
        "py" => "python",
        "ts" | "tsx" => "typescript",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "go" => "go",
        "c" | "h" => "c",
        "cc" | "cpp" | "cxx" | "hpp" => "cpp",
        "java" => "java",
        "rb" => "ruby",
        "kt" => "kotlin",
        "swift" => "swift",
        "cs" => "csharp",
        "" => "plaintext",
        other => other,
    }
    .to_string()
}

/// Read what the question is about. Fails, without starting anything, when the file
/// is not a readable file inside the repository or the line is not in it.
pub fn prepare(root: &Path, query: &Query) -> Result<Prepared, CapabilityError> {
    let target = check_target(root, query)?;
    Ok(Prepared {
        root_uri: file_uri(&target.canonical_root, "")?,
        document_uri: file_uri(&target.canonical_root, &target.relative)?,
        language_id: language_id(&query.path),
        text: target.text,
        line_text: target.line_text,
    })
}

/// What this client says it can do: read-only answers, and explicitly no editing,
/// no workspace folders, no configuration requests.
fn initialize_params(root_uri: &str) -> Value {
    json!({
        "processId": null,
        "clientInfo": {"name": "yana-rt"},
        "rootUri": root_uri,
        "workspaceFolders": null,
        "capabilities": {
            "general": {"positionEncodings": ["utf-16"]},
            "textDocument": {
                "synchronization": {"didSave": false},
                "definition": {"linkSupport": false},
                "references": {},
                "hover": {"contentFormat": ["plaintext", "markdown"]},
                "documentSymbol": {"hierarchicalDocumentSymbolSupport": true}
            },
            "workspace": {"applyEdit": false, "workspaceFolders": false, "configuration": false}
        }
    })
}

/// The conversation: initialize, open the one document, ask, return the server's `result`.
/// The whole of it, writes included, gets one deadline of at most `MAX_BUDGET`.
pub async fn exchange<R, W>(connection: &mut Connection<R, W>, prepared: &Prepared, query: &Query, budget: Duration) -> Result<Value, CapabilityError>
where
    R: tokio::io::AsyncBufRead + Unpin,
    W: tokio::io::AsyncWrite + Unpin,
{
    let budget = budget.min(MAX_BUDGET);
    let deadline = Instant::now() + budget;
    let left = || deadline.saturating_duration_since(Instant::now());
    let conversation = async {
        connection.request("initialize", initialize_params(&prepared.root_uri), left()).await?;
        connection.notify("initialized", json!({})).await?;
        let document = json!({"uri": prepared.document_uri, "languageId": prepared.language_id, "version": 1, "text": prepared.text});
        connection.notify("textDocument/didOpen", json!({"textDocument": document})).await?;
        let params = request_params(query, &prepared.document_uri, &prepared.line_text);
        connection.request(query.operation.method(), params, left()).await
    };
    tokio::time::timeout(budget, conversation).await.map_err(|_| CapabilityError::Timeout { detail: "the language server's answer".into() })?
}

fn budget(config: &ServerConfig) -> Duration {
    Duration::from_secs(config.timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS))
}

/// Start `config`'s server, ask, and stop it. The raw `result` of the LSP request.
pub async fn run_query(config: &ServerConfig, root: &Path, query: &Query) -> Result<Value, CapabilityError> {
    let prepared = prepare(root, query)?;
    let mut child = command_for(config, root)
        .spawn()
        .map_err(|e| CapabilityError::SpawnFailed { detail: format!("language server '{}' could not be started ({:?})", config.name, e.kind()) })?;
    let (Some(stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
        kill_tree(&mut child).await;
        return Err(CapabilityError::SpawnFailed { detail: format!("language server '{}': no pipes to talk through", config.name) });
    };
    // Remembered now: once the leader has been waited for, the child no longer knows its pid,
    // but helpers it started are still in its process group and must be killed.
    let group = child.id();
    let mut connection = Connection::new(BufReader::new(BoundedReader::new(stdout, READER_LINE_LIMIT, MAX_TOTAL_BYTES)), stdin);
    let outcome = exchange(&mut connection, &prepared, query, budget(config)).await;
    // Ask it to stop and give it a moment to leave (servers clean up locks and temp files on
    // exit); then make sure, whatever happened. A timed-out connection may be mid-frame, which
    // only matters here because the process is killed next.
    let _ = tokio::time::timeout(GOODBYE, async {
        let _ = connection.request("shutdown", Value::Null, GOODBYE).await;
        let _ = connection.notify("exit", Value::Null).await;
        let _ = child.wait().await;
    })
    .await;
    kill_group(group);
    kill_tree(&mut child).await;
    outcome
}

/// SIGKILL to the process group the server was started in (its pid is the group id).
fn kill_group(group: Option<u32>) {
    #[cfg(unix)]
    if let Some(pid) = group {
        // SAFETY: a plain signal to a process group this module created.
        unsafe {
            let _ = libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
    #[cfg(not(unix))]
    let _ = group;
}

/// `run_query` on a thread of its own, so it works whether or not the caller is
/// already inside an async runtime.
pub fn run_query_blocking(config: &ServerConfig, root: &Path, query: &Query) -> Result<Value, CapabilityError> {
    std::thread::scope(|scope| {
        scope
            .spawn(|| {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| CapabilityError::Io { detail: format!("could not start the language server runtime: {e}") })?;
                runtime.block_on(run_query(config, root, query))
            })
            .join()
            .unwrap_or_else(|_| Err(CapabilityError::Io { detail: "the language server query stopped unexpectedly".into() }))
    })
}

#[cfg(all(test, unix))]
mod tests;
