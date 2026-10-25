//! End-to-end tests for `yana-rt mcp`: the real binary, a real stdio JSON-RPC session.
//!
//! Until these existed CI only ran `cargo check --features mcp`, so nothing ever proved the
//! server answers a request. Each test starts its own server in a throwaway workspace.
#![cfg(feature = "mcp")]

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::time::Duration;

const REPLY_TIMEOUT: Duration = Duration::from_secs(30); // a cold debug binary can be slow on CI

struct McpSession {
    child: Child,
    stdin: ChildStdin,
    lines: Receiver<String>,
    next_id: u64,
    _workspace: tempfile::TempDir,
    _home: tempfile::TempDir,
}

impl McpSession {
    fn start() -> Self {
        let workspace = tempfile::tempdir().expect("workspace tmpdir");
        let home = tempfile::tempdir().expect("home tmpdir");
        std::fs::write(workspace.path().join("sample.txt"), "hello from sample\n").unwrap();
        let mut child = Command::new(env!("CARGO_BIN_EXE_yana-rt"))
            .arg("mcp")
            .current_dir(workspace.path())
            .env("HOME", home.path()) // keeps any developer's real leases out of the test
            .env("YANA_LOCKING_PROTOCOL_MODE", "test")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("start yana-rt mcp");
        let stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let (sender, lines) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if sender.send(line).is_err() {
                    break;
                }
            }
        });
        let mut session = Self {
            child,
            stdin,
            lines,
            next_id: 0,
            _workspace: workspace,
            _home: home,
        };
        let init = session.request(
            "initialize",
            json!({"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "integration-test", "version": "0"}}),
        );
        assert!(
            init["result"]["serverInfo"].is_object(),
            "initialize reply: {init}"
        );
        session.notify("notifications/initialized");
        session
    }

    fn send(&mut self, message: &Value) {
        writeln!(self.stdin, "{message}").expect("write to mcp stdin");
        self.stdin.flush().expect("flush mcp stdin");
    }

    fn notify(&mut self, method: &str) {
        self.send(&json!({"jsonrpc": "2.0", "method": method, "params": {}}));
    }

    fn request(&mut self, method: &str, params: Value) -> Value {
        self.next_id += 1;
        let id = self.next_id;
        self.send(&json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params}));
        loop {
            let line = self
                .lines
                .recv_timeout(REPLY_TIMEOUT)
                .expect("mcp server did not answer in time");
            if let Ok(value) = serde_json::from_str::<Value>(&line) {
                if value["id"] == json!(id) {
                    return value;
                }
            }
        }
    }

    /// Calls one tool and returns (isError, concatenated text content).
    fn call(&mut self, name: &str, arguments: Value) -> (bool, String) {
        let reply = self.request("tools/call", json!({"name": name, "arguments": arguments}));
        let result = &reply["result"];
        let text = result["content"]
            .as_array()
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|part| part["text"].as_str())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_else(|| reply.to_string());
        (result["isError"].as_bool().unwrap_or(true), text)
    }
}

impl Drop for McpSession {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn handshake_lists_the_core_tools() {
    let mut mcp = McpSession::start();
    let reply = mcp.request("tools/list", json!({}));
    let names: Vec<&str> = reply["result"]["tools"]
        .as_array()
        .expect("tools array")
        .iter()
        .filter_map(|tool| tool["name"].as_str())
        .collect();
    for expected in [
        "check_command",
        "read_file",
        "repo_tree",
        "list_processes",
        "browser_fetch",
    ] {
        assert!(
            names.contains(&expected),
            "missing tool {expected}; got {names:?}"
        );
    }
}

#[test]
fn read_file_returns_content_and_refuses_to_leave_the_workspace() {
    let mut mcp = McpSession::start();
    let (is_error, text) = mcp.call("read_file", json!({"path": "sample.txt"}));
    assert!(
        !is_error && text.contains("hello from sample"),
        "read_file: {text}"
    );

    let (is_error, text) = mcp.call("read_file", json!({"path": "/etc/hosts"}));
    assert!(
        is_error && text.contains("escapes repository root"),
        "absolute path: {text}"
    );

    let (is_error, text) = mcp.call("repo_tree", json!({"path": "/"}));
    assert!(
        is_error && text.contains("escapes repository root"),
        "root tree: {text}"
    );
}

#[cfg(unix)]
#[test]
fn read_file_refuses_a_symlink_that_points_outside_the_workspace() {
    let mut mcp = McpSession::start();
    let link = mcp._workspace.path().join("outside");
    std::os::unix::fs::symlink("/etc/hosts", &link).unwrap();
    let (is_error, text) = mcp.call("read_file", json!({"path": "outside"}));
    assert!(
        is_error && text.contains("escapes repository root"),
        "symlink: {text}"
    );
}

#[test]
fn check_command_allows_plain_commands_and_denies_recursive_force_delete() {
    let mut mcp = McpSession::start();
    let (_, allowed) = mcp.call("check_command", json!({"command": "ls -la"}));
    assert!(allowed.contains("\"allow\""), "ls: {allowed}");
    for command in [
        "rm -rf /tmp/x",
        "sudo rm -rf /",
        "git push --force origin main",
        "eval 'rm -rf ~/x'",
    ] {
        let (_, verdict) = mcp.call("check_command", json!({"command": command}));
        assert!(
            verdict.contains("\"deny\""),
            "{command} should be denied, got {verdict}"
        );
    }
}

#[cfg(unix)]
#[test]
fn list_processes_answers_for_both_sort_keys() {
    // Regression: macOS `ps` rejected the Linux-style sort flag and every call failed.
    let mut mcp = McpSession::start();
    for sort in ["cpu", "memory"] {
        let (is_error, text) = mcp.call("list_processes", json!({"sort": sort, "limit": 5}));
        assert!(!is_error, "list_processes {sort}: {text}");
        let parsed: Value = serde_json::from_str(&text).expect("list_processes returns JSON");
        let rows = parsed["data"]["rows"].as_array().expect("rows");
        assert!(
            !rows.is_empty() && rows.len() <= 5,
            "{sort}: {} rows",
            rows.len()
        );
    }
}

#[test]
fn browser_fetch_is_refused_without_a_human_granted_lease() {
    let mut mcp = McpSession::start();
    let (is_error, text) = mcp.call("browser_fetch", json!({"url": "https://example.com"}));
    assert!(
        is_error,
        "browser_fetch must not run without a lease: {text}"
    );
    assert!(
        text.contains("lease grant"),
        "the refusal should say how a human grants access: {text}"
    );
}
