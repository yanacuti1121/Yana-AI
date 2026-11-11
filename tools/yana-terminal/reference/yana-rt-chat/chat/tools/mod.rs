//! `yana chat`'s tool-calling module: the catalog of tools offered to the
//! model, and the individual tool implementations. See the plan's
//! "explicitly out of scope" section for what's deliberately not here yet
//! (write/edit-file tools, more than these 2, etc).

pub mod read_file;
pub mod round_guard;
pub mod run_command;

use super::tool_types::ToolSpec;

/// The MVP's fixed, 2-tool catalog.
pub fn catalog() -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: "read_file",
            description: "Read a UTF-8 text file within the repository. \
                Path is relative to the repository root; paths that \
                resolve outside it are refused.",
            parameters_schema: serde_json::json!({
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"],
            }),
        },
        ToolSpec {
            name: "run_command",
            description: "Propose running a shell command. Requires \
                explicit human approval in the terminal before it \
                executes — never runs silently, and commands matching a \
                known-destructive pattern (rm -rf, force-push, etc.) are \
                never offered for approval at all.",
            parameters_schema: serde_json::json!({
                "type": "object",
                "properties": { "command": { "type": "string" } },
                "required": ["command"],
            }),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_has_exactly_two_tools() {
        let tools = catalog();
        assert_eq!(tools.len(), 2);
        assert_eq!(tools[0].name, "read_file");
        assert_eq!(tools[1].name, "run_command");
    }
}
