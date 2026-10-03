//! The chat approval flow for `mcp_call`: what is shown, what blocks it, and what
//! runs after `y`. Kept out of `tool_dispatch.rs`, which is already far over the
//! file-length limit.

use super::approval_test_support::*;
use super::tool_dispatch::ChatCapabilityExecutor;
use super::*;
use crate::capability::mcp_disclosure::Disclosure;
use crate::chat::tool_types::ToolCall;
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

fn mcp_call(command: &str, arguments: serde_json::Value) -> ToolCall {
    ToolCall { id: "call-m".into(), name: "mcp_call".into(), arguments_json: serde_json::json!({"command": command, "arguments": arguments}).to_string() }
}


fn one_server() -> serde_json::Value {
    serde_json::json!([{"name": "gh", "command": "npx", "args": ["-y", "a b"], "env": ["GITHUB_TOKEN"]}])
}

#[test]
fn an_mcp_call_waits_for_approval_showing_the_exact_command_line() {
    let (_k, root) = trusted_repo(one_server());
    let mut app = app_in(&root);
    app.prepare_pending_approval(mcp_call("gh search", serde_json::json!({"q": "rust"})));
    match &app.turn {
        TurnState::AwaitingApproval(pending @ PendingApproval::McpCall { command, disclosure, arguments, .. }) => {
            assert_eq!(command, "gh search");
            assert_eq!(disclosure.command_line(), "npx -y 'a b'", "quoted, so two arguments cannot pass for one");
            assert_eq!(disclosure.env_names, ["GITHUB_TOKEN"]);
            assert_eq!(arguments, &serde_json::json!({"q": "rust"}));
            assert_eq!(pending.summary_line(), "mcp gh search");
            assert!(!pending.is_guard_denied());
        }
        _ => panic!("expected AwaitingApproval(McpCall), status: {}", app.status),
    }
}

#[test]
fn a_call_that_cannot_be_disclosed_never_reaches_the_approval_prompt() {
    let (_k, root) = trusted_repo(one_server());
    let refused = |app_root: &std::path::Path, call: ToolCall, needle: &str| {
        let mut app = app_in(app_root);
        app.prepare_pending_approval(call);
        assert!(matches!(app.turn, TurnState::Idle), "{needle}: must not wait for approval");
        let result = last_tool_result(&app);
        assert!(result.is_error && result.output.contains(needle), "{needle}: {result:?}");
    };
    refused(&root, mcp_call("other", serde_json::Value::Null), "not listed");
    refused(&root, mcp_call("gh  search", serde_json::Value::Null), "command must be");
    refused(&root, mcp_call("gh\u{a0}search", serde_json::Value::Null), "is not a valid server name");
    refused(&root, mcp_call("gh search", serde_json::json!([1, 2])), "must be a JSON object");
    refused(&root, ToolCall { id: "c".into(), name: "mcp_call".into(), arguments_json: "{}".into() }, "missing required argument 'command'");
    // A cloned repository's list: present, never confirmed.
    let outer = tempfile::tempdir().unwrap();
    let hostile = outer.path().join("ws");
    std::fs::create_dir_all(hostile.join(".yana-ai")).unwrap();
    std::fs::write(hostile.join(".yana-ai/mcp-servers.json"), serde_json::json!({"servers": one_server()}).to_string()).unwrap();
    crate::capability::config_trust::empty_store_in_test();
    refused(&hostile, mcp_call("gh search", serde_json::Value::Null), "not trusted");
}

#[test]
fn approving_after_the_server_configuration_changed_is_refused_and_starts_nothing() {
    let (_k, root) = trusted_repo(one_server());
    let mut app = app_in(&root);
    app.prepare_pending_approval(mcp_call("gh search", serde_json::Value::Null));
    assert!(matches!(app.turn, TurnState::AwaitingApproval(_)));
    screen_of(&mut app, 100, 30); // the prompt is on screen before the person answers
    // Confirmed again (so this is not the trust check): the PROGRAM changed after the prompt was drawn.
    write_servers(&root, serde_json::json!([{"name": "gh", "command": "/tmp/evil", "args": []}]));
    app.handle_approval_key(KeyEvent::new(KeyCode::Char('y'), KeyModifiers::NONE));
    assert!(matches!(app.turn, TurnState::Idle), "nothing is executing");
    let result = last_tool_result(&app);
    assert!(result.is_error && result.denied && result.output.contains("changed since approval"), "{result:?}");
}

#[test]
fn declining_records_a_denial_and_starts_nothing() {
    let (_k, root) = trusted_repo(one_server());
    let mut app = app_in(&root);
    app.prepare_pending_approval(mcp_call("gh search", serde_json::Value::Null));
    app.handle_approval_key(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE));
    assert!(matches!(app.turn, TurnState::Idle));
    assert!(last_tool_result(&app).output.contains("declined"));
}

fn disclosure_for(root: &std::path::Path, command: &str) -> Disclosure {
    crate::capability::mcp_disclosure::disclose(root, command).unwrap()
}

fn run_approved(root: &std::path::Path, executor: &ChatCapabilityExecutor, command: &str) -> crate::model::tool::ToolResultRecord {
    use crate::runtime::{execute_approved_tool, CancellationToken, TurnContext, TurnOrigin, YanaAuthorityChain};
    let session = crate::session_context::SessionContext::new("s", root.to_path_buf(), "mock", "mock", false);
    let context = TurnContext::new(session, TurnOrigin::Terminal, true);
    execute_approved_tool(&YanaAuthorityChain, executor, &context, &mcp_call(command, serde_json::json!({})), &CancellationToken::default(), &mut |_| {}).unwrap()
}

#[cfg(all(feature = "mcp", unix))]
fn sh_repo(call_text: &str) -> (tempfile::TempDir, std::path::PathBuf) {
    let (k, root) = trusted_repo(serde_json::json!([]));
    std::fs::write(root.join("server.sh"), crate::mcp_client::gateway_tests::server_script(call_text)).unwrap();
    write_servers(&root, serde_json::json!([{"name": "fake", "command": "/bin/sh", "args": [root.join("server.sh").to_string_lossy()]}]));
    (k, root)
}

#[cfg(all(feature = "mcp", unix))]
#[test]
fn after_approval_the_executor_runs_exactly_the_approved_configuration() {
    let (_k, root) = sh_repo("pong");
    let approved = disclosure_for(&root, "fake echo");
    let result = run_approved(&root, &ChatCapabilityExecutor::new(false).with_approved_mcp(Some(approved)), "fake echo");
    assert!(!result.is_error && result.output.contains("pong") && result.output.contains("UNTRUSTED EXTERNAL CONTENT"), "{result:?}");
    // Without a handed-over disclosure (a resumed remote approval) it is disclosed again first.
    let resumed = run_approved(&root, &ChatCapabilityExecutor::new(false), "fake echo");
    assert!(!resumed.is_error && resumed.output.contains("pong"), "{resumed:?}");
}

#[cfg(all(feature = "mcp", unix))]
#[test]
fn a_program_swapped_after_approval_does_not_run_even_if_the_new_one_was_confirmed() {
    let marker = tempfile::tempdir().unwrap();
    let marker_path = marker.path().join("started");
    let (_k, root) = sh_repo("pong");
    let approved = disclosure_for(&root, "fake echo");
    std::fs::write(root.join("evil.sh"), format!("#!/bin/sh\ntouch {}\n", marker_path.display())).unwrap();
    write_servers(&root, serde_json::json!([{"name": "fake", "command": "/bin/sh", "args": [root.join("evil.sh").to_string_lossy()]}]));
    let result = run_approved(&root, &ChatCapabilityExecutor::new(false).with_approved_mcp(Some(approved)), "fake echo");
    assert!(result.is_error && result.output.contains("not what was approved"), "{result:?}");
    assert!(!marker_path.exists(), "the swapped program must not have run");
}

#[cfg(not(feature = "mcp"))]
#[test]
fn a_build_without_the_client_refuses_at_the_authority_chain_before_anything_starts() {
    use crate::runtime::{execute_approved_tool, CancellationToken, TurnContext, TurnOrigin, YanaAuthorityChain};
    let (_k, root) = trusted_repo(one_server());
    let session = crate::session_context::SessionContext::new("s", root.clone(), "mock", "mock", false);
    let context = TurnContext::new(session, TurnOrigin::Terminal, true);
    let error = execute_approved_tool(&YanaAuthorityChain, &ChatCapabilityExecutor::new(false), &context, &mcp_call("gh search", serde_json::json!({})), &CancellationToken::default(), &mut |_| {})
        .unwrap_err()
        .to_string();
    assert!(error.contains("unavailable in this session") || error.contains("mcp.call"), "{error}");
}

#[test]
fn an_mcp_call_is_never_executed_without_approval() {
    let (_k, root) = trusted_repo(one_server());
    let session = crate::session_context::SessionContext::new("s", root.clone(), "mock", "mock", false);
    let context = crate::runtime::TurnContext::new(session, crate::runtime::TurnOrigin::Terminal, true);
    use crate::runtime::ToolExecutor;
    let result = ChatCapabilityExecutor::new(false).execute(&context, &mcp_call("gh search", serde_json::Value::Null));
    assert!(result.is_error && result.output.contains("no implementation"), "{result:?}");
}

#[test]
fn an_mcp_call_whose_arguments_do_not_fit_the_prompt_cannot_be_approved() {
    let (_k, root) = trusted_repo(one_server());
    let mut app = app_in(&root);
    app.prepare_pending_approval(mcp_call("gh search", serde_json::json!({"q": "x".repeat(1500)})));
    assert!(matches!(app.turn, TurnState::AwaitingApproval(PendingApproval::McpCall { .. })), "{}", app.status);
    let screen = screen_of(&mut app, 100, 40);
    assert!(app.shown_whole_call.is_none() && screen.contains("arguments too long") && !screen.contains("[y]es"), "{screen}");
    press(&mut app, 'y');
    assert!(matches!(app.turn, TurnState::AwaitingApproval(_)) && app.status.contains("not shown in full"), "{}", app.status);
    // Short arguments, on the same terminal, are shown whole and the key is accepted past the gate.
    app.turn = TurnState::Idle;
    app.prepare_pending_approval(mcp_call("gh search", serde_json::json!({"q": "rust"})));
    screen_of(&mut app, 100, 40);
    assert!(app.shown_whole_call.is_some());
}
