use super::*;

fn kind_for(status: u16, body: &str) -> ProviderErrorKind {
    ProviderError::from_http("p", status, body, None).kind
}

#[test]
fn status_codes_map_to_kinds() {
    assert_eq!(kind_for(429, "slow down"), ProviderErrorKind::RateLimited);
    assert_eq!(kind_for(402, ""), ProviderErrorKind::QuotaExhausted);
    assert_eq!(kind_for(401, ""), ProviderErrorKind::Auth);
    assert_eq!(kind_for(403, ""), ProviderErrorKind::Auth);
    assert_eq!(kind_for(503, ""), ProviderErrorKind::Overloaded);
    assert_eq!(kind_for(529, ""), ProviderErrorKind::Overloaded);
    assert_eq!(kind_for(500, ""), ProviderErrorKind::ServerError);
    assert_eq!(kind_for(502, ""), ProviderErrorKind::ServerError);
    assert_eq!(kind_for(504, ""), ProviderErrorKind::ServerError);
    assert_eq!(kind_for(400, "malformed json"), ProviderErrorKind::BadRequest);
    assert_eq!(kind_for(413, ""), ProviderErrorKind::BadRequest);
    assert_eq!(kind_for(418, ""), ProviderErrorKind::BadRequest);
    assert_eq!(kind_for(302, ""), ProviderErrorKind::Unknown);
}

#[test]
fn not_found_is_model_not_found_only_when_body_mentions_model() {
    assert_eq!(
        kind_for(404, r#"{"error":{"message":"The model `x` does not exist"}}"#),
        ProviderErrorKind::ModelNotFound
    );
    assert_eq!(kind_for(404, "page not found"), ProviderErrorKind::BadRequest);
}

#[test]
fn context_overflow_is_detected_from_body_across_providers() {
    for body in [
        "prompt is too long: 250000 tokens > 200000 maximum",
        r#"{"error":{"code":"context_length_exceeded"}}"#,
        "This model's maximum context length is 8192 tokens",
        "The input token count exceeds the maximum number of tokens allowed",
    ] {
        assert_eq!(kind_for(400, body), ProviderErrorKind::ContextOverflow, "{body}");
    }
}

#[test]
fn quota_body_wins_over_rate_limit_status() {
    assert_eq!(
        kind_for(429, r#"{"error":{"code":"insufficient_quota"}}"#),
        ProviderErrorKind::QuotaExhausted
    );
    assert_eq!(
        kind_for(400, "Your credit balance is too low to access the API"),
        ProviderErrorKind::QuotaExhausted
    );
}

#[test]
fn hint_table_matches_contract() {
    use ProviderErrorKind::*;
    let h = |k: ProviderErrorKind| {
        let x = k.hint();
        (x.retry_same, x.rotate_credential, x.fallback_provider)
    };
    assert_eq!(h(RateLimited), (true, true, true));
    assert_eq!(h(QuotaExhausted), (false, true, true));
    assert_eq!(h(ContextOverflow), (false, false, false));
    assert_eq!(h(Auth), (false, true, true));
    assert_eq!(h(Overloaded), (true, false, true));
    assert_eq!(h(ServerError), (true, false, true));
    assert_eq!(h(Timeout), (true, false, true));
    assert_eq!(h(Network), (true, false, true));
    assert_eq!(h(ModelNotFound), (false, false, true));
    assert_eq!(h(BadRequest), (false, false, false));
    assert_eq!(h(Unknown), (true, false, false));
}

#[test]
fn display_keeps_the_legacy_http_format() {
    let e = ProviderError::from_http("anthropic", 429, "slow down", None);
    assert_eq!(e.to_string(), "anthropic error (429): slow down");
}

#[test]
fn retry_after_parses_seconds_and_caps() {
    assert_eq!(parse_retry_after("30"), Some(Duration::from_secs(30)));
    assert_eq!(parse_retry_after(" 7 "), Some(Duration::from_secs(7)));
    assert_eq!(parse_retry_after("999999"), Some(MAX_RETRY_AFTER));
    assert_eq!(parse_retry_after("Wed, 21 Oct 2026 07:28:00 GMT"), None);
    assert_eq!(parse_retry_after(""), None);
    assert_eq!(parse_retry_after("-5"), None);
}

#[test]
fn detail_is_bounded_on_a_char_boundary() {
    let body = "é".repeat(5000);
    let d = sanitize_detail(&body);
    assert!(d.len() <= MAX_DETAIL_BYTES);
    assert!(d.chars().all(|c| c == 'é'));
    assert_eq!(sanitize_detail(""), "");
}

#[test]
fn credentials_never_reach_display_or_debug() {
    let body = concat!(
        r#"{"error":"bad key sk-ant-api03-FAKEFAKEFAKE1234567890"#,
        r#" and AIzaSyFAKEFAKEFAKEFAKE12345678 "#,
        r#"and Authorization: Bearer abc.def.ghi-FAKE"}"#
    );
    let e = ProviderError::from_http("p", 401, body, None);
    let shown = format!("{e} {e:?}");
    for secret in ["FAKEFAKEFAKE1234567890", "AIzaSyFAKEFAKEFAKEFAKE12345678", "abc.def.ghi-FAKE"] {
        assert!(!shown.contains(secret), "leaked {secret}: {shown}");
    }
}

#[test]
fn downcast_survives_anyhow_context() {
    use anyhow::Context;
    let err: anyhow::Error = anyhow::Error::new(ProviderError::from_http("p", 429, "x", None));
    let wrapped: anyhow::Result<()> = Err(err).context("is the daemon running?");
    let err = wrapped.unwrap_err();
    assert_eq!(
        err.downcast_ref::<ProviderError>().map(|e| e.kind),
        Some(ProviderErrorKind::RateLimited)
    );
}
