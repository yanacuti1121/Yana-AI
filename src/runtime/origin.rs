use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum TurnOrigin {
    Terminal,
    Desktop,
    Claude,
    Codex,
    Cursor,
    Cron,
    Governor,
    Subagent,
    Api,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TurnContext {
    pub(crate) session_id: String,
    pub(crate) workspace: PathBuf,
    pub(crate) origin: TurnOrigin,
    pub(crate) parent_origin: Option<TurnOrigin>,
    pub(crate) agent_id: Option<String>,
    pub(crate) parent_mission_id: Option<String>,
    pub(crate) human_initiated: bool,
}

impl TurnContext {
    pub(crate) fn new(
        session_id: impl Into<String>,
        workspace: PathBuf,
        origin: TurnOrigin,
        human_initiated: bool,
    ) -> Self {
        Self {
            session_id: session_id.into(),
            workspace,
            origin,
            parent_origin: None,
            agent_id: None,
            parent_mission_id: None,
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

    pub(crate) fn is_human_initiated(&self) -> bool {
        self.human_initiated
    }
}
