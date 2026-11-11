// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Default)]
pub struct ChatEngine {
    submitted: usize,
}

impl ChatEngine {
    pub fn record_submission(&mut self) {
        self.submitted += 1;
    }

    pub fn submitted(&self) -> usize {
        self.submitted
    }
}
