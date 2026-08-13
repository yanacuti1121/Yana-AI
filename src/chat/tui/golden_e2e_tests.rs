//! Golden local-model E2E (AD-24): launch/controller → mock local provider
//! emits a real tool call → chat dispatch → capability `read_file` →
//! result returned to the provider → final answer → session persisted/
//! restored. No model download: only the remote endpoint is faked, as a
//! real HTTP/1.1 + SSE server on `std::net::TcpListener` speaking the
//! exact OpenAI-compatible wire shape `OpenAiCompatProvider` already
//! parses — the SSE framing, the tool-call accumulation, the dispatch to
//! `crate::capability::read_file_observation` (reading a real temp file,
//! not a stub), and the history JSONL round-trip are all the real code
//! paths. Lives under `chat::tui` (not a sibling of it) because it drives
//! `App::spawn_turn`/`handle_tool_calls` directly, both `pub(super)` to
//! `chat::tui` — no PTY, no compiled-binary black box, so it's picked up
//! by plain `cargo test --bin yana-rt` like every other unit test here.

use super::{App, TurnState};
use crate::chat::openai_compat::OpenAiCompatProvider;
use crate::chat::provider::ChatProvider;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Restores the process's working directory on drop, even on panic —
/// needed because `chat::history`'s storage location is anchored to
/// `std::env::current_dir()` with no override parameter (see
/// `history.rs::history_dir()`); this is the same class of `$PWD`
/// dependency `guard::blast_paths`'s tests already have, which is why
/// this whole test binary is required to run with `--test-threads=1`
/// (`.github/workflows/ci.yml`) — this test relies on that same
/// existing guarantee, not a new one.
struct CwdGuard {
    original: PathBuf,
}

impl CwdGuard {
    fn enter(new_dir: &std::path::Path) -> Self {
        let original = std::env::current_dir().expect("read current dir");
        std::env::set_current_dir(new_dir).expect("set current dir to temp repo");
        Self { original }
    }
}

impl Drop for CwdGuard {
    fn drop(&mut self) {
        let _ = std::env::set_current_dir(&self.original);
    }
}

/// Reads one HTTP/1.1 request off `stream` (request line + headers, then
/// exactly `Content-Length` more bytes if present), discarding the body,
/// and returns the request's method (`"GET"`/`"POST"`/...) — this test
/// only cares that a real request round-tripped and which kind it was,
/// not the exact body, since `OpenAiCompatProvider`'s own unit tests
/// already cover request shape.
fn read_request_method(stream: &TcpStream) -> String {
    let mut reader = BufReader::new(stream);
    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .expect("read request line");
    let method = request_line
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_string();

    let mut content_length = 0usize;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).expect("read header line");
        if line == "\r\n" || line.is_empty() {
            break;
        }
        if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
            content_length = value.trim().parse().unwrap_or(0);
        }
    }
    let mut body = vec![0u8; content_length];
    if content_length > 0 {
        reader.read_exact(&mut body).expect("read request body");
    }
    method
}

/// Minimal valid `/v1/models`-shaped response for `list_models()`'s real
/// HTTP GET — `App::new()` unconditionally spawns a background health-
/// probe thread that calls `provider.list_models()`, which for
/// `OpenAiCompatProvider` is a real network call, not a stub. That probe
/// races the actual chat POST for connections on this same mock listener;
/// routing by method (see `spawn_mock_local_provider`) rather than assuming
/// strict accept-order handles both correctly regardless of which arrives
/// first.
fn respond_models_list(mut stream: TcpStream) {
    let body = serde_json::json!({"data": [{"id": "golden-mock-model"}]}).to_string();
    write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
    .expect("write models-list response");
    stream.flush().ok();
}

/// Writes a minimal valid HTTP/1.1 SSE response and closes the connection
/// (body length signaled by connection close, a valid HTTP/1.1 mechanism —
/// no `Content-Length`/chunked framing needed for a stream whose length
/// isn't known ahead of time, same as a real SSE endpoint).
fn respond_sse(mut stream: TcpStream, sse_body: &str) {
    write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n{sse_body}"
    )
    .expect("write SSE response");
    stream.flush().ok();
}

fn sse_event(json: &serde_json::Value) -> String {
    format!("data: {json}\n\n")
}

fn tool_call_sse_body() -> String {
    [
        sse_event(&serde_json::json!({
            "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": null}]
        })),
        sse_event(&serde_json::json!({
            "choices": [{"index": 0, "delta": {"tool_calls": [{
                "index": 0, "id": "call_golden_1", "type": "function",
                "function": {"name": "read_file", "arguments": ""}
            }]}, "finish_reason": null}]
        })),
        sse_event(&serde_json::json!({
            "choices": [{"index": 0, "delta": {"tool_calls": [{
                "index": 0, "function": {"arguments": "{\"path\": \""}
            }]}, "finish_reason": null}]
        })),
        sse_event(&serde_json::json!({
            "choices": [{"index": 0, "delta": {"tool_calls": [{
                "index": 0, "function": {"arguments": "golden.txt\"}"}
            }]}, "finish_reason": null}]
        })),
        sse_event(&serde_json::json!({
            "choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls"}],
            "usage": {"prompt_tokens": 42, "completion_tokens": 7}
        })),
        "data: [DONE]\n\n".to_string(),
    ]
    .concat()
}

fn final_answer_sse_body(expected_final_answer: &str) -> String {
    [
        sse_event(&serde_json::json!({
            "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": null}]
        })),
        sse_event(&serde_json::json!({
            "choices": [{"index": 0, "delta": {"content": expected_final_answer}, "finish_reason": null}]
        })),
        sse_event(&serde_json::json!({
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 58, "completion_tokens": 5}
        })),
        "data: [DONE]\n\n".to_string(),
    ]
    .concat()
}

/// Serves the mock local provider on one background thread until both
/// chat-completions POSTs (tool-call round, then final-answer round) have
/// been answered. Routes every accepted connection by HTTP method rather
/// than assuming strict ordering: `App::new()`'s background health-probe
/// thread makes its own real GET to `list_models()`'s endpoint on this
/// same listener, and it can race either POST — see
/// `respond_models_list`'s doc comment. Returns the bound port and a
/// `JoinHandle` the caller joins at the end, so a panic/assertion failure
/// inside the server thread (e.g. malformed request) fails the test
/// instead of being silently swallowed.
fn spawn_mock_local_provider(
    expected_final_answer: &'static str,
) -> (u16, std::thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock provider listener");
    let port = listener.local_addr().expect("local addr").port();

    let handle = std::thread::spawn(move || {
        let mut chat_posts_served = 0u32;
        for incoming in listener.incoming() {
            let stream = incoming.expect("accept connection");
            let method = read_request_method(&stream);
            if method != "POST" {
                // Health-probe GET (or anything else) — answer it cleanly
                // and keep listening; it isn't one of the two turns under
                // test.
                respond_models_list(stream);
                continue;
            }
            chat_posts_served += 1;
            if chat_posts_served == 1 {
                // Round 1: propose `read_file` for "golden.txt", streamed
                // across several fragments the way a real provider
                // actually does it — exercises `ToolCallAccumulator`, not
                // a single pre-assembled call.
                respond_sse(stream, &tool_call_sse_body());
            } else {
                // Round 2: the chat pipeline re-invoked the model with the
                // real tool result appended — answer in plain text so
                // `finish_turn`'s `StreamOutcome::Text` path (not another
                // tool call) closes the turn. Done after this.
                respond_sse(stream, &final_answer_sse_body(expected_final_answer));
                break;
            }
        }
    });

    (port, handle)
}

fn mock_provider(port: u16) -> OpenAiCompatProvider {
    let url: &'static str =
        Box::leak(format!("http://127.0.0.1:{port}/v1/chat/completions").into_boxed_str());
    OpenAiCompatProvider {
        provider_name: "golden-e2e-mock",
        url,
        default_model: "golden-mock-model",
        keyless: true,
        env_var: "",
    }
}

/// Pumps `drain_stream_events` (the same function the real render loop
/// calls every tick) until the turn returns to `Idle` or `timeout`
/// elapses. A single turn here actually spans two real network
/// round-trips: the tool-call round finishes inside `finish_turn`'s own
/// call to `handle_tool_calls` -> `dispatch_read_file` -> `spawn_turn()`
/// again, all synchronously within one `StreamEvent::Done` match arm, so
/// one pump loop carries the whole pipeline through without extra
/// orchestration.
fn pump_until_idle(app: &mut App, timeout: Duration) {
    let deadline = Instant::now() + timeout;
    loop {
        super::drain_stream_events(app);
        if matches!(app.turn, TurnState::Idle) {
            return;
        }
        if Instant::now() > deadline {
            panic!(
                "turn did not reach Idle within {timeout:?} — status: {}",
                app.status
            );
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[test]
fn golden_e2e_local_model_tool_call_round_trip() {
    let repo = std::env::temp_dir().join(format!("yana-golden-e2e-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&repo).expect("create temp repo");
    let file_content = "golden e2e content, read for real";
    std::fs::write(repo.join("golden.txt"), file_content).expect("write golden.txt");

    // Anchors both `App::new`'s repo_root (Gate L5 for read_file) and, via
    // CwdGuard, `chat::history`'s storage location to this temp repo — the
    // whole point of this test is that nothing here is stubbed.
    let _cwd_guard = CwdGuard::enter(&repo);

    let expected_final_answer = "The file contains: golden e2e content, read for real";
    let (port, server_handle) = spawn_mock_local_provider(expected_final_answer);
    let provider: Arc<dyn ChatProvider> = Arc::new(mock_provider(port));

    let session_id = format!("golden-e2e-{}", uuid::Uuid::new_v4());
    let initial_history = vec![crate::chat::provider::ChatMessage::text(
        crate::chat::provider::Role::User,
        "What's in golden.txt?",
    )];

    let mut app = App::new(
        Arc::clone(&provider),
        "golden-mock-model".to_string(),
        None,
        None,
        session_id.clone(),
        initial_history,
        false, // verbose
        true, // resumed — skip the recent-sessions/workspace-restore side effects, not under test here
        false, // use_sandbox
    );

    app.spawn_turn();
    pump_until_idle(&mut app, Duration::from_secs(10));
    server_handle
        .join()
        .expect("mock provider server thread panicked");

    // ── Real components actually ran, not mock labels ──────────────────
    let history = &app.history;
    let tool_call = history
        .iter()
        .find_map(|m| m.tool_call.as_ref())
        .expect("history must contain the model's tool_call turn");
    assert_eq!(tool_call.name, "read_file");
    assert_eq!(tool_call.arguments_json, r#"{"path": "golden.txt"}"#);

    let tool_result = history
        .iter()
        .find_map(|m| m.tool_result.as_ref())
        .expect("history must contain the tool_result turn");
    assert!(
        !tool_result.is_error,
        "read_file must succeed against a real file"
    );
    assert_eq!(
        tool_result.output, file_content,
        "tool result must be the real bytes capability::read_file_observation read from disk, not a stub"
    );

    let final_answer = history
        .iter()
        .rev()
        .find(|m| m.tool_call.is_none() && m.tool_result.is_none() && !m.content.is_empty())
        .expect("history must contain a final plain-text assistant turn");
    assert_eq!(final_answer.content, expected_final_answer);

    // ── Session persisted/restored — the JSONL round-trip is real ──────
    let restored = crate::chat::history::load(&session_id).expect("reload session from disk");
    assert!(
        restored
            .iter()
            .any(|m| m.tool_call.as_ref().map(|c| c.name.as_str()) == Some("read_file")),
        "persisted history must contain the tool_call turn"
    );
    assert!(
        restored
            .iter()
            .any(|m| m.tool_result.as_ref().map(|r| r.output.as_str()) == Some(file_content)),
        "persisted history must contain the real tool_result content"
    );
    assert!(
        restored.iter().any(|m| m.content == expected_final_answer),
        "persisted history must contain the final answer"
    );

    std::fs::remove_dir_all(&repo).ok();
}
