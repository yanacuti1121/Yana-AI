//! The chat approval flow for `lsp_query`: what is shown, what blocks it, and what
//! runs after `y`.

use super::approval_test_support::*;
use super::tool_dispatch::ChatCapabilityExecutor;
use super::*;
use crate::chat::tool_types::ToolCall;
use crate::model::tool::ToolResultRecord;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const SOURCE: &str = "pub fn alpha() {}\nlet beta = alpha();\n";

fn lsp_call(operation: &str, path: &str, line: u32) -> ToolCall {
    ToolCall {
        id: "call-l".into(),
        name: "lsp_query".into(),
        arguments_json: json!({"server": "rust", "operation": operation, "path": path, "line": line, "character": 5}).to_string(),
    }
}

/// A repository with src/lib.rs and one listed server (the shell as a stand-in program), confirmed.
fn lsp_repo(args: Vec<String>) -> (tempfile::TempDir, PathBuf) {
    let outer = tempfile::tempdir().unwrap();
    let root = outer.path().canonicalize().unwrap().join("ws");
    std::fs::create_dir_all(root.join(".yana-ai")).unwrap();
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src/lib.rs"), SOURCE).unwrap();
    list(&root, "/bin/sh", args);
    (outer, root)
}

fn list(root: &Path, command: &str, args: Vec<String>) {
    let servers = json!({"servers": [{"name": "rust", "command": command, "args": args, "env": ["RUST_LOG"], "timeout_secs": 10, "extensions": ["rs"]}]});
    std::fs::write(root.join(".yana-ai/lsp-servers.json"), servers.to_string()).unwrap();
    crate::capability::config_trust::trust_in_test(root);
}

fn last(app: &App) -> ToolResultRecord {
    last_tool_result(app)
}

#[test]
fn an_lsp_query_waits_for_approval_showing_the_program_the_variables_and_the_question() {
    let (_k, root) = lsp_repo(vec!["-c".into(), "a b".into()]);
    let mut app = app_in(&root);
    app.prepare_pending_approval(lsp_call("hover", "src/lib.rs", 2));
    match &app.turn {
        TurnState::AwaitingApproval(pending @ PendingApproval::LspQuery { disclosure, .. }) => {
            assert_eq!(disclosure.command_line(), "/bin/sh -c 'a b'", "quoted, so two arguments cannot pass for one");
            assert_eq!(disclosure.env_names, ["RUST_LOG"]);
            assert_eq!(disclosure.question(), "hover at src/lib.rs:2:5");
            assert_eq!(pending.summary_line(), "lsp hover src/lib.rs");
            assert!(!pending.is_guard_denied());
        }
        _ => panic!("expected AwaitingApproval(LspQuery), status: {}", app.status),
    }
    let screen = screen_of(&mut app, 100, 40);
    assert!(app.shown_whole_call.is_some() && screen.contains("Ask this language server?") && screen.contains("/bin/sh -c 'a b'"), "{screen}");
}

#[test]
fn a_question_that_cannot_be_disclosed_never_reaches_the_approval_prompt() {
    let (_k, root) = lsp_repo(Vec::new());
    std::fs::write(root.join(".env"), "API_KEY=x\n").unwrap();
    let refused = |root: &Path, call: ToolCall, needle: &str| {
        let mut app = app_in(root);
        app.prepare_pending_approval(call);
        assert!(matches!(app.turn, TurnState::Idle), "{needle}: must not wait for approval");
        let result = last(&app);
        assert!(result.is_error && result.output.contains(needle), "{needle}: {result:?}");
    };
    refused(&root, ToolCall { arguments_json: json!({"server": "other", "operation": "hover", "path": "src/lib.rs", "line": 1, "character": 1}).to_string(), ..lsp_call("hover", "src/lib.rs", 1) }, "not listed");
    refused(&root, lsp_call("rename", "src/lib.rs", 1), "'operation' must be");
    refused(&root, lsp_call("hover", "src/missing.rs", 1), "cannot ask");
    refused(&root, lsp_call("hover", "src/lib.rs", 99), "beyond the end");
    refused(&root, lsp_call("hover", ".env", 1), "secrets");
    refused(&root, lsp_call("hover", "../outside.rs", 1), "relative to the repository");
    refused(&root, ToolCall { arguments_json: "{}".into(), ..lsp_call("hover", "src/lib.rs", 1) }, "missing required argument");
    crate::capability::config_trust::forget_all_trust_in_test();
    refused(&root, lsp_call("hover", "src/lib.rs", 1), "not trusted");
}

#[test]
fn approving_after_the_server_configuration_changed_is_refused_and_starts_nothing() {
    let (_k, root) = lsp_repo(Vec::new());
    let mut app = app_in(&root);
    app.prepare_pending_approval(lsp_call("hover", "src/lib.rs", 1));
    assert!(matches!(app.turn, TurnState::AwaitingApproval(_)));
    screen_of(&mut app, 100, 40); // the prompt is on screen before the person answers
    list(&root, "/tmp/evil", Vec::new()); // confirmed again, so this is not the trust check
    press(&mut app, 'y');
    assert!(matches!(app.turn, TurnState::Idle), "nothing is executing");
    let result = last(&app);
    assert!(result.is_error && result.denied && result.output.contains("changed since approval"), "{result:?}");
}

#[test]
fn declining_records_a_denial_and_starts_nothing() {
    let (_k, root) = lsp_repo(Vec::new());
    let mut app = app_in(&root);
    app.prepare_pending_approval(lsp_call("hover", "src/lib.rs", 1));
    press(&mut app, 'n');
    assert!(matches!(app.turn, TurnState::Idle));
    assert!(last(&app).output.contains("declined"));
}

#[test]
fn a_question_that_was_not_shown_whole_cannot_be_approved() {
    let (_k, root) = lsp_repo(Vec::new());
    let mut app = app_in(&root);
    app.prepare_pending_approval(lsp_call("hover", "src/lib.rs", 1));
    let screen = screen_of(&mut app, 60, 40); // narrower than the prompt accepts
    assert!(app.shown_whole_call.is_none() && screen.contains("too small") && !screen.contains("[y]es"), "{screen}");
    press(&mut app, 'y');
    assert!(matches!(app.turn, TurnState::AwaitingApproval(_)) && app.status.contains("not shown in full"), "{}", app.status);
    screen_of(&mut app, 100, 40);
    assert!(app.shown_whole_call.is_some(), "the same question on a wide terminal is shown whole");
}

#[test]
fn an_lsp_query_is_never_executed_without_approval_so_a_lease_cannot_run_it() {
    let (_k, root) = lsp_repo(Vec::new());
    let session = crate::session_context::SessionContext::new("s", root.clone(), "mock", "mock", false);
    let context = crate::runtime::TurnContext::new(session, crate::runtime::TurnOrigin::Terminal, true);
    use crate::runtime::ToolExecutor;
    let result = ChatCapabilityExecutor::new(false).execute(&context, &lsp_call("hover", "src/lib.rs", 1));
    assert!(result.is_error && result.output.contains("no implementation"), "{result:?}");
}

fn run_approved(root: &Path, executor: &ChatCapabilityExecutor, call: &ToolCall) -> ToolResultRecord {
    use crate::runtime::{execute_approved_tool, CancellationToken, TurnContext, TurnOrigin, YanaAuthorityChain};
    let session = crate::session_context::SessionContext::new("s", root.to_path_buf(), "mock", "mock", false);
    let context = TurnContext::new(session, TurnOrigin::Terminal, true);
    execute_approved_tool(&YanaAuthorityChain, executor, &context, call, &CancellationToken::default(), &mut |_| {}).unwrap()
}

#[cfg(all(feature = "mcp", unix))]
const HELPERS: &str = r#"
read_frame() {
  len=0
  while IFS= read -r line; do
    line=$(printf '%s' "$line" | tr -d '\r')
    [ -z "$line" ] && break
    case "$line" in Content-Length:*) len=$(printf '%s' "$line" | tr -dc 0-9);; esac
  done
  if [ "$len" -gt 0 ]; then dd bs=1 count="$len" 2>/dev/null >/dev/null; fi
}
send() { body="$1"; printf 'Content-Length: %d\r\n\r\n%s' "${#body}" "$body"; }
"#;

/// Lists a fake language server whose script answers the question with `answer`.
#[cfg(all(feature = "mcp", unix))]
fn serve(root: &Path, answer: &str) -> PathBuf {
    let marker = root.join("started");
    let script = root.join("server.sh");
    let body = format!(
        r#"#!/bin/sh
echo started > '{marker}'
{HELPERS}
read_frame; send '{{"jsonrpc":"2.0","id":1,"result":{{"capabilities":{{}}}}}}'
read_frame
read_frame
read_frame; send '{{"jsonrpc":"2.0","id":2,"result":{answer}}}'
read_frame; send '{{"jsonrpc":"2.0","id":3,"result":null}}'
read_frame
"#,
        marker = marker.display()
    );
    std::fs::write(&script, body).unwrap();
    list(root, "/bin/sh", vec![script.to_string_lossy().into_owned()]);
    marker
}

#[cfg(all(feature = "mcp", unix))]
#[test]
fn after_approval_the_executor_runs_exactly_the_approved_program() {
    let (_k, root) = lsp_repo(Vec::new());
    let marker = serve(&root, r#"{"contents":"fn alpha()"}"#);
    let call = lsp_call("hover", "src/lib.rs", 1);
    let approved = crate::capability::lsp_disclosure::disclose(&root, &serde_json::from_str::<Value>(&call.arguments_json).unwrap()).unwrap();
    let result = run_approved(&root, &ChatCapabilityExecutor::new(false).with_approved_lsp(Some(approved)), &call);
    assert!(!result.is_error && result.output.contains("fn alpha()") && result.output.contains("UNTRUSTED EXTERNAL CONTENT"), "{result:?}");
    assert!(marker.exists(), "the server really ran");
    // Without a handed-over disclosure (a resumed remote approval) it is disclosed again first.
    let resumed = run_approved(&root, &ChatCapabilityExecutor::new(false), &call);
    assert!(!resumed.is_error && resumed.output.contains("fn alpha()"), "{resumed:?}");
}

#[cfg(all(feature = "mcp", unix))]
#[test]
fn a_program_swapped_after_approval_does_not_run_even_if_the_new_one_was_confirmed() {
    let (_k, root) = lsp_repo(Vec::new());
    serve(&root, "null");
    let call = lsp_call("hover", "src/lib.rs", 1);
    let approved = crate::capability::lsp_disclosure::disclose(&root, &serde_json::from_str::<Value>(&call.arguments_json).unwrap()).unwrap();
    let evil = root.join("evil.sh");
    std::fs::write(&evil, format!("#!/bin/sh\ntouch '{}'\n", root.join("evil-ran").display())).unwrap();
    list(&root, "/bin/sh", vec![evil.to_string_lossy().into_owned()]);
    let result = run_approved(&root, &ChatCapabilityExecutor::new(false).with_approved_lsp(Some(approved)), &call);
    assert!(result.is_error && result.output.contains("not what was approved"), "{result:?}");
    assert!(!root.join("evil-ran").exists(), "the swapped program must not have run");
}

#[cfg(not(feature = "mcp"))]
#[test]
fn a_build_without_the_client_refuses_at_the_authority_chain_before_anything_starts() {
    use crate::runtime::{execute_approved_tool, CancellationToken, TurnContext, TurnOrigin, YanaAuthorityChain};
    let (_k, root) = lsp_repo(Vec::new());
    let session = crate::session_context::SessionContext::new("s", root.clone(), "mock", "mock", false);
    let context = TurnContext::new(session, TurnOrigin::Terminal, true);
    let error = execute_approved_tool(&YanaAuthorityChain, &ChatCapabilityExecutor::new(false), &context, &lsp_call("hover", "src/lib.rs", 1), &CancellationToken::default(), &mut |_| {})
        .unwrap_err()
        .to_string();
    assert!(error.contains("unavailable in this session") || error.contains("lsp.query"), "{error}");
}
