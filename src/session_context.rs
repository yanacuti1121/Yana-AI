//! `SessionContext` — the canonical place any client (chat, MCP, Desktop)
//! learns repo/workspace, provider/model, and permission state for the
//! current session (AD-17).
//!
//! Deliberately additive, not a forced merge of the three structs that
//! already carry pieces of this today (`chat::history::SessionMetadata`,
//! `chat::tui::ChatTab`, `chat::tui::App`) — see the capability-runtime
//! plan for why. Existing state stays where it is; new code (capability
//! dispatch, evidence, tool-selection) is built against this type going
//! forward.
//!
//! No secrets: no API key field, ever — matches `ChatTab` already keeping
//! `api_key` out of the persisted `SessionMetadata`. No global mutable
//! singleton: always constructed explicitly per call/turn and passed by
//! reference, the same way `App`/`ChatTab` already are.

use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SessionContext {
    pub session_id: String,
    pub repo_root: PathBuf,
    pub provider_name: String,
    pub model: String,
    /// Mirrors `App::use_sandbox` — whether command execution routes
    /// through `core/scripts/sandbox-exec.sh`.
    pub sandboxed: bool,
}

impl SessionContext {
    pub fn new(
        session_id: impl Into<String>,
        repo_root: PathBuf,
        provider_name: impl Into<String>,
        model: impl Into<String>,
        sandboxed: bool,
    ) -> Self {
        Self {
            session_id: session_id.into(),
            repo_root,
            provider_name: provider_name.into(),
            model: model.into(),
            sandboxed,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constructs_with_expected_fields() {
        let ctx = SessionContext::new(
            "sess-1",
            PathBuf::from("/tmp/repo"),
            "ollama",
            "qwen2.5-coder:14b",
            true,
        );
        assert_eq!(ctx.session_id, "sess-1");
        assert_eq!(ctx.repo_root, PathBuf::from("/tmp/repo"));
        assert_eq!(ctx.provider_name, "ollama");
        assert_eq!(ctx.model, "qwen2.5-coder:14b");
        assert!(ctx.sandboxed);
    }
}
