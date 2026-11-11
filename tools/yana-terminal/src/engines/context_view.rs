// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Default)]
pub struct ContextViewEngine {
    visible_items: usize,
    locked: bool,
    token_estimate: u32,
}

impl ContextViewEngine {
    pub fn sync(&mut self, visible_items: usize, locked: bool, token_estimate: u32) {
        self.visible_items = visible_items;
        self.locked = locked;
        self.token_estimate = token_estimate;
    }

    pub fn summary(&self) -> String {
        format!(
            "{} files · {} · ~{} tok",
            self.visible_items,
            if self.locked { "locked" } else { "open" },
            self.token_estimate
        )
    }
}
