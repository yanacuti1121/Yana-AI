//! Failover tests for routing, retry, breaker and output rules.

use super::test_support::*;
use super::*;
use crate::model::provider_error::ProviderErrorKind;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

#[test]
fn healthy_primary_is_used_with_the_callers_model_and_key() {
    let primary = Fake::new("primary", vec![], Step::Ok("hi"));
    let backup = Fake::new("backup", vec![], Step::Ok("nope"));
    let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b-model", Some("b-key"))], fast_policy(2));
    let (result, chunks) = run(&router);
    assert!(result.is_ok());
    assert_eq!(chunks, vec!["hi:caller-model"]);
    assert_eq!(backup.calls(), 0);
    assert_eq!(primary.keys_seen.lock().unwrap()[0].as_deref(), Some("caller-key"));
}

#[test]
fn rate_limited_primary_falls_back_with_the_fallbacks_own_model_and_key() {
    let primary = Fake::new("primary", vec![], Step::Http(429, "slow down"));
    let backup = Fake::new("backup", vec![], Step::Ok("ok"));
    let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b-model", Some("b-key"))], fast_policy(1));
    let (result, chunks) = run(&router);
    assert!(result.is_ok());
    assert_eq!(chunks, vec!["ok:b-model"]);
    assert_eq!(backup.keys_seen.lock().unwrap()[0].as_deref(), Some("b-key"));
    assert_eq!(primary.calls(), 1);
}

#[test]
fn transient_error_is_retried_on_the_same_route_before_failover() {
    let primary = Fake::new("primary", vec![Step::Http(503, "busy")], Step::Ok("second try"));
    let backup = Fake::new("backup", vec![], Step::Ok("nope"));
    let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b", None)], fast_policy(2));
    let (result, _) = run(&router);
    assert!(result.is_ok());
    assert_eq!(primary.calls(), 2);
    assert_eq!(backup.calls(), 0);
}

#[test]
fn context_overflow_and_bad_request_never_fail_over() {
    for (status, body, kind) in [
        (400, "prompt is too long", ProviderErrorKind::ContextOverflow),
        (400, "malformed", ProviderErrorKind::BadRequest),
    ] {
        let primary = Fake::new("primary", vec![], Step::Http(status, body));
        let backup = Fake::new("backup", vec![], Step::Ok("nope"));
        let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b", None)], fast_policy(2));
        let (result, _) = run(&router);
        assert_eq!(kind_of(&result.unwrap_err()), Some(kind));
        assert_eq!(primary.calls(), 1, "{body}: not retried");
        assert_eq!(backup.calls(), 0, "{body}: not failed over");
    }
}

#[test]
fn auth_error_fails_over_without_retrying_the_same_key() {
    let primary = Fake::new("primary", vec![], Step::Http(401, "bad key"));
    let backup = Fake::new("backup", vec![], Step::Ok("ok"));
    let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b", None)], fast_policy(3));
    let (result, _) = run(&router);
    assert!(result.is_ok());
    assert_eq!(primary.calls(), 1);
}

#[test]
fn no_failover_once_output_was_streamed() {
    let primary = Fake::new("primary", vec![], Step::HttpAfterOutput(503));
    let backup = Fake::new("backup", vec![], Step::Ok("nope"));
    let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b", None)], fast_policy(3));
    let (result, chunks) = run(&router);
    assert_eq!(kind_of(&result.unwrap_err()), Some(ProviderErrorKind::Overloaded));
    assert_eq!(chunks, vec!["partial"], "user must not see a second answer");
    assert_eq!(primary.calls(), 1);
    assert_eq!(backup.calls(), 0);
}

#[test]
fn failover_after_output_is_allowed_only_when_the_policy_says_so() {
    let primary = Fake::new("primary", vec![], Step::HttpAfterOutput(503));
    let backup = Fake::new("backup", vec![], Step::Ok("ok"));
    let policy = FailoverPolicy { allow_failover_after_output: true, ..fast_policy(1) };
    let router = FailoverProvider::new(primary, vec![route(&backup, "b", None)], policy);
    let (result, _) = run(&router);
    assert!(result.is_ok());
    assert_eq!(backup.calls(), 1);
}

#[test]
fn untyped_error_is_returned_at_once() {
    let primary = Fake::new("primary", vec![], Step::Untyped);
    let backup = Fake::new("backup", vec![], Step::Ok("nope"));
    let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b", None)], fast_policy(3));
    let (result, _) = run(&router);
    assert!(result.unwrap_err().to_string().contains("KEY_NOT_SET"));
    assert_eq!(primary.calls(), 1);
    assert_eq!(backup.calls(), 0);
}

#[test]
fn all_routes_failing_reports_every_route_and_keeps_the_last_kind() {
    let primary = Fake::new("primary", vec![], Step::Http(503, "busy"));
    let backup = Fake::new("backup", vec![], Step::Http(529, "overloaded"));
    let router = FailoverProvider::new(primary, vec![route(&backup, "b", None)], fast_policy(1));
    let (result, _) = run(&router);
    let error = result.unwrap_err();
    let text = format!("{error:#}");
    assert!(text.contains("primary") && text.contains("backup"), "{text}");
    assert_eq!(kind_of(&error), Some(ProviderErrorKind::Overloaded));
}

#[test]
fn a_route_that_keeps_failing_is_skipped_once_its_breaker_opens() {
    // The breaker opens after 5 consecutive failures (MAX_FAILURES in
    // circuit_breaker.rs). Six turns: the primary is tried 5 times, then skipped.
    let primary = Fake::new("primary", vec![], Step::Http(500, "boom"));
    let backup = Fake::new("backup", vec![], Step::Ok("ok"));
    let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b", None)], fast_policy(1));
    for _ in 0..6 {
        assert!(run(&router).0.is_ok());
    }
    assert_eq!(primary.calls(), 5);
    assert_eq!(backup.calls(), 6);
}

#[test]
fn every_route_cooling_down_gives_a_clear_error() {
    let primary = Fake::new("primary", vec![], Step::Http(401, "bad key"));
    let router = FailoverProvider::new(primary.clone(), vec![], fast_policy(1));
    assert!(run(&router).0.is_err());
    // An auth failure opens the breaker for a long cooldown at once.
    let error = run(&router).0.unwrap_err();
    assert!(error.to_string().contains("cooling down"), "{error}");
    assert_eq!(primary.calls(), 1);
}

#[test]
fn long_retry_after_skips_inline_waiting_and_uses_the_next_provider() {
    struct Slow(AtomicUsize);
    impl ChatProvider for Slow {
        fn name(&self) -> &str { "slow" }
        fn default_model(&self) -> &str { "m" }
        fn requires_key(&self) -> bool { false }
        fn env_var(&self) -> &str { "" }
        fn stream_chat(&self, _: Option<&str>, _: &str, _: Option<&str>, _: &[ChatMessage], _: &[ToolSpec],
            _: &mut dyn FnMut(&str) -> Result<()>) -> Result<(ChatUsage, StreamOutcome)> {
            self.0.fetch_add(1, Ordering::SeqCst);
            Err(anyhow::Error::new(ProviderError::from_http("slow", 429, "", Some(Duration::from_secs(600)))))
        }
    }
    let primary = Arc::new(Slow(AtomicUsize::new(0)));
    let backup = Fake::new("backup", vec![], Step::Ok("ok"));
    let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b", None)], fast_policy(3));
    assert!(run(&router).0.is_ok());
    assert_eq!(primary.0.load(Ordering::SeqCst), 1, "must not retry a 10 minute wait inline");
}

#[test]
fn identity_and_capabilities_come_from_the_primary() {
    let primary = Fake::new("primary", vec![], Step::Ok("x"));
    let backup = Fake::new("backup", vec![], Step::Ok("x"));
    let router = FailoverProvider::new(primary, vec![route(&backup, "b", None)], fast_policy(1));
    assert_eq!(router.name(), "primary");
    assert_eq!(router.default_model(), "fake-default");
    assert!(!router.requires_key());
}
