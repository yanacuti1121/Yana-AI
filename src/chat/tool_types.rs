//! Shared types for LLM tool-calling in `yana chat`: the tool schema sent
//! to providers, the accumulator both Anthropic's and OpenAI-compatible
//! SSE streams use to reassemble a tool call from fragmented deltas, and
//! the serializable records `ChatMessage`/`HistoryLine` persist for a
//! completed tool-call/tool-result turn.
//!
//! Anthropic (`content_block_start` for id/name, `content_block_delta`'s
//! `input_json_delta`/`partial_json` for argument fragments, both keyed
//! by block index) and OpenAI-compatible (`delta.tool_calls[]`, keyed by
//! `index`, id/name on the first fragment only) reduce to the identical
//! "start(index,id,name)" + "append_args(index,str)" shape — implemented
//! once here instead of duplicated per provider.

pub(crate) use crate::runtime::tool_types::{
    StreamOutcome, ToolCall, ToolCallRecord, ToolResultRecord, ToolSpec,
};
use std::collections::BTreeMap;

/// Accumulates streamed tool-call fragments keyed by provider index.
#[derive(Debug, Default)]
pub struct ToolCallAccumulator {
    calls: BTreeMap<u32, (String, String, String)>, // index -> (id, name, args_so_far)
}

impl ToolCallAccumulator {
    pub fn new() -> Self {
        Self::default()
    }

    /// Records/updates the id+name for the call at `index`. Safe to call
    /// more than once per index (OpenAI sends id/name only on the first
    /// fragment) — a non-empty new value overwrites the stored one, since
    /// a later, more-complete value is more likely correct than an
    /// earlier, possibly-empty one.
    pub fn start(&mut self, index: u32, id: String, name: String) {
        let entry = self.calls.entry(index).or_default();
        if !id.is_empty() {
            entry.0 = id;
        }
        if !name.is_empty() {
            entry.1 = name;
        }
    }

    /// Appends an argument-JSON fragment to the call at `index`. Safe to
    /// call before `start()` — creates a placeholder entry that `start()`
    /// then fills in, in case a provider ever orders fragments that way.
    pub fn append_args(&mut self, index: u32, fragment: &str) {
        self.calls.entry(index).or_default().2.push_str(fragment);
    }

    /// Consumes the accumulator, returning every call in index order. A
    /// call whose `name` was never set (arguments-only, no `start()`) is
    /// dropped rather than surfaced as a call to nothing — the turn loop
    /// has no tool to dispatch to, and a nameless call is a
    /// malformed-stream signal, not a real one.
    pub fn finish(self) -> Vec<ToolCall> {
        self.calls
            .into_iter()
            .filter_map(|(_, (id, name, args))| {
                (!name.is_empty()).then_some(ToolCall {
                    id,
                    name,
                    arguments_json: args,
                })
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_call_in_order() {
        let mut acc = ToolCallAccumulator::new();
        acc.start(0, "call_1".to_string(), "read_file".to_string());
        acc.append_args(0, "{\"path\":");
        acc.append_args(0, "\"src/main.rs\"}");
        let calls = acc.finish();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].id, "call_1");
        assert_eq!(calls[0].name, "read_file");
        assert_eq!(calls[0].arguments_json, "{\"path\":\"src/main.rs\"}");
    }

    #[test]
    fn args_before_start_still_accumulate() {
        // Defensive case: a provider that (hypothetically) sends an
        // argument fragment before the id/name field on the same index.
        let mut acc = ToolCallAccumulator::new();
        acc.append_args(0, "{\"path\":\"x\"}");
        acc.start(0, "call_1".to_string(), "read_file".to_string());
        let calls = acc.finish();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].arguments_json, "{\"path\":\"x\"}");
    }

    #[test]
    fn multiple_calls_interleaved_by_index() {
        let mut acc = ToolCallAccumulator::new();
        acc.start(0, "call_1".to_string(), "read_file".to_string());
        acc.start(1, "call_2".to_string(), "run_command".to_string());
        acc.append_args(0, "{\"path\":");
        acc.append_args(1, "{\"command\":");
        acc.append_args(0, "\"a\"}");
        acc.append_args(1, "\"ls\"}");
        let calls = acc.finish();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].name, "read_file");
        assert_eq!(calls[0].arguments_json, "{\"path\":\"a\"}");
        assert_eq!(calls[1].name, "run_command");
        assert_eq!(calls[1].arguments_json, "{\"command\":\"ls\"}");
    }

    #[test]
    fn nameless_call_is_dropped() {
        let mut acc = ToolCallAccumulator::new();
        acc.append_args(0, "{}"); // no start() ever called for index 0
        let calls = acc.finish();
        assert!(calls.is_empty());
    }

    #[test]
    fn start_called_twice_keeps_latest_nonempty_value() {
        let mut acc = ToolCallAccumulator::new();
        acc.start(0, "call_1".to_string(), String::new());
        acc.start(0, String::new(), "read_file".to_string());
        let calls = acc.finish();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].id, "call_1");
        assert_eq!(calls[0].name, "read_file");
    }
}
