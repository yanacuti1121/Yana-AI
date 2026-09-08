//! Per-provider circuit breaker (Phase 2, Provider Gateway unification).
//! Moved verbatim from `chat::circuit_breaker` (see that module's
//! re-export shim) — "model plane owns provider state, chat consumes it,"
//! same rationale `model::provider`'s own doc comment already documents
//! for its own promotion out of `chat::`. Extended here with
//! status-code-aware failure classification; the original state machine
//! (`State`, `can_attempt`, `record_failure`, `record_success`,
//! `cooldown_remaining_secs`) is byte-for-byte unchanged, so every
//! pre-existing test below still exercises the exact same behavior.
//!
//! A direct third port of `core/hooks/per-tool-circuit-breaker.sh`'s state
//! machine (bash -> `tools/yana-web/lib/provider-failover.js` -> here),
//! keeping the same parameters consistent across all three ports.
//!
//! Simpler than the JS version: a single-user REPL process only ever talks
//! to one configured provider per session, so this is one struct instance,
//! not a `HashMap<provider, _>` — there's no concurrent-access concern the
//! JS server had to design around. It stops the REPL from repeatedly
//! hammering the same dead provider turn after turn within one session; it
//! deliberately does not auto-switch to a different provider
//! (`buildFallbackChain`'s behavior — out of scope, see the plan).

use std::time::{Duration, Instant};

const MAX_FAILURES: u32 = 5;
const COOLDOWN_INITIAL: Duration = Duration::from_secs(60);
const COOLDOWN_MAX: Duration = Duration::from_secs(1_800);
const COOLDOWN_MULTIPLIER: u32 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum State {
    Closed,
    Open,
    HalfOpen,
}

/// Why a call failed, classified from the HTTP status code alone. The WHY
/// determines whether the circuit should treat the failure as transient
/// (retry after backoff, same as before this phase) or as "this will not
/// fix itself by waiting" (long-open, no auto-retry). Research source:
/// AnyLLMTranslate's provider-failover classification — 429/5xx are
/// transient load/outage signals, 401/403 are a credential problem no
/// amount of waiting resolves, and any other 4xx is a caller-side mistake
/// that retrying identically will reproduce.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureClass {
    RateLimited,
    ServerError,
    AuthInvalid,
    ClientError,
}

impl FailureClass {
    pub fn from_status(status: u16) -> Option<Self> {
        match status {
            429 => Some(Self::RateLimited),
            500..=599 => Some(Self::ServerError),
            401 | 403 => Some(Self::AuthInvalid),
            400..=499 => Some(Self::ClientError),
            _ => None,
        }
    }
}

/// Tri-state health for the unified `Provider` record (`model::gateway`) —
/// replaces the implicit boolean `can_attempt()` exposed. `Cooldown` and
/// `Disabled` both mean "not currently callable" but differ in why and in
/// whether the circuit will self-heal on a timer: `Cooldown` will
/// transition back to `Open` once the backoff elapses; `Disabled` will
/// not, because a bad credential does not become valid by waiting.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderHealthState {
    Open,
    Cooldown,
    Disabled,
}

pub struct CircuitBreaker {
    state: State,
    failure_count: u32,
    cooldown_until: Option<Instant>,
    backoff: Duration,
    /// Classification of the failure that most recently caused an `Open`
    /// transition. `None` while `Closed`/`HalfOpen`, or when the circuit
    /// was opened via the legacy status-less `record_failure()` path —
    /// that path's callers have no status code to give, so they get the
    /// same `Cooldown` treatment `record_failure()` always implied.
    last_failure_class: Option<FailureClass>,
    /// Independent of `state`: a credential can be known-bad (an explicit
    /// check, or a 401 on first use) before the circuit has ever tripped
    /// on failure count. `false` forces `health_state()` to `Disabled`
    /// regardless of the underlying `State`.
    credential_valid: bool,
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        Self {
            state: State::Closed,
            failure_count: 0,
            cooldown_until: None,
            backoff: COOLDOWN_INITIAL,
            last_failure_class: None,
            credential_valid: true,
        }
    }
}

impl CircuitBreaker {
    pub fn new() -> Self {
        Self::default()
    }

    /// True if a call should be attempted right now. Has a side effect:
    /// transitions OPEN -> HALF_OPEN once the cooldown has elapsed (the
    /// transition itself is the "let's find out if it recovered" probe
    /// gate) — same behavior as the bash/JS originals.
    pub fn can_attempt(&mut self) -> bool {
        match self.state {
            State::Closed => true,
            State::Open => {
                if self
                    .cooldown_until
                    .is_none_or(|until| Instant::now() >= until)
                {
                    self.state = State::HalfOpen;
                    true
                } else {
                    false
                }
            }
            State::HalfOpen => true,
        }
    }

    /// Seconds remaining until the next attempt is allowed, for a
    /// human-readable "cooling down" message. `None` if an attempt is
    /// currently allowed.
    pub fn cooldown_remaining_secs(&self) -> Option<u64> {
        match (self.state, self.cooldown_until) {
            (State::Open, Some(until)) => {
                let now = Instant::now();
                if until > now {
                    Some((until - now).as_secs())
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    pub fn record_success(&mut self) {
        self.state = State::Closed;
        self.failure_count = 0;
        self.cooldown_until = None;
        self.backoff = COOLDOWN_INITIAL;
        self.last_failure_class = None;
        self.credential_valid = true;
    }

    /// Legacy entry point, unchanged: every failure counts toward
    /// `MAX_FAILURES` with plain escalating backoff, no classification.
    /// Preserved so pre-existing callers that don't have a status code
    /// keep exactly today's behavior.
    pub fn record_failure(&mut self) {
        self.failure_count += 1;
        match self.state {
            State::HalfOpen => {
                // Probe failed — re-open with escalated backoff.
                self.backoff = (self.backoff * COOLDOWN_MULTIPLIER).min(COOLDOWN_MAX);
                self.open();
            }
            State::Closed if self.failure_count >= MAX_FAILURES => {
                self.backoff = COOLDOWN_INITIAL;
                self.open();
            }
            _ => {}
        }
    }

    /// Status-code-aware failure recording. `None` defers to
    /// `record_failure()` verbatim. A classified status changes behavior
    /// only for `AuthInvalid` (long-open, marks the credential invalid)
    /// and `ClientError` (surfaced immediately, does not count toward the
    /// transient-failure threshold and does not trip the circuit — a
    /// caller mistake will reproduce identically on retry, so counting it
    /// toward "provider is down" would be wrong). `RateLimited`/
    /// `ServerError` behave exactly like the legacy path, which was
    /// already tuned for them.
    pub fn record_failure_with_status(&mut self, status: Option<u16>) {
        match status.and_then(FailureClass::from_status) {
            Some(FailureClass::AuthInvalid) => {
                self.credential_valid = false;
                self.failure_count += 1;
                self.last_failure_class = Some(FailureClass::AuthInvalid);
                self.backoff = COOLDOWN_MAX;
                self.open();
            }
            Some(FailureClass::ClientError) => {
                // Not a circuit-worthy failure — the caller sees the error,
                // the circuit stays exactly as it was.
            }
            Some(class @ (FailureClass::RateLimited | FailureClass::ServerError)) => {
                self.last_failure_class = Some(class);
                self.record_failure();
            }
            None => {
                self.last_failure_class = None;
                self.record_failure();
            }
        }
    }

    /// Explicit credential-validity signal, independent of call outcomes —
    /// e.g. a startup check that finds no API key configured at all. Set
    /// to `false` here has the same effect as an `AuthInvalid` failure.
    pub fn set_credential_valid(&mut self, valid: bool) {
        self.credential_valid = valid;
        if !valid {
            self.last_failure_class = Some(FailureClass::AuthInvalid);
            self.backoff = COOLDOWN_MAX;
            self.open();
        }
    }

    pub fn credential_valid(&self) -> bool {
        self.credential_valid
    }

    /// Tri-state health for the unified `Provider` record. Distinguishes
    /// `Cooldown` (will self-heal on a timer) from `Disabled` (will not —
    /// a bad credential, surfaced either via `set_credential_valid(false)`
    /// or a 401/403 through `record_failure_with_status`).
    pub fn health_state(&self) -> ProviderHealthState {
        if !self.credential_valid {
            return ProviderHealthState::Disabled;
        }
        match self.state {
            State::Closed | State::HalfOpen => ProviderHealthState::Open,
            State::Open => match self.last_failure_class {
                Some(FailureClass::AuthInvalid) => ProviderHealthState::Disabled,
                _ => ProviderHealthState::Cooldown,
            },
        }
    }

    fn open(&mut self) {
        self.state = State::Open;
        self.cooldown_until = Some(Instant::now() + self.backoff);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn closed_allows_attempts_until_max_failures() {
        let mut cb = CircuitBreaker::new();
        for _ in 0..MAX_FAILURES - 1 {
            assert!(cb.can_attempt());
            cb.record_failure();
        }
        assert!(cb.can_attempt());
        cb.record_failure();
        assert!(!cb.can_attempt());
    }

    #[test]
    fn success_resets_to_closed() {
        let mut cb = CircuitBreaker::new();
        for _ in 0..MAX_FAILURES {
            cb.record_failure();
        }
        assert!(!cb.can_attempt());
        // Manually simulate cooldown elapsed by forcing HalfOpen + success.
        cb.state = State::HalfOpen;
        cb.record_success();
        assert_eq!(cb.state, State::Closed);
        assert!(cb.can_attempt());
    }

    #[test]
    fn half_open_failure_escalates_backoff() {
        let mut cb = CircuitBreaker::new();
        for _ in 0..MAX_FAILURES {
            cb.record_failure();
        }
        assert_eq!(cb.backoff, COOLDOWN_INITIAL);
        cb.state = State::HalfOpen;
        cb.record_failure();
        assert_eq!(cb.backoff, COOLDOWN_INITIAL * COOLDOWN_MULTIPLIER);
    }

    #[test]
    fn backoff_caps_at_max() {
        let mut cb = CircuitBreaker::new();
        // Reach Open the normal way first (resets backoff to
        // COOLDOWN_INITIAL, per Closed's failure-threshold arm — that
        // reset is intentional and tested separately below), then push
        // backoff right up to the cap and drive one more HalfOpen failure:
        // multiplying should saturate at COOLDOWN_MAX, not overflow past it.
        for _ in 0..MAX_FAILURES {
            cb.record_failure();
        }
        cb.backoff = COOLDOWN_MAX;
        cb.state = State::HalfOpen;
        cb.record_failure();
        assert_eq!(cb.backoff, COOLDOWN_MAX);
    }

    #[test]
    fn failure_class_maps_status_codes_correctly() {
        assert_eq!(
            FailureClass::from_status(429),
            Some(FailureClass::RateLimited)
        );
        assert_eq!(
            FailureClass::from_status(500),
            Some(FailureClass::ServerError)
        );
        assert_eq!(
            FailureClass::from_status(503),
            Some(FailureClass::ServerError)
        );
        assert_eq!(
            FailureClass::from_status(401),
            Some(FailureClass::AuthInvalid)
        );
        assert_eq!(
            FailureClass::from_status(403),
            Some(FailureClass::AuthInvalid)
        );
        assert_eq!(
            FailureClass::from_status(404),
            Some(FailureClass::ClientError)
        );
        assert_eq!(FailureClass::from_status(200), None);
    }

    #[test]
    fn new_breaker_is_open_health() {
        let cb = CircuitBreaker::new();
        assert_eq!(cb.health_state(), ProviderHealthState::Open);
    }

    #[test]
    fn rate_limit_failures_produce_cooldown_not_disabled() {
        let mut cb = CircuitBreaker::new();
        for _ in 0..MAX_FAILURES {
            cb.record_failure_with_status(Some(429));
        }
        assert_eq!(cb.health_state(), ProviderHealthState::Cooldown);
        assert!(cb.credential_valid());
    }

    #[test]
    fn auth_invalid_status_disables_immediately_regardless_of_failure_count() {
        let mut cb = CircuitBreaker::new();
        // A single 401 — not five failures — must disable the provider.
        cb.record_failure_with_status(Some(401));
        assert_eq!(cb.health_state(), ProviderHealthState::Disabled);
        assert!(!cb.credential_valid());
    }

    #[test]
    fn client_error_status_does_not_trip_the_circuit() {
        let mut cb = CircuitBreaker::new();
        for _ in 0..(MAX_FAILURES * 3) {
            cb.record_failure_with_status(Some(404));
        }
        assert_eq!(cb.health_state(), ProviderHealthState::Open);
        assert!(cb.can_attempt());
    }

    #[test]
    fn explicit_credential_invalid_forces_disabled_even_when_closed() {
        let mut cb = CircuitBreaker::new();
        assert_eq!(cb.health_state(), ProviderHealthState::Open);
        cb.set_credential_valid(false);
        assert_eq!(cb.health_state(), ProviderHealthState::Disabled);
    }

    #[test]
    fn success_clears_disabled_back_to_open() {
        let mut cb = CircuitBreaker::new();
        cb.record_failure_with_status(Some(401));
        assert_eq!(cb.health_state(), ProviderHealthState::Disabled);
        cb.record_success();
        assert_eq!(cb.health_state(), ProviderHealthState::Open);
        assert!(cb.credential_valid());
    }

    #[test]
    fn status_less_failure_path_matches_legacy_record_failure_exactly() {
        let mut a = CircuitBreaker::new();
        let mut b = CircuitBreaker::new();
        for _ in 0..MAX_FAILURES {
            a.record_failure();
            b.record_failure_with_status(None);
        }
        assert_eq!(a.state, b.state);
        assert_eq!(a.failure_count, b.failure_count);
        assert_eq!(a.backoff, b.backoff);
        assert_eq!(a.health_state(), b.health_state());
    }
}
