//! Capability Registry / Manifest (AD-11, AD-16): the single place any
//! client — chat, MCP, Desktop — can ask "what capabilities exist, are
//! they read-only or mutating, what risk tier, does calling them need
//! human approval, what's their schema."
//!
//! Registry keys reuse the `Envelope.capability` namespace strings each
//! function already encodes its JSON payload under (`"repo.tree"`,
//! `"repo.read"`, ...) — one naming scheme, not two.
//!
//! Built fresh per call (`Manifest::all()`), the same way
//! `chat::tools::catalog()` already builds its `Vec<ToolSpec>` fresh each
//! turn rather than statically — schemas are `serde_json::Value`, which
//! isn't `Copy`/`const`-constructible, so there's no accuracy/perf reason
//! to fight that; the data is tiny and this is not a hot path.

use crate::session_context::SessionContext;
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccessMode {
    ReadOnly,
    Mutating,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum RiskTier {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalRequirement {
    None,
    /// Matches the existing `TurnState::AwaitingApproval` chat flow exactly
    /// — this registry does not introduce any new approval gate, it names
    /// the one `command.execute` already goes through.
    HumanApprovalPerCall,
}

#[derive(Debug, Clone)]
pub struct CapabilityDescriptor {
    pub name: &'static str,
    /// Provider-facing function name. Kept separate from the canonical
    /// dotted capability identity because common model APIs restrict tool
    /// names to identifier-like strings.
    pub tool_name: &'static str,
    pub description: &'static str,
    pub access_mode: AccessMode,
    pub risk_tier: RiskTier,
    pub approval: ApprovalRequirement,
    pub input_schema: Value,
    pub output_schema: Value,
    pub availability: fn(&SessionContext) -> bool,
}

use super::registry_data::all_descriptors;

pub struct Manifest {
    descriptors: Vec<CapabilityDescriptor>,
}

impl Manifest {
    pub fn all() -> Self {
        Self {
            descriptors: all_descriptors(),
        }
    }

    pub fn get(&self, name: &str) -> Option<&CapabilityDescriptor> {
        self.descriptors.iter().find(|d| d.name == name)
    }

    pub fn get_by_tool_name(&self, tool_name: &str) -> Option<&CapabilityDescriptor> {
        self.descriptors
            .iter()
            .find(|descriptor| descriptor.tool_name == tool_name)
    }

    /// Descriptors whose `availability` fn returns true for `ctx`.
    pub fn available(&self, ctx: &SessionContext) -> Vec<&CapabilityDescriptor> {
        self.descriptors
            .iter()
            .filter(|d| (d.availability)(ctx))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn ctx() -> SessionContext {
        SessionContext::new("s", PathBuf::from("/tmp"), "ollama", "m", false)
    }

    #[test]
    fn all_ten_descriptors_present() {
        assert_eq!(Manifest::all().descriptors.len(), 10);
    }

    #[test]
    fn get_finds_by_name() {
        let manifest = Manifest::all();
        assert_eq!(manifest.get("repo.read").unwrap().risk_tier, RiskTier::Low);
        assert!(manifest.get("does.not.exist").is_none());
    }

    #[test]
    fn provider_tool_names_resolve_to_canonical_capabilities() {
        let manifest = Manifest::all();
        assert_eq!(
            manifest.get_by_tool_name("read_file").unwrap().name,
            "repo.read"
        );
        assert_eq!(
            manifest.get_by_tool_name("run_command").unwrap().name,
            "command.execute"
        );
        assert!(manifest.get_by_tool_name("unknown_tool").is_none());
    }

    #[test]
    fn provider_tool_names_are_unique() {
        let manifest = Manifest::all();
        let mut names = std::collections::BTreeSet::new();
        for descriptor in manifest.descriptors {
            assert!(names.insert(descriptor.tool_name), "duplicate tool name");
        }
    }

    #[test]
    fn command_execute_requires_approval_and_is_mutating() {
        let manifest = Manifest::all();
        let descriptor = manifest.get("command.execute").unwrap();
        assert_eq!(descriptor.access_mode, AccessMode::Mutating);
        assert_eq!(
            descriptor.approval,
            ApprovalRequirement::HumanApprovalPerCall
        );
        assert_eq!(descriptor.risk_tier, RiskTier::High);
    }

    #[test]
    fn read_only_capabilities_need_no_approval() {
        let manifest = Manifest::all();
        for name in [
            "repo.tree",
            "repo.read",
            "repo.search",
            "git.status",
            "git.diff",
        ] {
            let descriptor = manifest.get(name).unwrap();
            assert_eq!(descriptor.access_mode, AccessMode::ReadOnly);
            assert_eq!(descriptor.approval, ApprovalRequirement::None);
        }
    }

    #[test]
    fn every_descriptor_has_object_schemas() {
        for descriptor in Manifest::all().descriptors {
            assert!(descriptor.input_schema.is_object());
            assert!(descriptor.output_schema.is_object());
        }
    }

    #[test]
    fn available_filters_by_session_context() {
        let manifest = Manifest::all();
        let available = manifest.available(&ctx());
        // On unix test runners, process.* stay available; on non-unix they
        // wouldn't be. Either way, count must be <= 10 and repo.read must
        // always be present.
        assert!(available.len() <= 10);
        assert!(available.iter().any(|d| d.name == "repo.read"));
    }
}
