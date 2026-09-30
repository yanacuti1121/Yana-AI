//! Behavior tests for `yana-rt fix`, which edits files in the user's repo.
//! Every fixer is called on a throwaway directory. Tests marked `#[ignore]`
//! are acceptance tests for known defects (Y12 to Y15 in the WS9 backlog):
//! they fail on the current code and pass once the defect is fixed.

use super::*;
use std::fs;
use tempfile::{tempdir, TempDir};

fn dir() -> (TempDir, String) {
    let d = tempdir().unwrap();
    let t = d.path().to_str().unwrap().to_string();
    (d, t)
}

fn write(d: &TempDir, rel: &str, body: &str) {
    let p = d.path().join(rel);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, body).unwrap();
}

fn read(d: &TempDir, rel: &str) -> String {
    fs::read_to_string(d.path().join(rel)).unwrap()
}

fn is_valid_yaml(s: &str) -> bool {
    serde_yml::from_str::<serde_yml::Value>(s).is_ok()
}

const WORKFLOW: &str = "name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n";
const PUBLISH_WORKFLOW: &str = "jobs:\n  publish:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Publish\n        run: npm publish\n";

// ── validate_target / cmd_fix ────────────────────────────────────────────────

#[test]
fn target_must_be_relative_and_free_of_parent_components() {
    for ok in [".", "sub", "a/b", "./a"] {
        assert!(validate_target(ok).is_ok(), "{ok}");
    }
    for bad in ["/etc", "/tmp/x", "..", "a/../b", "../a"] {
        assert!(validate_target(bad).is_err(), "{bad}");
    }
}

#[test]
fn an_unknown_rule_is_an_error_that_points_at_the_list_command() {
    let msg = cmd_fix("NOPE", ".", true).unwrap_err().to_string();
    assert!(msg.contains("No auto-fix") && msg.contains("fix list"), "{msg}");
}

#[test]
fn an_absolute_target_is_rejected_before_anything_is_written() {
    let (d, t) = dir();
    assert!(cmd_fix("AC001", &t, false).is_err());
    assert!(!d.path().join(".claude").exists());
}

#[test]
fn every_listed_rule_is_dispatchable_and_ids_are_case_insensitive() {
    for (id, _, _) in FIXABLE_RULES {
        for spelling in [id.to_string(), id.to_lowercase()] {
            if let Err(e) = cmd_fix(&spelling, ".", true) {
                assert!(!e.to_string().contains("No auto-fix"), "{spelling} is listed but not dispatched");
            }
        }
    }
}

// ── AC001: .claude/settings.json ─────────────────────────────────────────────

#[test]
fn ac001_creates_settings_that_deny_destructive_commands() {
    let (d, t) = dir();
    fix_ac001(&t, false).unwrap();
    let v: serde_json::Value = serde_json::from_str(&read(&d, ".claude/settings.json")).unwrap();
    let deny: Vec<&str> = v["permissions"]["deny"].as_array().unwrap().iter().filter_map(|x| x.as_str()).collect();
    assert!(deny.iter().any(|x| x.contains("rm -rf")) && deny.iter().any(|x| x.contains("git push --force")));
    assert!(v["permissions"]["allow"].as_array().unwrap().is_empty());
}

#[test]
fn ac001_never_overwrites_an_existing_settings_file() {
    let (d, t) = dir();
    write(&d, ".claude/settings.json", "{\"mine\": true}");
    fix_ac001(&t, false).unwrap();
    assert_eq!(read(&d, ".claude/settings.json"), "{\"mine\": true}");
}

#[test]
fn ac001_dry_run_writes_nothing() {
    let (d, t) = dir();
    fix_ac001(&t, true).unwrap();
    assert!(!d.path().join(".claude").exists());
}

// ── AC002: .gitignore ────────────────────────────────────────────────────────

#[test]
fn ac002_creates_a_gitignore_with_env_and_key_entries() {
    let (d, t) = dir();
    fix_ac002(&t, false).unwrap();
    let g = read(&d, ".gitignore");
    for entry in [".env", "*.pem", "*.key"] {
        assert!(g.lines().any(|l| l == entry), "{entry}");
    }
}

#[test]
fn ac002_appends_to_an_existing_gitignore_without_losing_content() {
    let (d, t) = dir();
    write(&d, ".gitignore", "target/\nnode_modules/\n");
    fix_ac002(&t, false).unwrap();
    let g = read(&d, ".gitignore");
    assert!(g.starts_with("target/\nnode_modules/\n"));
    assert!(g.lines().any(|l| l == ".env"));
}

#[test]
fn ac002_leaves_a_gitignore_that_already_ignores_env_untouched() {
    let (d, t) = dir();
    write(&d, ".gitignore", ".env\n");
    fix_ac002(&t, false).unwrap();
    assert_eq!(read(&d, ".gitignore"), ".env\n");
}

#[test]
fn ac002_dry_run_changes_nothing() {
    let (d, t) = dir();
    fix_ac002(&t, true).unwrap();
    assert!(!d.path().join(".gitignore").exists());
    write(&d, ".gitignore", "target/\n");
    fix_ac002(&t, true).unwrap();
    assert_eq!(read(&d, ".gitignore"), "target/\n");
}

// ── AC003 / CI007: workflows ─────────────────────────────────────────────────

#[test]
fn workflow_fixers_are_a_no_op_without_a_workflows_directory() {
    let (d, t) = dir();
    fix_ac003(&t, false).unwrap();
    fix_ci007(&t, false).unwrap();
    assert!(!d.path().join(".github").exists());
}

#[test]
fn ac003_skips_workflows_that_already_have_a_timeout_and_non_yaml_files() {
    let (d, t) = dir();
    let with_timeout = "jobs:\n  b:\n    runs-on: x\n    timeout-minutes: 5\n";
    write(&d, ".github/workflows/a.yml", with_timeout);
    write(&d, ".github/workflows/notes.txt", "runs-on: x\n");
    fix_ac003(&t, false).unwrap();
    assert_eq!(read(&d, ".github/workflows/a.yml"), with_timeout);
    assert_eq!(read(&d, ".github/workflows/notes.txt"), "runs-on: x\n");
}

#[test]
fn ac003_edits_both_yml_and_yaml_and_dry_run_edits_neither() {
    let (d, t) = dir();
    write(&d, ".github/workflows/a.yml", WORKFLOW);
    write(&d, ".github/workflows/b.yaml", WORKFLOW);
    fix_ac003(&t, true).unwrap();
    assert_eq!((read(&d, ".github/workflows/a.yml"), read(&d, ".github/workflows/b.yaml")), (WORKFLOW.into(), WORKFLOW.into()));
    fix_ac003(&t, false).unwrap();
    assert!(read(&d, ".github/workflows/a.yml").contains("timeout-minutes: 30"));
    assert!(read(&d, ".github/workflows/b.yaml").contains("timeout-minutes: 30"));
}

#[test]
fn ci007_skips_unrelated_and_already_gated_workflows() {
    let (d, t) = dir();
    write(&d, ".github/workflows/plain.yml", WORKFLOW);
    let gated = format!("{PUBLISH_WORKFLOW}    environment: production\n");
    write(&d, ".github/workflows/gated.yml", &gated);
    fix_ci007(&t, false).unwrap();
    assert_eq!(read(&d, ".github/workflows/plain.yml"), WORKFLOW);
    assert_eq!(read(&d, ".github/workflows/gated.yml"), gated);
}

#[test]
fn ci007_dry_run_writes_nothing() {
    let (d, t) = dir();
    write(&d, ".github/workflows/p.yml", PUBLISH_WORKFLOW);
    fix_ci007(&t, true).unwrap();
    assert_eq!(read(&d, ".github/workflows/p.yml"), PUBLISH_WORKFLOW);
}

// ── MCP001 ───────────────────────────────────────────────────────────────────

#[test]
fn mcp001_without_a_config_is_a_no_op() {
    let (d, t) = dir();
    fix_mcp001(&t, false).unwrap();
    assert!(!d.path().join(".mcp.json").exists());
}

#[test]
fn mcp001_adds_read_only_once_to_a_filesystem_server_and_is_idempotent() {
    let (d, t) = dir();
    write(&d, ".mcp.json", r#"{"mcpServers":{"files":{"command":"x","args":["a"]},"github":{"command":"y","args":["b"]}}}"#);
    fix_mcp001(&t, false).unwrap();
    fix_mcp001(&t, false).unwrap();
    let v: serde_json::Value = serde_json::from_str(&read(&d, ".mcp.json")).unwrap();
    assert_eq!(v["mcpServers"]["files"]["args"], serde_json::json!(["a", "--read-only"]));
    assert_eq!(v["mcpServers"]["github"]["args"], serde_json::json!(["b"]));
}

#[test]
fn mcp001_uses_the_servers_key_and_the_claude_dir_fallback() {
    let (d, t) = dir();
    write(&d, ".claude/mcp.json", r#"{"servers":{"my-files":{"args":[]}}}"#);
    fix_mcp001(&t, false).unwrap();
    let v: serde_json::Value = serde_json::from_str(&read(&d, ".claude/mcp.json")).unwrap();
    assert_eq!(v["servers"]["my-files"]["args"], serde_json::json!(["--read-only"]));
}

#[test]
fn mcp001_dry_run_leaves_the_file_byte_identical_and_invalid_json_is_an_error() {
    let (d, t) = dir();
    let body = r#"{"mcpServers":{"files":{"args":[]}}}"#;
    write(&d, ".mcp.json", body);
    fix_mcp001(&t, true).unwrap();
    assert_eq!(read(&d, ".mcp.json"), body);
    write(&d, ".mcp.json", "{oops");
    assert!(fix_mcp001(&t, false).is_err());
}

// ── acceptance tests for known defects (fail today) ─────────────────────────

#[test]
#[ignore = "Y12: AC003 inserts timeout-minutes at a fixed 6-space indent, which corrupts a standard workflow"]
fn ac003_produces_valid_yaml_with_the_timeout_at_job_level() {
    let (d, t) = dir();
    write(&d, ".github/workflows/ci.yml", WORKFLOW);
    fix_ac003(&t, false).unwrap();
    let out = read(&d, ".github/workflows/ci.yml");
    assert!(is_valid_yaml(&out), "invalid YAML after fix:\n{out}");
    let v: serde_yml::Value = serde_yml::from_str(&out).unwrap();
    assert_eq!(v["jobs"]["build"]["timeout-minutes"], serde_yml::Value::from(30));
    assert_eq!(v["jobs"]["build"]["runs-on"], serde_yml::Value::from("ubuntu-latest"));
}

#[test]
#[ignore = "Y13: CI007 inserts a job-level key between step lines and repeats it per matching line, which corrupts the workflow"]
fn ci007_produces_valid_yaml_with_one_environment_gate_on_the_job() {
    let (d, t) = dir();
    write(&d, ".github/workflows/p.yml", PUBLISH_WORKFLOW);
    fix_ci007(&t, false).unwrap();
    let out = read(&d, ".github/workflows/p.yml");
    assert!(is_valid_yaml(&out), "invalid YAML after fix:\n{out}");
    let v: serde_yml::Value = serde_yml::from_str(&out).unwrap();
    assert_eq!(v["jobs"]["publish"]["environment"], serde_yml::Value::from("production"));
    assert_eq!(out.matches("environment:").count(), 1);
}

#[test]
#[ignore = "Y14: AC002 uses a substring test, so `# .env` or `.environment` makes it skip while `doctor` still warns"]
fn ac002_adds_env_entries_when_env_only_appears_in_a_comment_or_a_longer_name() {
    let (d, t) = dir();
    write(&d, ".gitignore", "# .env\n.environment\n");
    fix_ac002(&t, false).unwrap();
    assert!(read(&d, ".gitignore").lines().any(|l| l == ".env"));
}

#[test]
#[ignore = "Y15: MCP001 adds `\"args\": null` to servers without args and also matches names like `profs-search`"]
fn mcp001_touches_only_filesystem_servers_and_never_writes_null_args() {
    let (d, t) = dir();
    write(&d, ".mcp.json", r#"{"mcpServers":{"zeta-files":{"command":"x"},"profs-search":{"command":"y","args":["a"]}}}"#);
    fix_mcp001(&t, false).unwrap();
    let v: serde_json::Value = serde_json::from_str(&read(&d, ".mcp.json")).unwrap();
    assert!(v["mcpServers"]["zeta-files"].get("args").map_or(true, |a| !a.is_null()));
    assert_eq!(v["mcpServers"]["profs-search"]["args"], serde_json::json!(["a"]));
}
