//! Helpers for tests that run real child processes (shared by the MCP and LSP clients).
//! The fake servers are `sh` scripts and the checks use `ps`, so this is Unix-only.

use std::path::Path;
use std::time::{Duration, Instant};

/// Dead means gone or an un-reaped zombie (which still answers `kill -0`).
pub(crate) fn is_dead(pid: &str) -> bool {
    let out = std::process::Command::new("ps").args(["-o", "stat=", "-p", pid]).output().unwrap();
    let stat = String::from_utf8_lossy(&out.stdout).trim().to_string();
    stat.is_empty() || stat.starts_with('Z')
}

pub(crate) fn wait_for(path: &Path) -> String {
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        if let Ok(text) = std::fs::read_to_string(path) {
            if !text.trim().is_empty() {
                return text.trim().to_string();
            }
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    panic!("{} was never written", path.display());
}
