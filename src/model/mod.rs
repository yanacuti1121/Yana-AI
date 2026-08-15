//! Model plane (Phase 6 of the host-native-os program): provider/model
//! identity, capability, catalog/selection, and resource-requirement
//! concepts, promoted out of `chat::` so any future consumer (Phase 7
//! Model Placement, `os::` code, a future non-chat client) can reach them
//! without depending on the chat UI layer.
//!
//! `chat` still owns everything that is actually about a chat TURN
//! (`ChatMessage.tool_call`/`tool_result`, streaming to a render loop,
//! history files) and everything that is actually about a specific
//! provider's WIRE FORMAT (`chat::anthropic`, `chat::openai_compat`) —
//! this program's brief was explicit: promote concepts, don't rewrite
//! implementations. `chat::provider` and the three functions/types
//! `chat::mod.rs` used to define directly (`provider_catalog`,
//! `try_select_provider`, `ProviderSummary`) are now thin re-exports of
//! this module; see `provider.rs`'s and `catalog.rs`'s own doc comments.
//!
//! This module builds no inference engine of its own — Ollama/LM
//! Studio/llama.cpp/TurboFieldfare/cloud providers remain the only
//! execution backends, unchanged.

pub(crate) mod catalog;
pub(crate) mod placement;
pub(crate) mod provider;
pub(crate) mod requirements;
pub(crate) mod runtime;
