// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ComposeStage {
    Plan,
    Execute,
    Review,
    Test,
    Reflect,
}

impl ComposeStage {
    pub const ALL: [ComposeStage; 5] = [
        ComposeStage::Plan,
        ComposeStage::Execute,
        ComposeStage::Review,
        ComposeStage::Test,
        ComposeStage::Reflect,
    ];

    pub fn label(self) -> &'static str {
        match self {
            ComposeStage::Plan => "Plan",
            ComposeStage::Execute => "Execute",
            ComposeStage::Review => "Review",
            ComposeStage::Test => "Test",
            ComposeStage::Reflect => "Reflect",
        }
    }
}

#[derive(Debug)]
pub struct ComposeStageEngine {
    current: ComposeStage,
}

impl Default for ComposeStageEngine {
    fn default() -> Self {
        Self {
            current: ComposeStage::Plan,
        }
    }
}

impl ComposeStageEngine {
    pub fn advance(&mut self) {
        self.current = match self.current {
            ComposeStage::Plan => ComposeStage::Execute,
            ComposeStage::Execute => ComposeStage::Review,
            ComposeStage::Review => ComposeStage::Test,
            ComposeStage::Test => ComposeStage::Reflect,
            ComposeStage::Reflect => ComposeStage::Plan,
        };
    }

    pub fn current(&self) -> ComposeStage {
        self.current
    }
}
