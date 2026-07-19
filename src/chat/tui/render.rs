//! Frame drawing for the chat TUI — split out of `tui.rs` (see that file's
//! module doc) once the header banner grew past a couple of lines. A
//! submodule of `tui`, not a sibling under `chat`, specifically so it can
//! read `App`'s private fields directly instead of needing a getter for
//! every one of them.

use super::super::banner;
use super::super::provider::Role;
use super::{App, TurnState};
use ratatui::layout::{Constraint, Layout};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{Block, Paragraph, Wrap};
use ratatui::Frame;

pub fn draw_ui(frame: &mut Frame, app: &mut App) {
    let header_lines = banner::header_lines(&app.banner_info, app.provider.name(), &app.model, &app.session_id);
    // Header height follows real content (git info / release note are each
    // omitted when unavailable) rather than a fixed constant, so nothing
    // gets clipped when a line is skipped — see banner::header_lines's doc.
    let header_height = (header_lines.len() as u16 + 2).clamp(4, 8);

    let [header_area, history_area, input_area] = Layout::vertical([
        Constraint::Length(header_height),
        Constraint::Min(3),
        Constraint::Length(3),
    ])
    .areas(frame.area());

    let header_widget = Paragraph::new(header_lines).block(Block::bordered());
    frame.render_widget(header_widget, header_area);

    if app.show_recent_sessions && app.history.is_empty() {
        draw_recent_sessions(frame, app, history_area);
    } else {
        draw_history(frame, app, history_area);
    }

    let input_title = if app.status.is_empty() {
        " message ".to_string()
    } else {
        format!(" {} ", app.status)
    };
    let input_widget = Paragraph::new(app.input.as_str()).block(Block::bordered().title(input_title));
    frame.render_widget(input_widget, input_area);
    frame.set_cursor_position((
        input_area.x + 1 + app.input.len() as u16,
        input_area.y + 1,
    ));
}

fn draw_history(frame: &mut Frame, app: &mut App, area: ratatui::layout::Rect) {
    let mut lines: Vec<Line> = Vec::with_capacity(app.history.len() + 1);
    for msg in &app.history {
        let (label, style) = match msg.role {
            Role::User => ("You", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
            Role::Assistant => ("AI", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
        };
        lines.push(Line::from(vec![Span::styled(format!("{label}: "), style), Span::raw(msg.content.clone())]));
        lines.push(Line::raw(""));
    }
    if matches!(app.turn, TurnState::Streaming(_)) || !app.streaming_reply.is_empty() {
        let style = Style::default().fg(Color::Green).add_modifier(Modifier::BOLD);
        lines.push(Line::from(vec![
            Span::styled("AI: ", style),
            Span::raw(app.streaming_reply.clone()),
        ]));
    }

    let total_lines = lines.len() as u16;
    let visible = area.height.saturating_sub(2); // minus top+bottom border
    let max_scroll = total_lines.saturating_sub(visible);
    // Pinned-to-bottom by default (App::new sets scroll = u16::MAX);
    // PageUp/PageDown move it, always re-clamped into range here so it
    // can never scroll past the actual content.
    app.scroll = app.scroll.min(max_scroll);

    let widget = Paragraph::new(Text::from(lines))
        .block(Block::bordered().title(" history "))
        .wrap(Wrap { trim: false })
        .scroll((app.scroll, 0));
    frame.render_widget(widget, area);
}

/// Shown in place of an empty history pane when `yana chat` opens without
/// `--resume` — a "here's what you could pick up" list, display-only for
/// now (no arrow-key selection yet, per the brief: `--resume <id>` already
/// exists, this just gives the id something to copy from).
fn draw_recent_sessions(frame: &mut Frame, app: &App, area: ratatui::layout::Rect) {
    let mut lines: Vec<Line> = Vec::new();
    if app.recent_sessions.is_empty() {
        lines.push(Line::raw("No previous sessions — send a message to start one."));
    } else {
        lines.push(Line::styled(
            "Recent sessions — resume with: yana-ai chat --resume <id>",
            Style::default().add_modifier(Modifier::ITALIC),
        ));
        lines.push(Line::raw(""));
        for s in &app.recent_sessions {
            let provider_model = match (&s.provider, &s.model) {
                (Some(p), Some(m)) => format!("{p}/{m}"),
                _ => "?".to_string(),
            };
            lines.push(Line::from(vec![
                Span::styled(s.session_id.clone(), Style::default().fg(Color::Yellow)),
                Span::raw(format!("  {}  {provider_model}  {} turns", s.last_ts, s.turn_count)),
            ]));
            if !s.preview.is_empty() {
                lines.push(Line::styled(format!("    \"{}\"", s.preview), Style::default().fg(Color::DarkGray)));
            }
        }
    }
    let widget = Paragraph::new(Text::from(lines))
        .block(Block::bordered().title(" history "))
        .wrap(Wrap { trim: false });
    frame.render_widget(widget, area);
}
