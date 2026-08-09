//! Frame drawing for the chat TUI — split out of `tui.rs` (see that file's
//! module doc) once the header banner grew past a couple of lines. A
//! submodule of `tui`, not a sibling under `chat`, specifically so it can
//! read `App`'s private fields directly instead of needing a getter for
//! every one of them.

mod render_tools;
#[cfg(test)]
mod tests;

use super::super::banner;
use super::super::provider::Role;
use super::sidebar;
use super::{App, TurnState};
use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{Block, Borders, Paragraph, Wrap};
use ratatui::Frame;

// Palette worked out on the sibling `codex/redesign-chat-tui` branch —
// kept as-is here rather than re-litigating color choices, since this
// file's job in this commit is reconciling that branch's header/border/
// animation work with the real-data sidebar built separately (see
// `sidebar.rs`'s own doc comment for why the sidebar's panels differ from
// that branch's Session/Activity split).
pub(super) const JADE: Color = Color::Rgb(69, 201, 157);
pub(super) const WATER: Color = Color::Rgb(94, 184, 222);
pub(super) const AMBER: Color = Color::Rgb(244, 181, 78);
pub(super) const ROSE: Color = Color::Rgb(244, 137, 185);
pub(super) const VIOLET: Color = Color::Rgb(181, 140, 255);
const LIME: Color = Color::Rgb(165, 222, 102);
const CORAL: Color = Color::Rgb(255, 137, 112);
pub(super) const SLATE: Color = Color::Rgb(126, 140, 153);
const SIDEBAR_MIN_WIDTH: u16 = 108;
const SIDEBAR_WIDTH: u16 = 32;
const SEND_BORDER_COLORS: [Color; 7] = [JADE, WATER, VIOLET, ROSE, CORAL, AMBER, LIME];

pub fn draw_ui(frame: &mut Frame, app: &mut App) {
    let header_lines = banner::header_lines(
        &app.banner_info,
        app.provider.name(),
        &app.model,
        &app.session_id,
        frame.area().width,
    );
    let header_height = header_lines.len() as u16 + 1;
    let input_height = if matches!(app.turn, TurnState::AwaitingApproval(_)) { 5 } else { 3 };

    let [header_area, content_area, input_area] = Layout::vertical([
        Constraint::Length(header_height),
        Constraint::Min(3),
        Constraint::Length(input_height),
    ])
    .areas(frame.area());

    let header_widget =
        Paragraph::new(header_lines).block(Block::default().borders(Borders::BOTTOM).border_style(Style::default().fg(JADE)));
    frame.render_widget(header_widget, header_area);

    let (history_area, sidebar_area) = if content_area.width >= SIDEBAR_MIN_WIDTH {
        let [history, sb] = Layout::horizontal([Constraint::Min(48), Constraint::Length(SIDEBAR_WIDTH)]).areas(content_area);
        (history, Some(sb))
    } else {
        (content_area, None)
    };

    if app.show_recent_sessions && app.history.is_empty() {
        draw_recent_sessions(frame, app, history_area);
    } else {
        draw_history(frame, app, history_area);
    }
    if let Some(sidebar_area) = sidebar_area {
        sidebar::render_sidebar(frame, sidebar_area, app);
    }

    if let TurnState::AwaitingApproval(pending) = &app.turn {
        render_tools::draw_approval_prompt(frame, pending, input_area);
        return;
    }

    let input_title = input_title(app);
    let is_processing = matches!(app.turn, TurnState::Streaming(_) | TurnState::ExecutingTool { .. });
    let input_border_color = if is_processing { AMBER } else { JADE };
    let input_text = if app.input.is_empty() {
        Text::from(Line::styled("Type a message…", Style::default().fg(SLATE)))
    } else {
        Text::from(app.input.as_str())
    };
    let input_widget = Paragraph::new(input_text)
        .block(Block::bordered().title(input_title).border_style(Style::default().fg(input_border_color)));
    frame.render_widget(input_widget, input_area);
    if is_processing {
        draw_spectrum_border(frame, input_area);
    }
    frame.set_cursor_position((
        input_area.x + 1 + (app.input.chars().count() as u16).min(input_area.width.saturating_sub(3)),
        input_area.y + 1,
    ));
}

/// Paints the existing input border with a moving seven-colour spectrum.
/// The event loop already redraws active turns every `TICK`, and `Frame`'s
/// monotonically increasing count keeps this visual-only animation detached
/// from provider timing and request state.
fn draw_spectrum_border(frame: &mut Frame, area: Rect) {
    if area.width < 2 || area.height < 2 {
        return;
    }
    let phase = frame.count() % SEND_BORDER_COLORS.len();
    let mut position = 0usize;
    let last_x = area.x + area.width - 1;
    let last_y = area.y + area.height - 1;
    let buffer = frame.buffer_mut();
    let mut paint = |x: u16, y: u16| {
        let color = SEND_BORDER_COLORS[(phase + position) % SEND_BORDER_COLORS.len()];
        buffer[(x, y)].set_fg(color);
        position += 1;
    };
    for x in area.x..=last_x {
        paint(x, area.y);
    }
    for y in (area.y + 1)..=last_y {
        paint(last_x, y);
    }
    for x in (area.x..last_x).rev() {
        paint(x, last_y);
    }
    for y in ((area.y + 1)..last_y).rev() {
        paint(area.x, y);
    }
}

fn input_title(app: &App) -> String {
    if matches!(app.turn, TurnState::Streaming(_)) {
        " Yana is responding… ".to_string()
    } else if matches!(app.turn, TurnState::ExecutingTool { .. }) {
        " Running approved tool… ".to_string()
    } else if app.status.is_empty() {
        " Message · Enter to send ".to_string()
    } else {
        format!(" {} ", app.status)
    }
}

fn draw_history(frame: &mut Frame, app: &mut App, area: Rect) {
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
            Role::User => (" YOU ", Style::default().fg(Color::Black).bg(WATER).add_modifier(Modifier::BOLD)),
            Role::Assistant => (" YANA ", Style::default().fg(Color::Black).bg(JADE).add_modifier(Modifier::BOLD)),
        };
        lines.push(Line::from(vec![Span::styled(label, style), Span::raw(format!("  {}", msg.content))]));
        lines.push(Line::raw(""));
    }
    if matches!(app.turn, TurnState::Streaming(_)) || !app.streaming_reply.is_empty() {
        let style = Style::default().fg(Color::Black).bg(JADE).add_modifier(Modifier::BOLD);
        lines.push(Line::from(vec![Span::styled(" YANA ", style), Span::raw(format!("  {}", app.streaming_reply))]));
    }

    let total_lines = lines.len() as u16;
    let visible = area.height.saturating_sub(2); // minus top+bottom border
    let max_scroll = total_lines.saturating_sub(visible);
    app.scroll = app.scroll.min(max_scroll);

    let widget = Paragraph::new(Text::from(lines))
        .block(Block::bordered().title(" Conversation ").border_style(Style::default().fg(WATER)))
        .wrap(Wrap { trim: false })
        .scroll((app.scroll, 0));
    frame.render_widget(widget, area);
}

/// Shown in place of an empty history pane when `yana chat` opens without
/// `--resume` — a "here's what you could pick up" list, display-only for
/// now (no arrow-key selection yet, per the brief: `--resume <id>` already
/// exists, this just gives the id something to copy from).
fn draw_recent_sessions(frame: &mut Frame, app: &App, area: Rect) {
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
        .block(Block::bordered().title(" Continue a session ").border_style(Style::default().fg(WATER)))
        .wrap(Wrap { trim: false });
    frame.render_widget(widget, area);
}

