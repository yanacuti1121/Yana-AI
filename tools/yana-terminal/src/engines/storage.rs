// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Default)]
pub struct StorageEngine {
    dirty: bool,
    saved_messages: usize,
}

impl StorageEngine {
    pub fn mark_dirty(&mut self) {
        self.dirty = true;
    }

    pub fn checkpoint(&mut self, message_count: usize) {
        self.saved_messages = message_count;
        self.dirty = false;
    }

    pub fn dirty(&self) -> bool {
        self.dirty
    }

    pub fn saved_messages(&self) -> usize {
        self.saved_messages
    }
}
