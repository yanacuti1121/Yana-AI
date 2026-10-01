//! Behavior tests for the doctor's file-based checks: .gitignore coverage,
//! Claude settings, MCP config, scanner rule files and hook wiring.
//! Each test builds a throwaway target directory; nothing reads the caller's
//! environment or real home.

use super::{
    check_claude_settings, check_gitignore, check_mcp_config, check_yana_ai_hooks_wired,
    check_yana_ai_scanners, count_hook_commands, Check,
};
use serde_json::json;
use std::fs;
use std::path::Path;
use tempfile::{tempdir, TempDir};

/// `check_claude_settings` flags configs that auto-approve more than this.
const MAX_AUTO_APPROVED_TOOLS: usize = 15;
/// `check_mcp_config` flags this many active servers as a large blast radius.
const BLAST_RADIUS_SERVERS: usize = 4;

fn write(dir: &Path, rel: &str, body: &str) {
    let path = dir.join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, body).unwrap();
}

fn target() -> (TempDir, String) {
    let dir = tempdir().unwrap();
    let path = dir.path().to_str().unwrap().to_string();
    (dir, path)
}

fn status(c: &Check) -> &'static str {
    c.status_name()
}

fn settings(dir: &Path, body: serde_json::Value) {
    write(dir, ".claude/settings.json", &body.to_string());
}

// ── Check helpers ────────────────────────────────────────────────────────────

#[test]
fn each_status_has_its_own_name_and_icon() {
    let checks = [Check::pass("l", "d"), Check::warn("l", "d", "f"), Check::fail("l", "d", "f"), Check::info("l", "d")];
    let names: Vec<&str> = checks.iter().map(status).collect();
    assert_eq!(names, vec!["OK", "WARN", "FAIL", "INFO"]);
    let icons: std::collections::HashSet<&str> = checks.iter().map(|c| c.icon()).collect();
    assert_eq!(icons.len(), 4);
    assert!(checks[0].fix.is_empty() && checks[3].fix.is_empty());
}

// ── .gitignore ───────────────────────────────────────────────────────────────

#[test]
fn gitignore_missing_file_warns() {
    let (_d, t) = target();
    let c = check_gitignore(&t);
    assert_eq!(status(&c), "WARN");
    assert!(c.detail.contains("not found"));
}

#[test]
fn gitignore_with_all_sensitive_patterns_passes() {
    let (d, t) = target();
    write(d.path(), ".gitignore", ".env\n*.pem\n*.key\ncredentials.json\ntoken.json\n");
    assert_eq!(status(&check_gitignore(&t)), "OK");
}

#[test]
fn gitignore_lists_exactly_the_missing_patterns() {
    let (d, t) = target();
    write(d.path(), ".gitignore", ".env\n*.pem\n");
    let c = check_gitignore(&t);
    assert_eq!(status(&c), "WARN");
    for missing in ["*.key", "credentials.json", "token.json"] {
        assert!(c.detail.contains(missing), "{missing} should be reported");
    }
    assert!(!c.detail.contains("*.pem"));
}

// ── Claude settings ──────────────────────────────────────────────────────────

#[test]
fn claude_settings_absent_is_informational() {
    let (_d, t) = target();
    assert_eq!(status(&check_claude_settings(&t)), "INFO");
}

#[test]
fn claude_settings_invalid_json_fails() {
    let (d, t) = target();
    write(d.path(), ".claude/settings.json", "{not json");
    assert_eq!(status(&check_claude_settings(&t)), "FAIL");
}

#[test]
fn claude_settings_flags_unrestricted_bash_in_both_spellings() {
    for entry in ["Bash(*)", "Bash"] {
        let (d, t) = target();
        settings(d.path(), json!({"permissions": {"allow": [entry]}}));
        let c = check_claude_settings(&t);
        assert_eq!(status(&c), "WARN", "{entry}");
        assert!(c.detail.contains("unrestricted Bash"));
    }
}

#[test]
fn claude_settings_scoped_bash_is_not_flagged() {
    let (d, t) = target();
    settings(d.path(), json!({"permissions": {"allow": ["Bash(git status)"]}}));
    assert_eq!(status(&check_claude_settings(&t)), "OK");
}

#[test]
fn claude_settings_flags_dangerously_allow_all() {
    let (d, t) = target();
    settings(d.path(), json!({"permissions": {"dangerouslyAllowAll": true}}));
    assert!(check_claude_settings(&t).detail.contains("dangerouslyAllowAll"));
    let (d2, t2) = target();
    settings(d2.path(), json!({"permissions": {"dangerouslyAllowAll": false}}));
    assert_eq!(status(&check_claude_settings(&t2)), "OK");
}

#[test]
fn claude_settings_flags_too_many_auto_approved_tools_only_past_the_limit() {
    let tools = |n: usize| (0..n).map(|i| format!("Tool{i}")).collect::<Vec<_>>();
    let (d, t) = target();
    settings(d.path(), json!({"permissions": {"allow": tools(MAX_AUTO_APPROVED_TOOLS)}}));
    assert_eq!(status(&check_claude_settings(&t)), "OK");
    let (d2, t2) = target();
    settings(d2.path(), json!({"permissions": {"allow": tools(MAX_AUTO_APPROVED_TOOLS + 1)}}));
    assert_eq!(status(&check_claude_settings(&t2)), "WARN");
}

// ── MCP config ───────────────────────────────────────────────────────────────

#[test]
fn mcp_absent_is_informational_and_all_known_locations_are_found() {
    let (_d, t) = target();
    assert_eq!(status(&check_mcp_config(&t)), "INFO");
    for rel in [".mcp.json", ".cursor/mcp.json", "mcp.json"] {
        let (d, t) = target();
        write(d.path(), rel, r#"{"mcpServers":{"docs":{"command":"docs-server"}}}"#);
        let c = check_mcp_config(&t);
        assert_eq!(status(&c), "OK", "{rel}");
        assert!(c.detail.contains("1 server"), "{rel}");
    }
}

#[test]
fn mcp_invalid_json_fails() {
    let (d, t) = target();
    write(d.path(), ".mcp.json", "{oops");
    assert_eq!(status(&check_mcp_config(&t)), "FAIL");
}

#[test]
fn mcp_database_server_without_read_only_warns_by_name_or_command() {
    let by_name = json!({"mcpServers": {"postgres": {"command": "tool"}}});
    let by_command = json!({"mcpServers": {"store": {"command": "mysql-mcp"}}});
    for cfg in [by_name, by_command] {
        let (d, t) = target();
        write(d.path(), ".mcp.json", &cfg.to_string());
        let c = check_mcp_config(&t);
        assert_eq!(status(&c), "WARN");
        assert!(c.detail.contains("read_only"));
    }
}

#[test]
fn mcp_database_server_with_read_only_true_passes() {
    let (d, t) = target();
    write(d.path(), ".mcp.json", &json!({"mcpServers": {"postgres": {"command": "x", "read_only": true}}}).to_string());
    assert_eq!(status(&check_mcp_config(&t)), "OK");
}

#[test]
fn mcp_many_servers_warn_about_blast_radius_only_at_the_threshold() {
    let servers = |n: usize| {
        let map: serde_json::Map<String, serde_json::Value> =
            (0..n).map(|i| (format!("srv{i}"), json!({"command": "run"}))).collect();
        json!({"mcpServers": map})
    };
    let (d, t) = target();
    write(d.path(), ".mcp.json", &servers(BLAST_RADIUS_SERVERS - 1).to_string());
    assert_eq!(status(&check_mcp_config(&t)), "OK");
    let (d2, t2) = target();
    write(d2.path(), ".mcp.json", &servers(BLAST_RADIUS_SERVERS).to_string());
    assert!(check_mcp_config(&t2).detail.contains("blast radius"));
}

// ── scanner rule files ───────────────────────────────────────────────────────

#[test]
fn scanners_missing_or_empty_directory_warns() {
    let (d, t) = target();
    assert_eq!(status(&check_yana_ai_scanners(&t)), "WARN");
    fs::create_dir(d.path().join("scanner")).unwrap();
    let c = check_yana_ai_scanners(&t);
    assert_eq!(status(&c), "WARN");
    assert!(c.detail.contains("no .yml"));
}

#[test]
fn scanners_count_only_yml_files() {
    let (d, t) = target();
    for f in ["a.yml", "b.yml", "notes.txt", "c.yaml"] {
        write(d.path(), &format!("scanner/{f}"), "x");
    }
    let c = check_yana_ai_scanners(&t);
    assert_eq!(status(&c), "OK");
    assert!(c.detail.starts_with("2 rule file"));
}

// ── hook wiring ──────────────────────────────────────────────────────────────

#[test]
fn hooks_missing_unparseable_or_absent_key_warn() {
    let (d, t) = target();
    assert_eq!(status(&check_yana_ai_hooks_wired(&t)), "WARN");
    write(d.path(), ".claude/settings.json", "{nope");
    assert!(check_yana_ai_hooks_wired(&t).detail.contains("Could not parse"));
    settings(d.path(), json!({"permissions": {}}));
    assert!(check_yana_ai_hooks_wired(&t).detail.contains("no hooks configured"));
}

#[test]
fn hooks_counts_commands_across_events() {
    let (d, t) = target();
    settings(d.path(), json!({"hooks": {
        "PreToolUse": [{"hooks": [{"command": "a"}, {"command": "b"}]}],
        "PostToolUse": [{"hooks": [{"command": "c"}]}],
    }}));
    let c = check_yana_ai_hooks_wired(&t);
    assert_eq!(status(&c), "OK");
    assert_eq!(c.detail, "3 hook(s) configured");
}

#[test]
fn hooks_empty_or_malformed_configuration_warns() {
    for hooks in [json!({}), json!({"PreToolUse": []}), json!("nope"), json!({"PreToolUse": "x"}), json!({"PreToolUse": [{"hooks": "x"}]})] {
        let (d, t) = target();
        settings(d.path(), json!({"hooks": hooks}));
        assert_eq!(status(&check_yana_ai_hooks_wired(&t)), "WARN", "{hooks}");
    }
}

#[test]
fn count_hook_commands_accepts_object_and_array_shapes_and_rejects_others() {
    let group = json!([{"hooks": [{"command": "a"}]}]);
    assert_eq!(count_hook_commands(&json!({"E": group.clone()})), Ok(1));
    assert_eq!(count_hook_commands(&group), Ok(1));
    assert!(count_hook_commands(&json!(5)).is_err());
    assert!(count_hook_commands(&json!({"E": {"hooks": []}})).is_err());
}
