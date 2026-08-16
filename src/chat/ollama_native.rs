//! Ollama's *native* REST API (`/api/tags`, `/api/ps`, `/api/pull`,
//! `/api/delete`) — distinct from `openai_compat::ollama()`, which only
//! covers the OpenAI-compatible chat/list-models surface every other
//! provider in this crate also uses. Pull/delete/running-status have no
//! equivalent on a cloud provider, so they live here as free functions
//! rather than `ChatProvider` trait methods — same reasoning that already
//! keeps `openai_compat::detect_ollama_model` a free function instead of
//! a trait method.
//!
//! Loopback only, matching `openai_compat::ollama()`'s own documented
//! constraint ("MVP does not accept a custom base-URL override — that
//! would reopen the SSRF surface `design::check_host_not_private` exists
//! to guard"): every request below targets a hardcoded
//! `127.0.0.1:11434`, never a caller-supplied host.
//!
//! Verification note: the parsing/formatting logic, and `list_installed`/
//! `running_models`'s HTTP-status handling (Section 8 fix below), are
//! tested against a real `std::net::TcpListener` on `127.0.0.1` speaking
//! hand-crafted HTTP/1.1 responses — not against a live Ollama daemon
//! itself, which this environment has none of reachable at startup, and
//! not a claim that Ollama's real wire behavior matches these fixtures in
//! every detail. The `Overlay`'s `item.split_whitespace().next()` id-recovery convention
//! (`tui/overlay.rs`) also assumes an Ollama tag never contains a space;
//! Ollama's own `namespace/name:tag` convention makes that safe in
//! practice, but nothing here enforces it against a daemon that returned
//! something unexpected.

use anyhow::{Context, Result};
use std::io::{BufRead, BufReader};
use std::time::Duration;

const BASE_URL: &str = "http://127.0.0.1:11434";

fn agent() -> ureq::Agent {
    let config = ureq::Agent::config_builder()
        .timeout_connect(Some(Duration::from_secs(5)))
        .timeout_recv_response(Some(Duration::from_secs(10)))
        .http_status_as_error(false)
        .build();
    ureq::Agent::new_with_config(config)
}

/// One entry from `GET /api/tags` — richer than the generic
/// `model::provider::ModelInfo` (which stays provider-agnostic and never
/// carries these fields), since only Ollama's native API reports them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OllamaModel {
    pub name: String,
    pub size_bytes: Option<u64>,
    pub parameter_size: Option<String>,
    pub quantization: Option<String>,
}

impl OllamaModel {
    /// One-line summary for the terminal chat's Models overlay row:
    /// `"<name>  <size>  <quant>"`. Never embeds a trailing space when a
    /// field is missing, so `item.split_whitespace().next()` (the same
    /// id-recovery convention the History overlay already uses) always
    /// gets back exactly `name`, nothing else.
    pub fn display_row(&self) -> String {
        let mut parts = vec![self.name.clone()];
        if let Some(bytes) = self.size_bytes {
            parts.push(format_size(bytes));
        }
        if let Some(quant) = &self.quantization {
            parts.push(quant.clone());
        }
        parts.join("  ")
    }
}

fn format_size(bytes: u64) -> String {
    const GB: f64 = 1e9;
    const MB: f64 = 1e6;
    let bytes = bytes as f64;
    if bytes >= GB {
        format!("{:.1}GB", bytes / GB)
    } else {
        format!("{:.0}MB", bytes / MB)
    }
}

fn parse_tags_response(body: &str) -> Result<Vec<OllamaModel>> {
    let parsed: serde_json::Value =
        serde_json::from_str(body).context("parsing /api/tags response as JSON")?;
    let models = parsed
        .get("models")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(models
        .iter()
        .filter_map(|entry| {
            let name = entry.get("name")?.as_str()?.to_string();
            let size_bytes = entry.get("size").and_then(serde_json::Value::as_u64);
            let details = entry.get("details");
            let parameter_size = details
                .and_then(|d| d.get("parameter_size"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_string);
            let quantization = details
                .and_then(|d| d.get("quantization_level"))
                .and_then(serde_json::Value::as_str)
                .map(str::to_string);
            Some(OllamaModel {
                name,
                size_bytes,
                parameter_size,
                quantization,
            })
        })
        .collect())
}

/// `GET /api/tags` — every model currently pulled to disk.
///
/// BUG FIX (Workstream A stabilization doc, Section 8, found + reproduced
/// live via `error_body_without_models_key_is_indistinguishable_from_genuine_empty`):
/// `agent()` sets `.http_status_as_error(false)`, so `.call()` succeeds and
/// returns normally even on a 404/500 — this function used to hand that
/// response straight to `parse_tags_response` without ever checking
/// `response.status()`. A real Ollama error body (`{"error": "..."}"`, no
/// "models" key) then silently became `Ok(vec![])` via
/// `unwrap_or_default()`, identical to a genuinely empty install. Fixed to
/// check status first and surface a real error with the response body,
/// matching `delete()`'s existing correct pattern below.
pub fn list_installed() -> Result<Vec<OllamaModel>> {
    list_installed_from(BASE_URL)
}

/// Split out from `list_installed()` so tests can point it at a real fake
/// HTTP server (`127.0.0.1:<ephemeral port>`) instead of the hardcoded
/// Ollama daemon address — the same test-seam shape `golden_e2e_tests.rs`
/// already established for `OpenAiCompatProvider`.
fn list_installed_from(base_url: &str) -> Result<Vec<OllamaModel>> {
    let mut response = agent()
        .get(format!("{base_url}/api/tags"))
        .call()
        .context("is the Ollama daemon running? (`ollama serve`)")?;
    if !response.status().is_success() {
        let detail = super::provider::read_error_body(&mut response);
        anyhow::bail!(
            "GET /api/tags failed ({}): {detail}",
            response.status().as_u16()
        );
    }
    let body = response
        .body_mut()
        .read_to_string()
        .context("reading /api/tags response body")?;
    parse_tags_response(&body)
}

fn parse_ps_response(body: &str) -> Result<Vec<String>> {
    let parsed: serde_json::Value =
        serde_json::from_str(body).context("parsing /api/ps response as JSON")?;
    let models = parsed
        .get("models")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(models
        .iter()
        .filter_map(|entry| entry.get("name")?.as_str().map(str::to_string))
        .collect())
}

/// `GET /api/ps` — models currently loaded into memory (i.e. actively
/// serving), a subset of `list_installed`'s result.
///
/// Same status-check fix as `list_installed()` above, and for the
/// identical reason: `parse_ps_response` has the same
/// `unwrap_or_default()` shape and would swallow a real error body the
/// same way.
pub fn running_models() -> Result<Vec<String>> {
    running_models_from(BASE_URL)
}

/// Same test-seam split as `list_installed_from()`.
fn running_models_from(base_url: &str) -> Result<Vec<String>> {
    let mut response = agent()
        .get(format!("{base_url}/api/ps"))
        .call()
        .context("is the Ollama daemon running? (`ollama serve`)")?;
    if !response.status().is_success() {
        let detail = super::provider::read_error_body(&mut response);
        anyhow::bail!(
            "GET /api/ps failed ({}): {detail}",
            response.status().as_u16()
        );
    }
    let body = response
        .body_mut()
        .read_to_string()
        .context("reading /api/ps response body")?;
    parse_ps_response(&body)
}

/// One line of `POST /api/pull`'s newline-delimited JSON progress stream
/// — a different wire shape from `provider::read_sse_stream`'s
/// `data: {...}\n\n` SSE framing, so this gets its own reader below
/// rather than misusing that helper.
#[derive(Debug, Clone)]
pub enum PullEvent {
    Status(String),
    Progress { status: String, percent: u8 },
    Done,
    Error(String),
}

fn parse_pull_line(line: &str) -> Option<PullEvent> {
    let value: serde_json::Value = serde_json::from_str(line).ok()?;
    if let Some(error) = value.get("error").and_then(serde_json::Value::as_str) {
        return Some(PullEvent::Error(error.to_string()));
    }
    let status = value.get("status").and_then(serde_json::Value::as_str)?;
    if status == "success" {
        return Some(PullEvent::Done);
    }
    let completed = value.get("completed").and_then(serde_json::Value::as_u64);
    let total = value.get("total").and_then(serde_json::Value::as_u64);
    match (completed, total) {
        (Some(completed), Some(total)) if total > 0 => Some(PullEvent::Progress {
            status: status.to_string(),
            percent: ((completed as f64 / total as f64) * 100.0).round() as u8,
        }),
        _ => Some(PullEvent::Status(status.to_string())),
    }
}

/// `POST /api/pull` — streams progress via `on_event` as the daemon
/// downloads `name`. Blocking; returns once the stream ends (success,
/// error, or connection drop).
pub fn pull(name: &str, mut on_event: impl FnMut(PullEvent)) -> Result<()> {
    let body = serde_json::json!({ "name": name });
    let pull_agent_config = ureq::Agent::config_builder()
        .timeout_connect(Some(Duration::from_secs(5)))
        // A real pull can take minutes for a large model — no response-
        // level timeout once the stream has started, matching this
        // crate's other long-lived streaming call (`provider::build_agent`'s
        // `timeout_recv_body`, generous by the same reasoning: real
        // per-line liveness is enforced by the caller reading events, not
        // by this timeout).
        .timeout_recv_response(Some(Duration::from_secs(30)))
        .http_status_as_error(false)
        .build();
    let response = ureq::Agent::new_with_config(pull_agent_config)
        .post(format!("{BASE_URL}/api/pull"))
        .send_json(&body)
        .context("is the Ollama daemon running? (`ollama serve`)")?;
    let reader = BufReader::new(response.into_body().into_reader());
    let mut saw_done = false;
    let mut last_error: Option<String> = None;
    for line in reader.lines() {
        let line = line.context("reading /api/pull response stream")?;
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Some(event) = parse_pull_line(line) else {
            continue;
        };
        match &event {
            PullEvent::Done => saw_done = true,
            PullEvent::Error(message) => last_error = Some(message.clone()),
            _ => {}
        }
        on_event(event);
    }
    if let Some(message) = last_error {
        anyhow::bail!("pull failed: {message}");
    }
    if !saw_done {
        anyhow::bail!("pull stream ended without a success status — connection dropped?");
    }
    Ok(())
}

/// `DELETE /api/delete` — removes an installed model.
pub fn delete(name: &str) -> Result<()> {
    let body = serde_json::json!({ "name": name });
    let mut response = agent()
        .delete(format!("{BASE_URL}/api/delete"))
        // DELETE has no body by default in ureq's typestate builder;
        // Ollama's native delete endpoint requires one (`{"name": ...}`).
        .force_send_body()
        .send_json(&body)
        .context("is the Ollama daemon running? (`ollama serve`)")?;
    if !response.status().is_success() {
        let detail = super::provider::read_error_body(&mut response);
        anyhow::bail!("delete failed ({}): {detail}", response.status().as_u16());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tags_response_with_full_and_partial_details() {
        let body = serde_json::json!({
            "models": [
                {
                    "name": "llama3.2:latest",
                    "size": 2_019_393_189u64,
                    "details": { "parameter_size": "3.2B", "quantization_level": "Q4_K_M" }
                },
                { "name": "no-details-model" }
            ]
        })
        .to_string();
        let models = parse_tags_response(&body).unwrap();
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].name, "llama3.2:latest");
        assert_eq!(models[0].size_bytes, Some(2_019_393_189));
        assert_eq!(models[0].quantization.as_deref(), Some("Q4_K_M"));
        assert_eq!(models[1].name, "no-details-model");
        assert_eq!(models[1].size_bytes, None);
        assert_eq!(models[1].quantization, None);
    }

    #[test]
    fn empty_tags_response_is_an_empty_list_not_an_error() {
        let body = serde_json::json!({ "models": [] }).to_string();
        assert_eq!(parse_tags_response(&body).unwrap(), vec![]);
    }

    /// REPRODUCTION (Workstream A stabilization doc, Section 8): a genuine
    /// Ollama error body — the real shape the daemon sends on a 404/500,
    /// e.g. for `/api/tags` failing — has no "models" key at all.
    /// `parse_tags_response` currently defaults that to an empty Vec via
    /// `unwrap_or_default()`, identical to a real empty install. This test
    /// demonstrates the parser-level ambiguity `list_installed()` inherits:
    /// it never checks `response.status()` before calling this function,
    /// so a live 500 with this exact body is silently reported to the
    /// caller as "0 models installed", not as a backend failure.
    #[test]
    fn error_body_without_models_key_is_indistinguishable_from_genuine_empty() {
        let error_body = serde_json::json!({
            "error": "model \"ghost\" not found, try pulling it first"
        })
        .to_string();
        let parsed = parse_tags_response(&error_body).unwrap();
        assert_eq!(
            parsed,
            vec![],
            "parse_tags_response silently swallows a genuine Ollama error body \
             into an empty list, identical to a real empty /api/tags response — \
             this is the exact ambiguity list_installed() must resolve by \
             checking response.status() before parsing, not something this \
             lower-level parser can fix on its own"
        );
    }

    #[test]
    fn display_row_omits_missing_fields_without_stray_whitespace() {
        let full = OllamaModel {
            name: "llama3.2:latest".to_string(),
            size_bytes: Some(2_000_000_000),
            parameter_size: Some("3.2B".to_string()),
            quantization: Some("Q4_K_M".to_string()),
        };
        assert_eq!(full.display_row(), "llama3.2:latest  2.0GB  Q4_K_M");

        let bare = OllamaModel {
            name: "no-details-model".to_string(),
            size_bytes: None,
            parameter_size: None,
            quantization: None,
        };
        assert_eq!(bare.display_row(), "no-details-model");
        // The id-recovery convention `activate_overlay_selection` relies on.
        assert_eq!(
            bare.display_row().split_whitespace().next(),
            Some("no-details-model")
        );
    }

    #[test]
    fn parses_ps_response() {
        let body = serde_json::json!({
            "models": [ { "name": "llama3.2:latest" }, { "name": "qwen2.5:7b" } ]
        })
        .to_string();
        assert_eq!(
            parse_ps_response(&body).unwrap(),
            vec!["llama3.2:latest".to_string(), "qwen2.5:7b".to_string()]
        );
    }

    #[test]
    fn empty_ps_response_is_an_empty_list() {
        let body = serde_json::json!({ "models": [] }).to_string();
        assert_eq!(parse_ps_response(&body).unwrap(), Vec::<String>::new());
    }

    #[test]
    fn parses_pull_progress_and_terminal_events() {
        assert!(matches!(
            parse_pull_line(r#"{"status":"pulling manifest"}"#),
            Some(PullEvent::Status(s)) if s == "pulling manifest"
        ));
        match parse_pull_line(r#"{"status":"downloading","completed":50,"total":200}"#) {
            Some(PullEvent::Progress { status, percent }) => {
                assert_eq!(status, "downloading");
                assert_eq!(percent, 25);
            }
            other => panic!("expected Progress, got {other:?}"),
        }
        assert!(matches!(
            parse_pull_line(r#"{"status":"success"}"#),
            Some(PullEvent::Done)
        ));
        assert!(matches!(
            parse_pull_line(r#"{"error":"model not found"}"#),
            Some(PullEvent::Error(e)) if e == "model not found"
        ));
        assert!(parse_pull_line("not json at all").is_none());
    }

    #[test]
    fn zero_total_falls_back_to_status_not_a_division_by_zero() {
        assert!(matches!(
            parse_pull_line(r#"{"status":"verifying digest","completed":0,"total":0}"#),
            Some(PullEvent::Status(s)) if s == "verifying digest"
        ));
    }

    // ── Live status-check regression tests (Workstream A, Section 8) ──────
    // Real HTTP/1.1 responses on a bound `127.0.0.1:0` listener, same
    // pattern `chat::tui::golden_e2e_tests` already established for
    // `OpenAiCompatProvider` — not a stub, an actual socket round-trip
    // through `list_installed_from`/`running_models_from`'s real ureq
    // agent.

    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;

    /// Serves exactly one request with the given raw status line and body,
    /// then stops listening. Returns the bound base URL
    /// (`http://127.0.0.1:<port>`) and a `JoinHandle` the caller joins so a
    /// server-side panic (e.g. the connection never arrived) fails the test
    /// instead of being silently swallowed.
    fn spawn_one_shot_response(
        status_line: &'static str,
        body: String,
    ) -> (String, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock ollama listener");
        let port = listener.local_addr().expect("local addr").port();
        let handle = std::thread::spawn(move || {
            let (stream, _) = listener.accept().expect("accept connection");
            // Drain the request line + headers so the client's write
            // doesn't block on an unread socket before it reads our
            // response — mirrors golden_e2e_tests::read_request_method's
            // reasoning, simplified since no test here needs the method.
            let mut reader = BufReader::new(&stream);
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).expect("read header line");
                if line == "\r\n" || line.is_empty() {
                    break;
                }
            }
            let mut writer = &stream;
            write!(
                writer,
                "{status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            .expect("write mock response");
            writer.flush().ok();
        });
        (format!("http://127.0.0.1:{port}"), handle)
    }

    #[test]
    fn list_installed_from_surfaces_a_real_500_as_an_error_not_empty_ok() {
        let error_body = serde_json::json!({
            "error": "model \"ghost\" not found, try pulling it first"
        })
        .to_string();
        let (base_url, handle) =
            spawn_one_shot_response("HTTP/1.1 500 Internal Server Error", error_body);
        let result = list_installed_from(&base_url);
        handle.join().expect("mock server thread panicked");
        let error = result.expect_err(
            "a live 500 with a real Ollama error body must surface as Err, \
             not silently become Ok(vec![]) as it did before the Section 8 fix",
        );
        let message = error.to_string();
        assert!(
            message.contains("500"),
            "error should mention the real HTTP status: {message}"
        );
    }

    #[test]
    fn list_installed_from_returns_models_on_a_real_200() {
        let body = serde_json::json!({
            "models": [{"name": "llama3.2:latest"}]
        })
        .to_string();
        let (base_url, handle) = spawn_one_shot_response("HTTP/1.1 200 OK", body);
        let models = list_installed_from(&base_url).expect("200 with valid body must succeed");
        handle.join().expect("mock server thread panicked");
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].name, "llama3.2:latest");
    }

    #[test]
    fn running_models_from_surfaces_a_real_404_as_an_error_not_empty_ok() {
        let error_body = serde_json::json!({ "error": "not found" }).to_string();
        let (base_url, handle) = spawn_one_shot_response("HTTP/1.1 404 Not Found", error_body);
        let result = running_models_from(&base_url);
        handle.join().expect("mock server thread panicked");
        let error = result.expect_err("a live 404 must surface as Err, not Ok(vec![])");
        assert!(error.to_string().contains("404"));
    }
}
