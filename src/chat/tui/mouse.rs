//! Mouse input. Split out of `keys.rs` because it needs the tab bar's
//! on-screen geometry (`App::tabs_area`, recorded by `render::draw_ui`
//! each frame) rather than pure key dispatch — a different enough concern
//! to earn its own file per this directory's existing convention.
//!
//! `mouse capture` itself is enabled/disabled by `TerminalGuard`
//! (`terminal_guard.rs`) — without that, the terminal never sends
//! `Event::Mouse` at all, so this module would never be reached.

use super::App;
use crossterm::event::{MouseButton, MouseEvent, MouseEventKind};

/// Scroll step for the mouse wheel — deliberately smaller than
/// `PageUp`/`PageDown`'s 10-line jump (see `keys.rs::SCROLL_PAGE`), since a
/// single wheel notch is a much finer gesture than a keyboard page flip.
const WHEEL_SCROLL: u16 = 3;

impl App {
    pub(super) fn on_mouse(&mut self, event: MouseEvent) {
        match event.kind {
            MouseEventKind::ScrollUp => {
                self.auto_scroll = false;
                self.scroll = self.scroll.saturating_sub(WHEEL_SCROLL);
            }
            MouseEventKind::ScrollDown => {
                self.scroll = self.scroll.saturating_add(WHEEL_SCROLL);
                self.has_new_output = false;
            }
            MouseEventKind::Down(MouseButton::Left) => {
                self.handle_tab_click(event.column, event.row);
            }
            _ => {}
        }
    }

    /// Resolves a click to a tab index using the exact same label layout
    /// `render::draw_tabs` painted (`tabs::visible_tab_labels`) — see that
    /// function's own doc comment for why the logic lives there, not here
    /// or in `render.rs`, a third time.
    fn handle_tab_click(&mut self, column: u16, row: u16) {
        let area = self.tabs_area;
        if row < area.y || row >= area.y.saturating_add(area.height) || column < area.x {
            return;
        }
        let available = area.width.saturating_sub(4) as usize;
        let mut cursor = area.x;
        for (index, label) in super::tabs::visible_tab_labels(&self.tabs, available) {
            let width = label.chars().count() as u16;
            if column >= cursor && column < cursor.saturating_add(width) {
                self.jump_to_tab(index);
                return;
            }
            cursor = cursor.saturating_add(width).saturating_add(1); // +1 separating space
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chat::provider::{ChatMessage, ChatProvider, ChatUsage};
    use crate::chat::tool_types::{StreamOutcome, ToolSpec};
    use anyhow::Result;
    use ratatui::layout::Rect;
    use std::sync::Arc;
    use uuid::Uuid;

    struct FakeProvider;

    impl ChatProvider for FakeProvider {
        fn name(&self) -> &str {
            "fake"
        }
        fn default_model(&self) -> &str {
            "local-test"
        }
        fn requires_key(&self) -> bool {
            false
        }
        fn env_var(&self) -> &str {
            ""
        }
        fn stream_chat(
            &self,
            _api_key: Option<&str>,
            _model: &str,
            _system: Option<&str>,
            _messages: &[ChatMessage],
            _tools: &[ToolSpec],
            _on_chunk: &mut dyn FnMut(&str) -> Result<()>,
        ) -> Result<(ChatUsage, StreamOutcome)> {
            Ok((ChatUsage::default(), StreamOutcome::Text))
        }
    }

    fn app() -> super::super::App {
        let mut app = super::super::App::new(
            Arc::new(FakeProvider),
            "local-test".to_string(),
            None,
            None,
            Uuid::new_v4().to_string(),
            Vec::new(),
            false,
            true,
            true,
        );
        app.settings.autosave = false;
        app.tabs_area = Rect::new(0, 1, 80, 2);
        app
    }

    fn click(column: u16, row: u16) -> MouseEvent {
        MouseEvent {
            kind: MouseEventKind::Down(MouseButton::Left),
            column,
            row,
            modifiers: crossterm::event::KeyModifiers::empty(),
        }
    }

    #[test]
    fn clicking_a_tab_label_switches_to_it() {
        let mut app = app();
        app.metadata.title = "first".to_string();
        app.new_tab();
        app.metadata.title = "second".to_string();
        assert_eq!(app.active_tab, 1);

        // Tab 0's label starts right after the area's left edge (x=0).
        app.on_mouse(click(1, 1));
        assert_eq!(app.active_tab, 0);
    }

    #[test]
    fn clicking_outside_the_tab_row_does_nothing() {
        let mut app = app();
        app.new_tab();
        assert_eq!(app.active_tab, 1);
        app.on_mouse(click(1, 5)); // row 5 is well below tabs_area (y=1..3)
        assert_eq!(app.active_tab, 1, "click outside the tab row must be a no-op");
    }

    #[test]
    fn scroll_wheel_disables_auto_scroll_and_moves_the_viewport() {
        let mut app = app();
        app.scroll = 20;
        app.auto_scroll = true;
        app.on_mouse(MouseEvent {
            kind: MouseEventKind::ScrollUp,
            column: 0,
            row: 0,
            modifiers: crossterm::event::KeyModifiers::empty(),
        });
        assert!(!app.auto_scroll);
        assert_eq!(app.scroll, 20 - WHEEL_SCROLL);
    }
}
