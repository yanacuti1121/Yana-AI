//! Provider failover (WS1 P2, see docs/contracts/ws1-provider.md section 3).
//!
//! `FailoverProvider` is itself a `ChatProvider`, so every existing caller
//! (chat TUI, runtime controller, Discord) can use it without any change.
//! It tries the primary provider first and moves to the fallbacks in order
//! when the classified error (`provider_error`) says a different provider
//! could succeed. One `CircuitBreaker` per route stops it from hammering a
//! provider that keeps failing.
//!
//! Rules worth knowing before changing this file:
//! - Never fail over after any output was streamed. Switching provider
//!   mid-answer would show the user duplicated or mismatched text.
//! - `ContextOverflow` and `BadRequest` never fail over: another provider
//!   does not make the same request valid.
//! - An error that is not a `ProviderError` (for example a missing API key)
//!   is returned at once, with no retry and no failover.
//! - Credential rotation (`RecoveryHint::rotate_credential`) is not done
//!   here; that is the credential pool (P3).

use super::circuit_breaker::CircuitBreaker;
use super::credential_pool::{CredentialPool, Lease};
use super::provider::{ChatMessage, ChatProvider, ChatUsage, ModelInfo, ProviderHealth, RuntimeKind};
use super::provider_error::ProviderError;
use super::tool::{StreamOutcome, ToolSpec};
use anyhow::Result;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

/// Attempts on one route before moving on, counting the first try.
const DEFAULT_MAX_ATTEMPTS_PER_ROUTE: u32 = 2;
/// Pause between two attempts on the same route.
const DEFAULT_RETRY_BACKOFF: Duration = Duration::from_millis(500);
/// A `Retry-After` longer than this is not waited out inline; the router
/// prefers the next provider instead of blocking the turn.
const DEFAULT_MAX_INLINE_WAIT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone)]
pub struct FailoverPolicy {
    pub max_attempts_per_route: u32,
    pub allow_failover_after_output: bool,
    pub retry_backoff: Duration,
    pub max_inline_wait: Duration,
}

impl Default for FailoverPolicy {
    fn default() -> Self {
        Self {
            max_attempts_per_route: DEFAULT_MAX_ATTEMPTS_PER_ROUTE,
            allow_failover_after_output: false,
            retry_backoff: DEFAULT_RETRY_BACKOFF,
            max_inline_wait: DEFAULT_MAX_INLINE_WAIT,
        }
    }
}

/// A fallback target. The primary provider uses the model and key the
/// caller passes to `stream_chat`; a fallback carries its own.
pub struct FallbackRoute {
    pub provider: Arc<dyn ChatProvider>,
    pub model: String,
    pub api_key: Option<String>,
    /// When set, keys come from the pool and `api_key` is ignored.
    pub pool: Option<Arc<CredentialPool>>,
}

struct Route {
    provider: Arc<dyn ChatProvider>,
    model: Option<String>,
    api_key: Option<String>,
    pool: Option<Arc<CredentialPool>>,
    breaker: Mutex<CircuitBreaker>,
}

pub struct FailoverProvider {
    routes: Vec<Route>,
    policy: FailoverPolicy,
}

/// What one route decided after its attempts.
enum RouteOutcome {
    Done((ChatUsage, StreamOutcome)),
    /// This route is spent; the next one may still succeed.
    Next(anyhow::Error),
    /// Return this error to the caller now.
    Stop(anyhow::Error),
}

impl FailoverProvider {
    pub fn new(
        primary: Arc<dyn ChatProvider>,
        fallbacks: Vec<FallbackRoute>,
        policy: FailoverPolicy,
    ) -> Self {
        let mut routes = vec![Route::new(primary, None, None, None)];
        routes.extend(
            fallbacks
                .into_iter()
                .map(|f| Route::new(f.provider, Some(f.model), f.api_key, f.pool)),
        );
        Self { routes, policy }
    }

    /// Serve the primary provider's keys from a pool instead of the single
    /// key the caller passes to `stream_chat`.
    pub fn with_primary_pool(mut self, pool: Arc<CredentialPool>) -> Self {
        self.routes[0].pool = Some(pool);
        self
    }
}

impl Route {
    fn new(
        provider: Arc<dyn ChatProvider>,
        model: Option<String>,
        api_key: Option<String>,
        pool: Option<Arc<CredentialPool>>,
    ) -> Self {
        Self { provider, model, api_key, pool, breaker: Mutex::new(CircuitBreaker::new()) }
    }

    fn breaker(&self) -> MutexGuard<'_, CircuitBreaker> {
        // A panic while holding the lock cannot leave the breaker in a state
        // worse than "counted one failure too few", so a poisoned lock is
        // still safe to use.
        self.breaker.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

impl ChatProvider for FailoverProvider {
    fn name(&self) -> &str {
        self.routes[0].provider.name()
    }
    fn default_model(&self) -> &str {
        self.routes[0].provider.default_model()
    }
    fn requires_key(&self) -> bool {
        self.routes[0].provider.requires_key()
    }
    fn env_var(&self) -> &str {
        self.routes[0].provider.env_var()
    }
    fn runtime_kind(&self) -> RuntimeKind {
        self.routes[0].provider.runtime_kind()
    }
    fn supports_tool_calling(&self) -> bool {
        self.routes[0].provider.supports_tool_calling()
    }
    fn supports_vision(&self) -> bool {
        self.routes[0].provider.supports_vision()
    }
    fn list_models(&self, api_key: Option<&str>) -> Result<Vec<ModelInfo>> {
        self.routes[0].provider.list_models(api_key)
    }
    fn health(&self, api_key: Option<&str>) -> ProviderHealth {
        self.routes[0].provider.health(api_key)
    }

    fn stream_chat(
        &self,
        api_key: Option<&str>,
        model: &str,
        system: Option<&str>,
        messages: &[ChatMessage],
        tools: &[ToolSpec],
        on_chunk: &mut dyn FnMut(&str) -> Result<()>,
    ) -> Result<(ChatUsage, StreamOutcome)> {
        let mut tried: Vec<String> = Vec::new();
        let mut last_error: Option<anyhow::Error> = None;
        for (index, route) in self.routes.iter().enumerate() {
            if !route.breaker().can_attempt() {
                tried.push(format!("{} (cooling down)", route.provider.name()));
                continue;
            }
            let outcome = self.run_route(index, api_key, model, system, messages, tools, on_chunk);
            match outcome {
                RouteOutcome::Done(result) => return Ok(result),
                RouteOutcome::Stop(error) => return Err(error),
                RouteOutcome::Next(error) => {
                    tried.push(route.provider.name().to_string());
                    last_error = Some(error);
                }
            }
        }
        let tried = tried.join(", ");
        Err(match last_error {
            Some(error) => error.context(format!("all providers failed, tried: {tried}")),
            None => anyhow::anyhow!("no provider available, all are cooling down: {tried}"),
        })
    }
}

impl FailoverProvider {
    /// Runs one route until it succeeds, is spent, or must stop the turn.
    #[allow(clippy::too_many_arguments)] // mirrors ChatProvider::stream_chat
    fn run_route(
        &self,
        index: usize,
        caller_key: Option<&str>,
        caller_model: &str,
        system: Option<&str>,
        messages: &[ChatMessage],
        tools: &[ToolSpec],
        on_chunk: &mut dyn FnMut(&str) -> Result<()>,
    ) -> RouteOutcome {
        let route = &self.routes[index];
        let (default_key, model) = match &route.model {
            None => (caller_key, caller_model),
            Some(own_model) => (route.api_key.as_deref(), own_model.as_str()),
        };
        let mut attempt = 1;
        let mut previous_error: Option<anyhow::Error> = None;
        loop {
            let lease = match &route.pool {
                Some(pool) => match pool.acquire() {
                    Some(lease) => Some(lease),
                    None => return RouteOutcome::Next(no_key_error(route, previous_error)),
                },
                None => None,
            };
            let key = lease.as_ref().map(Lease::secret).or(default_key);
            let mut emitted = false;
            let result = route.provider.stream_chat(key, model, system, messages, tools, &mut |chunk| {
                emitted = true;
                on_chunk(chunk)
            });
            let error = match result {
                Ok(done) => {
                    route.breaker().record_success();
                    return RouteOutcome::Done(done);
                }
                Err(error) => error,
            };
            let Some(typed) = error.downcast_ref::<ProviderError>().cloned() else {
                return RouteOutcome::Stop(error);
            };
            match self.decide(route, lease.as_ref(), &typed, emitted, attempt) {
                Decision::Rotate => {}
                Decision::Retry => {
                    std::thread::sleep(self.policy.retry_backoff);
                    attempt += 1;
                }
                Decision::Next => return RouteOutcome::Next(error),
                Decision::Stop => return RouteOutcome::Stop(error),
            }
            previous_error = Some(error);
        }
    }

    /// Decides what to do after a typed failure and books it: the pool parks
    /// the key that failed, and the breaker counts the failure unless a
    /// different key can still serve this route.
    fn decide(
        &self,
        route: &Route,
        lease: Option<&Lease>,
        error: &ProviderError,
        emitted: bool,
        attempt: u32,
    ) -> Decision {
        if let (Some(pool), Some(lease)) = (&route.pool, lease) {
            pool.report(lease, error);
        }
        let hint = error.kind.hint();
        let keys_left = route.pool.as_ref().is_none_or(|pool| pool.available() > 0);
        let output_locks_route = emitted && !self.policy.allow_failover_after_output;
        if !output_locks_route && hint.rotate_credential && route.pool.is_some() && keys_left {
            return Decision::Rotate;
        }
        route.breaker().record_failure_with_status(error.status);
        if output_locks_route {
            return Decision::Stop;
        }
        let can_retry = attempt < self.policy.max_attempts_per_route
            && error.retry_after.is_none_or(|wait| wait <= self.policy.max_inline_wait);
        if hint.retry_same && can_retry && keys_left {
            Decision::Retry
        } else if hint.fallback_provider {
            Decision::Next
        } else {
            Decision::Stop
        }
    }
}

/// What to do after one failed call on a route.
enum Decision {
    /// Another key of the same provider may work; try it without counting an attempt.
    Rotate,
    Retry,
    Next,
    Stop,
}

fn no_key_error(route: &Route, previous: Option<anyhow::Error>) -> anyhow::Error {
    let name = route.provider.name();
    match previous {
        Some(error) => error.context(format!("every credential for {name} is parked")),
        None => anyhow::anyhow!("no usable credential for {name}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::credential_pool::SystemClock;
    use crate::model::provider_error::ProviderErrorKind;
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[derive(Clone)]
    enum Step {
        Ok(&'static str),
        Http(u16, &'static str),
        HttpAfterOutput(u16),
        Untyped,
    }

    /// Scripted stand-in for a real provider. No network, no credentials.
    struct Fake {
        name: &'static str,
        steps: Mutex<VecDeque<Step>>,
        then: Step,
        calls: AtomicUsize,
        keys_seen: Mutex<Vec<Option<String>>>,
    }

    impl Fake {
        fn new(name: &'static str, steps: Vec<Step>, then: Step) -> Arc<Self> {
            Arc::new(Self {
                name,
                steps: Mutex::new(steps.into()),
                then,
                calls: AtomicUsize::new(0),
                keys_seen: Mutex::new(Vec::new()),
            })
        }
        fn calls(&self) -> usize {
            self.calls.load(Ordering::SeqCst)
        }
    }

    impl ChatProvider for Fake {
        fn name(&self) -> &str {
            self.name
        }
        fn default_model(&self) -> &str {
            "fake-default"
        }
        fn requires_key(&self) -> bool {
            false
        }
        fn env_var(&self) -> &str {
            ""
        }
        fn stream_chat(
            &self,
            api_key: Option<&str>,
            model: &str,
            _system: Option<&str>,
            _messages: &[ChatMessage],
            _tools: &[ToolSpec],
            on_chunk: &mut dyn FnMut(&str) -> Result<()>,
        ) -> Result<(ChatUsage, StreamOutcome)> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            self.keys_seen.lock().unwrap().push(api_key.map(str::to_string));
            let step = self.steps.lock().unwrap().pop_front().unwrap_or_else(|| self.then.clone());
            match step {
                Step::Ok(text) => {
                    on_chunk(&format!("{text}:{model}"))?;
                    Ok((ChatUsage::default(), StreamOutcome::Text))
                }
                Step::Http(status, body) => {
                    Err(anyhow::Error::new(ProviderError::from_http(self.name, status, body, None)))
                }
                Step::HttpAfterOutput(status) => {
                    on_chunk("partial")?;
                    Err(anyhow::Error::new(ProviderError::from_http(self.name, status, "cut", None)))
                }
                Step::Untyped => Err(anyhow::anyhow!("KEY_NOT_SET")),
            }
        }
    }

    fn fast_policy(max_attempts: u32) -> FailoverPolicy {
        FailoverPolicy {
            max_attempts_per_route: max_attempts,
            retry_backoff: Duration::ZERO,
            ..FailoverPolicy::default()
        }
    }

    fn route(provider: &Arc<Fake>, model: &str, key: Option<&str>) -> FallbackRoute {
        FallbackRoute {
            provider: provider.clone(),
            model: model.to_string(),
            api_key: key.map(str::to_string),
            pool: None,
        }
    }

    fn key_pool(keys: &[&str]) -> Arc<CredentialPool> {
        Arc::new(CredentialPool::new(
            "TEST_KEY",
            keys.iter().map(|k| k.to_string()).collect(),
            Arc::new(SystemClock),
        ))
    }

    fn keys_seen(fake: &Fake) -> Vec<String> {
        fake.keys_seen.lock().unwrap().iter().map(|k| k.clone().unwrap_or_default()).collect()
    }

    #[test]
    fn rate_limited_key_rotates_to_the_next_key_without_leaving_the_provider() {
        let primary = Fake::new("primary", vec![Step::Http(429, "slow")], Step::Ok("ok"));
        let backup = Fake::new("backup", vec![], Step::Ok("nope"));
        let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b", None)], fast_policy(1))
            .with_primary_pool(key_pool(&["k1", "k2"]));
        let (result, chunks) = run(&router);
        assert!(result.is_ok());
        assert_eq!(keys_seen(&primary), vec!["k1", "k2"]);
        assert_eq!(chunks, vec!["ok:caller-model"]);
        assert_eq!(backup.calls(), 0);
    }

    #[test]
    fn rotation_does_not_trip_the_breaker_while_a_good_key_remains() {
        // A 401 on one key would normally park the whole route for a long time.
        let primary = Fake::new("primary", vec![Step::Http(401, "bad key")], Step::Ok("ok"));
        let backup = Fake::new("backup", vec![], Step::Ok("nope"));
        let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b", None)], fast_policy(1))
            .with_primary_pool(key_pool(&["bad", "good"]));
        assert!(run(&router).0.is_ok());
        assert!(run(&router).0.is_ok(), "route must still be usable on the next turn");
        assert_eq!(backup.calls(), 0);
        assert_eq!(keys_seen(&primary), vec!["bad", "good", "good"]);
    }

    #[test]
    fn every_key_rate_limited_then_the_fallback_provider_is_used() {
        let primary = Fake::new("primary", vec![], Step::Http(429, "slow"));
        let backup = Fake::new("backup", vec![], Step::Ok("ok"));
        let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b", None)], fast_policy(1))
            .with_primary_pool(key_pool(&["k1", "k2"]));
        let (result, _) = run(&router);
        assert!(result.is_ok());
        assert_eq!(primary.calls(), 2, "one attempt per key, no more");
        assert_eq!(backup.calls(), 1);
    }

    #[test]
    fn a_route_with_no_usable_key_is_skipped_without_calling_the_provider() {
        let primary = Fake::new("primary", vec![], Step::Ok("nope"));
        let backup = Fake::new("backup", vec![], Step::Ok("ok"));
        let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b", None)], fast_policy(1))
            .with_primary_pool(key_pool(&[]));
        assert!(run(&router).0.is_ok());
        assert_eq!(primary.calls(), 0);
    }

    #[test]
    fn a_fallback_route_can_have_its_own_pool() {
        let primary = Fake::new("primary", vec![], Step::Http(503, "down"));
        let backup = Fake::new("backup", vec![Step::Http(429, "slow")], Step::Ok("ok"));
        let mut fallback = route(&backup, "b", Some("unused-single-key"));
        fallback.pool = Some(key_pool(&["b1", "b2"]));
        let router = FailoverProvider::new(primary, vec![fallback], fast_policy(1));
        assert!(run(&router).0.is_ok());
        assert_eq!(keys_seen(&backup), vec!["b1", "b2"]);
    }

    #[test]
    fn no_key_appears_in_the_final_error_text() {
        let secret = "sk-FAKEKEYFAKEKEY1234567890";
        let leaky: &'static str = Box::leak(format!("invalid key {secret}").into_boxed_str());
        let primary = Fake::new("primary", vec![], Step::Http(401, leaky));
        let router = FailoverProvider::new(primary, vec![], fast_policy(1))
            .with_primary_pool(key_pool(&[secret]));
        let error = run(&router).0.unwrap_err();
        assert!(!format!("{error:#} {error:?}").contains("FAKEKEYFAKEKEY"), "{error:#}");
    }

    /// Runs one turn and returns (outcome, chunks seen).
    fn run(router: &FailoverProvider) -> (Result<(ChatUsage, StreamOutcome)>, Vec<String>) {
        let mut chunks = Vec::new();
        let result = router.stream_chat(
            Some("caller-key"),
            "caller-model",
            None,
            &[],
            &[],
            &mut |c| {
                chunks.push(c.to_string());
                Ok(())
            },
        );
        (result, chunks)
    }

    fn kind_of(error: &anyhow::Error) -> Option<ProviderErrorKind> {
        error.downcast_ref::<ProviderError>().map(|e| e.kind)
    }

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
}
