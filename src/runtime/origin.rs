use super::authority::IntentDeclaration;
use crate::session_context::SessionContext;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) enum TurnOrigin {
    Terminal,
    Desktop,
    Remote,
    Claude,
    Codex,
    Cursor,
    Scheduler,
    Governor,
    Subagent,
    Api,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct TurnContext {
    pub session: SessionContext,
    pub origin: TurnOrigin,
    pub parent_origin: Option<TurnOrigin>,
    pub agent_id: Option<String>,
    pub human_initiated: bool,
    /// Correlation id for every authority decision and capability
    /// invocation that happens within one logical turn (Authority
    /// Hardening item #3/#4). Minted once per top-level turn in `new()`;
    /// `for_subagent` deliberately inherits it via `clone()` rather than
    /// generating a fresh one, so a delegated subagent's capability
    /// decisions are still traceable back to the human-initiated turn
    /// that spawned them — the whole point of an
    /// `AuthorityDecisionReceipt` correlation id.
    pub turn_id: String,
    /// Authority Hardening item #7: this task's own declared intent, if
    /// any. `None` (the default) means no declaration was made — the
    /// existing four-term envelope (HALT/registry/lease-or-approval/
    /// policy) governs unchanged, exactly as it did before this field
    /// existed. See `authority::IntentDeclaration`'s own doc comment for
    /// why this can only narrow, never widen, what those four checks
    /// already decided.
    pub intent: Option<IntentDeclaration>,
}

impl TurnContext {
    pub(crate) fn new(session: SessionContext, origin: TurnOrigin, human_initiated: bool) -> Self {
        Self {
            session,
            origin,
            parent_origin: None,
            agent_id: None,
            human_initiated,
            turn_id: Uuid::new_v4().to_string(),
            intent: None,
        }
    }

    pub(crate) fn for_subagent(&self, agent_id: impl Into<String>) -> Self {
        let mut child = self.clone();
        child.parent_origin = Some(self.origin.clone());
        child.origin = TurnOrigin::Subagent;
        child.agent_id = Some(agent_id.into());
        child.human_initiated = false;
        child
    }

    /// Declares this task's intent — additive, chainable after `new()` or
    /// `for_subagent()`. A coordinator dispatching a subagent calls this
    /// on the child context it hands off, not on its own; there is
    /// deliberately no automatic inheritance of a parent's declaration
    /// (unlike `turn_id`), since a coordinator's own intent and a
    /// subagent's delegated task are not the same claim.
    pub(crate) fn with_intent(mut self, intent: IntentDeclaration) -> Self {
        self.intent = Some(intent);
        self
    }
}
