//! Bounded exponential backoff for supervised child processes.
//!
//! Algorithm matches the validated approach in ZeroClaw's daemon
//! supervisor (`daemon/mod.rs`, read read-only for this session's
//! research, never forked/embedded): double the delay on every exit,
//! capped at a maximum, and reset to the initial delay once a component
//! has just run stably for long enough that continuing to inflate the
//! backoff would only slow down recovery from a genuinely new failure.

use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BoundedBackoff {
    initial: Duration,
    max: Duration,
    stable_run_threshold: Duration,
    current: Duration,
}

impl BoundedBackoff {
    pub fn new(initial: Duration, max: Duration, stable_run_threshold: Duration) -> Self {
        let initial = if initial.is_zero() {
            Duration::from_millis(1)
        } else {
            initial
        };
        Self {
            initial,
            max: max.max(initial),
            stable_run_threshold,
            current: initial,
        }
    }

    pub fn current(&self) -> Duration {
        self.current
    }

    /// Record that the supervised process just exited after running for
    /// `ran_for`. Returns the delay to wait before the next restart.
    ///
    /// This is invoked on every exit, not only failed ones: the reset
    /// decision is based on how long the process ran, not its exit code,
    /// matching the adopted ZeroClaw algorithm.
    pub fn record_failure(&mut self, ran_for: Duration) -> Duration {
        self.current = if ran_for >= self.stable_run_threshold {
            self.initial
        } else {
            self.current.saturating_mul(2).min(self.max)
        };
        self.current
    }

    pub fn reset(&mut self) {
        self.current = self.initial;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn backoff() -> BoundedBackoff {
        BoundedBackoff::new(
            Duration::from_secs(1),
            Duration::from_secs(30),
            Duration::from_secs(60),
        )
    }

    #[test]
    fn doubles_on_repeated_quick_failures() {
        let mut backoff = backoff();
        assert_eq!(
            backoff.record_failure(Duration::from_secs(1)),
            Duration::from_secs(2)
        );
        assert_eq!(
            backoff.record_failure(Duration::from_secs(1)),
            Duration::from_secs(4)
        );
        assert_eq!(
            backoff.record_failure(Duration::from_secs(1)),
            Duration::from_secs(8)
        );
    }

    #[test]
    fn caps_at_max_and_never_exceeds_it() {
        let mut backoff = backoff();
        for _ in 0..10 {
            backoff.record_failure(Duration::from_millis(1));
        }
        assert_eq!(backoff.current(), Duration::from_secs(30));
    }

    #[test]
    fn resets_to_initial_after_a_stable_run() {
        let mut backoff = backoff();
        backoff.record_failure(Duration::from_secs(1));
        backoff.record_failure(Duration::from_secs(1));
        assert_eq!(backoff.current(), Duration::from_secs(4));
        assert_eq!(
            backoff.record_failure(Duration::from_secs(90)),
            Duration::from_secs(1)
        );
    }

    #[test]
    fn zero_initial_delay_does_not_stall_growth_forever() {
        let mut backoff = BoundedBackoff::new(
            Duration::ZERO,
            Duration::from_secs(10),
            Duration::from_secs(60),
        );
        assert_eq!(backoff.current(), Duration::from_millis(1));
        backoff.record_failure(Duration::from_millis(1));
        assert!(backoff.current() > Duration::from_millis(1));
    }

    #[test]
    fn explicit_reset_returns_to_initial() {
        let mut backoff = backoff();
        backoff.record_failure(Duration::from_millis(1));
        backoff.record_failure(Duration::from_millis(1));
        backoff.reset();
        assert_eq!(backoff.current(), Duration::from_secs(1));
    }
}
