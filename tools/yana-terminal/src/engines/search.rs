// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

use crate::domain::Message;

#[derive(Debug, Default)]
pub struct SearchEngine {
    query: String,
    matches: Vec<usize>,
}

impl SearchEngine {
    pub fn search(&mut self, messages: &[Message], query: &str) -> usize {
        self.query = query.trim().to_owned();
        self.matches.clear();
        if self.query.is_empty() {
            return 0;
        }
        let needle = self.query.to_ascii_lowercase();
        self.matches.extend(
            messages
                .iter()
                .enumerate()
                .filter(|(_, message)| message.content.to_ascii_lowercase().contains(&needle))
                .map(|(index, _)| index),
        );
        self.matches.len()
    }

    pub fn query(&self) -> &str {
        &self.query
    }

    pub fn matches(&self) -> &[usize] {
        &self.matches
    }
}
