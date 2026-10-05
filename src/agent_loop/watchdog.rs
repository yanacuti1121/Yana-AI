//! The wall-clock and idle limits of a run, watched from a thread of their own because a
//! stalled model call never gives the run loop a chance to look at the time.

use super::{Clock, Limit, RunLimits};
use crate::runtime::CancellationToken;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

/// How often the watcher looks at the clock.
pub(super) const POLL: Duration = Duration::from_millis(20);

pub(super) struct Watchdog {
    stop: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
    fired: Arc<Mutex<Option<Limit>>>,
}

impl Watchdog {
    /// Start watching. When a limit is passed, `token` is cancelled and the limit is recorded.
    /// `last_event_ms` is set by the run loop to the clock's time at every event.
    pub(super) fn spawn(clock: Arc<dyn Clock>, limits: &RunLimits, token: CancellationToken, last_event_ms: Arc<AtomicU64>, poll: Duration) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let fired: Arc<Mutex<Option<Limit>>> = Arc::default();
        let (wall, idle) = (duration_ms(limits.wall), duration_ms(limits.idle));
        let started = clock.now_ms();
        let handle = (wall > 0 || idle > 0).then(|| {
            let (stop, fired) = (Arc::clone(&stop), Arc::clone(&fired));
            std::thread::spawn(move || {
                while !stop.load(Ordering::Acquire) {
                    let now = clock.now_ms();
                    let limit = if wall > 0 && now.saturating_sub(started) >= wall {
                        Some(Limit::Wall)
                    } else if idle > 0 && now.saturating_sub(last_event_ms.load(Ordering::Acquire)) >= idle {
                        Some(Limit::Idle)
                    } else {
                        None
                    };
                    if let Some(limit) = limit {
                        if let Ok(mut slot) = fired.lock() {
                            slot.get_or_insert(limit);
                        }
                        token.cancel();
                        return;
                    }
                    std::thread::sleep(poll);
                }
            })
        });
        Self { stop, handle, fired }
    }

    /// Stop watching and say which limit fired, if one did.
    pub(super) fn finish(mut self) -> Option<Limit> {
        self.stop.store(true, Ordering::Release);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
        self.fired.lock().ok().and_then(|slot| *slot)
    }
}

fn duration_ms(d: Duration) -> u64 {
    u64::try_from(d.as_millis()).unwrap_or(u64::MAX)
}
