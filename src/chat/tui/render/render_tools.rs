//! Tool-call/tool-result history rendering + the approval-prompt overlay
//! — split out of `render.rs` (see that file's module doc) purely for
//! line-count budget.

use super::super::super::tool_types::{ToolCallRecord, ToolResultRecord};
use super::super::PendingApproval;
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
    let style = Style::default()
        .fg(TOOL_CALL_COLOR)
        .add_modifier(Modifier::BOLD);
    let args = truncate_with_marker(&record.arguments_json, ARGS_PREVIEW_CHARS);
    Line::from(vec![
        Span::styled(format!("→ {}: ", record.name), style),
        Span::raw(args),
    ])
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
        Span::styled(
            format!("{label}: "),
            Style::default().fg(color).add_modifier(Modifier::BOLD),
        ),
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
/// Diff lines shown in the approval prompt are capped — a file-write
/// proposal on a large file must never make the approval box itself
/// unreadable or push the actual y/N prompt off-screen. The full diff
/// still exists on `FileMutationDiff::unified_diff`; this is a display
/// bound only, not a size limit `capability::file_mutation` itself
/// enforces (that's `MAX_MUTATION_BYTES`, a separate, earlier check).
const MAX_APPROVAL_DIFF_LINES: usize = 20;

pub(super) fn draw_approval_prompt(frame: &mut Frame, pending: &PendingApproval, area: Rect) {
    let (title, border_color, lines): (&str, Color, Vec<Line>) = match pending {
        PendingApproval::Command {
            command,
            guard_verdict: Some(reason),
            ..
        } => (
            " approve command ",
            Color::Red,
            vec![
                Line::styled(
                    format!("BLOCKED: {reason}"),
                    Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
                ),
                Line::raw(command.clone()),
                Line::styled(
                    "Press Enter to acknowledge — this command will not run.",
                    Style::default().add_modifier(Modifier::ITALIC),
                ),
            ],
        ),
        PendingApproval::Command { command, .. } => (
            " approve command ",
            Color::Yellow,
            vec![
                Line::styled(
                    "Run this command? [y]es / [N]o",
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ),
                Line::raw(command.clone()),
            ],
        ),
        PendingApproval::FileWrite { path, diff, .. } => {
            let mut lines = vec![
                Line::styled(
                    format!("{} {path}? [y]es / [N]o", diff.kind_label),
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ),
                Line::raw(format!(
                    "{} -> {} bytes",
                    diff.before_bytes.map(|b| b.to_string()).unwrap_or_else(|| "new file".to_string()),
                    diff.after_bytes
                )),
                Line::raw(""),
            ];
            let diff_lines: Vec<&str> = diff.unified_diff.lines().collect();
            let shown = diff_lines.len().min(MAX_APPROVAL_DIFF_LINES);
            for raw in &diff_lines[..shown] {
                let color = if raw.starts_with('+') {
                    Color::Green
                } else if raw.starts_with('-') {
                    Color::Red
                } else {
                    Color::Gray
                };
                lines.push(Line::styled((*raw).to_string(), Style::default().fg(color)));
            }
            if diff_lines.len() > shown {
                lines.push(Line::styled(
                    format!("… {} more line(s) not shown", diff_lines.len() - shown),
                    Style::default().add_modifier(Modifier::ITALIC),
                ));
            }
            (" approve file write ", Color::Yellow, lines)
        }
    };
    let widget = Paragraph::new(lines)
        .block(
            Block::bordered()
                .title(title)
                .border_style(Style::default().fg(border_color)),
        )
        .wrap(Wrap { trim: false });
    frame.render_widget(widget, area);
}
