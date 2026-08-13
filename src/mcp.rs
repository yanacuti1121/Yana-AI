//! Program J capability runtime over MCP stdio.
//!
//! Repository and host capabilities remain read-only. Workspace mutations use
//! the same typed service and governor as the CLI; Critical approval is not
//! exposed over MCP.

use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, ContentBlock, Implementation, ServerCapabilities, ServerInfo},
    schemars, tool, tool_handler, tool_router,
    transport::stdio,
    ErrorData as McpError, ServerHandler, ServiceExt,
};
use std::path::PathBuf;

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct CheckCommandParams {
    command: String,
}
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct RepoTreeParams {
    #[serde(default = "dot")]
    path: String,
    #[serde(default = "depth")]
    depth: usize,
}
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct ReadFileParams {
    path: String,
}
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct SearchCodeParams {
    query: String,
    #[serde(default = "dot")]
    path: String,
}
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct GitDiffParams {
    #[serde(default)]
    staged: bool,
}
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct ListProcessesParams {
    #[serde(default = "memory")]
    sort: String,
    #[serde(default = "process_limit")]
    limit: usize,
}
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct ProcessDetailsParams {
    pid: u32,
}
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct WorkspaceSearchParams {
    query: String,
}
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct WorkspaceRelatedParams {
    block_id: String,
}
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct WorkspaceInboxParams {
    #[serde(default)]
    include_noise: bool,
}
#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct WorkspaceOperationParams {
    operation_json: String,
}
fn dot() -> String {
    ".".into()
}
fn depth() -> usize {
    2
}
fn memory() -> String {
    "memory".into()
}
fn process_limit() -> usize {
    20
}

#[derive(Clone)]
struct YanaRuntime {
    repo_root: PathBuf,
    tool_router: ToolRouter<YanaRuntime>,
}

#[tool_router]
impl YanaRuntime {
    fn new(repo_root: PathBuf) -> Self {
        Self {
            repo_root,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        description = "Canonical destructive-command judgment using crate::guard::check_command()."
    )]
    fn check_command(
        &self,
        Parameters(p): Parameters<CheckCommandParams>,
    ) -> Result<CallToolResult, McpError> {
        let body = match crate::guard::check_command(&p.command) {
            None => serde_json::json!({"permission":"allow"}),
            Some(reason) => serde_json::json!({"permission":"deny","reason":reason}),
        };
        Ok(ok(body.to_string()))
    }
    #[tool(
        description = "Bounded repository tree; ignores generated directories and denies path escape."
    )]
    fn repo_tree(
        &self,
        Parameters(p): Parameters<RepoTreeParams>,
    ) -> Result<CallToolResult, McpError> {
        observe(crate::capability::repo_tree(&self.repo_root, &p.path, p.depth).map_err(Into::into))
    }
    #[tool(description = "Read one bounded UTF-8 repository file; denies path and symlink escape.")]
    fn read_file(
        &self,
        Parameters(p): Parameters<ReadFileParams>,
    ) -> Result<CallToolResult, McpError> {
        observe(crate::capability::read_file(&self.repo_root, &p.path).map_err(Into::into))
    }
    #[tool(description = "Literal case-insensitive search across bounded UTF-8 repository files.")]
    fn search_code(
        &self,
        Parameters(p): Parameters<SearchCodeParams>,
    ) -> Result<CallToolResult, McpError> {
        observe(
            crate::capability::search_code(&self.repo_root, &p.path, &p.query).map_err(Into::into),
        )
    }
    #[tool(description = "Read Git branch and working-tree status with fixed argv.")]
    fn git_status(&self) -> Result<CallToolResult, McpError> {
        observe(crate::capability::git_status(&self.repo_root).map_err(Into::into))
    }
    #[tool(description = "Read bounded staged or unstaged Git diff with fixed argv.")]
    fn git_diff(
        &self,
        Parameters(p): Parameters<GitDiffParams>,
    ) -> Result<CallToolResult, McpError> {
        observe(crate::capability::git_diff(&self.repo_root, p.staged).map_err(Into::into))
    }
    #[tool(description = "Read local OS, CPU, memory, load and disk summary.")]
    fn host_summary(&self) -> Result<CallToolResult, McpError> {
        observe(crate::capability::host_summary(&self.repo_root).map_err(Into::into))
    }
    #[tool(description = "List bounded local processes sorted by cpu or memory; read-only.")]
    fn list_processes(
        &self,
        Parameters(p): Parameters<ListProcessesParams>,
    ) -> Result<CallToolResult, McpError> {
        observe(crate::capability::list_processes(&p.sort, p.limit).map_err(Into::into))
    }
    #[tool(description = "Inspect one process by PID; read-only.")]
    fn process_details(
        &self,
        Parameters(p): Parameters<ProcessDetailsParams>,
    ) -> Result<CallToolResult, McpError> {
        observe(crate::capability::process_details(p.pid).map_err(Into::into))
    }
    #[tool(description = "Search the local Yana workspace graph across block titles, bodies, and metadata.")]
    fn workspace_search(
        &self,
        Parameters(p): Parameters<WorkspaceSearchParams>,
    ) -> Result<CallToolResult, McpError> {
        observe(self.workspace_state().and_then(|state| {
            serde_json::to_string(&state.search(&p.query)).map_err(|error| error.to_string())
        }))
    }
    #[tool(description = "Read bidirectionally linked context for one local workspace block.")]
    fn workspace_related(
        &self,
        Parameters(p): Parameters<WorkspaceRelatedParams>,
    ) -> Result<CallToolResult, McpError> {
        observe(self.workspace_state().and_then(|state| {
            let id = crate::workspace::resolve_block_id(&state, &p.block_id)?;
            let related: Vec<_> = state
                .related(&id)
                .into_iter()
                .map(|(block, link)| serde_json::json!({"block": block, "link": link}))
                .collect();
            serde_json::to_string(&related).map_err(|error| error.to_string())
        }))
    }
    #[tool(description = "Read the local Signal/Review workspace inbox; Noise is opt-in.")]
    fn workspace_inbox(
        &self,
        Parameters(p): Parameters<WorkspaceInboxParams>,
    ) -> Result<CallToolResult, McpError> {
        observe(self.workspace_state().and_then(|state| {
            serde_json::to_string(&state.inbox(p.include_noise)).map_err(|error| error.to_string())
        }))
    }
    #[tool(description = "Execute one typed local workspace operation. Critical approval is CLI-only and cannot be granted over MCP.")]
    fn workspace_operate(
        &self,
        Parameters(p): Parameters<WorkspaceOperationParams>,
    ) -> Result<CallToolResult, McpError> {
        let operation: crate::workspace::WorkspaceOperation = serde_json::from_str(&p.operation_json)
            .map_err(|error| McpError::invalid_params(format!("invalid workspace operation: {error}"), None))?;
        if matches!(operation, crate::workspace::WorkspaceOperation::ApproveAction { .. }) {
            return Ok(CallToolResult::error(vec![ContentBlock::text(
                "critical workspace approval is CLI-only; use yana-rt workspace action approve",
            )]));
        }
        observe(
            self.workspace_service()
                .execute(operation)
                .and_then(|event| serde_json::to_string(&event).map_err(|error| error.to_string())),
        )
    }
}

impl YanaRuntime {
    fn workspace_service(&self) -> crate::workspace::WorkspaceService<crate::workspace::FileEventStore> {
        crate::workspace::WorkspaceService::new(crate::workspace::FileEventStore::new(&self.repo_root))
    }

    fn workspace_state(&self) -> Result<crate::workspace::WorkspaceState, String> {
        self.workspace_service().state()
    }
}

fn ok(text: String) -> CallToolResult {
    CallToolResult::success(vec![ContentBlock::text(text)])
}
fn observe(result: Result<String, String>) -> Result<CallToolResult, McpError> {
    Ok(match result {
        Ok(v) => ok(v),
        Err(e) => CallToolResult::error(vec![ContentBlock::text(e)]),
    })
}

#[tool_handler]
impl ServerHandler for YanaRuntime {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::from_build_env())
            .with_instructions(
                "Yana Program J local capability runtime: read-only repository/host tools, governed workspace operations, and the canonical command guard. Critical workspace approval is CLI-only."
                    .to_string(),
            )
    }
}

pub async fn run_stdio() -> anyhow::Result<()> {
    let requested = std::env::var_os("YANA_REPO_ROOT")
        .map(PathBuf::from)
        .unwrap_or(std::env::current_dir()?);
    let repo_root = requested.canonicalize()?;
    anyhow::ensure!(repo_root.is_dir(), "YANA_REPO_ROOT is not a directory");
    let service = YanaRuntime::new(repo_root).serve(stdio()).await?;
    service.waiting().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn defaults_are_bounded() {
        assert_eq!(depth(), 2);
        assert_eq!(process_limit(), 20);
    }
    #[test]
    fn tool_error_is_not_panic() {
        assert!(observe(Err("denied".into()))
            .unwrap()
            .is_error
            .unwrap_or(false));
    }
}
