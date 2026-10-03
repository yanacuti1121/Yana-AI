//! The `run_command` approval prompt: the whole command, or no approval.
//!
//! A command is cut into rows of exactly the width available (no word wrapping,
//! no clipping) and the box grows to hold them. A command too long to show whole
//! in the largest box is not shown cut off: the prompt says so and `y` is refused
//! (see `approval.rs`), so the part a person cannot see can never be the part that matters.
//! Every character that is not ASCII is counted as two columns, which can only
//! over-count (never overflow) without a width table.

use crate::capability::untrusted::is_invisible_format_char;
use ratatui::layout::Rect;
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::Line;

/// Borders (2), the title (1) and up to 11 rows of command.
pub(super) const MAX_HEIGHT: u16 = 14;
/// The box the generic prompt always had: borders, the title and one row.
pub(super) const MIN_HEIGHT: u16 = 5;
/// Narrower than this and a command cannot be laid out in a useful number of rows.
const MIN_COLS: u16 = 40;

/// Control and invisible characters are made visible: a line break shows as an
/// arrow instead of starting a row that could imitate the title.
fn shown(c: char) -> char {
    match c {
        '\n' | '\r' => '\u{21b5}',
        c if c.is_control() || is_invisible_format_char(c) => '?',
        c => c,
    }
}

fn cells(c: char) -> usize {
    if c.is_ascii() {
        1
    } else {
        2
    }
}

/// `command` in rows of at most `width` cells.
pub(super) fn command_rows(command: &str, width: usize) -> Vec<String> {
    let width = width.max(2);
    let mut rows = Vec::new();
    let mut row = String::new();
    let mut used = 0;
    for c in command.chars().map(shown) {
        let w = cells(c);
        if used + w > width {
            rows.push(std::mem::take(&mut row));
            used = 0;
        }
        row.push(c);
        used += w;
    }
    if !row.is_empty() || rows.is_empty() {
        rows.push(row);
    }
    rows
}

/// The box height this command needs at `cols` columns, or `None` when it cannot be shown whole.
pub(super) fn needed_height(command: &str, cols: u16) -> Option<u16> {
    if cols < MIN_COLS {
        return None;
    }
    let height = command_rows(command, cols.saturating_sub(2) as usize).len() as u16 + 3;
    (height <= MAX_HEIGHT).then_some(height.max(MIN_HEIGHT))
}

/// The lines of the prompt, or `None` when the whole command does not fit `area`.
pub(super) fn lines(command: &str, area: Rect) -> Option<Vec<Line<'static>>> {
    if needed_height(command, area.width)? > area.height {
        return None;
    }
    let mut lines = vec![Line::styled("Run this command? [y]es / [N]o", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD))];
    lines.extend(command_rows(command, area.width.saturating_sub(2) as usize).into_iter().map(Line::raw));
    Some(lines)
}

/// Shown instead of a cut-off command.
pub(super) fn too_long_notice(command: &str) -> Vec<Line<'static>> {
    vec![
        Line::styled(
            format!("This command ({} characters) is too long to show in full: press n and ask for a shorter one.", command.chars().count()),
            Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
        ),
        Line::raw("It cannot be approved without being shown whole. [N]o"),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rows_are_exact_and_nothing_is_lost() {
        let command = "a".repeat(250);
        let rows = command_rows(&command, 78);
        assert_eq!(rows.len(), 4);
        assert!(rows.iter().all(|r| r.chars().count() <= 78));
        assert_eq!(rows.concat(), command, "every character is in some row, in order");
        assert_eq!(command_rows("", 78), [""], "an empty command is still one row");
    }

    #[test]
    fn line_breaks_and_hidden_characters_cannot_start_a_row_or_reorder_text() {
        let rows = command_rows("echo a\nBLOCKED: fine\u{202e}x\u{7}", 78);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0], "echo a\u{21b5}BLOCKED: fine?x?");
    }

    #[test]
    fn wide_characters_count_double_so_a_row_never_overflows() {
        let rows = command_rows(&"\u{4e2d}".repeat(100), 78);
        assert!(rows.iter().all(|r| r.chars().count() * 2 <= 78), "{:?}", rows.iter().map(|r| r.chars().count()).collect::<Vec<_>>());
    }

    #[test]
    fn a_short_command_gets_the_old_box_a_longer_one_a_taller_box_and_a_huge_one_none() {
        assert_eq!(needed_height("ls", 80), Some(MIN_HEIGHT));
        assert_eq!(needed_height(&"a".repeat(300), 80), Some(7), "300 chars = 4 rows at 78 columns, plus 3");
        assert_eq!(needed_height(&"a".repeat(2000), 80), None);
        assert_eq!(needed_height("ls", MIN_COLS - 1), None, "too narrow to lay out");
    }
}
