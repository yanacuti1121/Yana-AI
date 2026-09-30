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
    }]
}
