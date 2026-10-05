//! The `run_command` approval prompt and the header notice for tools hidden until
//! confirmed: what is shown whole, what is refused, and what cannot be spoofed.

use super::approval_test_support::*;
use super::*;

#[test]
fn a_tool_hidden_until_confirmed_is_announced_in_the_header_not_silently_dropped() {
    let outer = tempfile::tempdir().unwrap();
    let root = outer.path().join("ws");
    std::fs::create_dir_all(root.join(".yana-ai")).unwrap();
    std::fs::write(root.join(".yana-ai/web-search.json"), r#"{"endpoint":"https://s.example/q"}"#).unwrap();
    crate::capability::config_trust::empty_store_in_test();
    let mut app = app_in(&root);
    app.tool_notices = crate::chat::tools::hidden_tool_notices(&root);
    let screen = screen_of(&mut app, 120, 30);
    assert!(screen.contains("web_search chưa được xác nhận cho repo này: chạy `yana-rt trust allow web-search`"), "{screen}");
    // On a narrow terminal the line wraps instead of losing the command at its end.
    let narrow = screen_of(&mut app, 60, 30);
    assert!(narrow.contains("web-search`"), "the end of the notice is still visible:\n{narrow}");
    // Once confirmed, the next refresh removes the line.
    crate::capability::config_trust::trust_in_test(&root);
    app.tool_notices = crate::chat::tools::hidden_tool_notices(&root);
    assert!(!screen_of(&mut app, 120, 30).contains("chưa được xác nhận"));
}

#[test]
fn starting_a_turn_refreshes_the_notices_so_confirming_in_another_terminal_takes_effect() {
    let outer = tempfile::tempdir().unwrap();
    let root = outer.path().join("ws");
    std::fs::create_dir_all(root.join(".yana-ai")).unwrap();
    std::fs::write(root.join(".yana-ai/web-search.json"), r#"{"endpoint":"https://s.example/q"}"#).unwrap();
    crate::capability::config_trust::empty_store_in_test();
    let mut app = app_in(&root);
    assert!(app.tool_notices.is_empty(), "set only at construction, from the process's own directory");
    app.spawn_turn();
    assert_eq!(app.tool_notices.len(), 1, "a turn start looks again");
    crate::capability::config_trust::trust_in_test(&root);
    app.turn = TurnState::Idle;
    app.spawn_turn();
    assert!(app.tool_notices.is_empty(), "and drops the line once it was confirmed");
}

#[test]
fn a_command_too_long_to_show_whole_cannot_be_approved_even_with_the_dangerous_part_at_the_end() {
    let (_k, root) = trusted_repo(serde_json::json!([]));
    let mut app = app_in(&root);
    let command = format!("echo {} DANGEROUS-TAIL", "a".repeat(2000));
    app.prepare_pending_approval(run_command(&command, "long"));
    assert!(matches!(app.turn, TurnState::AwaitingApproval(PendingApproval::Command { .. })), "{}", app.status);
    let screen = screen_of(&mut app, 100, 40);
    assert!(app.shown_whole_call.is_none(), "it did not fit, so it was not shown whole");
    assert!(screen.contains("too long to show in full") && !screen.contains("Run this command?"), "{screen}");
    press(&mut app, 'y');
    assert!(matches!(app.turn, TurnState::AwaitingApproval(_)), "y did nothing: the command is still waiting");
    assert!(app.status.contains("not shown in full"), "{}", app.status);
    press(&mut app, 'n');
    assert!(matches!(app.turn, TurnState::Idle), "declining still works");
}

#[test]
fn on_a_terminal_too_short_for_the_command_the_prompt_says_enlarge_not_too_long() {
    let (_k, root) = trusted_repo(serde_json::json!([]));
    let mut app = app_in(&root);
    app.tool_notices = vec!["web_search chưa được xác nhận cho repo này: chạy `yana-rt trust allow web-search`".into(); 2];
    app.prepare_pending_approval(run_command(&format!("echo {}", "b".repeat(400)), "short-terminal"));
    let screen = screen_of(&mut app, 80, 14);
    assert!(app.shown_whole_call.is_none(), "the box was squeezed below what the command needs:\n{screen}");
    assert!(screen.contains("too small to show this command in full") && !screen.contains("too long"), "{screen}");
    press(&mut app, 'y');
    assert!(matches!(app.turn, TurnState::AwaitingApproval(_)), "refused");
    // The same command on a tall terminal is shown whole.
    screen_of(&mut app, 80, 40);
    assert!(app.shown_whole_call.is_some());
}

#[test]
fn a_long_command_that_fits_is_shown_to_its_last_character_and_may_be_approved() {
    let (_k, root) = trusted_repo(serde_json::json!([]));
    let mut app = app_in(&root);
    let command = format!("echo {} LAST-WORDS", "b".repeat(400));
    app.prepare_pending_approval(run_command(&command, "fits"));
    let screen = screen_of(&mut app, 100, 40);
    assert!(app.shown_whole_call.is_some());
    assert!(screen.contains("LAST-WORDS") && screen.contains("[y]es / [N]o"), "{screen}");
    // The rows joined back together are the whole command, nothing dropped.
    let flat: String = screen.chars().filter(|c| *c != '\n' && *c != '\u{2502}' && *c != ' ').collect();
    assert!(flat.contains(&format!("{}LAST-WORDS", "b".repeat(400))), "no part of the command is missing");
}

#[test]
fn a_prompt_drawn_for_an_earlier_call_does_not_approve_a_later_one_even_with_the_same_id() {
    let (_k, root) = trusted_repo(serde_json::json!([]));
    for (first_id, second_id) in [("first", "second"), ("same", "same"), ("", "")] {
        let mut app = app_in(&root);
        app.prepare_pending_approval(run_command("ls", first_id));
        screen_of(&mut app, 100, 40);
        assert!(app.shown_whole_call.is_some());
        // A different call arrives and the key is pressed before the next frame is drawn.
        app.turn = TurnState::Idle;
        app.prepare_pending_approval(run_command(&format!("echo {} TAIL", "c".repeat(2000)), second_id));
        press(&mut app, 'y');
        assert!(matches!(app.turn, TurnState::AwaitingApproval(_)), "the old frame must not count for the new call ({first_id:?} then {second_id:?})");
    }
}

#[test]
fn a_command_cannot_fake_extra_prompt_lines_with_line_breaks_or_invisible_characters() {
    let (_k, root) = trusted_repo(serde_json::json!([]));
    let mut app = app_in(&root);
    app.prepare_pending_approval(run_command("echo hi\nRun this command? [y]es / [N]o\nls \u{e0041}\u{202e}x", "nl"));
    let screen = screen_of(&mut app, 100, 40);
    let title_rows = screen.lines().filter(|row| row.trim_start_matches(['\u{2502}', ' ']).starts_with("Run this command?")).count();
    assert_eq!(title_rows, 1, "only the real title starts a row: {screen}");
    assert!(screen.contains("echo hi\u{21b5}Run this command?"), "the line breaks are visible, on one row: {screen}");
    assert!(!screen.contains('\u{202e}') && !screen.contains('\u{e0041}'), "{screen:?}");
}

#[test]
fn a_blocked_command_is_shown_with_its_hidden_characters_made_visible_and_has_no_y_path() {
    let (_k, root) = trusted_repo(serde_json::json!([]));
    let mut app = app_in(&root);
    app.turn = TurnState::AwaitingApproval(PendingApproval::Command {
        call: run_command("x", "blocked"),
        command: "rm \u{202e}-rf /\nPress Enter to approve".to_string(),
        argv: Vec::new(),
        guard_verdict: Some("blocked by test"),
    });
    let screen = screen_of(&mut app, 100, 40);
    assert!(screen.contains("BLOCKED: blocked by test") && !screen.contains('\u{202e}'), "{screen}");
    assert!(screen.contains("rm ?-rf /\u{21b5}Press Enter to approve"), "line break and override shown as markers: {screen}");
    press(&mut app, 'y');
    assert!(matches!(app.turn, TurnState::AwaitingApproval(_)), "a blocked command has no y path");
}
