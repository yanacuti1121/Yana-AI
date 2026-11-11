// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkflowState {
    Planning,
    Running,
    Review,
    Testing,
    Done,
}

impl WorkflowState {
    pub const ALL: [WorkflowState; 5] = [
        WorkflowState::Planning,
        WorkflowState::Running,
        WorkflowState::Review,
        WorkflowState::Testing,
        WorkflowState::Done,
    ];

    pub fn label(self) -> &'static str {
        match self {
            WorkflowState::Planning => "Planning",
            WorkflowState::Running => "Running",
            WorkflowState::Review => "Review",
            WorkflowState::Testing => "Testing",
            WorkflowState::Done => "Done",
        }
    }
}

#[derive(Debug)]
pub struct WorkflowEngine {
    state: WorkflowState,
}

impl Default for WorkflowEngine {
    fn default() -> Self {
        Self {
            state: WorkflowState::Planning,
        }
    }
}

impl WorkflowEngine {
    pub fn transition(&mut self, state: WorkflowState) {
        self.state = state;
    }

    pub fn state(&self) -> WorkflowState {
        self.state
    }
}
