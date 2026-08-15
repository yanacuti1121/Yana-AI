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
//! Verification note: the parsing/formatting logic here is fixture-tested
//! (`#[cfg(test)] mod tests` below), not live-tested against a real
//! Ollama daemon — this environment has none reachable at startup. The
//! `Overlay`'s `item.split_whitespace().next()` id-recovery convention
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
pub fn list_installed() -> Result<Vec<OllamaModel>> {
    let mut response = agent()
        .get(format!("{BASE_URL}/api/tags"))
        .call()
        .context("is the Ollama daemon running? (`ollama serve`)")?;
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
pub fn running_models() -> Result<Vec<String>> {
    let mut response = agent()
        .get(format!("{BASE_URL}/api/ps"))
        .call()
        .context("is the Ollama daemon running? (`ollama serve`)")?;
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
}
