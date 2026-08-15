//! Normalized host events (Phase 8 of the host-native-os program).
//!
//! Honest scope, per this phase's own instruction ("do not chase complete
//! parity"): this module implements event DETECTION for the three event
//! kinds derivable from data this program already collects, with zero new
//! dependencies —
//!
//!   - `Sleep`/`Wake`   — a reconciliation gap much larger than the
//!     expected poll interval is strong evidence the system was asleep
//!     for some part of that gap (a well-known technique; not exact
//!     timing, but honest about that limitation).
//!   - `ResourcePressureChanged` — diffs two `pressure::collect()`
//!     (Phase 5) readings.
//!   - `ServiceChanged` — diffs two `ServiceStatus` readings (Phase 4);
//!     the pure diff is implemented and tested here, but not yet wired to
//!     a live poll loop in this phase (that requires a concrete
//!     `ServiceDefinition`, an `os::service`-specific detail this module
//!     should not hardcode).
//!
//! `FilesystemChanged`, `ProcessStarted`, `ProcessExited`, and
//! `NetworkChanged` are declared in `HostEvent` (so callers can match on
//! the complete set now) but are NOT detected by anything in this phase.
//! Real native mechanisms for these (FSEvents/inotify/
//! ReadDirectoryChangesW for filesystem; kqueue/netlink/WMI eventing for
//! process/network) all require either raw FFI or a new crate dependency
//! — genuinely out of scope for "no new dependencies unless absolutely
//! necessary," and rushing an unreliable polling approximation (e.g.
//! diffing the entire system process table every tick) would be worse
//! than admitting these are unsupported. `platform/{macos,linux,windows}/
//! events.rs` are correctly absent this phase — creating them empty, with
//! no real per-OS mechanism yet implemented, would violate "do not create
//! empty modules."
//!
//! Architecture, per this phase's own mandate: this is the "periodic
//! reconciliation" half of "native event reaction + periodic
//! reconciliation," not the fast-reaction half — it derives events FROM
//! a poll, it does not push events as they happen. `os::monitor_service`'s
//! existing tick scheduler is untouched; this module is designed to be
//! called from within that tick, not to replace it.

use super::super::resource::pressure::{self, PressureLevel};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum HostEvent {
    FilesystemChanged {
        path: String,
    },
    ProcessStarted {
        pid: u32,
    },
    ProcessExited {
        pid: u32,
        exit_code: Option<i32>,
    },
    ResourcePressureChanged {
        from: PressureLevel,
        to: PressureLevel,
    },
    Sleep,
    Wake,
    NetworkChanged,
    ServiceChanged {
        service_id: String,
        registered: Option<bool>,
        running: Option<bool>,
    },
}

/// Durable, small piece of state a caller persists between reconciliation
/// ticks so `reconcile()` has something to diff against. Deliberately not
/// tied to `os::state`'s schema — this is reconciliation-local, not
/// authority (see Phase 17's STATE vs OBSERVATION distinction, which this
/// module already respects: this is an OBSERVATION snapshot).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
pub struct ReconciliationState {
    pub last_tick_unix_secs: Option<u64>,
    pub last_pressure: Option<PressureLevel>,
}

/// A gap this many times the expected poll interval is treated as
/// evidence of a sleep/wake cycle rather than ordinary scheduling jitter.
/// Interval-relative on purpose — an absolute magic number would be wrong
/// for a caller ticking every 10s as much as one ticking every 10 minutes.
const SLEEP_GAP_MULTIPLIER: u64 = 3;

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn detect_sleep_wake(
    last_tick_unix_secs: Option<u64>,
    now_unix_secs: u64,
    expected_interval_secs: u64,
) -> Vec<HostEvent> {
    let Some(last) = last_tick_unix_secs else {
        return Vec::new();
    };
    let gap = now_unix_secs.saturating_sub(last);
    if expected_interval_secs > 0
        && gap >= expected_interval_secs.saturating_mul(SLEEP_GAP_MULTIPLIER)
    {
        // Exact sleep/wake timestamps are unknowable from a gap alone —
        // only that some sleep interval occurred within [last, now]. Both
        // events are reported together, once, on the tick that notices
        // the gap.
        vec![HostEvent::Sleep, HostEvent::Wake]
    } else {
        Vec::new()
    }
}

fn detect_pressure_change(
    previous: Option<PressureLevel>,
    current: PressureLevel,
) -> Option<HostEvent> {
    let previous = previous?;
    if previous == current {
        return None;
    }
    Some(HostEvent::ResourcePressureChanged {
        from: previous,
        to: current,
    })
}

/// Pure diff — the live wiring (fetching two real `ServiceStatus`
/// readings for a specific service across two ticks) is left to a caller
/// that has a concrete `ServiceDefinition`; see this module's doc comment.
pub fn detect_service_change(
    service_id: &str,
    previous: Option<(Option<bool>, Option<bool>)>,
    current: (Option<bool>, Option<bool>),
) -> Option<HostEvent> {
    let previous = previous?;
    if previous == current {
        return None;
    }
    Some(HostEvent::ServiceChanged {
        service_id: service_id.to_string(),
        registered: current.0,
        running: current.1,
    })
}

/// Runs one reconciliation tick: collects fresh pressure (Phase 5),
/// diffs it and the tick timing against `state`, and returns whatever
/// `HostEvent`s that comparison justifies plus the updated state for the
/// next call. `expected_interval_secs` should match the caller's actual
/// poll interval (e.g. `os::monitor_service`'s configured interval).
pub fn reconcile(
    root: &Path,
    state: ReconciliationState,
    expected_interval_secs: u64,
) -> (Vec<HostEvent>, ReconciliationState) {
    let now = now_unix_secs();
    let mut events = detect_sleep_wake(state.last_tick_unix_secs, now, expected_interval_secs);

    let pressure = pressure::collect(root);
    if let Some(event) = detect_pressure_change(state.last_pressure, pressure.overall) {
        events.push(event);
    }

    let next_state = ReconciliationState {
        last_tick_unix_secs: Some(now),
        last_pressure: Some(pressure.overall),
    };
    (events, next_state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_ever_tick_reports_no_events() {
        let state = ReconciliationState::default();
        assert!(detect_sleep_wake(state.last_tick_unix_secs, 1000, 60).is_empty());
        assert_eq!(
            detect_pressure_change(state.last_pressure, PressureLevel::Normal),
            None
        );
    }

    #[test]
    fn ordinary_scheduling_jitter_is_not_a_sleep_wake_cycle() {
        // 65s gap against a 60s expected interval -- just late, not asleep.
        assert!(detect_sleep_wake(Some(1000), 1065, 60).is_empty());
    }

    #[test]
    fn a_gap_well_beyond_the_expected_interval_is_a_sleep_wake_cycle() {
        let events = detect_sleep_wake(Some(1000), 1000 + 60 * 10, 60);
        assert_eq!(events, vec![HostEvent::Sleep, HostEvent::Wake]);
    }

    #[test]
    fn zero_expected_interval_never_fires_to_avoid_a_div_by_zero_style_false_positive() {
        assert!(detect_sleep_wake(Some(1000), 999_999, 0).is_empty());
    }

    #[test]
    fn pressure_change_is_reported_only_on_an_actual_transition() {
        assert_eq!(
            detect_pressure_change(Some(PressureLevel::Normal), PressureLevel::Critical),
            Some(HostEvent::ResourcePressureChanged {
                from: PressureLevel::Normal,
                to: PressureLevel::Critical
            })
        );
        assert_eq!(
            detect_pressure_change(Some(PressureLevel::Normal), PressureLevel::Normal),
            None
        );
    }

    #[test]
    fn service_change_is_reported_only_on_an_actual_transition() {
        assert_eq!(
            detect_service_change(
                "giamthi",
                Some((Some(true), Some(false))),
                (Some(true), Some(true))
            ),
            Some(HostEvent::ServiceChanged {
                service_id: "giamthi".into(),
                registered: Some(true),
                running: Some(true),
            })
        );
        assert_eq!(
            detect_service_change(
                "giamthi",
                Some((Some(true), Some(true))),
                (Some(true), Some(true))
            ),
            None
        );
    }

    #[test]
    fn service_change_with_no_previous_reading_reports_nothing() {
        assert_eq!(
            detect_service_change("giamthi", None, (Some(true), Some(true))),
            None
        );
    }

    #[test]
    fn reconcile_runs_against_a_real_root_without_panicking() {
        let root = std::env::temp_dir();
        let (events, state) = reconcile(&root, ReconciliationState::default(), 60);
        // First-ever call: no prior state, so no events yet -- just
        // confirms the live wiring (pressure::collect against a real
        // path) doesn't panic and produces a usable next state.
        assert!(events.is_empty());
        assert!(state.last_tick_unix_secs.is_some());
        assert!(state.last_pressure.is_some());
    }
}
