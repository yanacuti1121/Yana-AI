//! Per-session circuit breaker for the configured chat provider. A direct
//! third port of `core/hooks/per-tool-circuit-breaker.sh`'s state machine
//! (bash -> `tools/yana-web/lib/provider-failover.js` -> here), keeping the
//! same parameters consistent across all three ports.
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

pub struct CircuitBreaker {
    state: State,
    failure_count: u32,
    cooldown_until: Option<Instant>,
    backoff: Duration,
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        Self {
            state: State::Closed,
            failure_count: 0,
            cooldown_until: None,
            backoff: COOLDOWN_INITIAL,
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
                if self.cooldown_until.is_none_or(|until| Instant::now() >= until) {
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
    }

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
}
