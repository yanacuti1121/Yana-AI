//! Keyboard-first overlays: command palette, model/history pickers and help/settings.

mod render;
pub(super) use render::draw_overlay;

use super::{App, Overlay, OverlayKind};
use crate::chat::input::TextInput;
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use std::sync::{mpsc, Arc};
use std::thread;

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
        let provider = Arc::clone(&self.provider);
        let api_key = self.api_key.clone();
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let result = provider
                .list_models(api_key.as_deref())
                .map_err(|error| error.to_string());
            let _ = tx.send(result);
        });
        self.model_discovery = Some(rx);
        self.overlay = Some(Overlay {
            kind: OverlayKind::Models,
            title: format!("Models · {}", self.provider.name()),
            query: TextInput::default(),
            items: Vec::new(),
            selected: 0,
            detail: vec!["Discovering models from the configured runtime…".to_string()],
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
                    vec!["No models reported by this provider.".to_string()]
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
            (KeyCode::Enter, _) => self.activate_overlay_selection(),
            _ => {}
        }
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
                if let Some(model) = filtered.get(overlay.selected) {
                    self.switch_model(model);
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
