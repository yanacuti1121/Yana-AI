use super::{commands, history, App, TurnState};
use crate::chat::provider::{ChatMessage, Role};
use crossterm::event::{KeyCode, KeyEvent, KeyEventKind, KeyModifiers};

const SCROLL_PAGE: u16 = 10;

impl App {
    pub(super) fn on_key(&mut self, key: KeyEvent) {
        if key.kind != KeyEventKind::Press {
            return;
        }
        if matches!(self.turn, TurnState::AwaitingApproval(_)) {
            self.handle_approval_key(key);
            return;
        }
        if self.overlay.is_some() {
            self.handle_overlay_key(key);
            return;
        }
        match (key.code, key.modifiers) {
            (KeyCode::Char('c'), KeyModifiers::CONTROL)
                if !matches!(self.turn, TurnState::Idle) =>
            {
                self.cancel_generation()
            }
            (KeyCode::Char('c'), KeyModifiers::CONTROL) if !self.input.is_empty() => {
                self.input.clear();
                self.status = "input cleared · Ctrl+C again to quit".to_string();
            }
            (KeyCode::Char('c'), KeyModifiers::CONTROL)
            | (KeyCode::Char('d'), KeyModifiers::CONTROL) => self.should_quit = true,
            (KeyCode::Char('k'), KeyModifiers::CONTROL) => self.open_command_palette(),
            (KeyCode::Char('t'), KeyModifiers::CONTROL) => self.new_tab(),
            (KeyCode::Char('w'), KeyModifiers::CONTROL) => self.close_active_tab(),
            (KeyCode::Tab, KeyModifiers::CONTROL) => self.next_tab(),
            (KeyCode::BackTab, _) => self.previous_tab(),
            (KeyCode::Esc, _) if !matches!(self.turn, TurnState::Idle) => self.cancel_generation(),
            (KeyCode::Char(number @ '1'..='9'), KeyModifiers::ALT) => {
                self.jump_to_tab(number.to_digit(10).unwrap_or(1) as usize - 1)
            }
            (KeyCode::Enter, _) => self.submit(),
            (KeyCode::Char('j'), KeyModifiers::CONTROL) => self.input.insert('\n'),
            (KeyCode::Backspace, _) => self.input.backspace(),
            (KeyCode::Delete, _) => self.input.delete(),
            (KeyCode::Left, KeyModifiers::ALT) => self.input.move_word_left(),
            (KeyCode::Right, KeyModifiers::ALT) => self.input.move_word_right(),
            (KeyCode::Left, _) => self.input.move_left(),
            (KeyCode::Right, _) => self.input.move_right(),
            (KeyCode::Home, _) => self.input.move_home(),
            (KeyCode::End, _) => self.input.move_end(),
            (KeyCode::PageUp, _) => {
                self.auto_scroll = false;
                self.scroll = self.scroll.saturating_sub(SCROLL_PAGE);
            }
            (KeyCode::PageDown, _) => {
                self.scroll = self.scroll.saturating_add(SCROLL_PAGE);
                self.has_new_output = false;
            }
            (KeyCode::Tab, _) if self.input.as_str().starts_with('/') => {
                if let Some(command) = commands::autocomplete(self.input.as_str()).first() {
                    self.input.set(format!("{command} "));
                }
            }
            (KeyCode::Tab, _) => self.sidebar_tab = self.sidebar_tab.next(),
            (KeyCode::Char(character), _) => self.input.insert(character),
            _ => {}
        }
    }

    fn submit(&mut self) {
        let text = self.input.as_str().trim().to_string();
        if text.is_empty() || !matches!(self.turn, TurnState::Idle) {
            return;
        }
        self.input.clear();
        self.tool_rounds.reset();
        if self.try_dispatch_command(&text) {
            return;
        }
        self.show_recent_sessions = false;
        if !self.breaker.can_attempt() {
            let seconds = self.breaker.cooldown_remaining_secs().unwrap_or(0);
            self.status = format!(
                "{} is cooling down after repeated failures, ~{seconds}s remaining",
                self.provider.name()
            );
            return;
        }
        if self.settings.privacy.log_messages {
            self.status = history::append_user(&self.session_id, &text)
                .map(|_| String::new())
                .unwrap_or_else(|error| {
                    format!("warning: failed to persist user message: {error}")
                });
        } else {
            self.status = "private session · message history disabled".to_string();
        }
        self.history.push(ChatMessage::text(Role::User, text));
        if self.metadata.title == "New conversation" {
            self.metadata.title = history::derive_title(&self.history.last().unwrap().content);
            let _ = history::save_metadata(&mut self.metadata);
        }
        self.spawn_turn();
    }
}
