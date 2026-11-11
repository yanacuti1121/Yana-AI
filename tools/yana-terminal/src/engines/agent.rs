// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

// UI-only agent roster. No agent runs anything here — this mirrors the
// roles Yana Core will eventually drive over the bridge. See
// docs/UI_REWRITE_SPEC.md § Agent: "Chỉ là UI."

use super::workflow::WorkflowState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentRole {
    Planner,
    Coder,
    Reviewer,
    Memory,
    Search,
}

impl AgentRole {
    pub const ALL: [AgentRole; 5] = [
        AgentRole::Planner,
        AgentRole::Coder,
        AgentRole::Reviewer,
        AgentRole::Memory,
        AgentRole::Search,
    ];

    pub fn label(self) -> &'static str {
        match self {
            AgentRole::Planner => "Planner",
            AgentRole::Coder => "Coder",
            AgentRole::Reviewer => "Reviewer",
            AgentRole::Memory => "Memory",
            AgentRole::Search => "Search",
        }
    }
}

#[derive(Debug, Default)]
pub struct AgentEngine;

impl AgentEngine {
    pub fn active_agent(&self, workflow_state: WorkflowState) -> AgentRole {
        match workflow_state {
            WorkflowState::Planning => AgentRole::Planner,
            WorkflowState::Running => AgentRole::Coder,
            WorkflowState::Review => AgentRole::Reviewer,
            WorkflowState::Testing => AgentRole::Search,
            WorkflowState::Done => AgentRole::Memory,
        }
    }
}
