//! Behavior tests for `map show`, the agent blast-radius report. A false LOW is
//! the dangerous failure here, so classification is pinned for each source
//! (Claude settings, MCP config, workflow permissions) and the roll-up.

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

fn settings(d: &TempDir, body: serde_json::Value) {
    write(d, ".claude/settings.json", &body.to_string());
}

fn mcp(d: &TempDir, servers: serde_json::Value) -> Vec<McpServer> {
    write(d, ".mcp.json", &serde_json::json!({"mcpServers": servers}).to_string());
    scan_mcp(d.path().to_str().unwrap())
}

fn wf(d: &TempDir, name: &str, body: &str) {
    write(d, &format!(".github/workflows/{name}"), body);
}

fn wf_risk(body: &str) -> WfPermissions {
    let (d, t) = dir();
    wf(&d, "w.yml", body);
    scan_workflows(&t).remove(0)
}

// ── Claude settings ──────────────────────────────────────────────────────────

#[test]
fn missing_or_invalid_settings_are_reported_as_not_found() {
    let (d, t) = dir();
    assert!(!scan_claude_settings(&t).found);
    write(&d, ".claude/settings.json", "{nope");
    assert!(!scan_claude_settings(&t).found);
}

#[test]
fn a_settings_file_with_only_deny_rules_does_not_crash_the_scan() {
    let (d, t) = dir();
    settings(&d, serde_json::json!({"permissions": {"deny": ["Bash(rm -rf*)"]}}));
    let ca = scan_claude_settings(&t);
    assert!(ca.found && !ca.dangerous);
    assert!(ca.shell.level.is_empty());
}

#[test]
fn allowed_tools_set_shell_read_and_write_levels() {
    let (d, t) = dir();
    settings(&d, serde_json::json!({"allowedTools": ["Bash", "Read", "Edit"]}));
    let ca = scan_claude_settings(&t);
    assert_eq!((ca.shell.level.as_str(), ca.file_read.level.as_str(), ca.file_write.level.as_str()), ("HIGH", "MEDIUM", "HIGH"));
    assert!(ca.dangerous);
}

#[test]
fn permission_patterns_set_shell_git_and_network_access() {
    let (d, t) = dir();
    settings(&d, serde_json::json!({"permissions": {"allow": ["Bash(ls)", "Bash(git push*)", "WebFetch"]}}));
    let ca = scan_claude_settings(&t);
    assert_eq!(ca.shell.level, "HIGH");
    assert!(ca.shell.detail.starts_with("2 Bash"), "{}", ca.shell.detail);
    assert_eq!((ca.git.level.as_str(), ca.network.level.as_str()), ("HIGH", "MEDIUM"));
    assert!(ca.dangerous);
}

#[test]
fn read_only_and_search_permissions_are_not_dangerous() {
    let (d, t) = dir();
    settings(&d, serde_json::json!({"allowedTools": ["Read"], "permissions": {"allow": ["WebSearch"]}}));
    let ca = scan_claude_settings(&t);
    assert!(!ca.dangerous);
    assert_eq!(ca.network.level, "MEDIUM");
}

// ── MCP servers ──────────────────────────────────────────────────────────────

#[test]
fn no_mcp_config_means_no_servers_and_both_locations_and_keys_are_read() {
    let (d, t) = dir();
    assert!(scan_mcp(&t).is_empty());
    write(&d, ".claude/mcp.json", r#"{"servers":{"docs":{"command":"x"}}}"#);
    assert_eq!(scan_mcp(&t)[0].name, "docs");
}

#[test]
fn an_unparseable_first_config_falls_through_to_the_next_location() {
    let (d, t) = dir();
    write(&d, ".mcp.json", "{oops");
    write(&d, ".claude/mcp.json", r#"{"mcpServers":{"docs":{"command":"x"}}}"#);
    assert_eq!(scan_mcp(&t).len(), 1);
}

#[test]
fn transport_is_explicit_then_stdio_for_a_command_then_unknown() {
    let (d, _) = dir();
    let s = mcp(&d, serde_json::json!({
        "a": {"transport": "sse", "url": "u"}, "b": {"command": "x"}, "c": {}
    }));
    let t = |n: &str| s.iter().find(|m| m.name == n).unwrap().transport.clone();
    assert_eq!((t("a").as_str(), t("b").as_str(), t("c").as_str()), ("sse", "stdio", "unknown"));
}

#[test]
fn capabilities_and_risk_follow_the_server_name() {
    let (d, _) = dir();
    let s = mcp(&d, serde_json::json!({
        "filesystem": {}, "github": {}, "postgres": {}, "playwright": {}, "brave-search": {}, "docs": {}
    }));
    let by = |n: &str| s.iter().find(|m| m.name == n).unwrap();
    assert_eq!(by("filesystem").risk, "HIGH");
    assert!(by("github").capabilities.contains(&"git-write".to_string()));
    assert!(by("postgres").capabilities.contains(&"db-write".to_string()));
    assert_eq!((by("playwright").capabilities.as_slice(), by("playwright").risk.as_str()), (&["browser-exec".to_string()][..], "HIGH"));
    assert_eq!(by("brave-search").risk, "MEDIUM");
    assert_eq!((by("docs").capabilities.as_slice(), by("docs").risk.as_str()), (&["unknown".to_string()][..], "LOW"));
}

#[test]
fn a_read_only_argument_drops_write_capabilities_and_a_write_argument_adds_one() {
    let (d, _) = dir();
    let s = mcp(&d, serde_json::json!({
        "files-ro": {"args": ["--read-only"]}, "docs": {"args": ["--allow-write"]}
    }));
    let by = |n: &str| s.iter().find(|m| m.name == n).unwrap();
    assert_eq!(by("files-ro").risk, "MEDIUM");
    assert!(!by("files-ro").capabilities.iter().any(|c| c.contains("write")));
    assert_eq!(by("docs").risk, "HIGH");
}

// ── workflow permissions ─────────────────────────────────────────────────────

#[test]
fn workflow_risk_scales_with_write_permissions_and_secrets() {
    let none = wf_risk("name: a\non: push\njobs: {}\n");
    assert_eq!((none.risk.as_str(), none.has_secrets, none.write_perms.len()), ("LOW", false, 0));
    assert_eq!(wf_risk("permissions:\n  contents: write\n").risk, "MEDIUM");
    assert_eq!(wf_risk("permissions:\n  contents: write\n  packages: write\n").risk, "HIGH");
    let secrets = wf_risk("env:\n  T: ${{ secrets.TOKEN }}\n");
    assert_eq!((secrets.risk.as_str(), secrets.has_secrets), ("MEDIUM", true));
}

#[test]
fn only_yml_and_yaml_files_are_scanned_and_a_missing_directory_is_empty() {
    let (d, t) = dir();
    assert!(scan_workflows(&t).is_empty());
    wf(&d, "a.yml", "x: 1\n");
    wf(&d, "b.yaml", "x: 1\n");
    wf(&d, "c.txt", "contents: write\n");
    let mut names: Vec<String> = scan_workflows(&t).into_iter().map(|w| w.file).collect();
    names.sort();
    assert_eq!(names, vec!["a.yml", "b.yaml"]);
}

#[test]
fn write_all_is_high_risk() {
    let w = wf_risk("name: x\non: push\npermissions: write-all\njobs:\n  a:\n    runs-on: x\n");
    assert_eq!(w.risk, "HIGH");
    assert!(w.write_perms.iter().any(|p| p == "write-all"));
}

#[test]
fn commented_out_permissions_are_not_counted() {
    let w = wf_risk("name: y\n# permissions:\n#   contents: write\n#   packages: write\njobs: {}\n");
    assert!(w.write_perms.is_empty());
    assert_eq!(w.risk, "LOW");
    let inline = wf_risk("name: y\npermissions: {}\n# contents: write # old\n");
    assert!(inline.write_perms.is_empty());
}

// ── roll-up and output ───────────────────────────────────────────────────────

fn server(risk: &str) -> McpServer {
    McpServer { name: "s".into(), transport: "stdio".into(), capabilities: vec![], risk: risk.into() }
}

fn workflow(risk: &str) -> WfPermissions {
    WfPermissions { file: "w.yml".into(), write_perms: vec![], has_secrets: false, risk: risk.into() }
}

#[test]
fn overall_risk_takes_the_highest_source_and_dangerous_settings_force_high() {
    let calm = ClaudeAccess::default();
    assert_eq!(overall_risk(&calm, &[], &[]), "LOW");
    assert_eq!(overall_risk(&calm, &[server("MEDIUM")], &[]), "MEDIUM");
    assert_eq!(overall_risk(&calm, &[], &[workflow("MEDIUM")]), "MEDIUM");
    assert_eq!(overall_risk(&calm, &[server("HIGH")], &[]), "HIGH");
    assert_eq!(overall_risk(&calm, &[], &[workflow("HIGH")]), "HIGH");
    let dangerous = ClaudeAccess { dangerous: true, ..Default::default() };
    assert_eq!(overall_risk(&dangerous, &[], &[]), "HIGH");
}

#[test]
fn the_report_renders_in_both_formats_for_a_tree_with_every_source() {
    let (d, t) = dir();
    settings(&d, serde_json::json!({"permissions": {"deny": ["x"], "allow": ["Bash(ls)"]}}));
    write(&d, ".mcp.json", r#"{"mcpServers":{"filesystem":{"command":"x"}}}"#);
    wf(&d, "w.yml", "permissions:\n  contents: write\nenv:\n  T: ${{ secrets.T }}\n");
    assert!(cmd_map(&t, false).is_ok());
    assert!(cmd_map(&t, true).is_ok());
    let (empty, te) = dir();
    let _keep = &empty;
    assert!(cmd_map(&te, false).is_ok());
}

#[test]
fn a_trailing_comment_and_a_commented_secret_are_not_counted() {
    let trailing = wf_risk("name: z\npermissions: {} # was contents: write\njobs: {}\n");
    assert!(trailing.write_perms.is_empty());
    assert_eq!(trailing.risk, "LOW");
    let secret = wf_risk("name: z\n# T: ${{ secrets.TOKEN }}\njobs: {}\n");
    assert!(!secret.has_secrets);
    assert_eq!(secret.risk, "LOW");
}
