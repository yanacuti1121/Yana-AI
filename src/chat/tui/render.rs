//! Frame drawing for the chat TUI — split out of `tui.rs` (see that file's
//! module doc) once the header banner grew past a couple of lines. A
//! submodule of `tui`, not a sibling under `chat`, specifically so it can
//! read `App`'s private fields directly instead of needing a getter for
//! every one of them.

mod render_tools;
#[cfg(test)]
mod tests;

use super::super::banner;
use super::super::provider::{ProviderHealth, Role};
use super::super::settings::ThemeName;
use super::sidebar;
use super::{App, TurnState};
use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span, Text};
use ratatui::widgets::{Block, BorderType, Borders, Paragraph, Wrap};
use ratatui::Frame;

pub(super) const JADE: Color = Color::Rgb(69, 201, 157);
pub(super) const WATER: Color = Color::Rgb(94, 184, 222);
pub(super) const AMBER: Color = Color::Rgb(244, 181, 78);
const ROSE: Color = Color::Rgb(244, 137, 185);
pub(super) const VIOLET: Color = Color::Rgb(181, 140, 255);
const LIME: Color = Color::Rgb(165, 222, 102);
const CORAL: Color = Color::Rgb(255, 137, 112);
pub(super) const SLATE: Color = Color::Rgb(126, 140, 153);
const SIDEBAR_MIN_WIDTH: u16 = 120;
const SIDEBAR_WIDTH: u16 = 36;
const SEND_BORDER_COLORS: [Color; 7] = [JADE, WATER, VIOLET, ROSE, CORAL, AMBER, LIME];

#[derive(Clone, Copy)]
struct Palette {
    primary: Color,
    accent: Color,
    muted: Color,
    warning: Color,
}

fn palette(theme: ThemeName) -> Palette {
    match theme {
        ThemeName::Yana => Palette {
            primary: JADE,
            accent: WATER,
            muted: SLATE,
            warning: AMBER,
        },
        ThemeName::YanaLight => Palette {
            primary: Color::Rgb(30, 145, 111),
            accent: Color::Rgb(37, 99, 235),
            muted: Color::Rgb(71, 85, 105),
            warning: Color::Rgb(217, 119, 6),
        },
        ThemeName::Terminal => Palette {
            primary: Color::Green,
            accent: Color::Cyan,
            muted: Color::DarkGray,
            warning: Color::Yellow,
        },
        ThemeName::HighContrast => Palette {
            primary: Color::White,
            accent: Color::Cyan,
            muted: Color::Gray,
            warning: Color::Yellow,
        },
    }
}

pub fn draw_ui(frame: &mut Frame, app: &mut App) {
    let colors = palette(app.settings.theme);
    let header_inner_w = frame.area().width;
    let header_lines = banner::header_lines(
        &app.banner_info,
        app.provider.name(),
        &app.model,
        &app.session_id,
        header_inner_w,
    );
    let header_height = header_lines.len() as u16 + 1;
    let input_height = if matches!(app.turn, TurnState::AwaitingApproval(_)) {
        5
    } else {
        (app.input.line_count() + 2).clamp(3, 8)
    };

    let [header_area, tabs_area, content_area, input_area, status_area] = Layout::vertical([
        Constraint::Length(header_height),
        Constraint::Length(2),
        Constraint::Min(3),
        Constraint::Length(input_height),
        Constraint::Length(1),
    ])
    .areas(frame.area());

    let header_widget = Paragraph::new(header_lines).block(
        Block::default()
            .borders(Borders::BOTTOM)
            .border_style(Style::default().fg(colors.primary)),
    );
    frame.render_widget(header_widget, header_area);
    // Recorded for `mouse::handle_tab_click` — the layout above is the only
    // source of truth for where the tab bar actually lands on screen.
    app.tabs_area = tabs_area;
    draw_tabs(frame, app, tabs_area, colors);

    let history_area = if content_area.width >= SIDEBAR_MIN_WIDTH {
        let [history, sidebar_area] =
            Layout::horizontal([Constraint::Min(60), Constraint::Length(SIDEBAR_WIDTH)])
                .areas(content_area);
        sidebar::render_sidebar(frame, sidebar_area, app);
        history
    } else {
        content_area
    };
    if app.history.is_empty() {
        draw_start_screen(frame, app, history_area);
    } else {
        draw_history(frame, app, history_area);
    }
    if let TurnState::AwaitingApproval(pending) = &app.turn {
        render_tools::draw_approval_prompt(frame, pending, input_area);
        draw_status_bar(frame, app, status_area, colors);
        return;
    }

    let input_title = input_title(app);
    let is_processing = matches!(
        app.turn,
        TurnState::Streaming { .. } | TurnState::ExecutingTool { .. }
    );
    let input_border_color = if is_processing {
        colors.warning
    } else {
        colors.primary
    };
    let input_text = if app.input.is_empty() {
        Text::from(Line::styled(
            "Type a message…",
            Style::default().fg(colors.muted),
        ))
    } else {
        Text::from(app.input.as_str())
    };
    let input_widget = Paragraph::new(input_text).block(
        Block::bordered()
            .border_type(BorderType::Rounded)
            .title(input_title)
            .border_style(Style::default().fg(input_border_color)),
    );
    frame.render_widget(input_widget, input_area);
    if is_processing {
        draw_spectrum_border(frame, input_area);
    }
    frame.set_cursor_position((
        input_area.x
            + 1
            + app
                .input
                .visual_cursor()
                .0
                .min(input_area.width.saturating_sub(3)),
        input_area.y
            + 1
            + app
                .input
                .visual_cursor()
                .1
                .min(input_area.height.saturating_sub(3)),
    ));
    draw_status_bar(frame, app, status_area, colors);
    super::overlay::draw_overlay(frame, app);
}

fn draw_tabs(frame: &mut Frame, app: &App, area: Rect, colors: Palette) {
    let available = area.width.saturating_sub(4) as usize;
    let mut spans = Vec::new();
    // `visible_tab_labels` also backs mouse-click hit-testing
    // (`mouse::handle_tab_click`) — kept in one place so what's drawn here
    // and what a click resolves to can't silently drift apart.
    for (index, label) in super::tabs::visible_tab_labels(&app.tabs, available) {
        let style = if index == app.active_tab {
            Style::default()
                .fg(Color::Black)
                .bg(colors.accent)
                .add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(colors.muted)
        };
        spans.push(Span::styled(label, style));
        spans.push(Span::raw(" "));
    }
    spans.push(Span::styled(
        " + ",
        Style::default()
            .fg(colors.primary)
            .add_modifier(Modifier::BOLD),
    ));
    frame.render_widget(
        Paragraph::new(Line::from(spans)).block(
            Block::default()
                .borders(Borders::BOTTOM)
                .border_style(Style::default().fg(Color::DarkGray)),
        ),
        area,
    );
}

fn draw_status_bar(frame: &mut Frame, app: &App, area: Rect, colors: Palette) {
    let state = match (&app.turn, &app.provider_health) {
        (TurnState::Idle, ProviderHealth::Checking) => "○ Checking",
        (TurnState::Idle, ProviderHealth::Unavailable(_)) => "⚠ Unavailable",
        (TurnState::Idle, ProviderHealth::Ready) => "✓ Ready",
        (TurnState::Streaming { .. }, _) => "◌ Generating",
        (TurnState::AwaitingApproval(_), _) => "! Approval",
        (TurnState::ExecutingTool { .. }, _) => "◌ Tool",
    };
    let runtime = app.provider.runtime_kind().label();
    let usage = if app.last_usage.input_tokens == 0 && app.last_usage.output_tokens == 0 {
        "ctx —".to_string()
    } else {
        let used = app.last_usage.input_tokens + app.last_usage.output_tokens;
        match app.metadata.generation.context_length {
            Some(limit) => format!("ctx {used}/{limit}"),
            None => format!("tokens {used}"),
        }
    };
    let speed = match (app.last_duration_ms, app.last_usage.output_tokens) {
        (Some(duration), tokens) if duration > 0 && tokens > 0 => {
            format!("{:.1} tok/s", tokens as f64 / (duration as f64 / 1000.0))
        }
        _ => "— tok/s".to_string(),
    };
    // Contextual, not a single fixed "Ctrl+K commands" always — the one
    // hint that actually applies to what's on the input line right now.
    let hint = if app.input.as_str().starts_with('/') {
        "Tab autocomplete · Enter run"
    } else if app.input.is_empty() {
        "Ctrl+K commands · Tab panel"
    } else {
        "Enter send · Ctrl+K commands"
    };
    let text = if area.width >= 85 && app.settings.show_metrics {
        format!(
            " {state} │ {} │ {} │ {usage} │ {speed} │ {runtime} │ {hint} ",
            app.provider.name(),
            app.model
        )
    } else {
        format!(" {state} │ {} │ {runtime} │ {hint} ", app.model)
    };
    frame.render_widget(
        Paragraph::new(text).style(Style::default().fg(colors.muted)),
        area,
    );
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
    if matches!(app.turn, TurnState::Streaming { .. }) {
        " Yana is responding… ".to_string()
    } else if matches!(app.turn, TurnState::ExecutingTool { .. }) {
        " Running approved tool… ".to_string()
    } else if app.input.as_str().starts_with('/') {
        let matches =
            super::commands::autocomplete(app.input.as_str(), &app.settings.custom_commands);
        if matches.is_empty() {
            " Unknown command · /help ".to_string()
        } else {
            format!(" {} · Tab completes ", matches.join("  "))
        }
    } else if app.status.is_empty() {
        " Message · Enter to send ".to_string()
    } else {
        format!(" {} ", app.status)
    }
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
            Role::User => (
                " YOU ",
                Style::default()
                    .fg(Color::Black)
                    .bg(WATER)
                    .add_modifier(Modifier::BOLD),
            ),
            Role::Assistant => (
                " YANA ",
                Style::default()
                    .fg(Color::Black)
                    .bg(JADE)
                    .add_modifier(Modifier::BOLD),
            ),
        };
        lines.push(Line::from(Span::styled(label, style)));
        lines.extend(markdown_lines(&msg.content));
        lines.push(Line::raw(""));
    }
    if matches!(app.turn, TurnState::Streaming { .. }) || !app.streaming_reply.is_empty() {
        let style = Style::default()
            .fg(Color::Black)
            .bg(JADE)
            .add_modifier(Modifier::BOLD);
        lines.push(Line::from(Span::styled(" YANA ", style)));
        lines.extend(markdown_lines(&format!("{}▌", app.streaming_reply)));
    }

    let total_lines = lines.len() as u16;
    let visible = area.height.saturating_sub(2); // minus top+bottom border
    let max_scroll = total_lines.saturating_sub(visible);
    // Pinned-to-bottom by default (App::new sets scroll = u16::MAX);
    // PageUp/PageDown move it, always re-clamped into range here so it
    // can never scroll past the actual content.
    app.scroll = app.scroll.min(max_scroll);
    if app.scroll == max_scroll {
        app.auto_scroll = true;
        app.has_new_output = false;
    }

    let widget = Paragraph::new(Text::from(lines))
        .block(
            Block::bordered()
                .title(" Conversation ")
                .border_style(Style::default().fg(WATER)),
        )
        .wrap(Wrap { trim: false })
        .scroll((app.scroll, 0));
    frame.render_widget(widget, area);
}

fn markdown_lines(content: &str) -> Vec<Line<'static>> {
    let mut in_code = false;
    let mut lines = Vec::new();
    for raw in content.lines() {
        if let Some(fence) = raw.strip_prefix("```") {
            if in_code {
                lines.push(Line::styled("  └", Style::default().fg(Color::DarkGray)));
                in_code = false;
            } else {
                let language = fence.trim();
                let title = if language.is_empty() {
                    "  ┌ code".to_string()
                } else {
                    format!("  ┌ {language}")
                };
                lines.push(Line::styled(title, Style::default().fg(WATER)));
                in_code = true;
            }
            continue;
        }
        if in_code {
            lines.push(Line::from(vec![
                Span::styled("  │ ", Style::default().fg(Color::DarkGray)),
                Span::styled(raw.to_string(), Style::default().fg(Color::White)),
            ]));
        } else if let Some(heading) = raw.strip_prefix("# ").or_else(|| raw.strip_prefix("## ")) {
            lines.push(Line::styled(
                format!("  {heading}"),
                Style::default().fg(WATER).add_modifier(Modifier::BOLD),
            ));
        } else if raw.starts_with("- ") || raw.starts_with("* ") {
            lines.push(Line::styled(
                format!("  • {}", &raw[2..]),
                Style::default().fg(Color::White),
            ));
        } else if let Some(quote) = raw.strip_prefix("> ") {
            lines.push(Line::styled(
                format!("  │ {quote}"),
                Style::default().fg(SLATE).add_modifier(Modifier::ITALIC),
            ));
        } else {
            lines.push(Line::raw(format!("  {raw}")));
        }
    }
    if content.is_empty() {
        lines.push(Line::raw(""));
    }
    lines
}

/// The first view of a new or empty session. It gives Yana a consistent,
/// local-first identity while still showing actual resumable sessions when
/// the user opened chat without `--resume`.
fn draw_start_screen(frame: &mut Frame, app: &App, area: ratatui::layout::Rect) {
    let mut lines = vec![
        Line::styled(
            " ✦  YANA // LOCAL ",
            Style::default()
                .fg(Color::Black)
                .bg(JADE)
                .add_modifier(Modifier::BOLD),
        ),
        Line::raw(""),
        Line::styled(
            "Your grounded copilot for this workspace.",
            Style::default().fg(WATER).add_modifier(Modifier::BOLD),
        ),
        Line::raw("Start with a goal, a file, or a command you want to understand."),
        Line::raw(""),
        Line::styled(
            format!("Local route  {} · {}", app.provider.name(), app.model),
            Style::default().fg(SLATE),
        ),
        Line::styled(
            "Yana asks before running any tool proposal.",
            Style::default().fg(SLATE),
        ),
    ];
    match &app.provider_health {
        ProviderHealth::Checking => lines.push(Line::styled(
            "Checking local runtime…",
            Style::default().fg(SLATE),
        )),
        ProviderHealth::Unavailable(error) => {
            lines.push(Line::raw(""));
            lines.push(Line::styled(
                "⚠ Local runtime unavailable",
                Style::default().fg(AMBER).add_modifier(Modifier::BOLD),
            ));
            lines.push(Line::styled(
                error.chars().take(100).collect::<String>(),
                Style::default().fg(SLATE),
            ));
            lines.push(Line::styled("Use /model to choose Ollama, LM Studio, llama.cpp, or another configured provider.", Style::default().fg(WATER)));
        }
        ProviderHealth::Ready => lines.push(Line::styled(
            "✓ Local runtime ready",
            Style::default().fg(JADE),
        )),
    }
    let recent_sessions = if app.show_recent_sessions {
        app.recent_sessions.as_slice()
    } else {
        &[]
    };
    if recent_sessions.is_empty() {
        lines.push(Line::raw(""));
        lines.push(Line::styled(
            "No earlier sessions here yet — send the first message.",
            Style::default().fg(SLATE),
        ));
    } else {
        lines.push(Line::raw(""));
        lines.push(Line::styled(
            "Continue a session  ·  /history",
            Style::default().fg(ROSE).add_modifier(Modifier::BOLD),
        ));
        lines.push(Line::raw(""));
        for s in recent_sessions {
            let provider_model = match (&s.provider, &s.model) {
                (Some(p), Some(m)) => format!("{p}/{m}"),
                _ => "?".to_string(),
            };
            lines.push(Line::from(vec![
                Span::styled(s.session_id.clone(), Style::default().fg(Color::Yellow)),
                Span::raw(format!(
                    "  {}  {}  {provider_model}  {} turns",
                    s.title, s.last_ts, s.turn_count
                )),
            ]));
            if !s.preview.is_empty() {
                lines.push(Line::styled(
                    format!("    \"{}\"", s.preview),
                    Style::default().fg(Color::DarkGray),
                ));
            }
        }
    }
    let widget = Paragraph::new(Text::from(lines))
        .block(
            Block::bordered()
                .title(" Continue a session ")
                .border_style(Style::default().fg(WATER)),
        )
        .wrap(Wrap { trim: false });
    frame.render_widget(widget, area);
}
