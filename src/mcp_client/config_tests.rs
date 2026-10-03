use super::config::*;
use crate::capability::CapabilityError;
use std::path::PathBuf;

fn root_with(json: &str) -> (tempfile::TempDir, PathBuf) {
    let outer = tempfile::tempdir().unwrap();
    let root = outer.path().join("ws");
    std::fs::create_dir_all(root.join(".yana-ai")).unwrap();
    std::fs::write(root.join(".yana-ai/mcp-servers.json"), json).unwrap();
    crate::capability::config_trust::trust_in_test(&root);
    (outer, root)
}

#[test]
fn a_valid_file_is_read_and_a_missing_one_means_no_servers() {
    let (_k, root) = root_with(r#"{"servers":[{"name":"github","command":"npx","args":["-y","pkg"],"env":["GITHUB_TOKEN"],"timeout_secs":20},{"name":"files","command":"/usr/bin/x"}]}"#);
    let servers = load_servers(&root).unwrap();
    assert_eq!(servers.len(), 2);
    assert_eq!(servers[0].command_line(), "npx -y pkg");
    assert_eq!(servers[0].timeout().as_secs(), 20);
    assert_eq!(servers[1].timeout().as_secs(), DEFAULT_TIMEOUT_SECS);
    let empty = tempfile::tempdir().unwrap();
    assert!(load_servers(empty.path()).unwrap().is_empty());
}

#[test]
fn invalid_entries_are_refused_whole() {
    let cases = [
        r#"{"servers":[{"name":"Has Space","command":"x"}]}"#,
        r#"{"servers":[{"name":"UPPER","command":"x"}]}"#,
        r#"{"servers":[{"name":"","command":"x"}]}"#,
        r#"{"servers":[{"name":"a","command":""}]}"#,
        r#"{"servers":[{"name":"a","command":"x\ny"}]}"#,
        r#"{"servers":[{"name":"a","command":"x","args":["a\u0007"]}]}"#,
        r#"{"servers":[{"name":"a","command":"x","env":["lower"]}]}"#,
        r#"{"servers":[{"name":"a","command":"x","env":[""]}]}"#,
        r#"{"servers":[{"name":"a","command":"x","timeout_secs":0}]}"#,
        r#"{"servers":[{"name":"a","command":"x","timeout_secs":9999}]}"#,
        r#"{"servers":[{"name":"a","command":"x"},{"name":"a","command":"y"}]}"#,
        r#"{"servers":"no"}"#,
        "not json",
        "",
    ];
    for json in cases {
        let (_k, root) = root_with(json);
        assert!(load_servers(&root).is_err(), "{json}");
    }
}

#[test]
fn an_oversized_file_and_an_unreadable_one_are_errors_not_empty() {
    let (_k, root) = root_with(&" ".repeat(70 * 1024));
    assert!(matches!(load_servers(&root), Err(CapabilityError::InvalidInput { .. })));
    let outer = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(outer.path().join(".yana-ai/mcp-servers.json")).unwrap();
    assert!(matches!(load_servers(outer.path()), Err(CapabilityError::Io { .. })), "a directory where the file should be");
}

#[test]
fn an_unlisted_server_is_not_found() {
    let (_k, root) = root_with(r#"{"servers":[{"name":"a","command":"x"}]}"#);
    assert!(find_server(&root, "a").is_ok());
    assert!(matches!(find_server(&root, "b"), Err(CapabilityError::NotFound { .. })));
}

#[test]
fn server_names_are_single_plain_tokens() {
    for ok in ["a", "github", "my-server_2"] {
        assert!(valid_server_name(ok), "{ok}");
    }
    for bad in ["", "A", "a b", "a/b", "a\"b", "a;b", &"n".repeat(33)] {
        assert!(!valid_server_name(bad), "{bad:?}");
    }
}

#[test]
fn variables_that_change_how_code_is_loaded_cannot_be_passed_on() {
    for name in ["LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES", "NODE_OPTIONS", "PYTHONPATH", "PATH", "BASH_ENV", "IFS"] {
        let (_k, root) = root_with(&format!(r#"{{"servers":[{{"name":"a","command":"x","env":["{name}"]}}]}}"#));
        assert!(load_servers(&root).is_err(), "{name}");
    }
    let (_k, root) = root_with(r#"{"servers":[{"name":"a","command":"x","env":["GITHUB_TOKEN","MY_SETTING"]}]}"#);
    assert!(load_servers(&root).is_ok());
}

#[test]
fn invisible_and_direction_characters_are_refused_in_what_an_approver_reads() {
    for bad in ["x\u{202e}y", "x\u{200b}y", "x\u{2028}y"] {
        let json = serde_json::json!({"servers": [{"name": "a", "command": bad}]}).to_string();
        let (_k, root) = root_with(&json);
        assert!(load_servers(&root).is_err(), "command {bad:?}");
        let json = serde_json::json!({"servers": [{"name": "a", "command": "x", "args": [bad]}]}).to_string();
        let (_k, root) = root_with(&json);
        assert!(load_servers(&root).is_err(), "arg {bad:?}");
    }
}

#[test]
fn a_command_line_or_variable_list_too_long_to_show_an_approver_is_refused() {
    let long_arg = "a".repeat(MAX_COMMAND_LINE_CHARS);
    let json = serde_json::json!({"servers": [{"name": "a", "command": "run", "args": [long_arg]}]}).to_string();
    let (_k, root) = root_with(&json);
    assert!(load_servers(&root).is_err(), "the whole command line is shown, so it must fit");
    let fits = "a".repeat(MAX_COMMAND_LINE_CHARS - 10);
    let json = serde_json::json!({"servers": [{"name": "a", "command": "run", "args": [fits]}]}).to_string();
    let (_k2, root2) = root_with(&json);
    assert!(load_servers(&root2).is_ok());
    let names: Vec<String> = (0..12).map(|n| format!("SOME_LONG_NAME_{n}")).collect();
    let json = serde_json::json!({"servers": [{"name": "a", "command": "run", "env": names}]}).to_string();
    let (_k3, root3) = root_with(&json);
    assert!(load_servers(&root3).is_err(), "the variable names are shown too");
}

#[test]
fn the_command_line_is_quoted_so_two_arguments_cannot_look_like_one() {
    let (_k, root) = root_with(r#"{"servers":[{"name":"a","command":"run","args":["b c"]},{"name":"b","command":"run","args":["b","c"]}]}"#);
    let servers = load_servers(&root).unwrap();
    assert_ne!(servers[0].command_line(), servers[1].command_line());
    assert_eq!(servers[0].command_line(), "run 'b c'");
}

#[test]
fn only_printable_ascii_is_allowed_in_what_an_approver_reads() {
    // A character is one terminal column only for ASCII; wide characters could push the call out of the prompt.
    for bad in ["x\u{4e2d}y", "caf\u{e9}", "x\u{a0}y", "x\ty"] {
        let json = serde_json::json!({"servers": [{"name": "a", "command": bad}]}).to_string();
        let (_k, root) = root_with(&json);
        assert!(load_servers(&root).is_err(), "command {bad:?}");
        let json = serde_json::json!({"servers": [{"name": "a", "command": "x", "args": [bad]}]}).to_string();
        let (_k2, root2) = root_with(&json);
        assert!(load_servers(&root2).is_err(), "arg {bad:?}");
    }
}
