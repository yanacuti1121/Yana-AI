//! Slash-command dispatch — split out of `tui.rs::submit()` purely for
//! line-count budget, same convention as every other file in this
//! directory.

use super::{App, SidebarTab};

impl App {
    /// Returns `true` if `text` was a recognized slash command (already
    /// fully handled — caller should return without falling through to
    /// the normal "send this as a chat message" path).
    pub(super) fn try_dispatch_command(&mut self, text: &str) -> bool {
        if let Some(rest) = text.strip_prefix("/model") {
            self.handle_model_command(rest.trim());
            return true;
        }
        if let Some(rest) = text.strip_prefix("/memory") {
            self.handle_memory_command(rest.trim());
            return true;
        }
        if text == "/skills" || text == "/agents" {
            self.sidebar_tab = SidebarTab::Project;
            self.status = "showing Project panel — Tab to cycle sidebar".to_string();
            return true;
        }
        if text == "/status" {
            self.handle_status_command();
            return true;
        }
        false
    }
}
