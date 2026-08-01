//! Program J (docs/programs/PROGRAM-J-SKELETON.md) Phase 9 Research/
//! Prototype spike. Exposes `check_command` as an MCP tool over stdio,
//! calling `crate::guard::check_command()` directly, in-process — the
//! same pure judgment function `core/hooks/guard-destructive.sh` mirrors.
//!
//! NOT wired into any live client path. No existing hook, adapter, or
//! CLI-default behavior changes because this file exists. Gated behind
//! the `mcp` Cargo feature (not part of default `cli`) specifically so a
//! spike doesn't change the footprint of the normal build — see Cargo.toml's
//! `mcp` feature comment for why (this crate's first tokio dependency).
//!
//! "deny" is a successful tool response carrying `permission: deny` in its
//! content, not an MCP protocol-level error — check_command() always
//! produces a definite answer for well-formed input, so there is no
//! internal "couldn't tell" case to simulate here. The Interfaces section's
//! fail-closed requirement (both MCP error channels map to deny) is a
//! CLIENT-side obligation for genuine MCP-level failures (server crash,
//! timeout, malformed request) — this file being clean of AC error paths
//! doesn't satisfy that requirement, it's a separate, not-yet-built piece.

use rmcp::{
    ErrorData as McpError, ServerHandler, ServiceExt,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, ContentBlock, Implementation, ServerCapabilities, ServerInfo},
    schemars, tool, tool_handler, tool_router,
    transport::stdio,
};

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct CheckCommandParams {
    /// The raw shell command about to be executed
    command: String,
}

#[derive(Clone)]
struct YanaGuard {
    tool_router: ToolRouter<YanaGuard>,
}

#[tool_router]
impl YanaGuard {
    fn new() -> Self {
        Self {
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        description = "Checks whether a shell command is destructive (rm -rf, git push --force, git reset --hard, SQL DROP/TRUNCATE, disguised inline-script bypasses, etc.) before it runs. Single source of truth: src/guard/mod.rs::check_command(), identical logic to core/hooks/guard-destructive.sh."
    )]
    fn check_command(
        &self,
        Parameters(CheckCommandParams { command }): Parameters<CheckCommandParams>,
    ) -> Result<CallToolResult, McpError> {
        let body = match crate::guard::check_command(&command) {
            None => serde_json::json!({ "permission": "allow" }),
            Some(reason) => serde_json::json!({ "permission": "deny", "reason": reason }),
        };
        Ok(CallToolResult::success(vec![ContentBlock::text(
            body.to_string(),
        )]))
    }
}

#[tool_handler]
impl ServerHandler for YanaGuard {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::from_build_env())
            .with_instructions(
                "Yana AI destructive-command guard (Program J Phase 9 spike). \
                 Tool: check_command."
                    .to_string(),
            )
    }
}

/// Runs the spike server over stdio until the client disconnects.
pub async fn run_stdio() -> anyhow::Result<()> {
    let service = YanaGuard::new().serve(stdio()).await?;
    service.waiting().await?;
    Ok(())
}
