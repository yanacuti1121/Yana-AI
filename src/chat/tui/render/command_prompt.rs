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

/// Most rows of command the largest box holds.
pub(super) const MAX_ROWS: usize = 11;
/// Borders (2) and the title (1) around the rows of command.
const CHROME_ROWS: usize = 3;
/// The box the generic prompt always had: borders, the title and one row.
pub(super) const MIN_HEIGHT: u16 = 5;
/// Narrower than this and a command cannot be laid out in a useful number of rows.
const MIN_COLS: u16 = 40;

/// Why a command could not be laid out whole.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Unshown {
    /// More than the largest box holds, at any terminal size.
    TooLong,
    /// It would fit a bigger terminal than this one.
    TooSmall,
}

/// One character as it is shown: line breaks, control and invisible characters are
/// made visible, so a break cannot start a row that imitates the title and nothing blank
/// can hide an argument.
fn shown(c: char) -> char {
    match c {
        '\n' | '\r' => '\u{21b5}',
        c if c.is_control() || is_invisible_format_char(c) => '?',
        c => c,
    }
}

/// `text` as a person is shown it.
pub(super) fn masked(text: &str) -> String {
    text.chars().map(shown).collect()
}

fn cells(c: char) -> usize {
    if c.is_ascii() {
        1
    } else {
        2
    }
}

/// `text` in rows of at most `width` cells.
pub(super) fn rows_of(text: &str, width: usize) -> Vec<String> {
    let width = width.max(2);
    let mut rows = Vec::new();
    let mut row = String::new();
    let mut used = 0;
    for c in text.chars().map(shown) {
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

/// The rows of `command` at `cols` columns, if it fits the largest box. Work is
/// bounded by the box, not by the command: a huge command is refused after looking
/// at no more characters than could possibly fit.
fn plan(command: &str, cols: u16) -> Result<Vec<String>, Unshown> {
    if cols < MIN_COLS {
        return Err(Unshown::TooSmall);
    }
    let width = usize::from(cols) - 2;
    let most_chars = MAX_ROWS * width; // one cell per character is the best case
    if command.chars().take(most_chars + 1).count() > most_chars {
        return Err(Unshown::TooLong);
    }
    let rows = rows_of(command, width);
    if rows.len() > MAX_ROWS {
        return Err(Unshown::TooLong);
    }
    Ok(rows)
}

/// The box height this command needs at `cols` columns, or `None` when it cannot be shown whole.
pub(super) fn needed_height(command: &str, cols: u16) -> Option<u16> {
    let rows = plan(command, cols).ok()?;
    u16::try_from((rows.len() + CHROME_ROWS).max(usize::from(MIN_HEIGHT))).ok()
}

/// The lines of the prompt, or why the whole command cannot be shown in `area`.
pub(super) fn lines(command: &str, area: Rect) -> Result<Vec<Line<'static>>, Unshown> {
    let rows = plan(command, area.width)?;
    if rows.len() + CHROME_ROWS > usize::from(area.height) {
        return Err(Unshown::TooSmall);
    }
    let mut lines = vec![Line::styled("Run this command? [y]es / [N]o", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD))];
    lines.extend(rows.into_iter().map(Line::raw));
    Ok(lines)
}

/// Shown instead of a command that could not be shown whole.
pub(super) fn notice(why: &Unshown, command: &str) -> Vec<Line<'static>> {
    let (headline, hint) = match why {
        Unshown::TooLong => (
            format!("This command ({} characters) is too long to show in full: press n and ask for a shorter one.", command.chars().count()),
            "It cannot be approved without being shown whole. [N]o",
        ),
        Unshown::TooSmall => (
            "The terminal is too small to show this command in full: enlarge it, or press n.".to_string(),
            "It cannot be approved without being shown whole. [N]o",
        ),
    };
    vec![Line::styled(headline, Style::default().fg(Color::Red).add_modifier(Modifier::BOLD)), Line::raw(hint)]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn area(width: u16, height: u16) -> Rect {
        Rect::new(0, 0, width, height)
    }

    #[test]
    fn rows_are_exact_and_nothing_is_lost() {
        let command = "a".repeat(250);
        let rows = rows_of(&command, 78);
        assert_eq!(rows.len(), 4);
        assert!(rows.iter().all(|r| r.chars().count() <= 78));
        assert_eq!(rows.concat(), command, "every character is in some row, in order");
        assert_eq!(rows_of("", 78), [""], "an empty command is still one row");
    }

    #[test]
    fn a_row_that_fills_the_width_exactly_does_not_spill_an_empty_row() {
        assert_eq!(rows_of(&"a".repeat(78), 78).len(), 1, "exactly one row's worth");
        assert_eq!(rows_of(&"a".repeat(79), 78).len(), 2);
        // A two-cell character that would straddle the end of a row starts the next one.
        let rows = rows_of(&format!("{}\u{4e2d}", "a".repeat(77)), 78);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[1], "\u{4e2d}");
    }

    #[test]
    fn line_breaks_and_hidden_characters_cannot_start_a_row_or_reorder_text() {
        let rows = rows_of("echo a\nBLOCKED: fine\u{202e}x\u{7}", 78);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0], "echo a\u{21b5}BLOCKED: fine?x?");
        // Characters that draw as nothing: tag characters, variation selectors, a soft hyphen, fillers.
        assert_eq!(masked("a\u{e0041}b\u{fe0f}c\u{ad}d\u{3164}e\u{2800}f"), "a?b?c?d?e?f");
    }

    #[test]
    fn wide_characters_count_double_so_a_row_never_overflows() {
        let rows = rows_of(&"\u{4e2d}".repeat(100), 78);
        assert!(rows.iter().all(|r| r.chars().count() * 2 <= 78), "{:?}", rows.iter().map(|r| r.chars().count()).collect::<Vec<_>>());
    }

    #[test]
    fn the_largest_box_holds_exactly_eleven_rows() {
        // 78 columns of room at 80: 11 rows is the last that fits, 12 is refused.
        assert_eq!(needed_height(&"a".repeat(11 * 78), 80), Some(14));
        assert_eq!(needed_height(&"a".repeat(11 * 78 + 1), 80), None);
        assert_eq!(needed_height("ls", 80), Some(u16::from(MIN_HEIGHT)));
        assert_eq!(needed_height(&"a".repeat(300), 80), Some(7), "300 chars = 4 rows at 78 columns, plus 3");
        assert_eq!(needed_height("ls", MIN_COLS - 1), None, "too narrow to lay out");
    }

    #[test]
    fn a_huge_command_is_refused_without_building_its_rows_and_never_wraps_the_height() {
        let huge = "a".repeat(70_000 * 10);
        assert_eq!(needed_height(&huge, 40), None);
        assert!(matches!(lines(&huge, area(80, 40)), Err(Unshown::TooLong)));
        // 65,538 rows at 2 columns would wrap a u16; at the narrowest accepted width it is still refused, not shown as 2 rows.
        assert!(needed_height(&"a".repeat(65_538 * 38), MIN_COLS).is_none());
    }

    #[test]
    fn a_command_that_fits_a_bigger_terminal_says_the_terminal_is_small_not_that_it_is_long() {
        let command = "a".repeat(300);
        assert!(lines(&command, area(80, 24)).is_ok());
        assert_eq!(lines(&command, area(80, 6)).unwrap_err(), Unshown::TooSmall, "needs 7 rows, has 6");
        assert_eq!(lines(&command, area(30, 24)).unwrap_err(), Unshown::TooSmall, "too narrow");
        assert_eq!(lines(&"a".repeat(2000), area(80, 40)).unwrap_err(), Unshown::TooLong);
        let small = notice(&Unshown::TooSmall, &command)[0].to_string();
        let long = notice(&Unshown::TooLong, &command)[0].to_string();
        assert!(small.contains("enlarge") && !small.contains("too long"), "{small}");
        assert!(long.contains("too long") && !long.contains("enlarge"), "{long}");
    }
}
