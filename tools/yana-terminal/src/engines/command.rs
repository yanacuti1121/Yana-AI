// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UiCommand {
    Help,
    Clear,
    NewSession,
    Engines,
    Provider(String),
    Approval(String),
    Search(String),
    Attach(String),
    Theme,
    Render,
    Save,
    Unknown(String),
}

#[derive(Debug, Default)]
pub struct CommandEngine;

impl CommandEngine {
    pub fn parse(&self, input: &str) -> Option<UiCommand> {
        let input = input.trim();
        if !input.starts_with('/') {
            return None;
        }
        let mut parts = input[1..].splitn(2, char::is_whitespace);
        let command = parts.next().unwrap_or_default().to_ascii_lowercase();
        let argument = parts.next().unwrap_or_default().trim().to_owned();
        Some(match command.as_str() {
            "help" => UiCommand::Help,
            "clear" => UiCommand::Clear,
            "new" => UiCommand::NewSession,
            "engines" => UiCommand::Engines,
            "model" | "provider" => UiCommand::Provider(argument),
            "approval" => UiCommand::Approval(argument),
            "search" => UiCommand::Search(argument),
            "attach" => UiCommand::Attach(argument),
            "theme" => UiCommand::Theme,
            "render" => UiCommand::Render,
            "save" => UiCommand::Save,
            _ => UiCommand::Unknown(command),
        })
    }
}
