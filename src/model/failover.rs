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

mod policy;
pub use policy::FailoverPolicy;

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
mod pool_tests;
#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;
