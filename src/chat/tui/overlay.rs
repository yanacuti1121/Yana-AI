//! Keyboard-first overlays: command palette, model/history pickers and help/settings.

mod render;
pub(super) use render::draw_overlay;

use super::{App, Overlay, OverlayKind};
use crate::chat::input::TextInput;
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use std::sync::{mpsc, Arc};
use std::thread;

/// One message from an in-flight `/api/pull` worker thread to `App`'s poll
/// loop. `Event` carries live progress (may arrive many times); `Finished`
/// arrives exactly once, ending the stream.
pub(super) enum PullUpdate {
    Event(super::super::ollama_native::PullEvent),
    Finished(Result<(), String>),
}

fn format_pull_event(event: &super::super::ollama_native::PullEvent) -> String {
    use super::super::ollama_native::PullEvent;
    match event {
        PullEvent::Status(status) => status.clone(),
        PullEvent::Progress { status, percent } => format!("{status} · {percent}%"),
        PullEvent::Done => "done".to_string(),
        PullEvent::Error(message) => format!("error: {message}"),
    }
}

impl App {
    pub(super) fn open_command_palette(&mut self) {
        self.overlay = Some(Overlay {
            kind: OverlayKind::Commands,
            title: "Commands · type to filter".to_string(),
            query: TextInput::default(),
            items: super::commands::PALETTE_COMMANDS
                .iter()
                .map(|item| (*item).to_string())
                .collect(),
            selected: 0,
            detail: vec!["Enter run · Esc close · ↑↓ navigate".to_string()],
            loading: false,
        });
    }

    pub(super) fn open_help(&mut self) {
        let mut items = vec![
            "Ctrl+K  Command palette".to_string(),
            "Ctrl+T / Ctrl+W  New / close tab".to_string(),
            "Ctrl+Tab / Ctrl+Shift+Tab  Change tab".to_string(),
            "Alt+1..9  Jump to tab · click a tab label".to_string(),
            "Enter  Send · Ctrl+J  Newline".to_string(),
            "Esc / Ctrl+C  Cancel generation".to_string(),
            "PageUp / PageDown / scroll wheel  Scroll".to_string(),
            "/undo  Restore the conversation after /clear".to_string(),
            "/model /history /settings /system /export".to_string(),
        ];
        if !self.settings.custom_commands.is_empty() {
            let names = self
                .settings
                .custom_commands
                .keys()
                .map(|name| format!("/{name}"))
                .collect::<Vec<_>>()
                .join(" ");
            items.push(format!("Custom: {names}"));
        }
        self.overlay = Some(Overlay {
            kind: OverlayKind::Help,
            title: "Yana Local Chat · Help".to_string(),
            query: TextInput::default(),
            items,
            selected: 0,
            detail: vec![
                "Everything above is keyboard-first, but the mouse works too: scroll the \
                 transcript, click a tab to switch."
                    .to_string(),
            ],
            loading: false,
        });
    }

    pub(super) fn open_model_picker(&mut self) {
        let is_ollama = self.provider.name() == "ollama";
        let (tx, rx) = mpsc::channel();
        if is_ollama {
            // Ollama-native listing (`/api/tags` + `/api/ps`) instead of the
            // generic `ChatProvider::list_models()` (which only sees the
            // OpenAI-compat `/v1/models` shim — bare ids, no size/quant/
            // running status). Each row is formatted `<id>  <size>  <quant>
            // [running]`, matching the History overlay's own "id token +
            // decorative suffix" convention, and fed through the exact same
            // `model_discovery`/`poll_model_discovery` plumbing every other
            // provider already uses — `ModelInfo::named` is a convenient
            // carrier here, not a claim that this row IS a bare model id.
            thread::spawn(move || {
                let result = super::super::ollama_native::list_installed()
                    .map_err(|error| error.to_string())
                    .map(|installed| {
                        let running =
                            super::super::ollama_native::running_models().unwrap_or_default();
                        installed
                            .into_iter()
                            .map(|model| {
                                let mut row = model.display_row();
                                if running.iter().any(|name| name == &model.name) {
                                    row.push_str("  [running]");
                                }
                                super::super::provider::ModelInfo::named(row)
                            })
                            .collect::<Vec<_>>()
                    });
                let _ = tx.send(result);
            });
        } else {
            let provider = Arc::clone(&self.provider);
            let api_key = self.api_key.clone();
            thread::spawn(move || {
                let result = provider
                    .list_models(api_key.as_deref())
                    .map_err(|error| error.to_string());
                let _ = tx.send(result);
            });
        }
        self.model_discovery = Some(rx);
        self.overlay = Some(Overlay {
            kind: OverlayKind::Models,
            title: format!("Models · {}", self.provider.name()),
            query: TextInput::default(),
            items: Vec::new(),
            selected: 0,
            detail: vec![if is_ollama {
                "Discovering installed Ollama models…".to_string()
            } else {
                "Discovering models from the configured runtime…".to_string()
            }],
            loading: true,
        });
    }

    pub(super) fn poll_model_discovery(&mut self) {
        let result = self
            .model_discovery
            .as_ref()
            .and_then(|rx| rx.try_recv().ok());
        let Some(result) = result else { return };
        self.model_discovery = None;
        let is_ollama = self.provider.name() == "ollama";
        let Some(overlay) = &mut self.overlay else {
            return;
        };
        if overlay.kind != OverlayKind::Models {
            return;
        }
        overlay.loading = false;
        match result {
            Ok(models) => {
                overlay.items = models.iter().map(|model| model.id.clone()).collect();
                overlay.detail = if overlay.items.is_empty() {
                    if is_ollama {
                        vec!["No models pulled yet · type a tag, Enter to pull".to_string()]
                    } else {
                        vec!["No models reported by this provider.".to_string()]
                    }
                } else if is_ollama {
                    vec![format!(
                        "{} model(s) · Enter to switch · Delete to remove · type an unlisted tag + Enter to pull",
                        overlay.items.len()
                    )]
                } else {
                    vec![format!(
                        "{} model(s) available · Enter to switch",
                        overlay.items.len()
                    )]
                };
            }
            Err(error) => {
                overlay.detail = vec![
                    format!("Backend unavailable: {error}"),
                    "Esc to close · /model <provider> <model> to configure".to_string(),
                ]
            }
        }
    }

    pub(super) fn open_history_picker(&mut self) {
        let sessions = crate::chat::history::list_recent_sessions(50);
        self.overlay = Some(Overlay {
            kind: OverlayKind::History,
            title: "Recent chats".to_string(),
            query: TextInput::default(),
            items: sessions
                .iter()
                .map(|session| {
                    format!(
                        "{}  {} · {}",
                        session.session_id, session.title, session.preview
                    )
                })
                .collect(),
            selected: 0,
            detail: vec!["Search by title/message preview · Enter opens in a tab".to_string()],
            loading: false,
        });
    }

    pub(super) fn open_settings(&mut self) {
        self.overlay = Some(Overlay {
            kind: OverlayKind::Settings,
            title: "Settings".to_string(),
            query: TextInput::default(),
            items: vec![
                format!("Show metrics: {}", self.settings.show_metrics),
                format!("Restore workspace: {}", self.settings.restore_session),
                format!("Autosave: {}", self.settings.autosave),
                format!("Theme: {:?}", self.settings.theme),
                format!(
                    "Store local message history: {}",
                    self.settings.privacy.log_messages
                ),
                "Telemetry: disabled".to_string(),
            ],
            selected: 0,
            detail: vec![
                "Enter toggles or cycles · settings stay local to this workspace".to_string(),
            ],
            loading: false,
        });
    }

    pub(super) fn open_system_prompt(&mut self) {
        self.overlay = Some(Overlay {
            kind: OverlayKind::SystemPrompt,
            title: "System prompt · Enter save · Ctrl+J newline".to_string(),
            query: TextInput::new(self.system.clone().unwrap_or_default()),
            items: Vec::new(),
            selected: 0,
            detail: vec!["This prompt belongs only to the active tab.".to_string()],
            loading: false,
        });
    }

    pub(super) fn handle_overlay_key(&mut self, key: KeyEvent) {
        if key.code == KeyCode::Esc {
            self.overlay = None;
            return;
        }
        let Some(overlay) = &mut self.overlay else {
            return;
        };
        if overlay.kind == OverlayKind::Help {
            if matches!(key.code, KeyCode::Enter | KeyCode::Char('q')) {
                self.overlay = None;
            }
            return;
        }
        match (key.code, key.modifiers) {
            (KeyCode::Up, _) => overlay.selected = overlay.selected.saturating_sub(1),
            (KeyCode::Down, _) => {
                overlay.selected = (overlay.selected + 1).min(overlay.items.len().saturating_sub(1))
            }
            (KeyCode::Backspace, _) => {
                overlay.query.backspace();
                overlay.selected = 0;
            }
            (KeyCode::Char('j'), KeyModifiers::CONTROL)
                if overlay.kind == OverlayKind::SystemPrompt =>
            {
                overlay.query.insert('\n')
            }
            (KeyCode::Char(character), _) => {
                overlay.query.insert(character);
                overlay.selected = 0;
            }
            (KeyCode::Delete, _)
                if overlay.kind == OverlayKind::Models && self.provider.name() == "ollama" =>
            {
                self.start_model_delete_selected();
            }
            (KeyCode::Enter, _) => self.activate_overlay_selection(),
            _ => {}
        }
    }

    /// Ollama-only, `Delete` key on the Models overlay: reads the selected
    /// row (short-lived immutable borrow of `self.overlay`, ended before
    /// `start_model_delete` needs `&mut self`), then kicks off the delete.
    fn start_model_delete_selected(&mut self) {
        let Some(overlay) = &self.overlay else { return };
        let filtered = filtered_items(overlay);
        let Some(name) = filtered
            .get(overlay.selected)
            .and_then(|item| item.split_whitespace().next())
            .map(str::to_string)
        else {
            return;
        };
        self.start_model_delete(name);
    }

    fn activate_overlay_selection(&mut self) {
        let Some(mut overlay) = self.overlay.take() else {
            return;
        };
        match overlay.kind {
            OverlayKind::Commands => {
                let filtered = filtered_items(&overlay);
                let Some(item) = filtered.get(overlay.selected) else {
                    return;
                };
                let command = super::commands::palette_command(item).to_string();
                if command == "/rename" {
                    self.status = "usage: /rename <new title>".to_string();
                } else {
                    self.try_dispatch_command(&command);
                }
            }
            OverlayKind::Models => {
                let filtered = filtered_items(&overlay);
                let is_ollama = self.provider.name() == "ollama";
                match filtered.get(overlay.selected) {
                    Some(item) => {
                        let id = item.split_whitespace().next().unwrap_or(item);
                        self.switch_model(id);
                    }
                    // No filtered match: on Ollama, treat the typed query as
                    // a tag to pull rather than doing nothing. Every other
                    // provider keeps today's exact behavior (no match = no-op).
                    None if is_ollama && !overlay.query.as_str().trim().is_empty() => {
                        let name = overlay.query.as_str().trim().to_string();
                        self.start_model_pull(name);
                    }
                    None => {}
                }
            }
            OverlayKind::History => {
                let filtered = filtered_items(&overlay);
                if let Some(item) = filtered.get(overlay.selected) {
                    if let Some(session_id) = item.split_whitespace().next() {
                        self.open_session_tab(session_id);
                    }
                }
            }
            OverlayKind::Settings => {
                self.toggle_setting(overlay.selected);
                self.open_settings();
            }
            OverlayKind::SystemPrompt => {
                let prompt = overlay.query.take_trimmed();
                self.system = if prompt.is_empty() {
                    None
                } else {
                    Some(prompt)
                };
                self.metadata.system_prompt = self.system.clone();
                self.persist_workspace();
                self.status = "system prompt updated for this tab".to_string();
            }
            OverlayKind::Help => {}
        }
    }

    fn switch_model(&mut self, model: &str) {
        self.model = model.to_string();
        self.metadata.model = self.model.clone();
        self.persist_workspace();
        self.status = format!(
            "model switched to {} / {}",
            self.provider.name(),
            self.model
        );
    }

    /// Ollama-only. Replaces `self.overlay` with a progress display (same
    /// background-thread + `mpsc::channel` shape as `open_model_picker`)
    /// and starts `ollama_native::pull` on a worker thread.
    fn start_model_pull(&mut self, name: String) {
        let (tx, rx) = mpsc::channel();
        let pull_name = name.clone();
        thread::spawn(move || {
            let tx_events = tx.clone();
            let result = super::super::ollama_native::pull(&pull_name, move |event| {
                let _ = tx_events.send(PullUpdate::Event(event));
            })
            .map_err(|error| error.to_string());
            let _ = tx.send(PullUpdate::Finished(result));
        });
        self.model_pull = Some(rx);
        self.overlay = Some(Overlay {
            kind: OverlayKind::Models,
            title: format!("Pulling {name} · Ollama"),
            query: TextInput::default(),
            items: Vec::new(),
            selected: 0,
            detail: vec![format!("Starting pull of {name}…")],
            loading: true,
        });
    }

    /// Ollama-only. Starts `ollama_native::delete` on a worker thread;
    /// leaves the current Models overlay in place, updating its `detail`
    /// while the delete is in flight.
    fn start_model_delete(&mut self, name: String) {
        let (tx, rx) = mpsc::channel();
        let delete_name = name.clone();
        thread::spawn(move || {
            let result = super::super::ollama_native::delete(&delete_name)
                .map(|()| delete_name.clone())
                .map_err(|error| error.to_string());
            let _ = tx.send(result);
        });
        self.model_delete = Some(rx);
        if let Some(overlay) = &mut self.overlay {
            overlay.loading = true;
            overlay.detail = vec![format!("Deleting {name}…")];
        }
    }

    /// Drains every pending `PullUpdate`, keeping only the latest progress
    /// line visible (each event supersedes the last — no scrollback needed
    /// for a percentage counter). On `Finished`, refreshes the model list
    /// via `open_model_picker` (success) or shows the error (failure).
    pub(super) fn poll_model_pull(&mut self) {
        let mut latest_line: Option<String> = None;
        let mut finished: Option<Result<(), String>> = None;
        if let Some(rx) = &self.model_pull {
            while let Ok(update) = rx.try_recv() {
                match update {
                    PullUpdate::Event(event) => latest_line = Some(format_pull_event(&event)),
                    PullUpdate::Finished(result) => finished = Some(result),
                }
            }
        }
        if latest_line.is_none() && finished.is_none() {
            return;
        }
        if let (Some(line), Some(overlay)) = (&latest_line, &mut self.overlay) {
            overlay.detail = vec![line.clone()];
        }
        let Some(result) = finished else { return };
        self.model_pull = None;
        match result {
            Ok(()) => {
                self.status = "pull complete".to_string();
                self.open_model_picker();
            }
            Err(error) => {
                self.status = format!("pull failed: {error}");
                if let Some(overlay) = &mut self.overlay {
                    overlay.loading = false;
                    overlay.detail =
                        vec![format!("Pull failed: {error}"), "Esc to close".to_string()];
                }
            }
        }
    }

    /// On success, refreshes the list (mirrors `ollama-manager.jsx`'s
    /// `reload()` after a delete). On failure, reports it in the overlay
    /// without discarding the current list.
    pub(super) fn poll_model_delete(&mut self) {
        let result = self.model_delete.as_ref().and_then(|rx| rx.try_recv().ok());
        let Some(result) = result else { return };
        self.model_delete = None;
        match result {
            Ok(name) => {
                self.status = format!("deleted {name}");
                self.open_model_picker();
            }
            Err(error) => {
                self.status = format!("delete failed: {error}");
                if let Some(overlay) = &mut self.overlay {
                    overlay.loading = false;
                    overlay.detail = vec![format!("Delete failed: {error}")];
                }
            }
        }
    }

    fn toggle_setting(&mut self, index: usize) {
        match index {
            0 => self.settings.show_metrics = !self.settings.show_metrics,
            1 => self.settings.restore_session = !self.settings.restore_session,
            2 => self.settings.autosave = !self.settings.autosave,
            3 => {
                self.settings.theme = match self.settings.theme {
                    crate::chat::settings::ThemeName::Yana => {
                        crate::chat::settings::ThemeName::YanaLight
                    }
                    crate::chat::settings::ThemeName::YanaLight => {
                        crate::chat::settings::ThemeName::Terminal
                    }
                    crate::chat::settings::ThemeName::Terminal => {
                        crate::chat::settings::ThemeName::HighContrast
                    }
                    crate::chat::settings::ThemeName::HighContrast => {
                        crate::chat::settings::ThemeName::Yana
                    }
                }
            }
            4 => self.settings.privacy.log_messages = !self.settings.privacy.log_messages,
            _ => {}
        }
        if let Err(error) = crate::chat::settings::save(&self.repo_root, &self.settings) {
            self.status = format!("cannot save settings: {error}");
        }
    }
}

fn filtered_items(overlay: &Overlay) -> Vec<String> {
    let query = overlay.query.as_str().to_lowercase();
    overlay
        .items
        .iter()
        .filter(|item| query.is_empty() || item.to_lowercase().contains(&query))
        .cloned()
        .collect()
}
