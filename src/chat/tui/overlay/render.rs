use super::{filtered_items, App, OverlayKind};
use ratatui::layout::{Constraint, Flex, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, List, ListItem, Paragraph};
use ratatui::Frame;

pub(crate) fn draw_overlay(frame: &mut Frame, app: &App) {
    let Some(overlay) = &app.overlay else { return };
    let area = centered_rect(frame.area(), 72, 70);
    frame.render_widget(Clear, area);
    let block = Block::default()
        .borders(Borders::ALL)
        .title(format!(" {} ", overlay.title))
        .border_style(Style::default().fg(Color::Cyan));
    let inner = block.inner(area);
    frame.render_widget(block, area);
    let [search_area, list_area, detail_area] = Layout::vertical([
        Constraint::Length(
            if matches!(overlay.kind, OverlayKind::Help | OverlayKind::Settings) {
                0
            } else {
                2
            },
        ),
        Constraint::Min(3),
        Constraint::Length(2),
    ])
    .areas(inner);

    if search_area.height > 0 {
        let label = if overlay.kind == OverlayKind::SystemPrompt {
            "Prompt"
        } else {
            "Search"
        };
        frame.render_widget(
            Paragraph::new(overlay.query.as_str())
                .block(Block::default().borders(Borders::BOTTOM).title(label)),
            search_area,
        );
    }
    let items = filtered_items(overlay);
    let rows: Vec<ListItem> = if overlay.loading {
        vec![ListItem::new("  Loading…")]
    } else {
        items
            .iter()
            .enumerate()
            .map(|(index, item)| {
                let marker = if index == overlay.selected {
                    "◆ "
                } else {
                    "  "
                };
                let style = if index == overlay.selected {
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD)
                } else {
                    Style::default().fg(Color::White)
                };
                ListItem::new(Line::from(vec![
                    Span::styled(marker, style),
                    Span::styled(item, style),
                ]))
            })
            .collect()
    };
    frame.render_widget(List::new(rows), list_area);
    frame.render_widget(
        Paragraph::new(
            overlay
                .detail
                .iter()
                .map(|line| Line::raw(line.clone()))
                .collect::<Vec<_>>(),
        )
        .style(Style::default().fg(Color::DarkGray)),
        detail_area,
    );
}

fn centered_rect(area: Rect, width_percent: u16, height_percent: u16) -> Rect {
    let [vertical] = Layout::vertical([Constraint::Percentage(height_percent)])
        .flex(Flex::Center)
        .areas(area);
    let [centered] = Layout::horizontal([Constraint::Percentage(width_percent)])
        .flex(Flex::Center)
        .areas(vertical);
    centered
}
