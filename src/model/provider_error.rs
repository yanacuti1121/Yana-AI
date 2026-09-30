//! Typed, classifiable provider errors (WS1 P1, see docs/contracts/ws1-provider.md).
//!
//! Adapters used to throw plain `anyhow` strings like
//! `"anthropic error (429): <body>"`. This module gives those failures a
//! kind the router can act on, while `Display` keeps the exact old text so
//! anything that prints or matches the message is unchanged. Callers recover
//! the typed error with `err.downcast_ref::<ProviderError>()`.

use std::fmt;
use std::time::Duration;

/// Longest error body kept, in bytes. Matches `read_error_body`'s own bound.
const MAX_DETAIL_BYTES: usize = 2048;
/// Longest `Retry-After` honored. A hostile or buggy upstream cannot park a
/// credential for longer than this.
const MAX_RETRY_AFTER: Duration = Duration::from_secs(3600);
/// Shortest run treated as a key when it starts with a known key prefix, so
/// ordinary words such as "sk-learn" are left alone.
const MIN_KEY_LEN: usize = 16;
const REDACTED: &str = "[redacted]";
/// Prefixes of well known API key formats (OpenAI and Anthropic `sk-`, Google
/// `AIza`, Groq `gsk_`, xAI `xai-`, Hugging Face `hf_`, GitHub `ghp_`, AWS `AKIA`).
const KEY_PREFIXES: [&str; 7] = ["sk-", "AIza", "gsk_", "xai-", "hf_", "ghp_", "AKIA"];
/// Words whose following value is a credential: the value is masked whatever it looks like.
const SECRET_MARKERS: [&str; 6] =
    ["bearer", "x-api-key", "x-goog-api-key", "api_key", "apikey", "api-key"];

const QUOTA_MARKERS: [&str; 4] = [
    "insufficient_quota",
    "credit balance is too low",
    "exceeded your current quota",
    "billing",
];
/// Bodies that say the key itself is bad even though the status is 400
/// (Gemini answers an invalid key with 400 and this text).
const BAD_KEY_MARKERS: [&str; 2] = ["api key not valid", "api_key_invalid"];
const CONTEXT_MARKERS: [&str; 5] = [
    "context_length_exceeded",
    "maximum context length",
    "prompt is too long",
    "exceeds the maximum number of tokens",
    "too many tokens",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderErrorKind {
    RateLimited,
    QuotaExhausted,
    ContextOverflow,
    Auth,
    Overloaded,
    ServerError,
    Timeout,
    Network,
    ModelNotFound,
    BadRequest,
    Unknown,
}

/// What a caller may do about an error. Advice only: the router decides.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RecoveryHint {
    pub retry_same: bool,
    pub rotate_credential: bool,
    pub fallback_provider: bool,
}

impl ProviderErrorKind {
    pub fn hint(self) -> RecoveryHint {
        use ProviderErrorKind::*;
        let (retry_same, rotate_credential, fallback_provider) = match self {
            RateLimited => (true, true, true),
            QuotaExhausted | Auth => (false, true, true),
            Overloaded | ServerError | Timeout | Network => (true, false, true),
            ModelNotFound => (false, false, true),
            ContextOverflow | BadRequest => (false, false, false),
            Unknown => (true, false, false),
        };
        RecoveryHint { retry_same, rotate_credential, fallback_provider }
    }
}

#[derive(Debug, Clone)]
pub struct ProviderError {
    pub kind: ProviderErrorKind,
    pub status: Option<u16>,
    pub provider: String,
    pub model: Option<String>,
    pub retry_after: Option<Duration>,
    detail: String,
    /// True for failures with no HTTP response (connect, timeout).
    transport: bool,
}

impl ProviderError {
    /// Build from a non-2xx HTTP response.
    pub fn from_http(provider: &str, status: u16, body: &str, retry_after: Option<Duration>) -> Self {
        Self {
            kind: classify_http(status, body),
            status: Some(status),
            provider: provider.to_string(),
            model: None,
            retry_after,
            detail: sanitize_detail(body),
            transport: false,
        }
    }

    /// Build from a failure that produced no HTTP response.
    pub fn from_transport(provider: &str, error: &ureq::Error) -> Self {
        Self {
            kind: classify_transport(error),
            status: None,
            provider: provider.to_string(),
            model: None,
            retry_after: None,
            detail: sanitize_detail(&error.to_string()),
            transport: true,
        }
    }

    pub fn with_model(mut self, model: &str) -> Self {
        self.model = Some(model.to_string());
        self
    }

}

impl fmt::Display for ProviderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match (self.transport, self.status) {
            (false, Some(status)) => write!(f, "{} error ({status}): {}", self.provider, self.detail),
            _ => write!(f, "{} request failed: {}", self.provider, self.detail),
        }
    }
}

impl std::error::Error for ProviderError {}

/// Consume a non-2xx response into a typed error. Reads the bounded error
/// body and the `Retry-After` header; the returned error prints exactly like
/// the old `"<provider> error (<status>): <body>"` string.
pub fn http_failure(
    provider: &str,
    model: &str,
    resp: &mut ureq::http::Response<ureq::Body>,
) -> anyhow::Error {
    let retry_after = resp
        .headers()
        .get("retry-after")
        .and_then(|value| value.to_str().ok())
        .and_then(parse_retry_after);
    let status = resp.status().as_u16();
    let body = super::provider::read_error_body(resp);
    anyhow::Error::new(ProviderError::from_http(provider, status, &body, retry_after).with_model(model))
}

/// Wrap a send-side failure (no HTTP response) into a typed error.
pub fn transport_failure(provider: &str, model: &str, error: &ureq::Error) -> anyhow::Error {
    anyhow::Error::new(ProviderError::from_transport(provider, error).with_model(model))
}

/// Parse a `Retry-After` header value given in whole seconds. HTTP-date
/// form is ignored (returns `None`). Capped at `MAX_RETRY_AFTER`.
pub fn parse_retry_after(value: &str) -> Option<Duration> {
    let seconds: u64 = value.trim().parse().ok()?;
    Some(Duration::from_secs(seconds).min(MAX_RETRY_AFTER))
}

/// Cut `raw` to `MAX_DETAIL_BYTES` on a char boundary and mask anything
/// that looks like a credential.
pub fn sanitize_detail(raw: &str) -> String {
    let masked = mask_secrets(raw);
    truncate_on_char_boundary(&masked, MAX_DETAIL_BYTES).to_string()
}

fn truncate_on_char_boundary(text: &str, max_bytes: usize) -> &str {
    if text.len() <= max_bytes {
        return text;
    }
    let mut end = max_bytes;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

fn is_token_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')
}

fn looks_like_key(token: &str) -> bool {
    token.len() >= MIN_KEY_LEN && KEY_PREFIXES.iter().any(|prefix| token.starts_with(prefix))
}

fn is_secret_marker(token: &str) -> bool {
    SECRET_MARKERS.iter().any(|marker| token.eq_ignore_ascii_case(marker))
}

/// Append `token` to `out`, masked when it is key-shaped or is the value of a
/// marker such as "Bearer" or "api_key". Returns whether the NEXT token is
/// such a value.
fn emit_token(token: &str, out: &mut String, is_value: bool) -> bool {
    if is_value || looks_like_key(token) {
        out.push_str(REDACTED);
    } else {
        out.push_str(token);
    }
    is_secret_marker(token)
}

/// Mask key-shaped tokens and the value that follows a secret marker. Inside
/// such a value `/`, `+` and `=` count as part of the token (base64 style
/// credentials), so the whole thing is masked and not just its first
/// segment. Runs before truncation so a secret cut in half is never half shown.
fn mask_secrets(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut token = String::new();
    let mut is_value = false;
    for c in raw.chars() {
        let value_char = is_value && !token.is_empty() && matches!(c, '/' | '+' | '=');
        if is_token_char(c) || value_char {
            token.push(c);
            continue;
        }
        if !token.is_empty() {
            is_value = emit_token(&token, &mut out, is_value);
            token.clear();
        }
        if !c.is_whitespace() && !matches!(c, ':' | '"' | '\'' | '=') {
            is_value = false;
        }
        out.push(c);
    }
    if !token.is_empty() {
        emit_token(&token, &mut out, is_value);
    }
    out
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| haystack.contains(needle))
}

fn classify_http(status: u16, body: &str) -> ProviderErrorKind {
    use ProviderErrorKind::*;
    let body = body.to_ascii_lowercase();
    if matches!(status, 400 | 402 | 429) && contains_any(&body, &QUOTA_MARKERS) {
        return QuotaExhausted;
    }
    if matches!(status, 400 | 413 | 422) && contains_any(&body, &CONTEXT_MARKERS) {
        return ContextOverflow;
    }
    if status == 400 && contains_any(&body, &BAD_KEY_MARKERS) {
        return Auth;
    }
    match status {
        402 => QuotaExhausted,
        408 => Timeout,
        429 => RateLimited,
        401 | 403 => Auth,
        404 if body.contains("model") => ModelNotFound,
        503 | 529 => Overloaded,
        500..=599 => ServerError,
        400..=499 => BadRequest,
        _ => Unknown,
    }
}

fn classify_transport(error: &ureq::Error) -> ProviderErrorKind {
    match error {
        ureq::Error::Timeout(_) => ProviderErrorKind::Timeout,
        ureq::Error::HostNotFound | ureq::Error::ConnectionFailed | ureq::Error::Io(_) => {
            ProviderErrorKind::Network
        }
        _ => ProviderErrorKind::Unknown,
    }
}

#[cfg(test)]
mod tests;
