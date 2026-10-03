//! The `mcp_call` approval prompt: what would run, with what, and what the model
//! passes it, shown whole or not approvable.
//!
//! Every part is cut into rows of exactly the width available (no word wrapping,
//! no clipping). The command line, variable names and server/tool names come from a
//! configuration that validation limits to printable ASCII, so their size is bounded
//! (160, 120 and 97 characters); the model-chosen arguments get whatever rows are
//! left, and if they do not all fit the call is refused rather than shown cut off.

use super::command_prompt::{masked, rows_of};
use crate::capability::mcp_disclosure::Disclosure;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::Line;

/// Two borders, the title, the command line (up to 3 rows at the narrowest accepted
/// terminal), the variable names (2), the call (2), and 4 rows for the arguments.
pub(super) const HEIGHT: u16 = 14;
/// Below this many columns or rows the call cannot be laid out, so it is not shown
/// and cannot be approved.
pub(super) const MIN_COLS: u16 = 70;
/// More argument text than this is refused before any layout is attempted.
const MAX_ARGUMENT_CHARS: usize = 2000;
/// Every label is this wide, so continuation rows line up under the text.
const LABEL_WIDTH: usize = 6;

pub(super) fn fits(cols: u16, rows: u16) -> bool {
    cols >= MIN_COLS && rows >= HEIGHT
}

/// `text` after `label`, in rows that never exceed `width` cells.
pub(super) fn labelled(label: &str, text: &str, width: usize) -> Vec<Line<'static>> {
    let room = width.saturating_sub(LABEL_WIDTH);
    rows_of(text, room)
        .into_iter()
        .enumerate()
        .map(|(n, row)| if n == 0 { Line::raw(format!("{label}{row}")) } else { Line::raw(format!("{}{row}", " ".repeat(LABEL_WIDTH))) })
        .collect()
}

/// The prompt's lines, or `None` when they cannot all be shown in `height` rows.
pub(super) fn lines(disclosure: &Disclosure, arguments: &serde_json::Value, width: usize, height: u16) -> Option<Vec<Line<'static>>> {
    let what = disclosure.tool.as_deref().map_or("(list its tools)".to_string(), str::to_string);
    let argument_text = if arguments.is_null() { "(none)".to_string() } else { masked(&arguments.to_string()) };
    if argument_text.chars().take(MAX_ARGUMENT_CHARS + 1).count() > MAX_ARGUMENT_CHARS {
        return None;
    }
    let mut lines = vec![Line::styled("Run this external program? [y]es / [N]o", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD))];
    lines.extend(labelled("run:  ", &disclosure.command_line(), width));
    lines.extend(labelled("env:  ", &disclosure.env_note(), width));
    lines.extend(labelled("call: ", &format!("{} {what}", disclosure.server), width));
    lines.extend(labelled("args: ", &argument_text, width));
    (lines.len() + 2 <= usize::from(height)).then_some(lines)
}

/// Shown instead of a call that could not be shown whole.
pub(super) fn notice() -> Vec<Line<'static>> {
    vec![Line::styled(
        "Terminal too small, or the arguments too long, to show this call in full: enlarge it, or press n.",
        Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
    )]
}

#[cfg(test)]
mod tests {
    use super::super::render_tools::draw_approval_prompt;
    use super::*;
    use crate::chat::tui::PendingApproval;

    fn longest() -> Disclosure {
        // As long as configuration validation lets each part be: a 160-character
        // command line, 120 characters of variable names, a 32-character server and 64-character tool.
        let command = "/usr/bin/run".to_string();
        let args = vec!["ARG-START".to_string(), "y".repeat(160 - command.len() - "ARG-START".len() - "ARG-END".len() - 3), "ARG-END".to_string()];
        let env_names = vec!["ENV_FIRST".to_string(), "M".repeat(99), "ENV_LAST".to_string()];
        Disclosure { server: "s".repeat(32), tool: Some("t".repeat(64)), command, args, env_names, timeout_secs: 30 }
    }

    fn pending(d: Disclosure, arguments: serde_json::Value) -> PendingApproval {
        PendingApproval::McpCall {
            call: crate::model::tool::ToolCall { id: "c".into(), name: "mcp_call".into(), arguments_json: "{}".into() },
            command: format!("{} {}", d.server, d.tool.clone().unwrap_or_default()),
            arguments,
            disclosure: d,
        }
    }

    fn draw(pending: &PendingApproval, width: u16, height: u16) -> (Vec<String>, bool) {
        use ratatui::backend::TestBackend;
        use ratatui::Terminal;
        let mut terminal = Terminal::new(TestBackend::new(width, height)).unwrap();
        let mut whole = false;
        terminal.draw(|frame| whole = draw_approval_prompt(frame, pending, frame.area())).unwrap();
        let buffer = terminal.backend().buffer().clone();
        ((0..height).map(|y| (0..width).map(|x| buffer[(x, y)].symbol().to_string()).collect::<String>()).collect(), whole)
    }

    /// The text of each row between the borders, padding included (a row may end in a real space).
    fn inner(rows: &[String]) -> Vec<String> {
        rows.iter().skip(1).take(rows.len() - 2).map(|r| r.trim_matches('\u{2502}').to_string()).collect()
    }

    #[test]
    fn at_the_narrowest_accepted_terminal_and_at_80_columns_every_part_is_shown_whole_and_in_order() {
        let d = longest();
        assert_eq!(d.command_line().chars().count(), crate::capability::mcp_config::MAX_COMMAND_LINE_CHARS, "the fixture is the longest allowed");
        assert_eq!(d.env_note().chars().count(), crate::capability::mcp_config::MAX_ENV_LIST_CHARS, "and so are the variable names");
        let arguments = serde_json::json!({"text": "q".repeat(100)});
        for width in [MIN_COLS, 80, 200] {
            let (screen, whole) = draw(&pending(d.clone(), arguments.clone()), width, HEIGHT);
            assert!(whole, "shown whole at {width}");
            let rows = inner(&screen);
            let at = |prefix: &str| rows.iter().position(|r| r.trim_start().starts_with(prefix)).unwrap_or_else(|| panic!("{prefix:?} missing at {width}:\n{}", rows.join("\n")));
            let (title, run, env, call, args) = (at("Run this"), at("run:"), at("env:"), at("call:"), at("args:"));
            assert!(title < run && run < env && env < call && call < args, "order at {width}");
            // Each part, joined back from its rows, is the whole of it.
            let joined = |from: usize, to: usize| {
                let parts: Vec<String> = rows[from..to].iter().map(|r| r.chars().skip(LABEL_WIDTH).collect::<String>()).collect();
                let (last, head) = parts.split_last().unwrap();
                format!("{}{}", head.concat(), last.trim_end()) // only the final row carries box padding
            };
            assert_eq!(joined(run, env), d.command_line(), "command line at {width}");
            assert_eq!(joined(env, call), d.env_note(), "variable names at {width}");
            assert_eq!(joined(call, args), format!("{} {}", d.server, "t".repeat(64)), "call at {width}");
            let last = rows.iter().rposition(|r| !r.trim().is_empty()).unwrap();
            assert_eq!(joined(args, last + 1), arguments.to_string(), "arguments at {width}");
        }
    }

    #[test]
    fn arguments_too_long_to_show_whole_make_the_call_unapprovable() {
        let d = longest();
        for text in [600, 5000] {
            let (screen, whole) = draw(&pending(d.clone(), serde_json::json!({"text": "q".repeat(text)})), 80, HEIGHT);
            let screen = screen.join("\n");
            assert!(!whole, "{text} characters of arguments do not fit");
            assert!(screen.contains("arguments too long") && !screen.contains("[y]es") && !screen.contains("/usr/bin/run"), "{screen}");
        }
    }

    #[test]
    fn a_terminal_too_small_to_show_the_call_shows_no_part_of_it() {
        let d = longest();
        for (w, h) in [(MIN_COLS - 1, HEIGHT), (80, HEIGHT - 1)] {
            let (screen, whole) = draw(&pending(d.clone(), serde_json::Value::Null), w, h);
            let screen = screen.join("\n");
            assert!(!whole && screen.contains("too small") && !screen.contains("/usr/bin/run") && !screen.contains("[y]es"), "{w}x{h}:\n{screen}");
        }
        assert!(fits(MIN_COLS, HEIGHT) && !fits(MIN_COLS - 1, HEIGHT) && !fits(MIN_COLS, HEIGHT - 1));
    }

    #[test]
    fn what_runs_comes_before_what_the_model_chose_and_hidden_characters_are_neutralized() {
        let d = longest();
        let text = |lines: &[Line<'_>]| lines.iter().map(|l| l.to_string()).collect::<Vec<_>>().join("\n");
        let shown = text(&lines(&d, &serde_json::json!({"x": "a\u{202e}b\u{7}c\u{e0041}"}), 78, HEIGHT).unwrap());
        assert!(shown.find("run:").unwrap() < shown.find("env:").unwrap() && shown.find("env:").unwrap() < shown.find("call:").unwrap() && shown.find("call:").unwrap() < shown.find("args:").unwrap(), "{shown}");
        assert!(!shown.contains('\u{202e}') && !shown.contains('\u{7}') && !shown.contains('\u{e0041}'), "{shown:?}");
        let none = lines(&Disclosure { tool: None, env_names: vec![], ..d }, &serde_json::Value::Null, 78, HEIGHT).unwrap();
        let none = text(&none);
        assert!(none.contains("env:  none") && none.contains("(list its tools)") && none.contains("args: (none)"), "{none}");
    }

    #[test]
    fn the_box_is_taller_than_the_search_box() {
        assert!(HEIGHT > super::super::render_tools::WEB_SEARCH_PROMPT_HEIGHT);
    }
}
