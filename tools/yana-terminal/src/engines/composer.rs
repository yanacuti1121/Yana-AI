// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Default)]
pub struct ComposerEngine {
    draft: String,
}

impl ComposerEngine {
    pub fn sync(&mut self, value: &str) {
        self.draft.clear();
        self.draft.push_str(value);
    }

    pub fn clear(&mut self) {
        self.draft.clear();
    }

    pub fn draft(&self) -> &str {
        &self.draft
    }
}
