//! `yana chat`'s tool-calling module: the catalog of tools offered to the
//! model, and the individual tool implementations. See the plan's
//! "explicitly out of scope" section for what's deliberately not here yet
//! (write/edit-file tools, more than these 2, etc).
//!
//! `catalog()` is manifest-driven (AD-25/AD-26): schemas come from
//! `capability::manifest()` instead of a literal `vec![...]`, and only the
//! capabilities chat actually offers (`repo.read`, `command.execute`) are
//! mapped to a `ToolSpec` — the other 8 registered capabilities (MCP-only
//! today: repo.tree, repo.search, git.*, host.summary, process.*) are
//! deliberately not exposed here, so chat's context budget doesn't grow
//! just because the registry does. `ToolSpec.description` stays the
//! original hand-tuned prompt text, not the registry's more
//! governance-oriented `description` — those serve different audiences
//! and conflating them would be a real (if subtle) behavior change to
//! what the model reads.

pub mod read_file;
pub mod round_guard;
pub mod run_command;

use super::tool_types::ToolSpec;
use crate::session_context::SessionContext;

/// The MVP's tool catalog: exactly `read_file` and `run_command` when both
/// backing capabilities are available for `ctx` — identical output to the
/// old hardcoded 2-tool `vec![...]` for every `SessionContext` in practice
/// today, since both `repo.read` and `command.execute` are always
/// available.
pub fn catalog(ctx: &SessionContext) -> Vec<ToolSpec> {
    let manifest = crate::capability::manifest();
    let available = manifest.available(ctx);
    let mut tools = Vec::new();
    if let Some(descriptor) = available.iter().find(|d| d.name == "repo.read") {
        tools.push(ToolSpec {
            name: "read_file",
            description: "Read a UTF-8 text file within the repository. \
                Path is relative to the repository root; paths that \
                resolve outside it are refused.",
            parameters_schema: descriptor.input_schema.clone(),
        });
    }
    if let Some(descriptor) = available.iter().find(|d| d.name == "command.execute") {
        tools.push(ToolSpec {
            name: "run_command",
            description: "Propose running a shell command. Requires \
                explicit human approval in the terminal before it \
                executes — never runs silently, and commands matching a \
                known-destructive pattern (rm -rf, force-push, etc.) are \
                never offered for approval at all.",
            parameters_schema: descriptor.input_schema.clone(),
        });
    }
    tools
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn ctx() -> SessionContext {
        SessionContext::new("s", PathBuf::from("/tmp"), "ollama", "m", false)
    }

    #[test]
    fn catalog_has_exactly_two_tools() {
        let tools = catalog(&ctx());
        assert_eq!(tools.len(), 2);
        assert_eq!(tools[0].name, "read_file");
        assert_eq!(tools[1].name, "run_command");
    }

    #[test]
    fn catalog_schema_matches_original_hardcoded_shape() {
        let tools = catalog(&ctx());
        assert_eq!(
            tools[0].parameters_schema,
            serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"],
            })
        );
        assert_eq!(
            tools[1].parameters_schema,
            serde_json::json!({
                "type": "object",
                "properties": { "command": { "type": "string" } },
                "required": ["command"],
            })
        );
    }
}
