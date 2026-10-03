//! The session against REAL child processes: a small `sh` script that speaks just
//! enough LSP. No network, no real language server.

use super::*;
use crate::lsp_client::operation::{parse_query, Operation};
use crate::mcp_client::gateway_tests::{is_dead, wait_for};
use std::path::PathBuf;
use std::time::Instant as StdInstant;

const SOURCE: &str = "pub fn alpha() {}\nlet beta = alpha();\n";

/// Shell helpers: `read_frame` appends each message body it receives to $LOG, and
/// `send` writes one framed message.
const HELPERS: &str = r#"
read_frame() {
  len=0
  while IFS= read -r line; do
    line=$(printf '%s' "$line" | tr -d '\r')
    [ -z "$line" ] && break
    case "$line" in Content-Length:*) len=$(printf '%s' "$line" | tr -dc 0-9);; esac
  done
  # dd with one-byte reads: head would read a whole buffer and swallow the next messages.
  if [ "$len" -gt 0 ]; then dd bs=1 count="$len" 2>/dev/null >> "$LOG"; echo >> "$LOG"; fi
}
send() { body="$1"; printf 'Content-Length: %d\r\n\r\n%s' "${#body}" "$body"; }
"#;

struct Fixture {
    _outer: tempfile::TempDir,
    root: PathBuf,
    log: PathBuf,
}

fn fixture() -> Fixture {
    let outer = tempfile::tempdir().unwrap();
    let root = outer.path().canonicalize().unwrap().join("repo");
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src/lib.rs"), SOURCE).unwrap();
    let log = outer.path().canonicalize().unwrap().join("received.log");
    Fixture { _outer: outer, root, log }
}

impl Fixture {
    fn script(&self, body: &str) -> PathBuf {
        let path = self.root.join("server.sh");
        std::fs::write(&path, format!("#!/bin/sh\nLOG='{}'\n{HELPERS}\n{body}\n", self.log.display())).unwrap();
        path
    }

    fn config(&self, script: &Path, timeout: u64) -> ServerConfig {
        ServerConfig {
            name: "rust".into(),
            command: "/bin/sh".into(),
            args: vec![script.to_string_lossy().into_owned()],
            env: Vec::new(),
            timeout_secs: Some(timeout),
        }
    }

    fn uri(&self, file: &str) -> String {
        url::Url::from_file_path(self.root.join(file)).unwrap().to_string()
    }

    fn received(&self) -> Vec<Value> {
        std::fs::read_to_string(&self.log).unwrap_or_default().lines().filter(|l| !l.is_empty()).map(|l| serde_json::from_str(l).unwrap()).collect()
    }
}

fn query(operation: &str, path: &str, line: u32, character: u32) -> Query {
    parse_query(&json!({"server": "rust", "operation": operation, "path": path, "line": line, "character": character})).unwrap()
}

/// A server that answers initialize, one question (with `answer`), and shutdown.
fn answering(answer: &str) -> String {
    format!(
        r#"
read_frame; send '{{"jsonrpc":"2.0","id":1,"result":{{"capabilities":{{}}}}}}'
read_frame
read_frame
read_frame; send '{{"jsonrpc":"2.0","id":2,"result":{answer}}}'
read_frame; send '{{"jsonrpc":"2.0","id":3,"result":null}}'
read_frame
"#
    )
}

#[test]
fn a_real_server_is_asked_in_the_right_order_with_the_right_content() {
    let fx = fixture();
    let location = format!(r#"{{"uri":"{}","range":{{"start":{{"line":0,"character":7}},"end":{{"line":0,"character":12}}}}}}"#, fx.uri("src/lib.rs"));
    let script = fx.script(&answering(&location));
    let result = run_query_blocking(&fx.config(&script, 10), &fx.root, &query("definition", "src/lib.rs", 2, 12)).unwrap();
    assert_eq!(result["range"]["start"], json!({"line": 0, "character": 7}));

    let received = fx.received();
    let methods: Vec<&str> = received.iter().map(|m| m["method"].as_str().unwrap()).collect();
    // `exit` is sent and the process is killed right after, so a slow server may not log it.
    let expected = ["initialize", "initialized", "textDocument/didOpen", "textDocument/definition", "shutdown"];
    assert!(methods == expected || (methods.len() == 6 && methods[..5] == expected && methods[5] == "exit"), "{methods:?}");
    let initialize = &received[0]["params"];
    assert_eq!(initialize["rootUri"], fx.uri("").trim_end_matches('/'), "the root is the repository");
    assert_eq!(initialize["capabilities"]["workspace"]["applyEdit"], false, "this client says it cannot edit");
    let open = &received[2]["params"]["textDocument"];
    assert_eq!((open["languageId"].as_str(), open["text"].as_str(), open["uri"].as_str()), (Some("rust"), Some(SOURCE), Some(fx.uri("src/lib.rs").as_str())));
    assert_eq!(received[3]["params"]["position"], json!({"line": 1, "character": 11}), "line 2, column 12 of the file, zero-based");
    assert_eq!(received[3]["params"]["textDocument"]["uri"], fx.uri("src/lib.rs"));
}

#[test]
fn a_document_symbols_question_needs_no_position() {
    let fx = fixture();
    let script = fx.script(&answering(r#"[{"name":"alpha","kind":12,"range":{"start":{"line":0,"character":0},"end":{"line":0,"character":17}}}]"#));
    let query = parse_query(&json!({"server": "rust", "operation": "document_symbols", "path": "src/lib.rs"})).unwrap();
    assert_eq!(query.operation, Operation::DocumentSymbols);
    let result = run_query_blocking(&fx.config(&script, 10), &fx.root, &query).unwrap();
    assert_eq!(result[0]["name"], "alpha");
    assert_eq!(fx.received()[3]["method"], "textDocument/documentSymbol");
}

#[test]
fn a_server_that_asks_the_client_to_edit_a_file_is_told_no_and_the_file_is_untouched() {
    let fx = fixture();
    let edit = format!(r#"{{"jsonrpc":"2.0","id":"e1","method":"workspace/applyEdit","params":{{"edit":{{"changes":{{"{}":[{{"range":{{"start":{{"line":0,"character":0}},"end":{{"line":0,"character":3}}}},"newText":"HACKED"}}]}}}}}}}}'"#, fx.uri("src/lib.rs"));
    let script = fx.script(&format!(
        r#"
read_frame; send '{{"jsonrpc":"2.0","id":1,"result":{{"capabilities":{{}}}}}}'
read_frame
read_frame
send '{edit}
read_frame
read_frame; send '{{"jsonrpc":"2.0","id":2,"result":null}}'
read_frame; send '{{"jsonrpc":"2.0","id":3,"result":null}}'
read_frame
"#
    ));
    // The server speaks first once it has the document: the edit request arrives while the client waits for its answer.
    run_query_blocking(&fx.config(&script, 10), &fx.root, &query("hover", "src/lib.rs", 1, 1)).ok();
    let log = std::fs::read_to_string(&fx.log).unwrap();
    assert!(log.contains(r#""applied":false"#), "the client's reply to the edit request says it was not applied: {log}");
    assert_eq!(std::fs::read_to_string(fx.root.join("src/lib.rs")).unwrap(), SOURCE, "the file is exactly as it was");
}

#[test]
fn a_server_that_never_answers_times_out_and_is_gone() {
    let fx = fixture();
    let pid_file = fx.root.join("pid");
    let script = fx.script(&format!("echo $$ > '{}'\nread_frame\nsleep 60\n", pid_file.display()));
    let started = StdInstant::now();
    let error = run_query_blocking(&fx.config(&script, 1), &fx.root, &query("hover", "src/lib.rs", 1, 1)).unwrap_err();
    assert!(matches!(error, CapabilityError::Timeout { .. }), "{error:?}");
    assert!(started.elapsed() < Duration::from_secs(10), "{:?}", started.elapsed());
    let pid = wait_for(&pid_file);
    assert!(is_dead(&pid), "the server (pid {pid}) must be gone");
}

#[test]
fn what_the_server_started_is_killed_with_it() {
    let fx = fixture();
    let helper_file = fx.root.join("helper");
    let body = format!("sleep 60 &\necho $! > '{}'\n{}", helper_file.display(), answering("null"));
    let script = fx.script(&body);
    run_query_blocking(&fx.config(&script, 10), &fx.root, &query("hover", "src/lib.rs", 1, 1)).unwrap();
    let helper = wait_for(&helper_file);
    let deadline = StdInstant::now() + Duration::from_secs(3);
    while StdInstant::now() < deadline && !is_dead(&helper) {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(is_dead(&helper), "the helper (pid {helper}) must be gone too");
}

#[test]
fn a_server_that_exits_at_once_or_cannot_be_started_is_an_error_not_a_hang() {
    let fx = fixture();
    let quit = fx.script("exit 0");
    let started = StdInstant::now();
    assert!(run_query_blocking(&fx.config(&quit, 30), &fx.root, &query("hover", "src/lib.rs", 1, 1)).is_err());
    assert!(started.elapsed() < Duration::from_secs(10), "the closed pipe is noticed, not waited out");
    let mut missing = fx.config(&quit, 5);
    missing.command = "/nonexistent/language-server".into();
    let error = run_query_blocking(&missing, &fx.root, &query("hover", "src/lib.rs", 1, 1)).unwrap_err();
    assert!(matches!(error, CapabilityError::SpawnFailed { .. }), "{error:?}");
}

#[test]
fn a_file_or_line_that_cannot_be_used_is_refused_before_the_program_starts() {
    let fx = fixture();
    let marker = fx.root.join("started");
    let script = fx.script(&format!("echo started > '{}'\n{}", marker.display(), answering("null")));
    let config = fx.config(&script, 10);
    std::fs::write(fx.root.join("src/subdir_file"), "x").unwrap();
    for (path, line) in [("src/missing.rs", 1), ("src", 1), ("src/lib.rs", 99), ("src/lib.rs", 3)] {
        let error = run_query_blocking(&config, &fx.root, &query("hover", path, line, 1));
        assert!(error.is_err(), "{path}:{line}");
        assert!(!marker.exists(), "{path}:{line}: the program must not have been started");
    }
    // A path that leaves the repository never reaches the server either (parse refuses '..'; a symlink is caught on resolve).
    #[cfg(unix)]
    {
        let outside = fx.root.parent().unwrap().join("outside.rs");
        std::fs::write(&outside, "secret").unwrap();
        std::os::unix::fs::symlink(&outside, fx.root.join("src/link.rs")).unwrap();
        assert!(run_query_blocking(&config, &fx.root, &query("hover", "src/link.rs", 1, 1)).is_err());
        assert!(!marker.exists(), "a symlink out of the repository is refused before the server is started");
    }
}

#[test]
fn output_that_is_not_the_protocol_is_an_error_and_an_error_answer_reports_its_code() {
    let fx = fixture();
    let garbage = fx.script("printf 'hello, I am not a language server\\n'\nsleep 60");
    let error = run_query_blocking(&fx.config(&garbage, 10), &fx.root, &query("hover", "src/lib.rs", 1, 1)).unwrap_err().to_string();
    assert!(error.contains("malformed"), "{error}");
    let refusing = fx.script(
        r#"
read_frame; send '{"jsonrpc":"2.0","id":1,"result":{"capabilities":{}}}'
read_frame
read_frame
read_frame; send '{"jsonrpc":"2.0","id":2,"error":{"code":-32601,"message":"no such method"}}'
read_frame; send '{"jsonrpc":"2.0","id":3,"result":null}'
read_frame
"#,
    );
    let error = run_query_blocking(&fx.config(&refusing, 10), &fx.root, &query("references", "src/lib.rs", 1, 1)).unwrap_err().to_string();
    assert!(error.contains("-32601") && !error.contains("no such method"), "{error}");
}

#[test]
fn language_ids_follow_the_extension() {
    for (path, id) in [("a.rs", "rust"), ("a.PY", "python"), ("a.tsx", "typescript"), ("a.mjs", "javascript"), ("Makefile", "plaintext"), ("a.zig", "zig")] {
        assert_eq!(language_id(path), id, "{path}");
    }
}
