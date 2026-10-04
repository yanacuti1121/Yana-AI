//! The `lsp_query` approval prompt: which program would start, with which variables,
//! and what it would be asked, shown whole or not approvable.
//!
//! Same rules as the MCP prompt: every part is cut into rows of exactly the width
//! available (no word wrapping, no clipping), the program comes first and the
//! model-chosen question last, hidden characters are made visible, and if the whole
//! thing does not fit the call is refused instead of being shown cut off.

use super::command_prompt::masked;
use super::mcp_prompt::labelled;
use crate::capability::lsp_disclosure::LspDisclosure;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::Line;

/// Two borders, the title, the program line (a resolved absolute path plus arguments:
/// up to 5 rows at the narrowest accepted terminal, about 310 characters), the variable
/// names (2) and the question (up to 4: a 200-character ASCII path, an operation and a
/// position). That is 12 of the 14 rows at worst, with no slack; anything larger (a
/// longer program line, or a non-ASCII path, which counts 2 cells per character) is
/// refused rather than shown cut off.
pub(super) const HEIGHT: u16 = 14;
/// Below this many columns or rows the question cannot be laid out, so it is not
/// shown and cannot be approved.
pub(super) const MIN_COLS: u16 = 70;
/// A program line longer than this is refused before any layout is attempted.
const MAX_PROGRAM_LINE_CHARS: usize = 600;

pub(super) fn fits(cols: u16, rows: u16) -> bool {
    cols >= MIN_COLS && rows >= HEIGHT
}

/// The prompt's lines, or `None` when they cannot all be shown in `height` rows.
pub(super) fn lines(disclosure: &LspDisclosure, width: usize, height: u16) -> Option<Vec<Line<'static>>> {
    let program = disclosure.command_line();
    if program.chars().take(MAX_PROGRAM_LINE_CHARS + 1).count() > MAX_PROGRAM_LINE_CHARS {
        return None;
    }
    let mut lines = vec![Line::styled("Ask this language server? [y]es / [N]o", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD))];
    lines.extend(labelled("run:  ", &masked(&program), width));
    lines.extend(labelled("env:  ", &masked(&disclosure.env_note()), width));
    lines.extend(labelled("ask:  ", &masked(&disclosure.question()), width));
    (lines.len() + 2 <= usize::from(height)).then_some(lines)
}

/// Shown instead of a question that could not be shown whole.
pub(super) fn notice() -> Vec<Line<'static>> {
    vec![Line::styled(
        "Terminal too small, or the command too long, to show this question in full: enlarge it, or press n.",
        Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
    )]
}

#[cfg(test)]
mod tests {
    use super::super::render_tools::draw_approval_prompt;
    use super::*;
    use crate::capability::lsp_disclosure::LspDisclosure;
    use crate::chat::tui::PendingApproval;
    use crate::lsp_client::operation::Operation;

    fn longest() -> LspDisclosure {
        LspDisclosure {
            server: "s".repeat(32),
            command: format!("/usr/local/bin/{}", "p".repeat(100)),
            args: vec!["--stdio".into(), "a".repeat(100)],
            env_names: vec!["ENV_FIRST".into(), "M".repeat(99), "ENV_LAST".into()],
            timeout_secs: 60,
            operation: Operation::Definition,
            path: format!("src/{}.rs", "d".repeat(190)),
            line: 123_456,
            character: 7_890,
        }
    }

    fn pending(disclosure: LspDisclosure) -> PendingApproval {
        PendingApproval::LspQuery { call: crate::model::tool::ToolCall { id: "c".into(), name: "lsp_query".into(), arguments_json: "{}".into() }, disclosure }
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

    fn inner(rows: &[String]) -> Vec<String> {
        rows.iter().skip(1).take(rows.len() - 2).map(|r| r.trim_matches('\u{2502}').to_string()).collect()
    }

    #[test]
    fn at_the_narrowest_accepted_terminal_and_wider_every_part_is_shown_whole_and_in_order() {
        let d = longest();
        for width in [MIN_COLS, 80, 200] {
            let (screen, whole) = draw(&pending(d.clone()), width, HEIGHT);
            assert!(whole, "shown whole at {width}");
            let rows = inner(&screen);
            let at = |prefix: &str| rows.iter().position(|r| r.trim_start().starts_with(prefix)).unwrap_or_else(|| panic!("{prefix:?} missing at {width}:\n{}", rows.join("\n")));
            let (title, run, env, ask) = (at("Ask this"), at("run:"), at("env:"), at("ask:"));
            assert!(title < run && run < env && env < ask, "order at {width}");
            let joined = |from: usize, to: usize| {
                let parts: Vec<String> = rows[from..to].iter().map(|r| r.chars().skip(6).collect::<String>()).collect();
                let (last, head) = parts.split_last().unwrap();
                format!("{}{}", head.concat(), last.trim_end())
            };
            assert_eq!(joined(run, env), d.command_line(), "program line at {width}");
            assert_eq!(joined(env, ask), d.env_note(), "variable names at {width}");
            let last = rows.iter().rposition(|r| !r.trim().is_empty()).unwrap();
            assert_eq!(joined(ask, last + 1), d.question(), "question at {width}");
        }
    }

    #[test]
    fn a_program_line_too_long_to_show_makes_the_call_unapprovable() {
        let mut d = longest();
        d.args = vec!["x".repeat(700)];
        let (screen, whole) = draw(&pending(d), 100, HEIGHT);
        let screen = screen.join("\n");
        assert!(!whole && screen.contains("too long") && !screen.contains("[y]es"), "{screen}");
    }

    #[test]
    fn a_terminal_too_small_shows_no_part_of_the_question() {
        let d = longest();
        for (w, h) in [(MIN_COLS - 1, HEIGHT), (80, HEIGHT - 1)] {
            let (screen, whole) = draw(&pending(d.clone()), w, h);
            let screen = screen.join("\n");
            assert!(!whole && screen.contains("too small") && !screen.contains("[y]es") && !screen.contains("/usr/local/bin"), "{w}x{h}:\n{screen}");
        }
        assert!(fits(MIN_COLS, HEIGHT) && !fits(MIN_COLS - 1, HEIGHT) && !fits(MIN_COLS, HEIGHT - 1));
    }

    #[test]
    fn hidden_characters_in_a_path_or_program_are_made_visible() {
        let mut d = longest();
        d.command = "/bin/with\nnewline\u{202e}".into();
        d.path = "src/a\u{e0041}b.rs".into();
        let text = lines(&d, 78, HEIGHT).unwrap().iter().map(|l| l.to_string()).collect::<Vec<_>>().join("\n");
        assert!(!text.contains('\u{202e}') && !text.contains('\u{e0041}') && !text.contains("with\nnewline"), "{text:?}");
    }

    #[test]
    fn a_document_symbols_question_is_worded_without_a_position() {
        let mut d = longest();
        d.operation = Operation::DocumentSymbols;
        let text = lines(&d, 78, HEIGHT).unwrap().iter().map(|l| l.to_string()).collect::<Vec<_>>().join("\n");
        assert!(text.contains("document_symbols of src/"), "{text}");
    }
}
