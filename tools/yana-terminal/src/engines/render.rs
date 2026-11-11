// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderMode {
    Transcript,
    Compact,
}

#[derive(Debug)]
pub struct RenderEngine {
    mode: RenderMode,
}

impl Default for RenderEngine {
    fn default() -> Self {
        Self {
            mode: RenderMode::Transcript,
        }
    }
}

impl RenderEngine {
    pub fn toggle(&mut self) {
        self.mode = match self.mode {
            RenderMode::Transcript => RenderMode::Compact,
            RenderMode::Compact => RenderMode::Transcript,
        };
    }

    pub fn mode(&self) -> RenderMode {
        self.mode
    }
}
