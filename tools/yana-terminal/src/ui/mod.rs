// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, BorderType, Borders, Clear, List, ListItem, Paragraph, Wrap},
    Frame,
};

use crate::{
    app::{App, Overlay, SidebarTab},
    domain::{ActivityState, Role},
    engines::{
        agent::AgentRole, approval::ApprovalMode, compose_stage::ComposeStage,
        workflow::WorkflowState,
    },
};

const CYAN: Color = Color::Rgb(76, 201, 240);
const PURPLE: Color = Color::Rgb(183, 130, 255);
const GREEN: Color = Color::Rgb(107, 203, 119);
const YELLOW: Color = Color::Rgb(244, 196, 91);
const MUTED: Color = Color::Rgb(160, 160, 160);
const PANEL: Color = Color::Rgb(47, 55, 68);

pub fn draw(frame: &mut Frame, app: &App) {
    let area = frame.area();
    let composer_height = estimate_composer_height(app, area.width);
    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Min(8),
            Constraint::Length(composer_height),
            Constraint::Length(1),
        ])
        .split(area);

    render_header(frame, rows[0], app);
    render_body(frame, rows[1], app);
    render_composer(frame, rows[2], app);
    render_status(frame, rows[3], app);

    if let Some(overlay) = app.overlay {
        render_overlay(frame, area, app, overlay);
    }
}

fn render_header(frame: &mut Frame, area: Rect, app: &App) {
    let workspace = env!("CARGO_PKG_NAME");
    let header = Paragraph::new(vec![
        Line::from(vec![
            Span::styled(
                " YANA ",
                Style::default()
                    .fg(Color::Black)
                    .bg(CYAN)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled("  Terminal AI Workspace", Style::default().fg(Color::White)),
        ]),
        Line::from(vec![
            Span::styled(format!(" {workspace} "), Style::default().fg(PURPLE)),
            Span::styled("· ", Style::default().fg(MUTED)),
            Span::styled(
                app.engines.provider.current().name.clone(),
                Style::default().fg(Color::White),
            ),
            Span::styled(" · ", Style::default().fg(MUTED)),
            Span::styled(&app.runtime.model, Style::default().fg(Color::White)),
            Span::styled(" · context ", Style::default().fg(MUTED)),
            Span::styled(
                app.engines.context_view.summary(),
                Style::default().fg(Color::White),
            ),
            Span::styled(" · ", Style::default().fg(MUTED)),
            Span::styled(
                format!(
                    "Mock Bridge · {}",
                    if app.engines.provider.current().local {
                        "LOCAL"
                    } else {
                        "REMOTE"
                    }
                ),
                Style::default().fg(GREEN),
            ),
            Span::styled(" · session ", Style::default().fg(MUTED)),
            Span::styled(
                app.engines.session.id().to_string(),
                Style::default().fg(Color::White),
            ),
        ]),
    ])
    .block(
        Block::default()
            .borders(Borders::BOTTOM)
            .border_style(Style::default().fg(PANEL)),
    );

    frame.render_widget(header, area);
}

fn render_body(frame: &mut Frame, area: Rect, app: &App) {
    let show_sidebar = area.width >= 120;
    let columns = if show_sidebar {
        Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Min(60), Constraint::Length(36)])
            .split(area)
    } else {
        Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Percentage(100)])
            .split(area)
    };

    render_transcript(frame, columns[0], app);
    if show_sidebar {
        render_sidebar(frame, columns[1], app);
    }
}

fn render_transcript(frame: &mut Frame, area: Rect, app: &App) {
    let items = app
        .messages
        .iter()
        .map(|message| {
            let (label, color) = match message.role {
                Role::User => ("YOU", GREEN),
                Role::Assistant => ("YANA", CYAN),
                Role::System => ("SYSTEM", YELLOW),
            };

            ListItem::new(vec![
                Line::from(vec![
                    Span::styled(
                        label,
                        Style::default().fg(color).add_modifier(Modifier::BOLD),
                    ),
                    Span::styled(
                        format!("  {}", message.timestamp),
                        Style::default().fg(MUTED),
                    ),
                ]),
                Line::from(Span::styled(
                    message.content.as_str(),
                    Style::default().fg(Color::White),
                )),
                Line::from(""),
            ])
        })
        .collect::<Vec<_>>();

    let transcript = List::new(items).block(
        Block::default()
            .title(" Transcript ")
            .borders(Borders::RIGHT)
            .border_style(Style::default().fg(PANEL)),
    );
    frame.render_widget(transcript, area);
}

fn render_sidebar(frame: &mut Frame, area: Rect, app: &App) {
    if area.height < 12 {
        render_sidebar_panel(frame, area, app);
        return;
    }

    let rows = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(7), Constraint::Min(8)])
        .split(area);
    render_provider_box(frame, rows[0], app);
    render_sidebar_panel(frame, rows[1], app);
}

fn render_provider_box(frame: &mut Frame, area: Rect, app: &App) {
    let current = app.engines.provider.current().name.as_str();
    let items = app
        .engines
        .provider
        .labels()
        .map(|label| {
            let active = label == current;
            let (marker, color) = if active {
                ("●", GREEN)
            } else {
                ("·", MUTED)
            };
            ListItem::new(Line::from(vec![
                Span::styled(format!("{marker} "), Style::default().fg(color)),
                Span::styled(
                    label,
                    Style::default().fg(if active { Color::White } else { MUTED }),
                ),
            ]))
        })
        .collect::<Vec<_>>();

    frame.render_widget(
        List::new(items).block(
            Block::default()
                .title(" Provider ")
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .border_style(Style::default().fg(PANEL)),
        ),
        area,
    );
}

fn render_sidebar_panel(frame: &mut Frame, area: Rect, app: &App) {
    match app.sidebar_tab {
        SidebarTab::Activity => render_activity(frame, area, app),
        SidebarTab::Workflow => render_workflow_panel(frame, area, app),
        SidebarTab::Memory => render_memory_panel(frame, area, app),
        SidebarTab::Compose => render_compose_panel(frame, area, app),
        SidebarTab::Approval => render_approval_panel(frame, area, app),
    }
}

fn render_activity(frame: &mut Frame, area: Rect, app: &App) {
    let items = app
        .activities
        .iter()
        .rev()
        .take(area.height.saturating_sub(2) as usize)
        .map(|activity| {
            let (symbol, color) = match activity.state {
                ActivityState::Running => ("◇", CYAN),
                ActivityState::Done => ("✓", GREEN),
                ActivityState::Warning => ("!", YELLOW),
            };
            ListItem::new(Line::from(vec![
                Span::styled(format!("{symbol} "), Style::default().fg(color)),
                Span::styled(&activity.label, Style::default().fg(Color::White)),
                Span::styled(format!("  {}", activity.detail), Style::default().fg(MUTED)),
            ]))
        })
        .collect::<Vec<_>>();

    frame.render_widget(
        List::new(items).block(
            Block::default()
                .title(" Activity · Tab ")
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .border_style(Style::default().fg(PANEL)),
        ),
        area,
    );
}

fn render_workflow_panel(frame: &mut Frame, area: Rect, app: &App) {
    let current = app.engines.workflow.state();
    let current_index = WorkflowState::ALL
        .iter()
        .position(|state| *state == current)
        .unwrap_or(0);

    let mut items = WorkflowState::ALL
        .iter()
        .enumerate()
        .map(|(index, state)| {
            let (symbol, color) = if index < current_index {
                ("✓", GREEN)
            } else if index == current_index {
                ("›", CYAN)
            } else {
                ("·", MUTED)
            };
            ListItem::new(Line::from(vec![
                Span::styled(format!("{symbol} "), Style::default().fg(color)),
                Span::styled(
                    state.label(),
                    Style::default().fg(if index == current_index {
                        Color::White
                    } else {
                        MUTED
                    }),
                ),
            ]))
        })
        .collect::<Vec<_>>();

    let active_role = app.engines.agent.active_agent(current);
    items.push(ListItem::new(Line::from(Span::styled(
        "Agent",
        Style::default().fg(CYAN).add_modifier(Modifier::BOLD),
    ))));
    for role in AgentRole::ALL {
        let active = role == active_role;
        let (marker, color) = if active {
            ("●", GREEN)
        } else {
            ("·", MUTED)
        };
        items.push(ListItem::new(Line::from(vec![
            Span::styled(format!("{marker} "), Style::default().fg(color)),
            Span::styled(
                role.label(),
                Style::default().fg(if active { Color::White } else { MUTED }),
            ),
        ])));
    }

    frame.render_widget(
        List::new(items).block(
            Block::default()
                .title(" Workflow · Tab ")
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .border_style(Style::default().fg(PANEL)),
        ),
        area,
    );
}

fn render_compose_panel(frame: &mut Frame, area: Rect, app: &App) {
    let current = app.engines.compose_stage.current();
    let current_index = ComposeStage::ALL
        .iter()
        .position(|stage| *stage == current)
        .unwrap_or(0);

    let items = ComposeStage::ALL
        .iter()
        .enumerate()
        .map(|(index, stage)| {
            let (symbol, color) = if index < current_index {
                ("✓", GREEN)
            } else if index == current_index {
                ("›", CYAN)
            } else {
                ("·", MUTED)
            };
            ListItem::new(Line::from(vec![
                Span::styled(format!("{symbol} "), Style::default().fg(color)),
                Span::styled(
                    stage.label(),
                    Style::default().fg(if index == current_index {
                        Color::White
                    } else {
                        MUTED
                    }),
                ),
            ]))
        })
        .collect::<Vec<_>>();

    frame.render_widget(
        List::new(items).block(
            Block::default()
                .title(" Compose · Tab ")
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .border_style(Style::default().fg(PANEL)),
        ),
        area,
    );
}

fn render_memory_panel(frame: &mut Frame, area: Rect, app: &App) {
    let memory = &app.engines.memory;
    let sections: [(&str, &[&str]); 5] = [
        ("Recent Evidence", memory.recent_evidence()),
        ("Timeline", memory.timeline()),
        ("Entities", memory.entities()),
        ("Related", memory.related()),
        ("Retrieved", memory.retrieved()),
    ];

    let mut lines = Vec::new();
    for (title, items) in sections {
        lines.push(Line::from(Span::styled(
            title,
            Style::default().fg(CYAN).add_modifier(Modifier::BOLD),
        )));
        for item in items {
            lines.push(Line::from(vec![
                Span::styled("  · ", Style::default().fg(MUTED)),
                Span::styled(*item, Style::default().fg(Color::White)),
            ]));
        }
    }

    frame.render_widget(
        Paragraph::new(lines).wrap(Wrap { trim: false }).block(
            Block::default()
                .title(" Memory · Ctrl+E ")
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .border_style(Style::default().fg(PANEL)),
        ),
        area,
    );
}

fn render_approval_panel(frame: &mut Frame, area: Rect, app: &App) {
    let current = app.engines.approval.current();
    let items = ApprovalMode::ALL
        .iter()
        .map(|mode| {
            let active = *mode == current;
            let (marker, color) = if active {
                ("●", GREEN)
            } else {
                ("·", MUTED)
            };
            ListItem::new(Line::from(vec![
                Span::styled(format!("{marker} "), Style::default().fg(color)),
                Span::styled(
                    mode.label(),
                    Style::default().fg(if active { Color::White } else { MUTED }),
                ),
            ]))
        })
        .collect::<Vec<_>>();

    frame.render_widget(
        List::new(items).block(
            Block::default()
                .title(" Approval · Ctrl+A ")
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .border_style(Style::default().fg(PANEL)),
        ),
        area,
    );
}

struct ComposerContent {
    left_spans: Vec<Span<'static>>,
    left_len: usize,
    right_text: String,
    right_len: usize,
}

fn build_composer_content(app: &App) -> ComposerContent {
    let provider_name = app.engines.provider.current().name.clone();
    let approval = app.engines.approval.current().label();
    let render_mode = format!("{:?}", app.engines.render.mode());
    let attachments = app.engines.attachment.pending().len();

    let mut left_spans: Vec<Span<'static>> = vec![
        Span::styled(format!("[{provider_name}]"), Style::default().fg(PURPLE)),
        Span::raw(" "),
        Span::styled(format!("[{approval}]"), Style::default().fg(YELLOW)),
        Span::raw(" "),
        Span::styled(format!("[{render_mode}]"), Style::default().fg(MUTED)),
        Span::raw(" "),
    ];
    if attachments > 0 {
        left_spans.push(Span::styled(
            format!("[{attachments} file(s)]"),
            Style::default().fg(GREEN),
        ));
        left_spans.push(Span::raw(" "));
    }
    left_spans.push(Span::styled("› ", Style::default().fg(CYAN)));
    if app.input.is_empty() {
        left_spans.push(Span::styled(
            "Ask Yana or type /help",
            Style::default().fg(MUTED),
        ));
    } else {
        left_spans.push(Span::styled(
            app.input.clone(),
            Style::default().fg(Color::White),
        ));
    }

    let left_len: usize = left_spans
        .iter()
        .map(|span| span.content.chars().count())
        .sum();
    let right_text = format!("{} · {} ", stream_label(app), app.runtime.model);
    let right_len = right_text.chars().count();

    ComposerContent {
        left_spans,
        left_len,
        right_text,
        right_len,
    }
}

/// Grows the composer box to fit the current input on wrap, instead of a
/// fixed 3-row bar that clips or overlaps long prompts.
fn estimate_composer_height(app: &App, width: u16) -> u16 {
    let content = build_composer_content(app);
    let inner_width = width.saturating_sub(2).max(1) as usize;
    let total_len = content.left_len + 1 + content.right_len;
    let lines = (total_len + inner_width - 1) / inner_width;
    lines.clamp(1, 6) as u16 + 2
}

fn render_composer(frame: &mut Frame, area: Rect, app: &App) {
    let content = build_composer_content(app);
    let inner_width = area.width.saturating_sub(2) as usize;
    let padding = inner_width
        .saturating_sub(content.left_len + content.right_len)
        .max(1);

    let mut line_spans = content.left_spans;
    line_spans.push(Span::raw(" ".repeat(padding)));
    line_spans.push(Span::styled(content.right_text, Style::default().fg(MUTED)));

    let composer = Paragraph::new(Line::from(line_spans))
        .wrap(Wrap { trim: false })
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .border_style(Style::default().fg(CYAN)),
        );
    frame.render_widget(composer, area);
}

fn stream_label(app: &App) -> &'static str {
    if !app.input.is_empty() {
        return "Typing…";
    }
    match app.engines.workflow.state() {
        WorkflowState::Planning => "Waiting…",
        WorkflowState::Running | WorkflowState::Review | WorkflowState::Testing => "Streaming…",
        WorkflowState::Done => "Done",
    }
}

fn render_status(frame: &mut Frame, area: Rect, app: &App) {
    let status = Paragraph::new(Line::from(vec![
        Span::styled(" Ctrl+P ", Style::default().fg(PURPLE)),
        Span::styled("plan", Style::default().fg(MUTED)),
        Span::styled("  Ctrl+E ", Style::default().fg(PURPLE)),
        Span::styled("memory", Style::default().fg(MUTED)),
        Span::styled("  Ctrl+A ", Style::default().fg(PURPLE)),
        Span::styled("approval", Style::default().fg(MUTED)),
        Span::styled("  Tab ", Style::default().fg(PURPLE)),
        Span::styled("sidebar", Style::default().fg(MUTED)),
        Span::styled("  Esc ", Style::default().fg(PURPLE)),
        Span::styled("quit", Style::default().fg(MUTED)),
        Span::styled("   ·   ", Style::default().fg(PANEL)),
        Span::styled(&app.status, Style::default().fg(GREEN)),
        Span::styled("   ·   ", Style::default().fg(PANEL)),
        Span::styled(
            format!(
                "session {} · {} · {}",
                app.engines.session.id(),
                app.sidebar_tab.label(),
                app.engines.workflow.state().label()
            ),
            Style::default().fg(MUTED),
        ),
    ]));
    frame.render_widget(status, area);
}

fn render_overlay(frame: &mut Frame, area: Rect, app: &App, overlay: Overlay) {
    let popup = centered_rect(72, 70, area);
    frame.render_widget(Clear, popup);

    match overlay {
        Overlay::Scope => {
            let mut lines = vec![
                Line::from(Span::styled(
                    "SMART SCOPE",
                    Style::default().fg(CYAN).add_modifier(Modifier::BOLD),
                )),
                Line::from(""),
            ];
            for file in &app.scope {
                let marker = if file.selected { "✓" } else { "·" };
                lines.push(Line::from(vec![
                    Span::styled(format!("{marker} "), Style::default().fg(GREEN)),
                    Span::styled(&file.path, Style::default().fg(Color::White)),
                    Span::styled(
                        format!("  {}% · {} lines", file.confidence, file.lines),
                        Style::default().fg(MUTED),
                    ),
                ]));
            }
            lines.push(Line::from(""));
            lines.push(Line::from(Span::styled(
                "Enter/Esc close · scope expansion is not automatic",
                Style::default().fg(MUTED),
            )));

            frame.render_widget(
                Paragraph::new(lines).wrap(Wrap { trim: false }).block(
                    Block::default()
                        .title(" Scope Inspector ")
                        .borders(Borders::ALL)
                        .border_type(BorderType::Rounded)
                        .border_style(Style::default().fg(CYAN)),
                ),
                popup,
            );
        }
        Overlay::Plan => {
            let lines = app
                .plan
                .iter()
                .enumerate()
                .map(|(index, step)| {
                    let symbol = if step.done {
                        "✓"
                    } else if step.active {
                        "›"
                    } else {
                        "·"
                    };
                    Line::from(format!("{symbol} {}. {}", index + 1, step.title))
                })
                .collect::<Vec<_>>();

            frame.render_widget(
                Paragraph::new(lines).alignment(Alignment::Left).block(
                    Block::default()
                        .title(" Plan Tracker ")
                        .borders(Borders::ALL)
                        .border_type(BorderType::Rounded)
                        .border_style(Style::default().fg(PURPLE)),
                ),
                popup,
            );
        }
    }
}

fn centered_rect(percent_x: u16, percent_y: u16, area: Rect) -> Rect {
    let vertical = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(area);

    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(vertical[1])[1]
}
