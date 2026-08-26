//! Real conversation-tab lifecycle and workspace persistence.

use super::{App, ChatTab, TurnState};
use crate::chat::circuit_breaker::CircuitBreaker;
use crate::chat::history::{self, WorkspaceState};
use crate::chat::input::TextInput;
use crate::chat::provider::{ChatUsage, ProviderHealth};
use crate::chat::tools::round_guard::ToolRoundGuard;
use uuid::Uuid;

impl App {
    pub(super) fn open_session_tab(&mut self, session_id: &str) {
        if let Some(index) = self
            .tabs
            .iter()
            .position(|tab| tab.session_id == session_id)
        {
            self.jump_to_tab(index);
            return;
        }
        let metadata = history::load_metadata(session_id).unwrap_or_else(|_| {
            let summary = history::list_recent_sessions(100)
                .into_iter()
                .find(|summary| summary.session_id == session_id);
            let provider = summary
                .as_ref()
                .and_then(|item| item.provider.as_deref())
                .unwrap_or("ollama");
            let model = summary
                .as_ref()
                .and_then(|item| item.model.as_deref())
                .unwrap_or("llama3.2");
            let mut metadata = history::new_metadata(session_id, provider, model, None);
            if let Some(summary) = summary {
                metadata.title = history::derive_title(&summary.preview);
            }
            metadata
        });
        let provider = match crate::chat::try_select_provider(&metadata.provider) {
            Ok(provider) => provider,
            Err(error) => {
                self.status = error;
                return;
            }
        };
        let api_key = if provider.requires_key() {
            std::env::var(provider.env_var())
                .ok()
                .filter(|key| !key.is_empty())
        } else {
            None
        };
        if provider.requires_key() && api_key.is_none() {
            self.status = format!("{} is required to restore this session", provider.env_var());
            return;
        }
        let messages = match history::load(session_id) {
            Ok(messages) => messages,
            Err(error) => {
                self.status = format!("cannot restore session history: {error}");
                return;
            }
        };
        let health_rx =
            Self::start_health_probe(provider.clone(), api_key.clone(), metadata.model.clone());
        self.tabs.push(ChatTab {
            history: messages,
            streaming_reply: String::new(),
            input: TextInput::default(),
            status: "session restored".to_string(),
            scroll: u16::MAX,
            breaker: CircuitBreaker::new(),
            turn: TurnState::Idle,
            turn_started_at: None,
            session_id: session_id.to_string(),
            provider,
            model: metadata.model.clone(),
            system: metadata.system_prompt.clone(),
            api_key,
            provider_health: ProviderHealth::Checking,
            health_rx: Some(health_rx),
            metadata,
            last_usage: ChatUsage::default(),
            last_duration_ms: None,
            output_started_at: None,
            output_chunks: 0,
            auto_scroll: true,
            has_new_output: false,
            tool_rounds: ToolRoundGuard::new(),
            undo_buffer: None,
        });
        self.active_tab = self.tabs.len() - 1;
        self.persist_workspace();
    }

    pub(super) fn new_tab(&mut self) {
        let active = &self.tabs[self.active_tab];
        let session_id = Uuid::new_v4().to_string();
        let metadata = history::new_metadata(
            &session_id,
            active.provider.name(),
            &active.model,
            active.system.clone(),
        );
        self.tabs.push(ChatTab {
            history: Vec::new(),
            streaming_reply: String::new(),
            input: TextInput::default(),
            status: "new tab · type a message or press Ctrl+K".to_string(),
            scroll: u16::MAX,
            breaker: CircuitBreaker::new(),
            turn: TurnState::Idle,
            turn_started_at: None,
            session_id,
            provider: active.provider.clone(),
            model: active.model.clone(),
            system: active.system.clone(),
            api_key: active.api_key.clone(),
            provider_health: active.provider_health.clone(),
            health_rx: None,
            metadata,
            last_usage: ChatUsage::default(),
            last_duration_ms: None,
            output_started_at: None,
            output_chunks: 0,
            auto_scroll: true,
            has_new_output: false,
            tool_rounds: ToolRoundGuard::new(),
            undo_buffer: None,
        });
        self.active_tab = self.tabs.len() - 1;
        self.show_recent_sessions = false;
        self.persist_workspace();
    }

    pub(super) fn duplicate_tab(&mut self) {
        let source = &self.tabs[self.active_tab];
        let source_history = source.history.clone();
        let source_title = source.metadata.title.clone();
        self.new_tab();
        self.metadata.title = format!("{} copy", source_title).chars().take(80).collect();
        self.history = source_history;
        if let Err(error) = history::rewrite_session(
            &self.session_id,
            self.provider.name(),
            &self.model,
            &self.history,
        ) {
            self.status = format!("tab duplicated in memory; autosave failed: {error}");
        }
        self.persist_workspace();
    }

    pub(super) fn close_active_tab(&mut self) {
        if self.tabs.len() == 1 {
            if !matches!(self.turn, TurnState::Idle) {
                self.status = "stop the active request before closing the last tab".to_string();
                return;
            }
            self.new_tab();
            self.tabs.remove(0);
            self.active_tab = 0;
            self.persist_workspace();
            return;
        }
        if !matches!(self.turn, TurnState::Idle) {
            self.status = "stop the active request before closing this tab".to_string();
            return;
        }
        self.tabs.remove(self.active_tab);
        self.active_tab = self.active_tab.min(self.tabs.len() - 1);
        self.persist_workspace();
    }

    pub(super) fn next_tab(&mut self) {
        self.active_tab = (self.active_tab + 1) % self.tabs.len();
        self.has_new_output = false;
        self.persist_workspace();
    }

    pub(super) fn previous_tab(&mut self) {
        self.active_tab = if self.active_tab == 0 {
            self.tabs.len() - 1
        } else {
            self.active_tab - 1
        };
        self.has_new_output = false;
        self.persist_workspace();
    }

    pub(super) fn jump_to_tab(&mut self, index: usize) {
        if index < self.tabs.len() {
            self.active_tab = index;
            self.has_new_output = false;
            self.persist_workspace();
        }
    }

    pub(super) fn rename_active_tab(&mut self, title: &str) {
        match history::rename_session(&self.session_id, title) {
            Ok(metadata) => {
                self.metadata = metadata;
                self.status = "tab renamed".to_string();
            }
            Err(error) => self.status = format!("cannot rename tab: {error}"),
        }
    }

    pub(super) fn delete_session_by_id(&mut self, session_id: &str) {
        if session_id.is_empty() {
            self.status = "usage: /history delete <session-id>".to_string();
            return;
        }
        if self.session_id == session_id {
            self.status = "close the active tab before deleting its saved session".to_string();
            return;
        }
        match history::delete_session(session_id) {
            Ok(()) => {
                self.tabs.retain(|tab| tab.session_id != session_id);
                self.active_tab = self.active_tab.min(self.tabs.len().saturating_sub(1));
                self.status = format!("deleted saved session {session_id}");
                self.persist_workspace();
            }
            Err(error) => self.status = format!("cannot delete session: {error}"),
        }
    }

    pub(super) fn shutdown(&mut self) {
        for tab in &self.tabs {
            if let TurnState::Streaming { cancel, .. } = &tab.turn {
                cancel.cancel();
            }
        }
        self.persist_workspace();
    }

    pub(super) fn cancel_generation(&mut self) {
        match &self.turn {
            TurnState::Streaming { cancel, .. } => {
                cancel.cancel();
                self.status = "cancelling generation…".to_string();
            }
            TurnState::ExecutingTool { .. } => {
                self.status =
                    "an approved tool is already running and cannot be detached safely".to_string();
            }
            TurnState::AwaitingApproval(_) => self.decline_tool(),
            TurnState::Idle => {}
        }
    }

    pub(super) fn persist_workspace(&mut self) {
        if !self.settings.autosave {
            return;
        }
        let mut metadata_error = None;
        for tab in &mut self.tabs {
            if let Err(error) = history::save_metadata(&mut tab.metadata) {
                metadata_error = Some(error.to_string());
            }
        }
        let state = WorkspaceState {
            session_ids: self.tabs.iter().map(|tab| tab.session_id.clone()).collect(),
            active_session_id: self.session_id.clone(),
        };
        if let Err(error) = history::save_workspace(&state) {
            self.status = format!("warning: failed to save workspace: {error}");
        } else if let Some(error) = metadata_error {
            self.status = format!("warning: failed to save tab metadata: {error}");
        }
    }

    pub(super) fn poll_health_checks(&mut self) {
        for tab in &mut self.tabs {
            let result = tab.health_rx.as_ref().and_then(|rx| rx.try_recv().ok());
            if let Some(health) = result {
                tab.provider_health = health;
                tab.health_rx = None;
            }
        }
    }
}

/// The tab bar's label text and left-to-right truncation logic, shared
/// between `render::draw_tabs` (what's painted) and `mouse::handle_tab_click`
/// (what a click hit-tests against) — extracted here so the two can never
/// silently drift out of sync with each other. Returns `(tab index, label
/// text)` pairs in on-screen order; a tab that doesn't fit in
/// `available_width` is omitted, matching `draw_tabs`'s own overflow cutoff.
pub(super) fn visible_tab_labels(tabs: &[ChatTab], available_width: usize) -> Vec<(usize, String)> {
    let mut used = 0usize;
    let mut visible = Vec::new();
    for (index, tab) in tabs.iter().enumerate() {
        let mut title: String = tab.metadata.title.chars().take(18).collect();
        if tab.metadata.title.chars().count() > 18 {
            title.push('…');
        }
        let activity = if matches!(tab.turn, TurnState::Streaming { .. }) {
            " ◌"
        } else if tab.has_new_output {
            " ↓"
        } else {
            ""
        };
        let label = format!(" {} {}{} ", index + 1, title, activity);
        if used + label.chars().count() > available_width {
            break;
        }
        used += label.chars().count() + 1; // +1 for the separating space
        visible.push((index, label));
    }
    visible
}

#[cfg(test)]
mod tests;
