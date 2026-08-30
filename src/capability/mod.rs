//! Provider-agnostic local capabilities for Program J — the canonical
//! implementation behind MCP's 9 tools and `yana chat`'s `read_file`/
//! `run_command` tools alike (AD-11: no per-client duplicate logic).
//!
//! Split across files by domain (repo/git/system/command) to stay under
//! the repo's 300-line file limit once the registry/error/evidence layer
//! was added on top of the original single-file implementation — pure
//! move of existing function bodies, no behavior change.

pub mod archive;
pub mod cli;
pub mod command;
pub mod error;
pub mod evidence;
pub mod git;
pub mod lease;
pub mod registry;
mod registry_data;
pub mod repo;
pub mod system;

pub use archive::{extract_zip, inspect_zip, ExtractionResult, ZipEntryInfo, ZipInspection};
pub use command::{execute_command, validate_command, CommandOutcome, ValidatedCommand};
pub use error::CapabilityError;
pub use evidence::ToolEvidence;
pub use git::{git_commit, git_diff, git_diff_path, git_stage, git_status, git_unstage};
pub use registry::{AccessMode, ApprovalRequirement, CapabilityDescriptor, Manifest, RiskTier};
pub use repo::{
    read_file, read_file_observation, repo_tree, resolve_existing, search_code, FileReadObservation,
};
pub use system::{host_summary, list_processes, process_details};

use serde::Serialize;

// Private, but visible to child modules (repo/git/system/command) — Rust
// lets a descendant module see its ancestor's private items.
const MAX_TREE_ENTRIES: usize = 500;
const MAX_READ_BYTES: u64 = 256 * 1024;
const MAX_SEARCH_RESULTS: usize = 200;
const MAX_SEARCH_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_DIFF_BYTES: usize = 64 * 1024;
const MAX_COMMAND_OUTPUT_BYTES: usize = 32 * 1024;

#[derive(Serialize)]
struct Envelope<T: Serialize> {
    capability: &'static str,
    data: T,
    truncated: bool,
}

fn encode<T: Serialize>(
    capability: &'static str,
    data: T,
    truncated: bool,
) -> Result<String, CapabilityError> {
    serde_json::to_string(&Envelope {
        capability,
        data,
        truncated,
    })
    .map_err(|e| CapabilityError::Serialize {
        detail: e.to_string(),
    })
}

/// The canonical, always-fresh capability manifest (AD-16).
pub fn manifest() -> Manifest {
    Manifest::all()
}

/// Shared subprocess helper for `git`/`ps`/`uptime`/`df`/`sysctl`/`vm_stat`
/// — one implementation, used by both `git.rs` and `system.rs`.
fn run(program: &str, args: &[&str]) -> Result<String, CapabilityError> {
    let output = std::process::Command::new(program)
        .args(args)
        .output()
        .map_err(|e| CapabilityError::SpawnFailed {
            detail: format!("{program}: {e}"),
        })?;
    if !output.status.success() {
        return Err(CapabilityError::Io {
            detail: String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        });
    }
    String::from_utf8(output.stdout).map_err(|e| CapabilityError::InvalidUtf8 {
        requested: format!("{program} output: {e}"),
    })
}
