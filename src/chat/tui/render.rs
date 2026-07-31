//! Frame drawing for the chat TUI — split out of `tui.rs` (see that file's
//! module doc) once the header banner grew past a couple of lines. A
//! submodule of `tui`, not a sibling under `chat`, specifically so it can
//! read `App`'s private fields directly instead of needing a getter for
//! every one of them.

mod render_tools;

use super::super::banner;
use super::super::provider::Role;
use super::{App, TurnState};
use ratatui::layout::{Constraint, Layout};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{Block, Paragraph, Wrap};
use ratatui::Frame;

// Personalized palette (requested 2026-07-31; iterated twice since — first
// "nhạt hơn" made it too pale/washed out, then "thiếu một màu, không hài
// hòa" asked for a third hue to round it out). Settled on a pink→purple→
// blue trio, one hue per pane (header/input/history) instead of reusing
// just two, at a saturation between the original vivid pass and the
// over-pale one. Rgb, not a named Color variant — ratatui's named colors
// are the 16-color ANSI set and have no pastel entries close to these.
const LIGHT_PINK: Color = Color::Rgb(255, 192, 210);
const LIGHT_PURPLE: Color = Color::Rgb(200, 180, 230);
const LIGHT_BLUE: Color = Color::Rgb(165, 210, 235);

pub fn draw_ui(frame: &mut Frame, app: &mut App) {
    // Inner width = full-frame width minus the header block's own left+
    // right border chars — Layout::vertical only splits height, so the
    // header area's width always equals frame.area().width.
    let header_inner_w = frame.area().width.saturating_sub(2);
    let header_lines = banner::header_lines(&app.banner_info, app.provider.name(), &app.model, &app.session_id, header_inner_w);
    // Header height follows real content (git info / release note / the
    // wordmark + 2-column block are each variable-length) rather than a
    // small fixed clamp, so nothing gets clipped — see
    // banner::header_lines's doc. Upper bound is generous (a long,
    // heavily-wrapped release note is the only thing that grows this much)
    // rather than unbounded, so a pathological release-note string can't
    // push the history/input panes off-screen entirely.
    let header_height = (header_lines.len() as u16 + 2).clamp(4, 28);

    let [header_area, history_area, input_area] = Layout::vertical([
        Constraint::Length(header_height),
        Constraint::Min(3),
        Constraint::Length(3),
    ])
    .areas(frame.area());

    let header_widget = Paragraph::new(header_lines)
        .block(Block::bordered().border_style(Style::default().fg(LIGHT_PINK)));
    frame.render_widget(header_widget, header_area);

    if app.show_recent_sessions && app.history.is_empty() {
        draw_recent_sessions(frame, app, history_area);
    } else {
        draw_history(frame, app, history_area);
    }

    if let TurnState::AwaitingApproval(pending) = &app.turn {
        // Replaces the input box entirely — free-text input is disabled
        // in this state (`tui.rs::on_key`'s early-return branch routes
        // every key to `handle_approval_key` instead), so no cursor is
        // shown either.
        render_tools::draw_approval_prompt(frame, pending, input_area);
        return;
    }

    let input_title = if app.status.is_empty() {
        " message ".to_string()
    } else {
        format!(" {} ", app.status)
    };
    // Busy (a turn in flight, or a tool actually executing) gets a
    // distinct border color from idle-and-ready — a glanceable "is it my
    // turn to type" signal that doesn't depend on reading the status text.
    let input_border_color = if matches!(app.turn, TurnState::Streaming(_) | TurnState::ExecutingTool { .. }) {
        Color::Yellow
    } else {
        LIGHT_PURPLE
    };
    let input_widget = Paragraph::new(app.input.as_str()).block(
        Block::bordered()
            .title(input_title)
            .border_style(Style::default().fg(input_border_color)),
    );
    frame.render_widget(input_widget, input_area);
    frame.set_cursor_position((
        input_area.x + 1 + app.input.len() as u16,
        input_area.y + 1,
    ));
}

fn draw_history(frame: &mut Frame, app: &mut App, area: ratatui::layout::Rect) {
    let mut lines: Vec<Line> = Vec::with_capacity(app.history.len() + 1);
    for msg in &app.history {
        if let Some(call) = &msg.tool_call {
            lines.push(render_tools::tool_call_line(call));
            lines.push(Line::raw(""));
            continue;
        }
        if let Some(result) = &msg.tool_result {
            lines.push(render_tools::tool_result_line(result));
            lines.push(Line::raw(""));
            continue;
        }
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
        .block(Block::bordered().title(" history ").border_style(Style::default().fg(LIGHT_BLUE)))
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
        .block(Block::bordered().title(" history ").border_style(Style::default().fg(LIGHT_BLUE)))
        .wrap(Wrap { trim: false });
    frame.render_widget(widget, area);
}
