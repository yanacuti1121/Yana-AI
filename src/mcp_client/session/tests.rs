//! `Session` against a real rmcp SERVER over an in-memory pipe: the protocol is
//! exercised for real, and no process or socket is involved.

use super::*;
use rmcp::model::{CallToolResult, ContentBlock, ListToolsResult, ServerCapabilities, ServerInfo, Tool};
use rmcp::service::RequestContext;
use rmcp::{ErrorData, RoleServer, ServerHandler};
use std::sync::Arc;

struct Fake;

fn schema() -> Arc<Map<String, Value>> {
    Arc::new(Map::new())
}

impl ServerHandler for Fake {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
    }

    async fn list_tools(&self, _: Option<rmcp::model::PaginatedRequestParams>, _: RequestContext<RoleServer>) -> Result<ListToolsResult, ErrorData> {
        let names = ["echo", "big", "fail", "slow", "multi", "rpc_error", "bad name", "semi;colon"];
        let tools = names.iter().map(|n| Tool::new(*n, "line one\nline two", schema())).collect();
        Ok(ListToolsResult { tools, ..Default::default() })
    }

    async fn call_tool(&self, request: rmcp::model::CallToolRequestParams, _: RequestContext<RoleServer>) -> Result<CallToolResult, ErrorData> {
        let args = request.arguments.unwrap_or_default();
        match request.name.as_ref() {
            "echo" => Ok(CallToolResult::success(vec![ContentBlock::text(args.get("text").and_then(Value::as_str).unwrap_or("").to_string())])),
            "big" => Ok(CallToolResult::success(vec![ContentBlock::text("x".repeat(MAX_RESULT_BYTES * 2))])),
            "fail" => Ok(CallToolResult::error(vec![ContentBlock::text("it broke")])),
            "multi" => Ok(CallToolResult::success(vec![ContentBlock::text("one"), ContentBlock::text("two")])),
            "slow" => {
                tokio::time::sleep(Duration::from_secs(30)).await;
                Ok(CallToolResult::success(vec![]))
            }
            _ => Err(ErrorData::internal_error("secret internal detail", None)),
        }
    }
}

fn limits(call_ms: u64) -> Limits {
    Limits { startup: Duration::from_secs(5), call: Duration::from_millis(call_ms) }
}

async fn connected(call_ms: u64) -> Session {
    let (client_io, server_io) = tokio::io::duplex(256 * 1024);
    tokio::spawn(async move {
        if let Ok(service) = Fake.serve(server_io).await {
            let _ = service.waiting().await;
        }
    });
    Session::start(client_io, None, limits(call_ms), "fake").await.unwrap()
}

#[tokio::test]
async fn tools_are_listed_with_clean_descriptions_and_odd_names_are_dropped() {
    let session = connected(2000).await;
    let tools = session.list_tools().await.unwrap();
    let names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();
    assert_eq!(names, ["echo", "big", "fail", "slow", "multi", "rpc_error"], "names a lease could not match as one token are dropped");
    assert!(tools.iter().all(|t| !t.description.contains('\n')), "descriptions are one line");
    session.close().await;
}

#[tokio::test]
async fn a_call_returns_the_servers_text() {
    let session = connected(2000).await;
    let out = session.call_tool("echo", &serde_json::json!({"text": "hello"})).await.unwrap();
    assert_eq!(out, ToolOutput { text: "hello".into(), truncated: false, is_error: false });
    let multi = session.call_tool("multi", &Value::Null).await.unwrap();
    assert_eq!(multi.text, "one\ntwo");
    session.close().await;
}

#[tokio::test]
async fn a_huge_result_is_cut_and_marked() {
    let session = connected(5000).await;
    let out = session.call_tool("big", &Value::Null).await.unwrap();
    assert!(out.truncated && out.text.len() == MAX_RESULT_BYTES, "{} bytes", out.text.len());
    session.close().await;
}

#[tokio::test]
async fn a_tool_that_reports_failure_is_marked_not_hidden() {
    let session = connected(2000).await;
    let out = session.call_tool("fail", &Value::Null).await.unwrap();
    assert!(out.is_error && out.text == "it broke");
    session.close().await;
}

#[tokio::test]
async fn a_slow_call_times_out_at_the_limit() {
    let session = connected(150).await;
    let started = std::time::Instant::now();
    let error = session.call_tool("slow", &Value::Null).await.unwrap_err();
    assert!(matches!(error, CapabilityError::Timeout { .. }), "{error:?}");
    assert!(started.elapsed() < Duration::from_secs(5), "{:?}", started.elapsed());
    session.close().await;
}

#[tokio::test]
async fn a_protocol_error_does_not_copy_the_servers_message() {
    let session = connected(2000).await;
    let error = session.call_tool("rpc_error", &Value::Null).await.unwrap_err();
    assert!(matches!(error, CapabilityError::External { .. }), "{error:?}");
    assert!(!error.to_string().contains("secret internal detail"), "{error}");
    session.close().await;
}

#[tokio::test]
async fn bad_tool_names_and_arguments_are_refused_before_anything_is_sent() {
    let session = connected(2000).await;
    for name in ["", "a b", "x;y", "../x", &"n".repeat(100)] {
        assert!(session.call_tool(name, &Value::Null).await.is_err(), "{name:?}");
    }
    assert!(session.call_tool("echo", &serde_json::json!([1, 2])).await.is_err(), "arguments must be an object");
    assert!(session.call_tool("echo", &serde_json::json!("text")).await.is_err());
    session.close().await;
}

#[test]
fn the_byte_cap_never_splits_a_multi_byte_character() {
    // "€" is 3 bytes and 65536 is not a multiple of 3, so the cut must step back.
    let block = ContentBlock::text("€".repeat(MAX_RESULT_BYTES));
    let out = output_of(&CallToolResult::success(vec![block]));
    assert!(out.truncated && out.text.len() <= MAX_RESULT_BYTES && out.text.len() > MAX_RESULT_BYTES - 3, "{} bytes", out.text.len());
    assert!(out.text.chars().all(|c| c == '€'), "no broken character at the end");
}

#[test]
fn non_text_content_is_named_never_included_and_structured_content_is_the_fallback() {
    let image = ContentBlock::image("AAAA", "image/png");
    let out = output_of(&CallToolResult::success(vec![ContentBlock::text("hi"), image]));
    assert_eq!(out.text, "hi\n[image content omitted]");
    let mut structured = CallToolResult::success(vec![]);
    structured.structured_content = Some(serde_json::json!({"k": 1}));
    assert_eq!(output_of(&structured).text, r#"{"k":1}"#);
}

/// A server that always claims there is another page.
struct Endless;

impl ServerHandler for Endless {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
    }

    async fn list_tools(&self, _: Option<rmcp::model::PaginatedRequestParams>, _: RequestContext<RoleServer>) -> Result<ListToolsResult, ErrorData> {
        let tools = (0..150).map(|n| Tool::new(format!("t{n}"), "d", schema())).collect();
        Ok(ListToolsResult { tools, next_cursor: Some("more".into()), ..Default::default() })
    }
}

#[tokio::test]
async fn a_server_that_never_stops_paging_is_cut_off_at_the_tool_limit() {
    let (client_io, server_io) = tokio::io::duplex(256 * 1024);
    tokio::spawn(async move {
        if let Ok(service) = Endless.serve(server_io).await {
            let _ = service.waiting().await;
        }
    });
    let session = Session::start(client_io, None, limits(5000), "endless").await.unwrap();
    let tools = session.list_tools().await.unwrap();
    assert_eq!(tools.len(), MAX_TOOLS, "stopped at the tool limit instead of paging forever");
    session.close().await;
}

#[tokio::test]
async fn a_single_message_over_the_size_limit_ends_the_session_instead_of_filling_memory() {
    use super::super::bounded::BoundedReader;
    use tokio::io::AsyncWriteExt;
    let (client_io, mut server_io) = tokio::io::duplex(64 * 1024);
    tokio::spawn(async move {
        // Never a newline: one endless "message".
        let chunk = vec![b'x'; 16 * 1024];
        for _ in 0..1000 {
            if server_io.write_all(&chunk).await.is_err() {
                return;
            }
        }
    });
    let (read, write) = tokio::io::split(client_io);
    let bounded = BoundedReader::new(read, 64 * 1024, 16 * 1024 * 1024);
    let started = std::time::Instant::now();
    let error = Session::start((bounded, write), None, limits(5000), "flood").await.err().unwrap();
    assert!(matches!(error, CapabilityError::External { .. } | CapabilityError::Timeout { .. }), "{error:?}");
    assert!(started.elapsed() < Duration::from_secs(4), "ended promptly: {:?}", started.elapsed());
}

#[tokio::test]
async fn something_that_is_not_an_mcp_server_fails_the_handshake_quickly() {
    let (client_io, server_io) = tokio::io::duplex(1024);
    drop(server_io);
    let error = Session::start(client_io, None, limits(1000), "dead").await.err().unwrap();
    assert!(matches!(error, CapabilityError::External { .. }), "{error:?}");
    let (client_io, _quiet) = tokio::io::duplex(1024);
    let silent = Limits { startup: Duration::from_millis(150), call: Duration::from_secs(1) };
    let error = Session::start(client_io, None, silent, "silent").await.err().unwrap();
    assert!(matches!(error, CapabilityError::Timeout { .. }), "a server that never answers: {error:?}");
}
