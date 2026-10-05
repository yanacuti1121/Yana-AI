//! Starting a configured MCP server as a child process (WS3 T1).
//!
//! The child gets an EMPTY environment plus `PATH` and the variable names the
//! user listed for that server, the repository root as its working directory,
//! no terminal input, and its error output discarded. It runs in its own
//! process group so the whole tree can be killed, and its output is read
//! through a bounded reader. It is killed when the session ends or is dropped.

use super::bounded::{BoundedReader, MAX_LINE_BYTES, MAX_TOTAL_BYTES};
use super::config::ServerConfig;
use super::process::command_for;
use super::session::{Limits, Session};
use crate::capability::CapabilityError;
use std::path::Path;

/// Start `config`'s server and finish the MCP handshake.
pub async fn spawn_session(config: &ServerConfig, root: &Path) -> Result<Session, CapabilityError> {
    let mut child = command_for(config, root).spawn().map_err(|e| CapabilityError::SpawnFailed {
        detail: format!("MCP server '{}' could not be started ({:?})", config.name, e.kind()),
    })?;
    let (Some(stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
        return Err(CapabilityError::SpawnFailed { detail: format!("MCP server '{}': no pipes to talk through", config.name) });
    };
    let limits = Limits { startup: config.timeout(), call: config.timeout() };
    let bounded = BoundedReader::new(stdout, MAX_LINE_BYTES, MAX_TOTAL_BYTES);
    Session::start((bounded, stdin), Some(child), limits, &config.name).await
}
