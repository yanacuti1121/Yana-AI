//! Tool-call/tool-result history rendering + the approval-prompt overlay
//! — split out of `render.rs` (see that file's module doc) purely for
//! line-count budget.

use super::super::PendingApproval;
use super::super::super::tool_types::{ToolCallRecord, ToolResultRecord};
use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Paragraph, Wrap};
use ratatui::Frame;

const TOOL_CALL_COLOR: Color = Color::Magenta;
const TOOL_RESULT_COLOR: Color = Color::Yellow;
const TOOL_ERROR_COLOR: Color = Color::Red;
const TOOL_DENIED_COLOR: Color = Color::DarkGray;

/// Arguments are shown as their raw JSON, truncated so a pathological
/// huge argument payload can't blow out the history pane — the TUI view
/// is a preview, not the record of truth (the full JSON is always
/// persisted in the session's `.jsonl` regardless of what's shown here).
const ARGS_PREVIEW_CHARS: usize = 200;
const RESULT_PREVIEW_CHARS: usize = 500;

/// One history line for a proposed tool call, e.g. `→ run_command:
/// {"command":"npm test"}`.
pub(super) fn tool_call_line(record: &ToolCallRecord) -> Line<'static> {
    let style = Style::default().fg(TOOL_CALL_COLOR).add_modifier(Modifier::BOLD);
    let args = truncate_with_marker(&record.arguments_json, ARGS_PREVIEW_CHARS);
    Line::from(vec![Span::styled(format!("→ {}: ", record.name), style), Span::raw(args)])
}

/// One history line for what running (or declining) a tool call
/// produced.
pub(super) fn tool_result_line(record: &ToolResultRecord) -> Line<'static> {
    let (color, label) = if record.denied {
        (TOOL_DENIED_COLOR, "← declined")
    } else if record.is_error {
        (TOOL_ERROR_COLOR, "← error")
    } else {
        (TOOL_RESULT_COLOR, "← result")
    };
    let text = truncate_with_marker(&record.output, RESULT_PREVIEW_CHARS);
    Line::from(vec![
        Span::styled(format!("{label}: "), Style::default().fg(color).add_modifier(Modifier::BOLD)),
        Span::raw(text),
    ])
}

fn truncate_with_marker(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max_chars).collect();
    out.push_str(" [truncated in view — full output persisted]");
    out
}

/// Replaces the input pane's content while `TurnState::AwaitingApproval`.
/// A guard denial (`guard_verdict.is_some()`) shows an acknowledge-only
/// prompt with no y-path rendered at all — the visual half of "no
/// override on a guard denial" (`tui/approval.rs` is the enforcement
/// half: it simply never dispatches `y`/`Y` to execution in this case).
pub(super) fn draw_approval_prompt(frame: &mut Frame, pending: &PendingApproval, area: Rect) {
    let (border_color, lines): (Color, Vec<Line>) = if let Some(reason) = pending.guard_verdict {
        (
            Color::Red,
            vec![
                Line::styled(
                    format!("BLOCKED: {reason}"),
                    Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
                ),
                Line::raw(pending.command.clone()),
                Line::styled(
                    "Press Enter to acknowledge — this command will not run.",
                    Style::default().add_modifier(Modifier::ITALIC),
                ),
            ],
        )
    } else {
        (
            Color::Yellow,
            vec![
                Line::styled(
                    "Run this command? [y]es / [N]o",
                    Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD),
                ),
                Line::raw(pending.command.clone()),
            ],
        )
    };
    let widget = Paragraph::new(lines)
        .block(Block::bordered().title(" approve command ").border_style(Style::default().fg(border_color)))
        .wrap(Wrap { trim: false });
    frame.render_widget(widget, area);
}
