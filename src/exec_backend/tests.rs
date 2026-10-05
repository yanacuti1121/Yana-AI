//! Regression tests for E0: the `local` backend behaves as `spawn_command` always did.

use super::*;
use crate::capability::command::{execute_command, spawn_command};

fn root() -> tempfile::TempDir {
    tempfile::tempdir().unwrap()
}

fn argv(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|p| p.to_string()).collect()
}

#[cfg(unix)]
#[test]
fn local_runs_the_program_in_the_root_with_the_agent_marker_and_reports_the_exit_code() {
    let dir = root();
    let request = ExecRequest { root: dir.path().to_path_buf(), argv: argv(&["sh", "-c", "pwd; echo marker=$YANA_AGENT_CHILD; exit 3"]) };
    let out = LocalBackend::new(false).run(&request).unwrap();
    let text = String::from_utf8(out.stdout).unwrap();
    let canonical = dir.path().canonicalize().unwrap();
    assert!(text.starts_with(canonical.to_str().unwrap()), "{text}");
    assert!(text.contains("marker=1"), "{text}");
    assert_eq!(out.exit_code, Some(3), "a non-zero exit is a result, not an error");
}

#[test]
fn local_refuses_an_empty_command_and_a_root_that_is_not_a_directory() {
    let dir = root();
    let backend = LocalBackend::new(false);
    assert!(matches!(backend.run(&ExecRequest { root: dir.path().to_path_buf(), argv: Vec::new() }), Err(CapabilityError::EmptyCommand)));
    let file = dir.path().join("f");
    std::fs::write(&file, "x").unwrap();
    assert!(backend.run(&ExecRequest { root: file, argv: argv(&["true"]) }).is_err());
    assert!(backend.run(&ExecRequest { root: dir.path().join("missing"), argv: argv(&["true"]) }).is_err());
}

#[test]
fn local_reports_a_program_that_cannot_start_as_an_error() {
    let dir = root();
    let error = LocalBackend::new(false).run(&ExecRequest { root: dir.path().to_path_buf(), argv: argv(&["/definitely/not/here"]) }).unwrap_err();
    assert!(matches!(error, CapabilityError::SpawnFailed { .. }), "{error:?}");
}

#[cfg(unix)]
#[test]
fn spawn_command_still_returns_the_whole_output_and_execute_command_still_caps_it() {
    let dir = root();
    // Well above the cap (32 KiB) the chat applies after the fact.
    let size = 100_000;
    let script = format!("head -c {size} /dev/zero | tr '\\0' a");
    let raw = spawn_command(dir.path(), &argv(&["sh", "-c", &script]), false).unwrap();
    assert_eq!(raw.stdout.len(), size, "the compaction path must keep seeing the full output");
    let capped = execute_command(dir.path(), &argv(&["sh", "-c", &script]), false).unwrap();
    assert!(capped.truncated);
    assert!(capped.stdout.len() < size && capped.stdout.len() >= 1024, "{}", capped.stdout.len());
}

#[test]
fn the_disclosure_says_where_and_how_the_command_runs() {
    let plain = LocalBackend::new(false).disclosure();
    assert_eq!(plain.kind, "local");
    assert_eq!(plain.notes.len(), 1);
    assert!(plain.notes[0].contains("your environment and home"));
    let sandboxed = LocalBackend::new(true).disclosure();
    assert!(sandboxed.notes.iter().any(|n| n.contains("sandbox-exec.sh")), "{sandboxed:?}");
    LocalBackend::new(false).cleanup();
}
