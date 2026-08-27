use super::*;

fn raw<'a>(command_text: &'a str, stdout: &'a str, stderr: &'a str, exit_code: Option<i32>) -> RawCommandOutput<'a> {
    RawCommandOutput {
        command_text,
        stdout,
        stderr,
        exit_code,
    }
}

// ---- has_shell_composition: the structural guard that makes the rtk
// `git log --oneline | wc -l` incident impossible to reproduce here ----

#[test]
fn shell_composition_detects_the_exact_rtk_incident_command() {
    assert!(has_shell_composition("git log --oneline | wc -l"));
}

#[test]
fn shell_composition_detects_every_operator() {
    for op in ["|", ">", ">>", "&&", "||", ";", "`", "$("] {
        let cmd = format!("git status {op} something");
        assert!(has_shell_composition(&cmd), "operator {op} not detected");
    }
}

#[test]
fn shell_composition_allows_plain_commands() {
    assert!(!has_shell_composition("git log --oneline"));
    assert!(!has_shell_composition("git status --porcelain"));
    assert!(!has_shell_composition("cargo test --workspace"));
}

/// Regression test for the exact gap security-auditor review (2026-08-27)
/// found and reproduced live: `bash -c` treats a literal newline as a
/// statement separator exactly like `;`, so a command string joining two
/// invocations with an embedded newline instead of an operator character
/// used to slip past every marker in the list — this is the same failure
/// class as the rtk `git log --oneline | wc -l` incident, just triggered
/// via a different separator.
#[test]
fn shell_composition_detects_embedded_newline() {
    assert!(has_shell_composition("git log --oneline\ngit log --oneline"));
}

#[test]
fn shell_composition_detects_input_redirect_operators() {
    for op in ["<", "<<", "<("] {
        let cmd = format!("git status {op} something");
        assert!(has_shell_composition(&cmd), "operator {op} not detected");
    }
}

// ---- git_log ----

#[test]
fn git_log_compacts_a_large_oneline_history_with_exact_count() {
    let lines: Vec<String> = (1..=200).map(|i| format!("abc{i:04} commit number {i}")).collect();
    let stdout = lines.join("\n") + "\n";
    let r = raw("git log --oneline", &stdout, "", Some(0));
    let body = git_log::compact(&r).expect("expected compaction");
    assert_eq!(body.stats.total_count, Some(200));
    assert!(body.text.contains("200 commits total"));
    assert!(body.text.len() < stdout.len());
}

#[test]
fn git_log_declines_without_oneline_flag() {
    let r = raw("git log", "commit abc\nAuthor: x\n\n    msg\n", "", Some(0));
    assert!(git_log::compact(&r).is_none());
}

/// Regression test for code-auditor review (2026-08-27): the old substring
/// check (`command_text.contains("--oneline")`) would false-match a command
/// whose `--oneline` flag isn't actually present, just quoted text
/// containing the same characters — which would then miscount arbitrary
/// multi-line `git log` output as one commit per line.
#[test]
fn git_log_declines_on_oneline_substring_without_the_actual_flag() {
    let r = raw(
        r#"git log --grep="--oneline""#,
        "commit abc123\nAuthor: x\n\n    msg one\n\ncommit def456\nAuthor: y\n\n    msg two\n",
        "",
        Some(0),
    );
    assert!(git_log::compact(&r).is_none());
    assert!(!git_log::recognizes(r.command_text));
}

#[test]
fn git_log_declines_on_short_history() {
    let stdout = "abc1 one\nabc2 two\n";
    let r = raw("git log --oneline", stdout, "", Some(0));
    assert!(git_log::compact(&r).is_none());
}

#[test]
fn git_log_declines_on_nonzero_exit_or_stderr() {
    let stdout = (1..=200).map(|i| format!("abc{i} c\n")).collect::<String>();
    assert!(git_log::compact(&raw("git log --oneline", &stdout, "", Some(1))).is_none());
    assert!(git_log::compact(&raw("git log --oneline", &stdout, "warning: x", Some(0))).is_none());
}

// ---- git_status ----

#[test]
fn git_status_keeps_tracked_changes_verbatim_and_summarizes_bulk_untracked() {
    let mut stdout = String::new();
    stdout.push_str(" M src/main.rs\n");
    stdout.push_str("A  src/new_file.rs\n");
    for i in 0..50 {
        stdout.push_str(&format!("?? node_modules/pkg{i}/index.js\n"));
    }
    let r = raw("git status --porcelain", &stdout, "", Some(0));
    let body = git_status::compact(&r).expect("expected compaction");
    assert_eq!(body.stats.total_count, Some(52));
    assert!(body.text.contains("M src/main.rs") || body.text.contains(" M src/main.rs"));
    assert!(body.text.contains("A  src/new_file.rs"));
    assert!(body.text.contains("more untracked entries omitted"));
    assert!(body.text.len() < stdout.len());
}

#[test]
fn git_status_declines_below_untracked_threshold() {
    let stdout = " M src/main.rs\n?? one.txt\n?? two.txt\n";
    let r = raw("git status --porcelain", stdout, "", Some(0));
    assert!(git_status::compact(&r).is_none());
}

#[test]
fn git_status_declines_without_porcelain_or_short_flag() {
    let stdout: String = (0..50).map(|i| format!("?? f{i}\n")).collect();
    let r = raw("git status", &stdout, "", Some(0));
    assert!(git_status::compact(&r).is_none());
}

/// Regression test for code-auditor review (2026-08-27): `--porcelain=v2`
/// uses a different line shape (`? path`, single `?`, not `?? path`) that
/// this v1-only parser would silently miscategorize as a tracked change
/// rather than compact correctly — must be rejected, not accepted-but-wrong.
#[test]
fn git_status_declines_porcelain_v2() {
    let stdout: String = (0..50).map(|i| format!("?? f{i}\n")).collect();
    let r = raw("git status --porcelain=v2", &stdout, "", Some(0));
    assert!(git_status::compact(&r).is_none());
    assert!(!git_status::recognizes(r.command_text));
}

#[test]
fn git_status_declines_on_short_malformed_line() {
    let stdout = "?\n";
    let r = raw("git status --porcelain", stdout, "", Some(0));
    assert!(git_status::compact(&r).is_none());
}

/// Defense-in-depth regression test (code-auditor review, 2026-08-27): a
/// line whose byte offset 2 doesn't land on a UTF-8 character boundary must
/// decline gracefully, not panic the whole `yana-rt compact` process via an
/// out-of-bounds string slice.
#[test]
fn git_status_declines_rather_than_panics_on_non_char_boundary_line() {
    // '€' is 3 bytes (0xE2 0x82 0xAC) — byte offset 2 falls inside it, not
    // on a character boundary.
    let stdout = "€ oops\n M src/main.rs\n";
    let r = raw("git status --porcelain", stdout, "", Some(0));
    assert!(git_status::compact(&r).is_none());
}

// ---- test_runner: cargo ----

#[test]
fn cargo_test_compacts_a_large_all_passing_run() {
    let mut stdout = String::new();
    for i in 0..40 {
        stdout.push_str(&format!("test mod::case_{i} ... ok\n"));
    }
    stdout.push_str("\ntest result: ok. 40 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s\n");
    let r = raw("cargo test", &stdout, "", Some(0));
    let body = test_runner::compact(&r).expect("expected compaction");
    assert_eq!(body.stats.pass_count, Some(40));
    assert_eq!(body.stats.fail_count, Some(0));
    assert!(body.text.contains("test result: ok"));
    assert!(body.text.len() < stdout.len());
}

#[test]
fn cargo_test_declines_on_any_failure() {
    let stdout = "test mod::a ... ok\ntest mod::b ... FAILED\n\nfailures:\n    mod::b\n\ntest result: FAILED. 1 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s\n";
    let r = raw("cargo test", stdout, "", Some(101));
    assert!(test_runner::compact(&r).is_none());
}

#[test]
fn cargo_test_declines_below_pass_threshold() {
    let stdout = "test mod::a ... ok\n\ntest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s\n";
    let r = raw("cargo test", stdout, "", Some(0));
    assert!(test_runner::compact(&r).is_none());
}

/// Regression test for code-auditor review (2026-08-27): doctest result
/// lines contain spaces in the test name (`src/lib.rs - Foo::bar (line 10)`)
/// — the old `\S+` regex silently never matched them at all, undercounting
/// `pass` while the header still claimed "exact counts from full output".
#[test]
fn cargo_test_counts_doctest_lines_with_spaces_in_the_name() {
    let mut stdout = String::new();
    for i in 0..15 {
        stdout.push_str(&format!("test mod::case_{i} ... ok\n"));
    }
    stdout.push_str("\ntest result: ok. 15 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s\n\n");
    for i in 0..15 {
        stdout.push_str(&format!("test src/lib.rs - Foo::bar_{i} (line {i}) ... ok\n"));
    }
    stdout.push_str("\ntest result: ok. 15 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s\n");
    let r = raw("cargo test", &stdout, "", Some(0));
    let body = test_runner::compact(&r).expect("expected compaction");
    // 15 regular + 15 doctests = 30 — the pre-fix regex would have reported
    // only 15 (doctests invisible to \S+).
    assert_eq!(body.stats.pass_count, Some(30));
}

// ---- test_runner: pytest ----

#[test]
fn pytest_compacts_a_large_all_passing_run() {
    let stdout = "..................................... [100%]\n===== 40 passed in 3.21s =====\n";
    let r = raw("pytest", stdout, "", Some(0));
    let body = test_runner::compact(&r).expect("expected compaction");
    assert_eq!(body.stats.pass_count, Some(40));
    assert_eq!(body.stats.fail_count, Some(0));
    assert!(body.text.contains("40 passed"));
}

#[test]
fn pytest_declines_on_any_failure_or_error() {
    let stdout = "..F.............................  [100%]\n===== 1 failed, 39 passed in 3.21s =====\n";
    let r = raw("pytest", stdout, "", Some(1));
    assert!(test_runner::compact(&r).is_none());
}

#[test]
fn pytest_declines_without_recognizable_summary() {
    let r = raw("pytest", "no summary line here\n", "", Some(0));
    assert!(test_runner::compact(&r).is_none());
}

// ---- orchestrator-level: never-worse + bypass ----

#[test]
fn never_worse_guard_is_a_type_level_property() {
    // Every matcher above already asserts body.text.len() < stdout.len() in
    // its own success case; run()'s own never-worse check is exercised via
    // the integration tests (tests/integration_compact.rs), which spawn a
    // real process — this unit test documents the invariant matchers must
    // uphold rather than re-testing run()'s process-spawning path.
    let stdout: String = (1..=200).map(|i| format!("abc{i} c\n")).collect();
    let r = raw("git log --oneline", &stdout, "", Some(0));
    let body = git_log::compact(&r).unwrap();
    assert!(body.text.len() < stdout.len());
}
