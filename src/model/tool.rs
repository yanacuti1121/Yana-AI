//! Provider-neutral model tool protocol.
//!
//! Providers produce these values, the unified runtime governs and executes
//! them, and clients only render their lifecycle. Keeping the protocol in the
//! model plane prevents terminal chat from becoming the owner of a contract
//! also needed by Desktop, remote adapters, MCP, and future local runtimes.

use std::collections::BTreeMap;

#[derive(Debug, Clone)]
pub struct ToolSpec {
    pub name: &'static str,
    pub description: &'static str,
    pub parameters_schema: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments_json: String,
}

#[derive(Debug, Clone)]
pub enum StreamOutcome {
    Text,
    ToolCalls(Vec<ToolCall>),
}

#[derive(Debug, Default)]
pub struct ToolCallAccumulator {
    calls: BTreeMap<u32, (String, String, String)>,
}

impl ToolCallAccumulator {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn start(&mut self, index: u32, id: String, name: String) {
        let entry = self.calls.entry(index).or_default();
        if !id.is_empty() {
            entry.0 = id;
        }
        if !name.is_empty() {
            entry.1 = name;
        }
    }

    pub fn append_args(&mut self, index: u32, fragment: &str) {
        self.calls.entry(index).or_default().2.push_str(fragment);
    }

    pub fn finish(self) -> Vec<ToolCall> {
        self.calls
            .into_iter()
            .filter_map(|(_, (id, name, arguments_json))| {
                (!name.is_empty()).then_some(ToolCall {
                    id,
                    name,
                    arguments_json,
                })
            })
            .collect()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ToolCallRecord {
    pub id: String,
    pub name: String,
    pub arguments_json: String,
}

impl From<ToolCall> for ToolCallRecord {
    fn from(call: ToolCall) -> Self {
        Self {
            id: call.id,
            name: call.name,
            arguments_json: call.arguments_json,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ToolResultRecord {
    pub call_id: String,
    pub output: String,
    pub is_error: bool,
    pub denied: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fragments_are_accumulated_in_provider_index_order() {
        let mut accumulator = ToolCallAccumulator::new();
        accumulator.start(1, "call-2".into(), "run_command".into());
        accumulator.start(0, "call-1".into(), "read_file".into());
        accumulator.append_args(1, "{\"command\":\"pwd\"}");
        accumulator.append_args(0, "{\"path\":\"Cargo.toml\"}");

        let calls = accumulator.finish();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].name, "read_file");
        assert_eq!(calls[1].name, "run_command");
    }

    #[test]
    fn split_argument_fragments_form_one_exact_call() {
        let mut accumulator = ToolCallAccumulator::new();
        accumulator.start(0, "call-1".into(), "read_file".into());
        accumulator.append_args(0, "{\"path\":");
        accumulator.append_args(0, "\"src/main.rs\"}");
        let calls = accumulator.finish();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].id, "call-1");
        assert_eq!(calls[0].arguments_json, "{\"path\":\"src/main.rs\"}");
    }

    #[test]
    fn arguments_before_identity_are_preserved() {
        let mut accumulator = ToolCallAccumulator::new();
        accumulator.append_args(0, "{}");
        accumulator.start(0, "call-1".into(), "read_file".into());
        assert_eq!(accumulator.finish()[0].arguments_json, "{}");
    }

    #[test]
    fn nameless_fragments_are_not_executable_calls() {
        let mut accumulator = ToolCallAccumulator::new();
        accumulator.append_args(0, "{}");
        assert!(accumulator.finish().is_empty());
    }

    #[test]
    fn later_nonempty_identity_fragments_complete_the_call() {
        let mut accumulator = ToolCallAccumulator::new();
        accumulator.start(0, "call-1".into(), String::new());
        accumulator.start(0, String::new(), "read_file".into());
        let calls = accumulator.finish();
        assert_eq!(calls[0].id, "call-1");
        assert_eq!(calls[0].name, "read_file");
    }
}
