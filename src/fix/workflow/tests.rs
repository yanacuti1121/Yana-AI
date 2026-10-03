//! Behavior tests for the workflow editors. Results are checked with a real
//! YAML parser, not by comparing text, so a change that keeps the text pretty
//! but breaks the structure still fails.

use super::*;
use serde_yml::Value;

const PATTERNS: &[&str] = &["npm publish", "cargo publish", "pypi"];

fn yaml(s: &str) -> Value {
    serde_yml::from_str(s).unwrap_or_else(|e| panic!("invalid YAML ({e}):\n{s}"))
}

const ONE_JOB: &str = "name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n";
const PUBLISH_JOB: &str = "jobs:\n  publish:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Publish\n        run: npm publish\n";

// ── add_job_timeouts ─────────────────────────────────────────────────────────

#[test]
fn timeout_lands_at_job_level_and_leaves_everything_else_alone() {
    let (out, n) = add_job_timeouts(ONE_JOB);
    assert_eq!(n, 1);
    let v = yaml(&out);
    assert_eq!(v["jobs"]["build"]["timeout-minutes"], Value::from(30));
    assert_eq!(v["jobs"]["build"]["runs-on"], Value::from("ubuntu-latest"));
    assert_eq!(yaml(ONE_JOB)["jobs"]["build"]["steps"], v["jobs"]["build"]["steps"]);
}

#[test]
fn timeout_follows_the_files_own_indentation() {
    for indent in [2usize, 4, 6] {
        let pad = " ".repeat(indent);
        let wf = format!("jobs:\n{pad}build:\n{pad}{pad}runs-on: x\n{pad}{pad}steps: []\n");
        let (out, n) = add_job_timeouts(&wf);
        assert_eq!(n, 1, "indent {indent}");
        assert_eq!(yaml(&out)["jobs"]["build"]["timeout-minutes"], Value::from(30), "indent {indent}");
    }
}

#[test]
fn only_jobs_without_a_timeout_are_changed() {
    let wf = "jobs:\n  a:\n    runs-on: x\n    timeout-minutes: 5\n  b:\n    runs-on: x\n";
    let (out, n) = add_job_timeouts(wf);
    assert_eq!(n, 1);
    let v = yaml(&out);
    assert_eq!(v["jobs"]["a"]["timeout-minutes"], Value::from(5));
    assert_eq!(v["jobs"]["b"]["timeout-minutes"], Value::from(30));
}

#[test]
fn a_list_valued_runs_on_keeps_its_items_and_the_key_goes_after_the_list() {
    let wf = "jobs:\n  a:\n    runs-on:\n      - self-hosted\n      - linux\n    steps: []\n";
    let (out, n) = add_job_timeouts(wf);
    assert_eq!(n, 1);
    let v = yaml(&out);
    assert_eq!(v["jobs"]["a"]["runs-on"], yaml("[self-hosted, linux]"));
    assert_eq!(v["jobs"]["a"]["timeout-minutes"], Value::from(30));
}

#[test]
fn a_commented_out_timeout_does_not_count_as_one() {
    let wf = "jobs:\n  a:\n    runs-on: x\n    # timeout-minutes: 5\n";
    assert_eq!(add_job_timeouts(wf).1, 1);
}

#[test]
fn a_comment_inside_the_job_does_not_hide_an_existing_timeout() {
    let wf = "jobs:\n  a:\n    timeout-minutes: 7\n# top-level comment\n    runs-on: x\n";
    assert_eq!(add_job_timeouts(wf).1, 0);
}

#[test]
fn files_without_runs_on_are_untouched() {
    let reusable = "jobs:\n  call:\n    uses: ./.github/workflows/other.yml\n";
    assert_eq!(add_job_timeouts(reusable), (reusable.to_string(), 0));
    assert_eq!(add_job_timeouts(""), (String::new(), 0));
}

#[test]
fn crlf_line_endings_are_preserved() {
    let wf = ONE_JOB.replace('\n', "\r\n");
    let (out, n) = add_job_timeouts(&wf);
    assert_eq!(n, 1);
    assert!(!out.replace("\r\n", "").contains('\n'), "a bare LF was introduced");
    assert_eq!(yaml(&out)["jobs"]["build"]["timeout-minutes"], Value::from(30));
}

#[test]
fn a_missing_final_newline_stays_missing_even_when_the_edit_is_at_the_end() {
    let wf = "jobs:\n  a:\n    runs-on: x";
    let (out, n) = add_job_timeouts(wf);
    assert_eq!(n, 1);
    assert!(!out.ends_with('\n'));
    assert_eq!(yaml(&out)["jobs"]["a"]["timeout-minutes"], Value::from(30));
}

#[test]
fn applying_it_twice_changes_nothing_the_second_time() {
    let (once, _) = add_job_timeouts(ONE_JOB);
    let (twice, n) = add_job_timeouts(&once);
    assert_eq!((twice, n), (once, 0));
}

// ── add_job_environment ──────────────────────────────────────────────────────

#[test]
fn a_publish_job_gets_one_job_level_environment_gate() {
    let two_publishes = "jobs:\n  publish:\n    runs-on: x\n    steps:\n      - run: npm publish\n      - run: cargo publish\n";
    for wf in [PUBLISH_JOB, two_publishes] {
        let (out, n) = add_job_environment(wf, PATTERNS);
        assert_eq!(n, 1);
        assert_eq!(out.matches("environment:").count(), 1, "{out}");
        assert_eq!(yaml(&out)["jobs"]["publish"]["environment"], Value::from("production"));
        assert_eq!(yaml(wf)["jobs"]["publish"]["steps"], yaml(&out)["jobs"]["publish"]["steps"]);
    }
}

#[test]
fn only_the_publishing_job_is_gated() {
    let wf = "jobs:\n  test:\n    runs-on: x\n    steps:\n      - run: cargo test\n  publish:\n    runs-on: x\n    steps:\n      - run: npm publish\n";
    let (out, n) = add_job_environment(wf, PATTERNS);
    assert_eq!(n, 1);
    let v = yaml(&out);
    assert!(v["jobs"]["test"].get("environment").is_none());
    assert_eq!(v["jobs"]["publish"]["environment"], Value::from("production"));
}

#[test]
fn a_publish_command_only_in_a_comment_does_not_trigger_the_gate() {
    let wf = "jobs:\n  a:\n    runs-on: x\n    steps:\n      # npm publish later\n      - run: echo hi\n";
    assert_eq!(add_job_environment(wf, PATTERNS).1, 0);
}

#[test]
fn a_job_that_already_has_an_environment_is_left_alone_in_both_spellings() {
    let scalar = format!("{PUBLISH_JOB}    environment: staging\n");
    let mapping = format!("{PUBLISH_JOB}    environment:\n      name: staging\n");
    for wf in [scalar, mapping] {
        assert_eq!(add_job_environment(&wf, PATTERNS), (wf.clone(), 0));
    }
}

#[test]
fn the_gate_is_written_right_after_runs_on() {
    let (out, _) = add_job_environment(PUBLISH_JOB, PATTERNS);
    let lines: Vec<&str> = out.lines().collect();
    let at = lines.iter().position(|l| l.trim() == "runs-on: ubuntu-latest").unwrap();
    assert_eq!(lines[at + 1], "    environment: production");
}

#[test]
fn a_nested_key_with_the_same_name_does_not_count_as_a_job_level_key() {
    let nested_timeout = "jobs:\n  a:\n    runs-on: x\n    steps:\n      - uses: some/action\n        with:\n          timeout-minutes: 5\n";
    let (out, n) = add_job_timeouts(nested_timeout);
    assert_eq!(n, 1);
    assert_eq!(yaml(&out)["jobs"]["a"]["timeout-minutes"], Value::from(30));

    let nested_env = "jobs:\n  a:\n    runs-on: x\n    steps:\n      - run: npm publish\n        env:\n          environment: staging\n";
    let (out, n) = add_job_environment(nested_env, PATTERNS);
    assert_eq!(n, 1);
    assert_eq!(yaml(&out)["jobs"]["a"]["environment"], Value::from("production"));
}
