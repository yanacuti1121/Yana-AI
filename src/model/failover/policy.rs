//! Tunables for `FailoverProvider`.

use crate::model::provider_error::ProviderError;
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

impl FailoverPolicy {
    /// Pause before retrying after `error`: the server's `Retry-After` when
    /// it asks for longer than the base backoff, otherwise the backoff.
    pub fn retry_wait(&self, error: &ProviderError) -> Duration {
        error.retry_after.map_or(self.retry_backoff, |wait| wait.max(self.retry_backoff))
    }
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
