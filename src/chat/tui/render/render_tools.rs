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

/// Rows the web-search approval box needs: two border rows plus the four lines
/// of `web_search_prompt_lines`. The generic approval box is 5 rows (3 lines),
/// which would clip the line that says an API key is being sent.
pub(super) const WEB_SEARCH_PROMPT_HEIGHT: u16 = 6;
/// Longest part of the query shown; the whole query is still what is sent.
const PROMPT_QUERY_CHARS: usize = 70;

/// What the approver reads for a web search, in this order: the question, WHERE
/// it goes, WHETHER a key goes with it (the variable NAME, never a value), and
/// last, the query (cut to one line). The model-chosen text comes last so it
/// can never push the destination or the key line out of view; their lengths are
/// bounded by `web_search::disclose`.
pub(super) fn web_search_prompt_lines(
    query: &str,
    disclosure: &crate::capability::web_search::SearchDisclosure,
) -> Vec<Line<'static>> {
    let shown: String = query.chars().take(PROMPT_QUERY_CHARS).collect();
    let cut = if query.chars().count() > PROMPT_QUERY_CHARS { "…" } else { "" };
    vec![
        Line::styled(
            "Send this search? [y]es / [N]o",
            Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD),
        ),
        Line::raw(format!("to:    {}", disclosure.backend_host)),
        Line::raw(format!("key:   {}", disclosure.key_note())),
        Line::raw(format!("query: {shown}{cut}")),
    ]
}

/// Draws the prompt and says whether the whole call was shown. For a command or an
/// MCP call that is the condition for accepting `y`: a prompt that had to be cut
/// off is a notice instead, and cannot be approved.
#[must_use]
pub(super) fn draw_approval_prompt(frame: &mut Frame, pending: &PendingApproval, area: Rect) -> bool {
    // Laid out once; `whole` and what is drawn come from the same layout.
    let command_view = match pending {
        PendingApproval::Command { command, guard_verdict: None, .. } => Some(super::command_prompt::lines(command, area)),
        _ => None,
    };
    let mcp_view = match pending {
        PendingApproval::McpCall { disclosure, arguments, .. } if super::mcp_prompt::fits(area.width, area.height) => {
            super::mcp_prompt::lines(disclosure, arguments, usize::from(area.width) - 2, area.height)
        }
        _ => None,
    };
    let lsp_view = match pending {
        PendingApproval::LspQuery { disclosure, .. } if super::lsp_prompt::fits(area.width, area.height) => {
            super::lsp_prompt::lines(disclosure, usize::from(area.width) - 2, area.height)
        }
        _ => None,
    };
    let whole = match pending {
        PendingApproval::Command { guard_verdict: None, .. } => matches!(command_view, Some(Ok(_))),
        PendingApproval::McpCall { .. } => mcp_view.is_some(),
        PendingApproval::LspQuery { .. } => lsp_view.is_some(),
        _ => true,
    };
    let (title, border_color, lines): (&str, Color, Vec<Line>) = match pending {
        PendingApproval::McpCall { .. } => (" approve external program ", Color::Yellow, mcp_view.unwrap_or_else(super::mcp_prompt::notice)),
        PendingApproval::LspQuery { .. } => (" approve language server ", Color::Yellow, lsp_view.unwrap_or_else(super::lsp_prompt::notice)),
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
                Line::raw(super::command_prompt::masked(command)),
                Line::styled(
                    "Press Enter to acknowledge — this command will not run.",
                    Style::default().add_modifier(Modifier::ITALIC),
                ),
            ],
        ),
        PendingApproval::Command { command, .. } => (
            " approve command ",
            Color::Yellow,
            match command_view {
                Some(Ok(lines)) => lines,
                Some(Err(why)) => super::command_prompt::notice(&why, command),
                None => Vec::new(),
            },
        ),
        PendingApproval::WebSearch { query, disclosure, .. } => (
            " approve web search ",
            Color::Yellow,
            web_search_prompt_lines(query, disclosure),
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
    whole
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capability::web_search::SearchDisclosure;

    fn text(lines: &[Line<'_>]) -> String {
        lines.iter().map(|l| l.to_string()).collect::<Vec<_>>().join("\n")
    }

    fn keyed() -> SearchDisclosure {
        SearchDisclosure { backend_host: "search.example".into(), endpoint: "https://search.example/q".into(), key_variable: Some("YANA_SEARCH_KEY".into()) }
    }

    #[test]
    fn the_search_prompt_shows_the_host_the_key_variable_name_and_the_query() {
        let shown = text(&web_search_prompt_lines("rust release", &keyed()));
        assert!(shown.contains("to:    search.example") && shown.contains("query: rust release"), "{shown}");
        assert!(shown.contains("$YANA_SEARCH_KEY WILL be sent"), "{shown}");
        assert!(shown.contains("[y]es / [N]o"), "{shown}");
    }

    #[test]
    fn without_a_key_the_prompt_says_none_is_sent() {
        let plain = SearchDisclosure { backend_host: "s.example".into(), endpoint: "https://s.example/".into(), key_variable: None };
        let shown = text(&web_search_prompt_lines("q", &plain));
        assert!(shown.contains("no API key is sent") && !shown.contains('$'), "{shown}");
    }

    #[test]
    fn the_destination_and_key_come_before_the_query_and_a_long_query_is_cut() {
        let long = "q".repeat(300);
        let lines = web_search_prompt_lines(&long, &keyed());
        assert_eq!(lines.len() as u16 + 2, WEB_SEARCH_PROMPT_HEIGHT, "the box is sized for exactly these lines");
        let shown = text(&lines);
        assert!(shown.find("to:").unwrap() < shown.find("key:").unwrap() && shown.find("key:").unwrap() < shown.find("query:").unwrap());
        assert!(shown.ends_with('…') && shown.matches('q').count() <= PROMPT_QUERY_CHARS + 1, "{shown}");
    }

    /// Renders the real prompt into a real buffer, the way the screen does, and
    /// checks what is VISIBLE: a unit test on the lines alone cannot see clipping.
    #[test]
    fn in_a_real_render_the_host_and_the_key_line_are_visible_even_for_a_huge_query() {
        use ratatui::backend::TestBackend;
        use ratatui::Terminal;
        let pending = PendingApproval::WebSearch {
            call: crate::model::tool::ToolCall { id: "c".into(), name: "web_search".into(), arguments_json: "{}".into() },
            query: "x".repeat(300),
            disclosure: keyed(),
        };
        let mut terminal = Terminal::new(TestBackend::new(80, WEB_SEARCH_PROMPT_HEIGHT)).unwrap();
        terminal
            .draw(|frame| {
                draw_approval_prompt(frame, &pending, frame.area());
            })
            .unwrap();
        let buffer = terminal.backend().buffer().clone();
        let rows: Vec<String> = (0..WEB_SEARCH_PROMPT_HEIGHT).map(|y| (0..80).map(|x| buffer[(x, y)].symbol().to_string()).collect::<String>()).collect();
        let screen = rows.join("\n");
        assert!(screen.contains("to:    search.example"), "{screen}");
        assert!(screen.contains("$YANA_SEARCH_KEY WILL be sent"), "{screen}");
        assert!(screen.contains("[y]es / [N]o"), "{screen}");
    }

    /// The old 5-row box (3 lines) is what clipped the key line; this pins that
    /// the generic height is NOT what a search uses.
    #[test]
    fn the_generic_approval_box_is_too_small_for_a_search_prompt() {
        use ratatui::backend::TestBackend;
        use ratatui::Terminal;
        assert!(WEB_SEARCH_PROMPT_HEIGHT > 5);
        let pending = PendingApproval::WebSearch {
            call: crate::model::tool::ToolCall { id: "c".into(), name: "web_search".into(), arguments_json: "{}".into() },
            query: "x".into(),
            disclosure: keyed(),
        };
        let mut terminal = Terminal::new(TestBackend::new(80, 5)).unwrap();
        terminal.draw(|frame| {
                draw_approval_prompt(frame, &pending, frame.area());
            }).unwrap();
        let buffer = terminal.backend().buffer().clone();
        let screen: String = (0..5u16).flat_map(|y| (0..80u16).map(move |x| (x, y))).map(|(x, y)| buffer[(x, y)].symbol().to_string()).collect();
        assert!(!screen.contains("query:"), "in 5 rows the last line is clipped, which is why the box is taller for a search");
    }
}
