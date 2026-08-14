//! Supervision loop: restart a governed child on exit, with bounded
//! exponential backoff, while respecting the shared cross-engine halt
//! lock fail-closed.
//!
//! The watchdog never restarts a halted component, and a halt takes
//! effect on the very next restart decision — the same "only a human
//! clears it" asymmetry `os::supervisor::halt()`/`unlock()` already
//! implement for the rest of this system, reused here rather than
//! reinvented: this reads the exact same `.claude/state/GIAMTHI_HALT.lock`
//! path, resolved from the same project-root anchor.

use anyhow::Result;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::attribution::{self, ProcessAttribution};
use super::monitor::{BoundedBackoff, HealthRegistry, HealthState};

const HALT_RELATIVE_PATH: &str = ".claude/state/GIAMTHI_HALT.lock";
const CHILD_POLL_INTERVAL: Duration = Duration::from_millis(50);

#[derive(Debug, Clone)]
pub struct WatchdogConfig {
    pub component: String,
    pub argv: Vec<String>,
    pub owner: ProcessAttribution,
    pub initial_backoff: Duration,
    pub max_backoff: Duration,
    pub stable_run_threshold: Duration,
    /// `None` means unlimited restarts (the normal always-on case).
    pub max_restarts: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WatchdogOutcome {
    /// `.claude/state/GIAMTHI_HALT.lock` is present; the watchdog stopped
    /// without spawning anything further.
    Halted,
    /// `max_restarts` was exceeded; a human must intervene.
    MaxRestartsReached,
}

pub(crate) enum RunOutcome {
    /// The child exited (successfully or not); wait `Duration` then call
    /// `run_once` again.
    Restart(Duration),
    Stopped(WatchdogOutcome),
}

pub struct Watchdog<'a> {
    root: PathBuf,
    config: WatchdogConfig,
    health: &'a HealthRegistry,
    backoff: BoundedBackoff,
}

impl<'a> Watchdog<'a> {
    pub fn new(root: &Path, config: WatchdogConfig, health: &'a HealthRegistry) -> Self {
        let backoff = BoundedBackoff::new(
            config.initial_backoff,
            config.max_backoff,
            config.stable_run_threshold,
        );
        Self {
            root: root.to_path_buf(),
            config,
            health,
            backoff,
        }
    }

    fn is_halted(&self) -> bool {
        match std::fs::symlink_metadata(self.root.join(HALT_RELATIVE_PATH)) {
            Ok(_) => true,
            Err(error) => error.kind() != std::io::ErrorKind::NotFound,
        }
    }

    /// Run one supervised child to completion (spawn, wait for exit) and
    /// decide what happens next. Exposed as its own step, rather than
    /// buried inside a loop, specifically so tests can assert on a single
    /// halt-then-stop or restart-with-backoff decision without waiting on
    /// a real sleep.
    pub(crate) fn run_once(&mut self, restart_count: u32) -> Result<RunOutcome> {
        if self.is_halted() {
            self.health
                .set_state(&self.config.component, HealthState::Halted);
            return Ok(RunOutcome::Stopped(WatchdogOutcome::Halted));
        }
        if let Some(max) = self.config.max_restarts {
            if restart_count > max {
                self.health
                    .set_state(&self.config.component, HealthState::HumanRequired);
                return Ok(RunOutcome::Stopped(WatchdogOutcome::MaxRestartsReached));
            }
        }
        self.health
            .set_state(&self.config.component, HealthState::Restarting);
        self.health.record_restart(&self.config.component);
        let mut governed =
            attribution::spawn(&self.root, &self.config.argv, self.config.owner.clone())?;
        let started = Instant::now();
        let status = loop {
            if self.is_halted() {
                governed.terminate_and_reap();
                self.health
                    .set_state(&self.config.component, HealthState::Halted);
                return Ok(RunOutcome::Stopped(WatchdogOutcome::Halted));
            }
            if let Some(status) = governed.child.try_wait()? {
                break status;
            }
            std::thread::sleep(CHILD_POLL_INTERVAL);
        };
        let ran_for = started.elapsed();
        // Invoked on every exit, success or failure: the reset-vs-double
        // decision is duration-based, matching the adopted ZeroClaw
        // algorithm in `crate::monitor::backoff`.
        let delay = self.backoff.record_failure(ran_for);
        if status.success() {
            self.health
                .set_state(&self.config.component, HealthState::Healthy);
        } else {
            self.health
                .record_error(&self.config.component, &format!("exit status: {status}"));
            self.health
                .set_state(&self.config.component, HealthState::Backoff);
        }
        Ok(RunOutcome::Restart(delay))
    }

    /// Drive `run_once` in a loop until halted or `max_restarts` is
    /// exceeded, sleeping `sleep(delay)` between restarts. `sleep` is
    /// injectable so tests can drive the loop deterministically without
    /// waiting on real backoff delays.
    pub fn supervise(&mut self, mut sleep: impl FnMut(Duration)) -> WatchdogOutcome {
        let mut restart_count = 0u32;
        loop {
            match self.run_once(restart_count) {
                Ok(RunOutcome::Stopped(outcome)) => return outcome,
                Ok(RunOutcome::Restart(delay)) => {
                    restart_count += 1;
                    sleep(delay);
                }
                Err(error) => {
                    self.health
                        .record_error(&self.config.component, &error.to_string());
                    restart_count += 1;
                    sleep(self.backoff.current());
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn temp_root() -> PathBuf {
        std::env::temp_dir().join(format!("yana-watchdog-{}", Uuid::new_v4()))
    }

    #[cfg(unix)]
    fn config(argv: Vec<String>, max_restarts: Option<u32>) -> WatchdogConfig {
        WatchdogConfig {
            component: "test-component".into(),
            argv,
            owner: ProcessAttribution {
                agent_id: "watchdog-test".into(),
                session_id: None,
                mission_id: None,
            },
            initial_backoff: Duration::from_millis(1),
            max_backoff: Duration::from_millis(10),
            stable_run_threshold: Duration::from_secs(60),
            max_restarts,
        }
    }

    #[test]
    fn a_present_halt_lock_stops_without_spawning() {
        let root = temp_root();
        std::fs::create_dir_all(root.join(".claude/state")).unwrap();
        std::fs::write(root.join(HALT_RELATIVE_PATH), "halted for test").unwrap();
        let health = HealthRegistry::new();
        // Deliberately not-a-real-binary: if the watchdog ever tried to
        // spawn it, run_once would return Err, not the Halted outcome
        // asserted below.
        let cfg = WatchdogConfig {
            component: "svc".into(),
            argv: vec!["/definitely/not/a/real/binary-xyz".into()],
            owner: ProcessAttribution {
                agent_id: "test".into(),
                session_id: None,
                mission_id: None,
            },
            initial_backoff: Duration::from_millis(1),
            max_backoff: Duration::from_millis(10),
            stable_run_threshold: Duration::from_secs(60),
            max_restarts: None,
        };
        let mut watchdog = Watchdog::new(&root, cfg, &health);
        let outcome = watchdog.supervise(|_| {});
        assert_eq!(outcome, WatchdogOutcome::Halted);
        assert_eq!(health.component("svc").unwrap().state, HealthState::Halted);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn non_regular_halt_state_also_stops_fail_closed() {
        let root = temp_root();
        std::fs::create_dir_all(root.join(HALT_RELATIVE_PATH)).unwrap();
        let health = HealthRegistry::new();
        let cfg = WatchdogConfig {
            component: "svc".into(),
            argv: vec!["/definitely/not/a/real/binary-xyz".into()],
            owner: ProcessAttribution {
                agent_id: "test".into(),
                session_id: None,
                mission_id: None,
            },
            initial_backoff: Duration::from_millis(1),
            max_backoff: Duration::from_millis(10),
            stable_run_threshold: Duration::from_secs(60),
            max_restarts: None,
        };
        let mut watchdog = Watchdog::new(&root, cfg, &health);
        assert!(matches!(
            watchdog.run_once(0).unwrap(),
            RunOutcome::Stopped(WatchdogOutcome::Halted)
        ));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn max_restarts_is_respected_and_flags_human_required() {
        let root = temp_root();
        std::fs::create_dir_all(&root).unwrap();
        let health = HealthRegistry::new();
        let cfg = config(
            vec!["/bin/sh".into(), "-c".into(), "exit 1".into()],
            Some(1),
        );
        let mut watchdog = Watchdog::new(&root, cfg, &health);
        let mut sleeps = 0u32;
        let outcome = watchdog.supervise(|_| sleeps += 1);
        assert_eq!(outcome, WatchdogOutcome::MaxRestartsReached);
        assert_eq!(
            health.component("test-component").unwrap().state,
            HealthState::HumanRequired
        );
        assert!(sleeps >= 1);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn successful_exit_marks_healthy_and_still_requests_a_restart() {
        let root = temp_root();
        std::fs::create_dir_all(&root).unwrap();
        let health = HealthRegistry::new();
        let cfg = config(vec!["/bin/sh".into(), "-c".into(), "exit 0".into()], None);
        let mut watchdog = Watchdog::new(&root, cfg, &health);
        let outcome = watchdog.run_once(0).unwrap();
        assert!(matches!(outcome, RunOutcome::Restart(_)));
        let recorded = health.component("test-component").unwrap();
        assert_eq!(recorded.state, HealthState::Healthy);
        assert_eq!(recorded.restart_count, 1);
        assert!(recorded.last_error.is_none());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn failed_exit_marks_backoff_and_records_the_error() {
        let root = temp_root();
        std::fs::create_dir_all(&root).unwrap();
        let health = HealthRegistry::new();
        let cfg = config(vec!["/bin/sh".into(), "-c".into(), "exit 7".into()], None);
        let mut watchdog = Watchdog::new(&root, cfg, &health);
        let outcome = watchdog.run_once(0).unwrap();
        assert!(matches!(outcome, RunOutcome::Restart(_)));
        let recorded = health.component("test-component").unwrap();
        assert_eq!(recorded.state, HealthState::Backoff);
        assert!(recorded
            .last_error
            .as_deref()
            .unwrap_or_default()
            .contains('7'));
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn halt_created_while_child_runs_stops_child_and_prevents_restart() {
        let root = temp_root();
        std::fs::create_dir_all(root.join(".claude/state")).unwrap();
        let marker = root.join("running.pid");
        let cfg = config(
            vec![
                "/bin/sh".into(),
                "-c".into(),
                format!("echo $$ > '{}'; sleep 30", marker.display()),
            ],
            None,
        );
        let halt = root.join(HALT_RELATIVE_PATH);
        let marker_for_thread = marker.clone();
        let writer = std::thread::spawn(move || {
            for _ in 0..100 {
                if marker_for_thread.is_file() {
                    std::fs::write(halt, "halt during child run").unwrap();
                    return;
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            panic!("child never wrote its running marker");
        });
        let health = HealthRegistry::new();
        let mut watchdog = Watchdog::new(&root, cfg, &health);
        let outcome = watchdog.run_once(0).unwrap();
        writer.join().unwrap();
        assert!(matches!(
            outcome,
            RunOutcome::Stopped(WatchdogOutcome::Halted)
        ));
        assert_eq!(
            health.component("test-component").unwrap().state,
            HealthState::Halted
        );
        let pid: i32 = std::fs::read_to_string(marker)
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        assert_ne!(
            unsafe { libc::kill(pid, 0) },
            0,
            "halted child {pid} survived"
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
