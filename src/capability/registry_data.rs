//! The 10 `CapabilityDescriptor` entries themselves — split out of
//! `registry.rs` purely for the repo's 300-line file-length limit (this
//! file is data, not logic; `registry.rs` keeps the types/`Manifest`).

use super::registry::{AccessMode, ApprovalRequirement, CapabilityDescriptor, RiskTier};
use crate::session_context::SessionContext;
use serde_json::json;

fn always_available(_ctx: &SessionContext) -> bool {
    true
}

fn unix_only(_ctx: &SessionContext) -> bool {
    cfg!(unix)
}

pub(super) fn all_descriptors() -> Vec<CapabilityDescriptor> {
    vec![
        CapabilityDescriptor {
            name: "repo.tree",
            description: "Bounded repository tree; ignores generated directories and denies path escape.",
            access_mode: AccessMode::ReadOnly,
            risk_tier: RiskTier::Low,
            approval: ApprovalRequirement::None,
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "depth": {"type": "integer"}
                },
                "required": []
            }),
            output_schema: json!({
                "type": "object",
                "properties": {
                    "capability": {"const": "repo.tree"},
                    "data": {"type": "object", "properties": {
                        "path": {"type": "string"},
                        "depth": {"type": "integer"},
                        "entries": {"type": "array"}
                    }},
                    "truncated": {"type": "boolean"}
                }
            }),
            availability: always_available,
        },
        CapabilityDescriptor {
            name: "repo.read",
            description: "Read one bounded UTF-8 repository file; denies path and symlink escape.",
            access_mode: AccessMode::ReadOnly,
            risk_tier: RiskTier::Low,
            approval: ApprovalRequirement::None,
            input_schema: json!({
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"]
            }),
            output_schema: json!({
                "type": "object",
                "properties": {
                    "capability": {"const": "repo.read"},
                    "data": {"type": "object", "properties": {
                        "path": {"type": "string"},
                        "size_bytes": {"type": "integer"},
                        "content": {"type": "string"}
                    }},
                    "truncated": {"type": "boolean"}
                }
            }),
            availability: always_available,
        },
        CapabilityDescriptor {
            name: "repo.search",
            description: "Literal case-insensitive search across bounded UTF-8 repository files.",
            access_mode: AccessMode::ReadOnly,
            risk_tier: RiskTier::Low,
            approval: ApprovalRequirement::None,
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "query": {"type": "string"}
                },
                "required": ["query"]
            }),
            output_schema: json!({
                "type": "object",
                "properties": {
                    "capability": {"const": "repo.search"},
                    "data": {"type": "object", "properties": {
                        "path": {"type": "string"},
                        "query": {"type": "string"},
                        "matches": {"type": "array"}
                    }},
                    "truncated": {"type": "boolean"}
                }
            }),
            availability: always_available,
        },
        CapabilityDescriptor {
            name: "git.status",
            description: "Read Git branch and working-tree status with fixed argv.",
            access_mode: AccessMode::ReadOnly,
            risk_tier: RiskTier::Low,
            approval: ApprovalRequirement::None,
            input_schema: json!({"type": "object", "properties": {}}),
            output_schema: json!({
                "type": "object",
                "properties": {
                    "capability": {"const": "git.status"},
                    "data": {"type": "object", "properties": {"output": {"type": "string"}}}
                }
            }),
            availability: always_available,
        },
        CapabilityDescriptor {
            name: "git.diff",
            description: "Read bounded staged or unstaged Git diff with fixed argv.",
            access_mode: AccessMode::ReadOnly,
            risk_tier: RiskTier::Low,
            approval: ApprovalRequirement::None,
            input_schema: json!({
                "type": "object",
                "properties": {"staged": {"type": "boolean"}}
            }),
            output_schema: json!({
                "type": "object",
                "properties": {
                    "capability": {"const": "git.diff"},
                    "data": {"type": "object", "properties": {
                        "staged": {"type": "boolean"},
                        "output": {"type": "string"}
                    }},
                    "truncated": {"type": "boolean"}
                }
            }),
            availability: always_available,
        },
        CapabilityDescriptor {
            name: "host.summary",
            description: "Read local OS, CPU, memory, load and disk summary.",
            access_mode: AccessMode::ReadOnly,
            risk_tier: RiskTier::Low,
            approval: ApprovalRequirement::None,
            input_schema: json!({"type": "object", "properties": {}}),
            output_schema: json!({
                "type": "object",
                "properties": {
                    "capability": {"const": "host.summary"},
                    "data": {"type": "object"}
                }
            }),
            availability: always_available,
        },
        CapabilityDescriptor {
            name: "process.list",
            description: "List bounded local processes sorted by cpu or memory; read-only.",
            access_mode: AccessMode::ReadOnly,
            // Can reveal other users'/system processes — Medium, not Low.
            // Not newly approval-gated: chat/MCP don't gate this today and
            // this registry doesn't change that, it only names the
            // existing risk.
            risk_tier: RiskTier::Medium,
            approval: ApprovalRequirement::None,
            input_schema: json!({
                "type": "object",
                "properties": {
                    "sort": {"type": "string", "enum": ["cpu", "memory"]},
                    "limit": {"type": "integer"}
                }
            }),
            output_schema: json!({
                "type": "object",
                "properties": {
                    "capability": {"const": "process.list"},
                    "data": {"type": "object", "properties": {
                        "sort": {"type": "string"},
                        "rows": {"type": "array"}
                    }},
                    "truncated": {"type": "boolean"}
                }
            }),
            availability: unix_only,
        },
        CapabilityDescriptor {
            name: "process.inspect",
            description: "Inspect one process by PID; read-only.",
            access_mode: AccessMode::ReadOnly,
            risk_tier: RiskTier::Medium,
            approval: ApprovalRequirement::None,
            input_schema: json!({
                "type": "object",
                "properties": {"pid": {"type": "integer"}},
                "required": ["pid"]
            }),
            output_schema: json!({
                "type": "object",
                "properties": {
                    "capability": {"const": "process.inspect"},
                    "data": {"type": "object", "properties": {
                        "pid": {"type": "integer"},
                        "output": {"type": "string"}
                    }}
                }
            }),
            availability: unix_only,
        },
        CapabilityDescriptor {
            name: "command.validate",
            description: "Parse a shell command into argv and judge it via crate::guard::check_command(); dry-run, no execution.",
            access_mode: AccessMode::ReadOnly,
            risk_tier: RiskTier::Low,
            approval: ApprovalRequirement::None,
            input_schema: json!({
                "type": "object",
                "properties": {"command": {"type": "string"}},
                "required": ["command"]
            }),
            output_schema: json!({
                "type": "object",
                "properties": {
                    "argv": {"type": "array"},
                    "guard_verdict": {"type": ["string", "null"]}
                }
            }),
            availability: always_available,
        },
        CapabilityDescriptor {
            name: "command.execute",
            description: "Execute a validated, guard-approved command's argv directly (or sandboxed). Requires explicit human approval in the terminal before it executes.",
            access_mode: AccessMode::Mutating,
            risk_tier: RiskTier::High,
            approval: ApprovalRequirement::HumanApprovalPerCall,
            input_schema: json!({
                "type": "object",
                "properties": {"command": {"type": "string"}},
                "required": ["command"]
            }),
            output_schema: json!({
                "type": "object",
                "properties": {
                    "stdout": {"type": "string"},
                    "stderr": {"type": "string"},
                    "exit_code": {"type": ["integer", "null"]},
                    "truncated": {"type": "boolean"}
                }
            }),
            availability: always_available,
        },
    ]
}
