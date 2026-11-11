// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug)]
pub struct SessionEngine {
    id: u64,
    title: String,
}

impl Default for SessionEngine {
    fn default() -> Self {
        Self {
            id: 1,
            title: "Terminal workspace".into(),
        }
    }
}

impl SessionEngine {
    pub fn new_session(&mut self) {
        self.id += 1;
        self.title = format!("Session {}", self.id);
    }

    pub fn id(&self) -> u64 {
        self.id
    }

    pub fn title(&self) -> &str {
        &self.title
    }
}
