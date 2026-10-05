//! A clock the run loop reads, so tests move time by hand instead of sleeping.

use std::time::Instant;

pub(crate) trait Clock: Send + Sync {
    /// Milliseconds since some fixed point; only differences matter.
    fn now_ms(&self) -> u64;
}

/// The real clock: monotonic, unaffected by changes of the system time.
pub(crate) struct SystemClock {
    start: Instant,
}

impl SystemClock {
    pub(crate) fn new() -> Self {
        Self { start: Instant::now() }
    }
}

impl Clock for SystemClock {
    fn now_ms(&self) -> u64 {
        u64::try_from(self.start.elapsed().as_millis()).unwrap_or(u64::MAX)
    }
}

/// A clock that moves only when told to.
#[cfg(test)]
#[derive(Default)]
pub(crate) struct ManualClock {
    now: std::sync::atomic::AtomicU64,
}

#[cfg(test)]
impl ManualClock {
    pub(crate) fn advance(&self, ms: u64) {
        self.now.fetch_add(ms, std::sync::atomic::Ordering::SeqCst);
    }
}

#[cfg(test)]
impl Clock for ManualClock {
    fn now_ms(&self) -> u64 {
        self.now.load(std::sync::atomic::Ordering::SeqCst)
    }
}
