use crate::session_context::SessionContext;

#[derive(Debug, Clone, PartialEq, Eq)]
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TurnContext {
    pub session: SessionContext,
    pub origin: TurnOrigin,
    pub parent_origin: Option<TurnOrigin>,
    pub agent_id: Option<String>,
    pub human_initiated: bool,
}

impl TurnContext {
    pub(crate) fn new(session: SessionContext, origin: TurnOrigin, human_initiated: bool) -> Self {
        Self {
            session,
            origin,
            parent_origin: None,
            agent_id: None,
            human_initiated,
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
}
