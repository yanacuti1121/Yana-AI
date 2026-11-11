// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

use std::collections::VecDeque;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoticeLevel {
    Info,
    Success,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Notice {
    pub level: NoticeLevel,
    pub text: String,
}

#[derive(Debug, Default)]
pub struct NotificationEngine {
    notices: VecDeque<Notice>,
}

impl NotificationEngine {
    pub fn push(&mut self, level: NoticeLevel, text: impl Into<String>) {
        self.notices.push_back(Notice {
            level,
            text: text.into(),
        });
        while self.notices.len() > 5 {
            self.notices.pop_front();
        }
    }

    pub fn latest(&self) -> Option<&Notice> {
        self.notices.back()
    }
}
