// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

use std::time::{SystemTime, UNIX_EPOCH};

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

use crate::{
    domain::{Activity, ActivityState, Message, PlanStep, Role, RuntimeInfo, ScopedFile},
    engines::{
        approval::ApprovalMode, command::UiCommand, notification::NoticeLevel,
        workflow::WorkflowState, UiEngines,
    },
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Overlay {
    Scope,
    Plan,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SidebarTab {
    Activity,
    Workflow,
    Memory,
    Compose,
    Approval,
}

impl SidebarTab {
    pub fn next(self) -> Self {
        match self {
            SidebarTab::Activity => SidebarTab::Workflow,
            SidebarTab::Workflow => SidebarTab::Memory,
            SidebarTab::Memory => SidebarTab::Compose,
            SidebarTab::Compose => SidebarTab::Approval,
            SidebarTab::Approval => SidebarTab::Activity,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            SidebarTab::Activity => "Activity",
            SidebarTab::Workflow => "Workflow",
            SidebarTab::Memory => "Memory",
            SidebarTab::Compose => "Compose",
            SidebarTab::Approval => "Approval",
        }
    }
}

pub struct App {
    pub messages: Vec<Message>,
    pub activities: Vec<Activity>,
    pub plan: Vec<PlanStep>,
    pub scope: Vec<ScopedFile>,
    pub runtime: RuntimeInfo,
    pub input: String,
    pub status: String,
    pub sidebar_tab: SidebarTab,
    pub overlay: Option<Overlay>,
    pub should_quit: bool,
    pub engines: UiEngines,
}

impl App {
    pub fn demo() -> Self {
        let mut engines = UiEngines::default();
        engines.context_view.sync(4, true, 1_200);
        engines.layout.set_sidebar(true);
        let provider_model = engines.provider.current().model.clone();
        Self {
            messages: vec![
                Message {
                    role: Role::System,
                    content: format!(
                        "{} UI engines ready. Type /help to inspect the terminal surface.",
                        UiEngines::COUNT
                    ),
                    timestamp: timestamp(),
                },
                Message {
                    role: Role::User,
                    content: "Thiết kế lại composer nhưng không động vào provider và history."
                        .into(),
                    timestamp: timestamp(),
                },
                Message {
                    role: Role::Assistant,
                    content: "Tôi đã khoanh vùng phần giao diện. Đây vẫn là UI bridge mock; Yana Core chưa bị nhân bản vào repo này."
                        .into(),
                    timestamp: timestamp(),
                },
            ],
            activities: vec![
                Activity {
                    label: "UI engines registered".into(),
                    detail: format!("{} engines", UiEngines::COUNT),
                    state: ActivityState::Done,
                },
                Activity {
                    label: "Context view".into(),
                    detail: engines.context_view.summary(),
                    state: ActivityState::Done,
                },
                Activity {
                    label: "Runtime boundary".into(),
                    detail: "mock bridge only".into(),
                    state: ActivityState::Warning,
                },
            ],
            plan: vec![
                PlanStep {
                    title: "Chat + composer surface".into(),
                    done: true,
                    active: false,
                },
                PlanStep {
                    title: "14 UI engines".into(),
                    done: true,
                    active: false,
                },
                PlanStep {
                    title: "Bridge contract".into(),
                    done: false,
                    active: true,
                },
                PlanStep {
                    title: "Real provider events".into(),
                    done: false,
                    active: false,
                },
            ],
            scope: vec![
                ScopedFile {
                    path: "src/app/mod.rs".into(),
                    confidence: 98,
                    lines: 280,
                    selected: true,
                },
                ScopedFile {
                    path: "src/engines/".into(),
                    confidence: 96,
                    lines: 600,
                    selected: true,
                },
                ScopedFile {
                    path: "src/ui/mod.rs".into(),
                    confidence: 91,
                    lines: 330,
                    selected: true,
                },
                ScopedFile {
                    path: "src/ui/theme.rs".into(),
                    confidence: 72,
                    lines: 40,
                    selected: true,
                },
            ],
            runtime: RuntimeInfo {
                model: provider_model,
            },
            input: String::new(),
            status: format!("{} UI engines ready", UiEngines::COUNT),
            sidebar_tab: SidebarTab::Activity,
            overlay: None,
            should_quit: false,
            engines,
        }
    }

    pub fn handle_key(&mut self, key: KeyEvent) {
        if key.modifiers.contains(KeyModifiers::CONTROL) {
            match key.code {
                KeyCode::Char('c') => self.should_quit = true,
                KeyCode::Char('s') => self.toggle_overlay(Overlay::Scope),
                KeyCode::Char('p') => self.toggle_overlay(Overlay::Plan),
                // Ctrl+M is unreachable on standard terminals: raw mode sends
                // byte 0x0D for both Ctrl+M and Enter, so crossterm reports
                // both as KeyCode::Enter with no way to tell them apart.
                // Ctrl+E jumps to Memory instead (E as in "Evidence").
                KeyCode::Char('e') => self.sidebar_tab = SidebarTab::Memory,
                KeyCode::Char('a') => {
                    self.engines.approval.cycle();
                    self.sidebar_tab = SidebarTab::Approval;
                    self.status = format!("Approval: {}", self.engines.approval.current().label());
                }
                _ => {}
            }
            return;
        }

        match key.code {
            KeyCode::Esc => {
                if self.overlay.is_some() {
                    self.overlay = None;
                } else {
                    self.should_quit = true;
                }
            }
            KeyCode::Tab => {
                self.sidebar_tab = self.sidebar_tab.next();
            }
            KeyCode::Enter => {
                if self.overlay.is_some() {
                    self.overlay = None;
                } else {
                    self.submit_input();
                }
            }
            KeyCode::Backspace => {
                self.input.pop();
                self.engines.composer.sync(&self.input);
            }
            KeyCode::Char(character) if self.overlay.is_none() => {
                self.input.push(character);
                self.engines.composer.sync(&self.input);
            }
            _ => {}
        }
    }

    fn toggle_overlay(&mut self, overlay: Overlay) {
        self.overlay = if self.overlay == Some(overlay) {
            None
        } else {
            Some(overlay)
        };
    }

    fn submit_input(&mut self) {
        let prompt = self.input.trim().to_owned();
        if prompt.is_empty() {
            return;
        }

        self.input.clear();
        self.engines.composer.clear();

        if let Some(command) = self.engines.command.parse(&prompt) {
            self.execute_command(command);
            return;
        }

        self.engines.workflow.transition(WorkflowState::Planning);
        self.messages.push(Message {
            role: Role::User,
            content: prompt,
            timestamp: timestamp(),
        });
        self.engines.chat.record_submission();
        self.engines.storage.mark_dirty();

        self.engines.workflow.transition(WorkflowState::Running);
        self.engines.compose_stage.advance();
        self.engines.workflow.transition(WorkflowState::Review);
        self.engines.compose_stage.advance();
        self.engines.workflow.transition(WorkflowState::Testing);
        self.engines.compose_stage.advance();

        self.messages.push(Message {
            role: Role::Assistant,
            content: "UI workflow đã nhận yêu cầu qua Mock Bridge. Bước tiếp theo là thay mock event bằng bridge tới Yana Core, không nhân bản runtime ở đây."
                .into(),
            timestamp: timestamp(),
        });
        self.engines.workflow.transition(WorkflowState::Done);
        self.engines.compose_stage.advance();
        self.engines.notification.push(
            NoticeLevel::Success,
            format!("Prompt #{} rendered", self.engines.chat.submitted()),
        );
        self.activities.push(Activity {
            label: "Workflow complete".into(),
            detail: format!("prompt #{} · mock bridge", self.engines.chat.submitted()),
            state: ActivityState::Done,
        });
        self.status = "Mock workflow rendered".into();
    }

    fn execute_command(&mut self, command: UiCommand) {
        match command {
            UiCommand::Help => self.system_message(
                "/help  /engines  /clear  /new  /provider <name>  /approval <auto|ask|never>  /search <text>  /attach <path>  /theme  /render  /save",
            ),
            UiCommand::Engines => self.system_message(&format!(
                "{} UI engines: {}",
                UiEngines::COUNT,
                UiEngines::names().join(", ")
            )),
            UiCommand::Clear => {
                self.messages.clear();
                self.status = "Transcript cleared".into();
            }
            UiCommand::NewSession => {
                self.engines.session.new_session();
                self.messages.clear();
                let message = format!(
                    "Started {} (id {}).",
                    self.engines.session.title(),
                    self.engines.session.id()
                );
                self.system_message(&message);
                self.status = "New session".into();
            }
            UiCommand::Provider(name) => {
                if name.is_empty() {
                    let labels = self.engines.provider.labels().collect::<Vec<_>>().join(", ");
                    self.system_message(&format!("Providers: {labels}"));
                } else {
                    match self.engines.provider.select(&name) {
                        Ok(profile) => {
                            self.runtime.model = profile.model.clone();
                            self.status = format!("Provider: {}", profile.name);
                        }
                        Err(error) => self.warn(error),
                    }
                }
            }
            UiCommand::Approval(name) => {
                if name.is_empty() {
                    let labels = ApprovalMode::ALL
                        .iter()
                        .map(|mode| mode.label())
                        .collect::<Vec<_>>()
                        .join(", ");
                    self.system_message(&format!("Approval modes: {labels}"));
                } else {
                    match self.engines.approval.select(&name) {
                        Ok(mode) => self.status = format!("Approval: {}", mode.label()),
                        Err(error) => self.warn(error),
                    }
                }
            }
            UiCommand::Search(query) => {
                let count = self.engines.search.search(&self.messages, &query);
                self.system_message(&format!("Search “{}”: {} match(es).", query, count));
                self.status = format!("Search: {count} matches");
            }
            UiCommand::Attach(path) => match self.engines.attachment.attach(&path) {
                Ok(()) => {
                    self.system_message(&format!("Attached workspace path: {path}"));
                    self.status = format!(
                        "{} attachment(s)",
                        self.engines.attachment.pending().len()
                    );
                }
                Err(error) => self.warn(error),
            },
            UiCommand::Theme => {
                self.engines.theme.toggle();
                let message = format!(
                    "Theme switched to {:?}. UI palette wiring remains intentionally local.",
                    self.engines.theme.current()
                );
                self.system_message(&message);
            }
            UiCommand::Render => {
                self.engines.render.toggle();
                let message = format!("Render mode: {:?}.", self.engines.render.mode());
                self.system_message(&message);
            }
            UiCommand::Save => {
                self.engines.storage.checkpoint(self.messages.len());
                let message = format!(
                    "UI checkpoint recorded for {} messages (in-memory MVP).",
                    self.engines.storage.saved_messages()
                );
                self.system_message(&message);
                self.status = "Checkpoint clean".into();
            }
            UiCommand::Unknown(name) => self.warn(format!("Unknown command /{name}. Type /help.")),
        }
    }

    fn system_message(&mut self, content: &str) {
        self.messages.push(Message {
            role: Role::System,
            content: content.into(),
            timestamp: timestamp(),
        });
        self.engines
            .notification
            .push(NoticeLevel::Info, content.to_owned());
    }

    fn warn(&mut self, content: impl Into<String>) {
        let content = content.into();
        self.messages.push(Message {
            role: Role::System,
            content: format!("Warning: {content}"),
            timestamp: timestamp(),
        });
        self.engines
            .notification
            .push(NoticeLevel::Warning, content.clone());
        self.status = content;
    }
}

fn timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        % 86_400;
    let hours = seconds / 3_600;
    let minutes = (seconds % 3_600) / 60;
    let seconds = seconds % 60;
    format!("{hours:02}:{minutes:02}:{seconds:02}")
}
