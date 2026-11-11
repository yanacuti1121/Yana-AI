// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    User,
    Assistant,
    System,
}

#[derive(Debug, Clone)]
pub struct Message {
    pub role: Role,
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActivityState {
    Running,
    Done,
    Warning,
}

#[derive(Debug, Clone)]
pub struct Activity {
    pub label: String,
    pub detail: String,
    pub state: ActivityState,
}

#[derive(Debug, Clone)]
pub struct PlanStep {
    pub title: String,
    pub done: bool,
    pub active: bool,
}

#[derive(Debug, Clone)]
pub struct ScopedFile {
    pub path: String,
    pub confidence: u8,
    pub lines: usize,
    pub selected: bool,
}

#[derive(Debug, Clone)]
pub struct RuntimeInfo {
    pub model: String,
}
