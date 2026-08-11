//! Slash-command dispatch — split out of `tui.rs::submit()` purely for
//! line-count budget, same convention as every other file in this
//! directory.

use super::{App, SidebarTab};

pub(super) const SLASH_COMMANDS: &[&str] = &[
    "/help",
    "/model",
    "/models",
    "/new",
    "/clear",
    "/tab",
    "/tabs",
    "/rename",
    "/history",
    "/export",
    "/settings",
    "/system",
    "/context",
    "/status",
    "/memory",
    "/skills",
    "/agents",
    "/quit",
];

pub(super) const PALETTE_COMMANDS: &[&str] = &[
    "New conversation  /new",
    "Switch model  /model",
    "Recent chats  /history",
    "Rename tab  /rename",
    "Duplicate tab  /tab duplicate",
    "Clear conversation  /clear",
    "Export Markdown  /export",
    "Edit system prompt  /system",
    "Settings  /settings",
    "Context details  /context",
    "Help  /help",
    "Quit  /quit",
];

pub(super) fn autocomplete(prefix: &str) -> Vec<&'static str> {
    SLASH_COMMANDS
        .iter()
        .copied()
        .filter(|command| command.starts_with(prefix))
        .collect()
}

pub(super) fn palette_command(label: &str) -> &str {
    label.find('/').map_or("/help", |index| &label[index..])
}

impl App {
    /// Returns `true` if `text` was a recognized slash command (already
    /// fully handled — caller should return without falling through to
    /// the normal "send this as a chat message" path).
    pub(super) fn try_dispatch_command(&mut self, text: &str) -> bool {
        let (command, args) = text.split_once(' ').unwrap_or((text, ""));
        match command {
            "/help" => self.open_help(),
            "/models" => self.open_model_picker(),
            "/new" => self.new_tab(),
            "/clear" => self.clear_active_conversation(),
            "/tabs" => self.status = self.tab_summary(),
            "/history" if args.trim().is_empty() => self.open_history_picker(),
            "/history" if args.trim().starts_with("delete ") => {
                self.delete_session_by_id(args.trim()[7..].trim());
            }
            "/history" => self.status = "usage: /history [delete <session-id>]".to_string(),
            "/settings" => self.open_settings(),
            "/system" if args.trim().is_empty() => self.open_system_prompt(),
            "/system" if args.trim() == "reset" => {
                self.system = None;
                self.metadata.system_prompt = None;
                self.persist_workspace();
                self.status = "system prompt reset".to_string();
            }
            "/system" => {
                self.system = Some(args.trim().to_string());
                self.metadata.system_prompt = self.system.clone();
                self.persist_workspace();
                self.status = "system prompt updated".to_string();
            }
            "/context" => self.show_context_status(),
            "/status" => self.handle_status_command(),
            "/memory" => self.handle_memory_command(args.trim()),
            "/skills" | "/agents" => {
                self.sidebar_tab = SidebarTab::Project;
                self.status = "showing Project panel · Tab cycles sidebar".to_string();
            }
            "/export" => self.export_active_conversation(),
            "/rename" if args.trim().is_empty() => {
                self.status = "usage: /rename <new title>".to_string()
            }
            "/rename" => self.rename_active_tab(args),
            "/tab" => self.handle_tab_command(args),
            "/quit" => self.should_quit = true,
            "/model" if args.trim().is_empty() => self.open_model_picker(),
            "/model" => self.handle_model_command(args.trim()),
            _ => {
                if text.starts_with('/') {
                    let matches = autocomplete(command);
                    self.status = if matches.is_empty() {
                        format!("unknown command '{command}' · /help lists commands")
                    } else {
                        format!("did you mean: {}", matches.join("  "))
                    };
                    return true;
                }
                return false;
            }
        }
        true
    }

    fn handle_tab_command(&mut self, args: &str) {
        match args.trim() {
            "new" => self.new_tab(),
            "close" => self.close_active_tab(),
            "next" => self.next_tab(),
            "prev" | "previous" => self.previous_tab(),
            "duplicate" => self.duplicate_tab(),
            value => match value.parse::<usize>() {
                Ok(index) if index > 0 => self.jump_to_tab(index - 1),
                _ => self.status = "usage: /tab <new|close|next|prev|duplicate|1..9>".to_string(),
            },
        }
    }

    fn clear_active_conversation(&mut self) {
        if !matches!(self.turn, super::TurnState::Idle) {
            self.status = "stop generation before clearing this conversation".to_string();
            return;
        }
        self.history.clear();
        self.streaming_reply.clear();
        self.scroll = u16::MAX;
        if let Err(error) = crate::chat::history::rewrite_session(
            &self.session_id,
            self.provider.name(),
            &self.model,
            &[],
        ) {
            self.status = format!("conversation cleared in memory; persistence failed: {error}");
        } else {
            self.status = "conversation cleared".to_string();
        }
    }

    fn export_active_conversation(&mut self) {
        match crate::chat::history::export_markdown(&self.metadata, &self.history) {
            Ok(path) => self.status = format!("exported Markdown to {}", path.display()),
            Err(error) => self.status = format!("export failed: {error}"),
        }
    }

    fn show_context_status(&mut self) {
        let used = self
            .last_usage
            .input_tokens
            .saturating_add(self.last_usage.output_tokens);
        self.status = match self.metadata.generation.context_length {
            Some(limit) if used > 0 => {
                format!("context {used}/{limit} tokens · provider-reported latest usage")
            }
            Some(limit) => format!("context limit {limit} · usage unavailable for this provider"),
            None if used > 0 => {
                format!("latest request used {used} tokens · context limit unavailable")
            }
            None => "context metrics unavailable — Yana does not estimate or invent token counts"
                .to_string(),
        };
    }

    fn tab_summary(&self) -> String {
        self.tabs
            .iter()
            .enumerate()
            .map(|(index, tab)| {
                let active = if index == self.active_tab { "*" } else { "" };
                format!("{}{}:{}", index + 1, active, tab.metadata.title)
            })
            .collect::<Vec<_>>()
            .join(" · ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slash_autocomplete_is_prefix_based_and_deterministic() {
        assert_eq!(autocomplete("/mo"), vec!["/model", "/models"]);
        assert!(autocomplete("/unknown").is_empty());
    }

    #[test]
    fn palette_keeps_multiword_command_arguments() {
        assert_eq!(
            palette_command("Duplicate tab  /tab duplicate"),
            "/tab duplicate"
        );
    }
}
