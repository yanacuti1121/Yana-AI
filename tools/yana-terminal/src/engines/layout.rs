// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LayoutMode {
    Focus,
    Split,
}

#[derive(Debug)]
pub struct LayoutEngine {
    mode: LayoutMode,
}

impl Default for LayoutEngine {
    fn default() -> Self {
        Self {
            mode: LayoutMode::Split,
        }
    }
}

impl LayoutEngine {
    pub fn set_sidebar(&mut self, visible: bool) {
        self.mode = if visible {
            LayoutMode::Split
        } else {
            LayoutMode::Focus
        };
    }

    pub fn mode(&self) -> LayoutMode {
        self.mode
    }
}
