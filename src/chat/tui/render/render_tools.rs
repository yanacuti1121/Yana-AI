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

/// The MCP approval box is a fixed grid: every part is cut into rows of exactly
/// the width available (no word wrapping, no clipping), and the box is sized for
/// the largest values configuration validation allows (ASCII only, so a character
/// is a column) at the narrowest terminal that is accepted:
/// two borders, the title, the command line (160 characters, 3 rows), the
/// variable names (120, 2 rows), the call (up to 97, 2 rows), the arguments (71, 2 rows).
pub(super) const MCP_PROMPT_HEIGHT: u16 = 12;
/// Below this many columns or rows the call cannot be shown in full, so it is not
/// shown at all and cannot be approved.
pub(crate) const MCP_PROMPT_MIN_COLS: u16 = 70;
const PROMPT_ARGS_CHARS: usize = 70;

pub(crate) fn mcp_prompt_fits(cols: u16, rows: u16) -> bool {
    cols >= MCP_PROMPT_MIN_COLS && rows >= MCP_PROMPT_HEIGHT
}

/// `text` after `label`, in rows of exactly `width` columns (continuations indented under the text).
fn fixed_rows(label: &str, text: &str, width: usize) -> Vec<Line<'static>> {
    let indent = " ".repeat(label.chars().count());
    let room = width.saturating_sub(label.chars().count()).max(1);
    let chars: Vec<char> = text.chars().collect();
    let mut rows: Vec<Line<'static>> = chars
        .chunks(room)
        .enumerate()
        .map(|(i, chunk)| Line::raw(format!("{}{}", if i == 0 { label } else { indent.as_str() }, chunk.iter().collect::<String>())))
        .collect();
    if rows.is_empty() {
        rows.push(Line::raw(label.to_string()));
    }
    rows
}

pub(super) fn mcp_prompt_lines(
    disclosure: &crate::capability::mcp_disclosure::Disclosure,
    arguments: &serde_json::Value,
    width: usize,
) -> Vec<Line<'static>> {
    let what = disclosure.tool.as_deref().map_or("(list its tools)".to_string(), str::to_string);
    let raw = if arguments.is_null() { "(none)".to_string() } else { arguments.to_string() };
    let shown: String = raw
        .chars()
        .map(|c| if c.is_control() || crate::capability::untrusted::is_invisible_format_char(c) { '?' } else { c })
        .take(PROMPT_ARGS_CHARS)
        .collect();
    let cut = if raw.chars().count() > PROMPT_ARGS_CHARS { "\u{2026}" } else { "" };
    let mut lines = vec![Line::styled(
        "Run this external program? [y]es / [N]o",
        Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD),
    )];
    lines.extend(fixed_rows("run:  ", &disclosure.command_line(), width));
    lines.extend(fixed_rows("env:  ", &disclosure.env_note(), width));
    lines.extend(fixed_rows("call: ", &format!("{} {what}", disclosure.server), width));
    lines.extend(fixed_rows("args: ", &format!("{shown}{cut}"), width));
    lines
}

/// Draws the prompt and says whether the whole call was shown. For a command or an
/// MCP call that is the condition for accepting `y`: a prompt that had to be cut
/// off is a notice instead, and cannot be approved.
pub(super) fn draw_approval_prompt(frame: &mut Frame, pending: &PendingApproval, area: Rect) -> bool {
    let whole = match pending {
        PendingApproval::Command { command, guard_verdict: None, .. } => super::command_prompt::lines(command, area).is_some(),
        PendingApproval::McpCall { .. } => mcp_prompt_fits(area.width, area.height),
        _ => true,
    };
    let (title, border_color, lines): (&str, Color, Vec<Line>) = match pending {
        PendingApproval::McpCall { disclosure, arguments, .. } => (
            " approve external program ",
            Color::Yellow,
            if mcp_prompt_fits(area.width, area.height) {
                mcp_prompt_lines(disclosure, arguments, area.width.saturating_sub(2) as usize)
            } else {
                vec![Line::styled(
                    "Terminal too small to show this call in full: enlarge it, or press n.",
                    Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
                )]
            },
        ),
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
            super::command_prompt::lines(command, area).unwrap_or_else(|| super::command_prompt::too_long_notice(command)),
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

    fn longest_mcp_disclosure() -> crate::capability::mcp_disclosure::Disclosure {
        // As long as configuration validation lets each part be: a 160-character
        // command line, 120 characters of variable names, a 32-character server and 64-character tool.
        let command = "/usr/bin/run".to_string();
        let args = vec!["ARG-START".to_string(), "y".repeat(160 - command.len() - "ARG-START".len() - "ARG-END".len() - 3), "ARG-END".to_string()];
        let env_names: Vec<String> = ["ENV_FIRST".to_string(), "M".repeat(99), "ENV_LAST".to_string()].to_vec();
        crate::capability::mcp_disclosure::Disclosure { server: "s".repeat(32), tool: Some("t".repeat(64)), command, args, env_names, timeout_secs: 30 }
    }

    fn mcp_pending(d: crate::capability::mcp_disclosure::Disclosure) -> PendingApproval {
        PendingApproval::McpCall {
            call: crate::model::tool::ToolCall { id: "c".into(), name: "mcp_call".into(), arguments_json: "{}".into() },
            command: format!("{} {}", d.server, d.tool.clone().unwrap_or_default()),
            arguments: serde_json::json!({"text": "q".repeat(500)}),
            disclosure: d,
        }
    }

    fn render_rows(pending: &PendingApproval, width: u16, height: u16) -> Vec<String> {
        use ratatui::backend::TestBackend;
        use ratatui::Terminal;
        let mut terminal = Terminal::new(TestBackend::new(width, height)).unwrap();
        terminal.draw(|frame| { draw_approval_prompt(frame, pending, frame.area()); }).unwrap();
        let buffer = terminal.backend().buffer().clone();
        (0..height).map(|y| (0..width).map(|x| buffer[(x, y)].symbol().to_string()).collect::<String>()).collect()
    }

    /// The text of each row between the borders, trimmed.
    fn inner(rows: &[String]) -> Vec<String> {
        rows.iter().skip(1).take(rows.len() - 2).map(|r| r.trim_matches('\u{2502}').trim_end().to_string()).collect()
    }

    #[test]
    fn at_the_narrowest_accepted_terminal_and_at_80_columns_every_part_is_shown_whole_and_in_order() {
        let d = longest_mcp_disclosure();
        assert_eq!(d.command_line().chars().count(), crate::capability::mcp_config::MAX_COMMAND_LINE_CHARS, "the fixture is the longest allowed");
        assert_eq!(d.env_note().chars().count(), crate::capability::mcp_config::MAX_ENV_LIST_CHARS, "and so are the variable names");
        for width in [MCP_PROMPT_MIN_COLS, 80, 200] {
            let rows = inner(&render_rows(&mcp_pending(d.clone()), width, MCP_PROMPT_HEIGHT));
            let at = |prefix: &str| rows.iter().position(|r| r.starts_with(prefix)).unwrap_or_else(|| panic!("{prefix:?} missing at {width}:\n{}", rows.join("\n")));
            let (title, run, env, call, args) = (at("Run this"), at("run:"), at("env:"), at("call:"), at("args:"));
            assert!(title < run && run < env && env < call && call < args, "order at {width}");
            // The command line, joined back from its rows, is the whole of it.
            let joined = |from: usize, to: usize, label: &str| rows[from..to].iter().map(|r| r.chars().skip(label.chars().count()).collect::<String>()).collect::<String>();
            assert_eq!(joined(run, env, "run:  "), d.command_line(), "command line at {width}");
            assert_eq!(joined(env, call, "env:  "), d.env_note(), "variable names at {width}");
            assert_eq!(joined(call, args, "call: "), format!("{} {}", d.server, "t".repeat(64)), "call at {width}");
            assert!(rows[args].starts_with("args: ") && rows.len() > args, "arguments row at {width}");
        }
    }

    #[test]
    fn a_terminal_too_small_to_show_the_call_shows_no_part_of_it() {
        let d = longest_mcp_disclosure();
        for (w, h) in [(MCP_PROMPT_MIN_COLS - 1, MCP_PROMPT_HEIGHT), (80, MCP_PROMPT_HEIGHT - 1)] {
            let screen = render_rows(&mcp_pending(d.clone()), w, h).join("\n");
            assert!(screen.contains("too small") && !screen.contains("/usr/bin/run") && !screen.contains("[y]es"), "{w}x{h}:\n{screen}");
        }
        assert!(mcp_prompt_fits(MCP_PROMPT_MIN_COLS, MCP_PROMPT_HEIGHT) && !mcp_prompt_fits(MCP_PROMPT_MIN_COLS - 1, MCP_PROMPT_HEIGHT));
    }

    #[test]
    fn the_mcp_prompt_shows_what_runs_before_what_the_model_chose_and_neutralizes_hidden_characters() {
        let d = longest_mcp_disclosure();
        let lines = mcp_prompt_lines(&d, &serde_json::json!({"x": "a\u{202e}b\u{7}c"}), 78);
        let text = lines.iter().map(|l| l.to_string()).collect::<Vec<_>>().join("\n");
        assert!(text.find("run:").unwrap() < text.find("env:").unwrap() && text.find("env:").unwrap() < text.find("call:").unwrap() && text.find("call:").unwrap() < text.find("args:").unwrap(), "{text}");
        assert!(!text.contains('\u{202e}') && !text.contains('\u{7}'), "{text:?}");
        let none = mcp_prompt_lines(&crate::capability::mcp_disclosure::Disclosure { tool: None, env_names: vec![], ..d }, &serde_json::Value::Null, 78);
        let shown = none.iter().map(|l| l.to_string()).collect::<Vec<_>>().join("\n");
        assert!(shown.contains("env:  none") && shown.contains("(list its tools)") && shown.contains("args: (none)"), "{shown}");
    }

    #[test]
    fn the_mcp_box_is_taller_than_the_generic_one() {
        assert!(MCP_PROMPT_HEIGHT > WEB_SEARCH_PROMPT_HEIGHT && MCP_PROMPT_HEIGHT > 5);
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
