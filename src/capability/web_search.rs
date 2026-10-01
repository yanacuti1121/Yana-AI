//! `web.search` (WS3 T2, docs/contracts/ws3-tools.md 5).
//!
//! The backend is one JSON endpoint chosen by the user in
//! `<repo>/.yana-ai/web-search.json` (a SearXNG-style `GET <endpoint>?q=..&format=json`
//! answering `{"results":[{"title","url","content"}]}`). The model can neither
//! set nor change it. The query text leaves the machine, so the capability needs
//! human approval per call (registry). Results are untrusted data: they are
//! trimmed, then screened and wrapped by `untrusted::guard`.
//!
//! The API key, when one is needed, is read from the environment variable the
//! config NAMES; the key itself is never stored, logged, or put in an error.

use super::egress::{get_checked, system_resolver, Resolver, Transport, UreqTransport};
use super::error::CapabilityError;
use super::untrusted::guard;
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::Path;

const CONFIG_PATH: &str = ".yana-ai/web-search.json";
const MAX_QUERY_CHARS: usize = 300;
const DEFAULT_RESULTS: usize = 5;
const MAX_RESULTS: usize = 10;
const MAX_BODY_BYTES: usize = 256 * 1024;
const MAX_TITLE_CHARS: usize = 200;
const MAX_URL_CHARS: usize = 500;
const MAX_SNIPPET_CHARS: usize = 500;
const MAX_CONFIG_BYTES: usize = 16 * 1024;
/// Prefix a key variable name must have (see `key_variable`).
const KEY_PREFIX: &str = "YANA_SEARCH_";

#[derive(Debug, Clone, Deserialize)]
pub struct SearchConfig {
    pub endpoint: String,
    /// NAME of the environment variable holding a bearer key, if the backend needs one.
    #[serde(default)]
    pub api_key_env: Option<String>,
    #[serde(default)]
    pub max_results: Option<usize>,
}

fn invalid(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::InvalidInput { detail: detail.into() }
}

fn load_config(root: &Path) -> Result<SearchConfig, CapabilityError> {
    let path = root.join(CONFIG_PATH);
    let text = match fs::read_to_string(&path) {
        Ok(text) if text.len() <= MAX_CONFIG_BYTES => text,
        Ok(_) => return Err(invalid(format!("{CONFIG_PATH} is larger than {MAX_CONFIG_BYTES} bytes"))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(CapabilityError::Unsupported {
                detail: format!("web search is not configured: create {CONFIG_PATH} with an \"endpoint\" (https URL of a JSON search backend)"),
            })
        }
        Err(e) => return Err(CapabilityError::Io { detail: format!("read {CONFIG_PATH}: {e}") }),
    };
    serde_json::from_str(&text).map_err(|e| invalid(format!("{CONFIG_PATH} is not valid: {e}")))
}

/// The key variable must be one set aside for this tool. The config file lives
/// in the repository, so without this a cloned repo (or a rewritten file) could
/// name any secret in the environment and have it sent to a host of its choosing.
fn key_variable(config: &SearchConfig) -> Result<Option<&str>, CapabilityError> {
    match config.api_key_env.as_deref() {
        None => Ok(None),
        Some(name) if name.starts_with(KEY_PREFIX) && name.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_') => Ok(Some(name)),
        Some(_) => Err(invalid(format!("api_key_env must be an upper-case variable name starting with {KEY_PREFIX}"))),
    }
}

fn clean_query(query: &str) -> Result<String, CapabilityError> {
    let query = query.trim();
    if query.is_empty() {
        return Err(invalid("query must not be empty"));
    }
    if query.chars().count() > MAX_QUERY_CHARS {
        return Err(invalid(format!("query is longer than {MAX_QUERY_CHARS} characters")));
    }
    if query.chars().any(char::is_control) {
        return Err(invalid("query must not contain control characters"));
    }
    Ok(query.to_string())
}

/// Search with the config in `root`, the real network, and the real environment.
pub fn web_search(root: &Path, query: &str) -> Result<String, CapabilityError> {
    let config = load_config(root)?;
    let env = |name: &str| std::env::var(name).ok();
    search_with(&config, &UreqTransport, &system_resolver, &env, query)
}

/// Everything injectable, so tests use a fake transport, resolver and environment.
pub fn search_with(
    config: &SearchConfig,
    transport: &dyn Transport,
    resolve: Resolver<'_>,
    env: &dyn Fn(&str) -> Option<String>,
    query: &str,
) -> Result<String, CapabilityError> {
    let query = clean_query(query)?;
    let mut url = url::Url::parse(&config.endpoint).map_err(|e| invalid(format!("endpoint is not a valid URL: {e}")))?;
    url.query_pairs_mut().append_pair("q", &query).append_pair("format", "json");
    let mut headers = Vec::new();
    if let Some(name) = key_variable(config)? {
        let key = env(name).ok_or_else(|| invalid(format!("the environment variable {name} named in {CONFIG_PATH} is not set")))?;
        headers.push(("Authorization".to_string(), format!("Bearer {key}")));
    }
    let reply = get_checked(transport, resolve, url.as_str(), &headers, MAX_BODY_BYTES)?;
    if !(200..300).contains(&reply.status) {
        return Err(CapabilityError::External { detail: format!("the search backend answered HTTP {}", reply.status) });
    }
    let limit = config.max_results.unwrap_or(DEFAULT_RESULTS).clamp(1, MAX_RESULTS);
    let listing = render(&reply.body, limit)?;
    let wrapped = guard("web.search", &listing)?;
    // The backend host is part of the answer so it is visible where the query went.
    let backend = url.host_str().unwrap_or("?");
    super::encode("web.search", serde_json::json!({"query": query, "backend": backend, "content": wrapped}), false)
}

fn text_field(item: &Value, name: &str, max: usize) -> String {
    let raw = item.get(name).and_then(Value::as_str).unwrap_or("");
    let one_line: String = raw.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    one_line.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(max).collect()
}

/// A numbered list of at most `limit` results; entries without a usable http(s) URL are dropped.
fn render(body: &[u8], limit: usize) -> Result<String, CapabilityError> {
    let value: Value = serde_json::from_slice(body).map_err(|e| CapabilityError::External { detail: format!("the search backend sent invalid JSON: {e}") })?;
    let results = value.get("results").and_then(Value::as_array).ok_or_else(|| CapabilityError::External { detail: "the search backend's answer has no \"results\" list".into() })?;
    let mut entries: Vec<String> = Vec::new();
    for item in results {
        // A link that had to be cut is dropped rather than shown as a different, valid-looking URL.
        let raw = item.get("url").and_then(Value::as_str).unwrap_or("");
        let link = text_field(item, "url", MAX_URL_CHARS + 1);
        let usable = link.chars().count() <= MAX_URL_CHARS && link == raw && url::Url::parse(&link).is_ok_and(|u| matches!(u.scheme(), "http" | "https"));
        if !usable {
            continue;
        }
        let n = entries.len() + 1;
        entries.push(format!("{n}. {}\n   {link}\n   {}", text_field(item, "title", MAX_TITLE_CHARS), text_field(item, "content", MAX_SNIPPET_CHARS)));
        if n >= limit {
            break;
        }
    }
    if entries.is_empty() {
        return Ok("(no results)".to_string());
    }
    Ok(entries.join("\n"))
}

#[cfg(test)]
mod tests;
