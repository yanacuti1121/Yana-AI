//! Frame drawing for the chat TUI, nested under `tui` so helpers can read
//! `App`'s private state without renderer-only getters.

mod palette;
mod render_tools;
#[cfg(test)]
mod tests;

use super::super::banner;
use super::super::provider::Role;
use super::sidebar;
use super::{App, TurnState};
use palette::active_palette;
pub(super) use palette::Palette;
#[cfg(test)]
use palette::{ColorMode, LOTUS_BLUE, MATCHA_GREEN, OBSIDIAN, SAKURA_PINK};
use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{Block, Borders, Paragraph, Wrap};
use ratatui::Frame;
const SIDEBAR_MIN_WIDTH: u16 = 108;
const SIDEBAR_WIDTH: u16 = 32;

pub fn draw_ui(frame: &mut Frame, app: &mut App) {
    draw_ui_with_palette(frame, app, active_palette());
}

fn draw_ui_with_palette(frame: &mut Frame, app: &mut App, palette: Palette) {
    let header_lines = banner::header_lines(
        &app.banner_info,
        app.provider.name(),
        &app.model,
        &app.session_id,
        frame.area().width,
    );
    let header_height = header_lines.len() as u16 + 1;
    let input_height = if matches!(app.turn, TurnState::AwaitingApproval(_)) {
        5
    } else {
        3
    };

    let [header_area, content_area, input_area] = Layout::vertical([
        Constraint::Length(header_height),
        Constraint::Min(3),
        Constraint::Length(input_height),
    ])
    .areas(frame.area());

    let header_widget = Paragraph::new(header_lines).block(
        Block::default()
            .borders(Borders::BOTTOM)
            .border_style(Style::default().fg(palette.system_blue)),
    );
    frame.render_widget(header_widget, header_area);

    let (history_area, sidebar_area) = if content_area.width >= SIDEBAR_MIN_WIDTH {
        let [history, sb] =
            Layout::horizontal([Constraint::Min(48), Constraint::Length(SIDEBAR_WIDTH)])
                .areas(content_area);
        (history, Some(sb))
    } else {
        (content_area, None)
    };

    if app.show_recent_sessions && app.history.is_empty() {
        draw_recent_sessions(frame, app, history_area, palette);
    } else {
        draw_history(frame, app, history_area, palette);
    }
    if let Some(sidebar_area) = sidebar_area {
        sidebar::render_sidebar(frame, sidebar_area, app, palette);
    }

    if let TurnState::AwaitingApproval(pending) = &app.turn {
        render_tools::draw_approval_prompt(frame, pending, input_area, palette);
        if !palette.colors_enabled() {
            strip_frame_colors(frame);
        }
        return;
    }

    let input_title = input_title(app, palette);
    let model_is_running = matches!(app.turn, TurnState::Streaming(_));
    let input_border_color = composer_tone(app, palette);
    let input_text = if app.input.is_empty() {
        Text::from(Line::styled(
            "Type a message…",
            Style::default().fg(palette.muted),
        ))
    } else {
        Text::from(app.input.as_str())
    };
    let input_widget = Paragraph::new(input_text).block(
        Block::bordered()
            .title(input_title)
            .border_style(Style::default().fg(input_border_color)),
    );
    frame.render_widget(input_widget, input_area);
    if model_is_running && palette.colors_enabled() {
        draw_spectrum_border(frame, input_area, palette.processing_ring);
    }
    frame.set_cursor_position((
        input_area.x
            + 1
            + (app.input.chars().count() as u16).min(input_area.width.saturating_sub(3)),
        input_area.y + 1,
    ));
    if !palette.colors_enabled() {
        strip_frame_colors(frame);
    }
}

fn strip_frame_colors(frame: &mut Frame) {
    for cell in &mut frame.buffer_mut().content {
        cell.set_fg(Color::Reset).set_bg(Color::Reset);
    }
}

/// Paints the existing input border with a frame-driven seven-colour spectrum,
/// detached from provider timing and request state.
fn draw_spectrum_border(frame: &mut Frame, area: Rect, colors: [Color; 7]) {
    if area.width < 2 || area.height < 2 {
        return;
    }
    let phase = (frame.count() / 3) % colors.len();
    let mut position = 0usize;
    let last_x = area.x + area.width - 1;
    let last_y = area.y + area.height - 1;
    let buffer = frame.buffer_mut();
    let mut paint = |x: u16, y: u16| {
        let color = colors[(phase + position) % colors.len()];
        let cell = &mut buffer[(x, y)];
        if matches!(cell.symbol(), "─" | "│" | "┌" | "┐" | "└" | "┘") {
            cell.set_fg(color);
        }
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

fn composer_tone(app: &App, palette: Palette) -> Color {
    match &app.turn {
        TurnState::Streaming(_) | TurnState::ExecutingTool { .. } => palette.runtime_green,
        TurnState::AwaitingApproval(_) => palette.warning,
        TurnState::Idle
            if app.status.starts_with("error") || app.status.starts_with("stream interrupted") =>
        {
            palette.danger
        }
        TurnState::Idle if app.status.starts_with("warning") => palette.warning,
        TurnState::Idle => palette.user_pink,
    }
}

fn input_title(app: &App, palette: Palette) -> Line<'static> {
    if matches!(app.turn, TurnState::Streaming(_)) {
        Line::from(vec![
            Span::styled(" YANA-RT ", palette.badge_style(palette.runtime_green)),
            Span::styled(
                " THINKING · streaming response… ",
                Style::default().fg(palette.system_blue),
            ),
        ])
    } else if matches!(app.turn, TurnState::ExecutingTool { .. }) {
        Line::from(vec![
            Span::styled(" SYSTEM ", palette.badge_style(palette.system_blue)),
            Span::styled(
                " Yana-rt · approved tool running… ",
                Style::default().fg(palette.runtime_green),
            ),
        ])
    } else if app.status.is_empty() {
        Line::from(vec![
            Span::styled(" YOU ", palette.badge_style(palette.user_pink)),
            Span::styled(
                " Message · Enter to send ",
                Style::default().fg(palette.user_pink),
            ),
        ])
    } else {
        Line::from(vec![
            Span::styled(" SYSTEM ", palette.badge_style(palette.system_blue)),
            Span::styled(
                format!(" {} ", app.status),
                Style::default().fg(composer_tone(app, palette)),
            ),
        ])
    }
}

fn draw_history(frame: &mut Frame, app: &mut App, area: Rect, palette: Palette) {
    let mut lines: Vec<Line> = Vec::with_capacity(app.history.len() + 1);
    for msg in &app.history {
        if let Some(call) = &msg.tool_call {
            lines.push(render_tools::tool_call_line(call, palette));
            lines.push(Line::raw(""));
            continue;
        }
        if let Some(result) = &msg.tool_result {
            lines.push(render_tools::tool_result_line(result, palette));
            lines.push(Line::raw(""));
            continue;
        }
        let (label, style) = match msg.role {
            Role::User => (" YOU ", palette.badge_style(palette.user_pink)),
            Role::Assistant => (" YANA-RT ", palette.badge_style(palette.runtime_green)),
        };
        lines.push(Line::from(vec![
            Span::styled(label, style),
            Span::raw(format!("  {}", msg.content)),
        ]));
        lines.push(Line::raw(""));
    }
    if matches!(app.turn, TurnState::Streaming(_)) || !app.streaming_reply.is_empty() {
        let style = palette.badge_style(palette.runtime_green);
        lines.push(Line::from(vec![
            Span::styled(" YANA-RT ", style),
            Span::raw(format!("  {}", app.streaming_reply)),
        ]));
    }

    let total_lines = lines.len() as u16;
    let visible = area.height.saturating_sub(2); // minus top+bottom border
    let max_scroll = total_lines.saturating_sub(visible);
    app.scroll = app.scroll.min(max_scroll);

    let widget = Paragraph::new(Text::from(lines))
        .block(
            Block::bordered()
                .title(" Conversation ")
                .border_style(Style::default().fg(palette.system_blue)),
        )
        .wrap(Wrap { trim: false })
        .scroll((app.scroll, 0));
    frame.render_widget(widget, area);
}

/// Shown in place of an empty history pane when `yana chat` opens without
/// `--resume` — a "here's what you could pick up" list, display-only for
/// now (no arrow-key selection yet, per the brief: `--resume <id>` already
/// exists, this just gives the id something to copy from).
fn draw_recent_sessions(frame: &mut Frame, app: &App, area: Rect, palette: Palette) {
    let mut lines: Vec<Line> = Vec::new();
    if app.recent_sessions.is_empty() {
        lines.push(Line::raw(
            "No previous sessions — send a message to start one.",
        ));
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
                Span::styled(
                    s.session_id.clone(),
                    Style::default().fg(palette.system_blue),
                ),
                Span::raw(format!(
                    "  {}  {provider_model}  {} turns",
                    s.last_ts, s.turn_count
                )),
            ]));
            if !s.preview.is_empty() {
                lines.push(Line::styled(
                    format!("    \"{}\"", s.preview),
                    Style::default().fg(palette.muted),
                ));
            }
        }
    }
    let widget = Paragraph::new(Text::from(lines))
        .block(
            Block::bordered()
                .title(" Continue a session ")
                .border_style(Style::default().fg(palette.system_blue)),
        )
        .wrap(Wrap { trim: false });
    frame.render_widget(widget, area);
}
