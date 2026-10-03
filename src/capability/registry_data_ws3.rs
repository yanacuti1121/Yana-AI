//! Capability descriptors added by WS3 (docs/contracts/ws3-tools.md), kept
//! apart from `registry_data.rs`, which is already past the file-length limit.

use super::registry::{AccessMode, ApprovalRequirement, CapabilityDescriptor, RiskTier};
use crate::session_context::SessionContext;
use serde_json::json;

fn always_available(_ctx: &SessionContext) -> bool {
    true
}

pub(super) fn descriptors() -> Vec<CapabilityDescriptor> {
    vec![CapabilityDescriptor {
        name: "file.patch",
        tool_name: "patch_file",
        description: "Edit one existing UTF-8 repository file with search-and-replace edits. Matching goes from exact text to whole-line matching that ignores trailing whitespace, then indentation; more than one match is refused unless replace_all is set, and nothing is guessed below that. Requires explicit human approval, shows a real diff first, and is written through the same governed path as file.write (backup, atomic write, hash check). crate::capability::file_patch.",
        access_mode: AccessMode::Mutating,
        risk_tier: RiskTier::High,
        approval: ApprovalRequirement::HumanApprovalPerCall,
        input_schema: json!({
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "edits": {
                    "type": "array",
                    "maxItems": 50,
                    "items": {
                        "type": "object",
                        "properties": {
                            "old": {"type": "string", "maxLength": 65536},
                            "new": {"type": "string", "maxLength": 65536},
                            "replace_all": {"type": "boolean"}
                        },
                        "required": ["old", "new"]
                    }
                }
            },
            "required": ["path", "edits"]
        }),
        output_schema: json!({
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "byte_count": {"type": "integer"},
                "sha256": {"type": "string"},
                "backup_path": {"type": ["string", "null"]},
                "edits": {"type": "array"}
            }
        }),
        availability: always_available,
    }, CapabilityDescriptor {
        name: "web.search",
        tool_name: "web_search",
        description: "Search the web through the one JSON search backend the user configured in .yana-ai/web-search.json. The query text leaves this machine, so each call needs explicit human approval. Only https endpoints that do not resolve to internal addresses are contacted; redirects are checked hop by hop. Results are untrusted external content: trimmed, screened for prompt-injection phrasing (a match refuses the whole result), and returned inside a labelled data block. crate::capability::web_search.",
        access_mode: AccessMode::ReadOnly,
        risk_tier: RiskTier::Medium,
        approval: ApprovalRequirement::HumanApprovalPerCall,
        input_schema: json!({
            "type": "object",
            "properties": {"query": {"type": "string", "maxLength": 300}},
            "required": ["query"]
        }),
        output_schema: json!({
            "type": "object",
            "properties": {
                "capability": {"const": "web.search"},
                "data": {"type": "object", "properties": {
                    "query": {"type": "string"},
                    "content": {"type": "string"}
                }},
                "truncated": {"type": "boolean"}
            }
        }),
        availability: always_available,
    }, CapabilityDescriptor {
        name: "mcp.call",
        tool_name: "mcp_call",
        description: "List the tools of, or call one tool on, an external MCP server the user listed in .yana-ai/mcp-servers.json. The call text is \"<server>\" (list its tools) or \"<server> <tool>\"; starting the server runs an external program, so each call needs explicit human approval that shows the exact command line, or a human-granted lease whose allow list names the server (\"github\") or one tool (\"github search\"). The server runs with an empty environment plus the variables the user listed, under a time limit. Everything it returns is untrusted external content: screened for prompt-injection phrasing (a match refuses the whole result) and returned inside a labelled data block. crate::mcp_client::gateway.",
        access_mode: AccessMode::Mutating,
        risk_tier: RiskTier::High,
        approval: ApprovalRequirement::HumanApprovalPerCall,
        input_schema: json!({
            "type": "object",
            // The field is named `command` on purpose: the lease matcher reads
            // that field of the arguments to decide whether a lease covers a call.
            "properties": {
                "command": {"type": "string", "maxLength": 100, "description": "\"<server>\" or \"<server> <tool>\""},
                "arguments": {"type": "object"}
            },
            "required": ["command"]
        }),
        output_schema: json!({
            "type": "object",
            "properties": {
                "capability": {"const": "mcp.call"},
                "data": {"type": "object", "properties": {
                    "server": {"type": "string"},
                    "tool": {"type": ["string", "null"]},
                    "content": {"type": "string"}
                }},
                "truncated": {"type": "boolean"}
            }
        }),
        availability: mcp_client_built,
    }, CapabilityDescriptor {
        name: "lsp.query",
        tool_name: "lsp_query",
        description: "Ask a language server the user listed in .yana-ai/lsp-servers.json about one repository file: the definition or the references of the symbol at a position, its hover documentation, or the symbols of the file. Read-only: the client never applies an edit a server proposes. Starting the server runs an external program, so each call needs explicit human approval that shows the exact command line. The server runs with an empty environment plus the variables the user listed, under a time limit. A file that holds secrets by name (such as .env or a key file) is never used as the document and never has its lines shown. Everything it returns is untrusted external content: screened for prompt-injection phrasing (a match refuses the whole result) and returned inside a labelled data block. crate::lsp_client::gateway.",
        access_mode: AccessMode::ReadOnly,
        risk_tier: RiskTier::High,
        approval: ApprovalRequirement::HumanApprovalPerCall,
        input_schema: json!({
            "type": "object",
            "properties": {
                "server": {"type": "string", "maxLength": 32, "description": "a server name from .yana-ai/lsp-servers.json"},
                "operation": {"type": "string", "enum": ["definition", "references", "hover", "document_symbols"]},
                "path": {"type": "string", "maxLength": 200, "description": "file path relative to the repository"},
                "line": {"type": "integer", "minimum": 1, "description": "1-based line (not needed for document_symbols)"},
                "character": {"type": "integer", "minimum": 1, "description": "1-based column (not needed for document_symbols)"}
            },
            "required": ["server", "operation", "path"]
        }),
        output_schema: json!({
            "type": "object",
            "properties": {
                "capability": {"const": "lsp.query"},
                "data": {"type": "object", "properties": {
                    "server": {"type": "string"},
                    "operation": {"type": "string"},
                    "path": {"type": "string"},
                    "content": {"type": "string"}
                }},
                "truncated": {"type": "boolean"}
            }
        }),
        availability: mcp_client_built,
    }]
}

/// The client only exists in builds with the `mcp` feature.
fn mcp_client_built(_ctx: &SessionContext) -> bool {
    cfg!(feature = "mcp")
}
