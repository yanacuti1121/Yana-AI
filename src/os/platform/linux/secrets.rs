//! Linux Secret Service presence backend, via `secret-tool` (from
//! `libsecret-tools`) — Phase 11 of the host-native-os program.
//!
//! Honesty note (unlike macOS's `security`, verified live on this
//! session's real hardware): this file was written and unit-tested for
//! its pure logic, but `secret-tool` itself was NOT run live this
//! session — there is no Linux machine available to this session. The
//! exit-code contract below (0 = found, 1 = not found) matches
//! `secret-tool`'s documented behavior and `libsecret`'s own error
//! convention, but should be confirmed against a real Linux host before
//! being trusted in production, the same way `security`'s contract was
//! confirmed here. This matches how this program's Windows code
//! (`platform::windows::{telemetry,service,profile}`) was already
//! written without live Windows verification — an established, already
//! -accepted pattern in this codebase, not a new relaxation.
//!
//! `secret-tool lookup` PRINTS the secret value to stdout when found —
//! this backend must never read, log, or otherwise surface that output;
//! it inspects only the exit status, with stdout redirected to
//! `/dev/null` at the OS level so the value never enters this process's
//! memory at all.
//!
//! `is_available()` checks for the `secret-tool` binary itself:
//! `libsecret-tools` is commonly present on GNOME-based desktop distros
//! but is NOT installed by default on many server/headless Linux
//! systems — absence here is a real, common `Support::Unsupported`
//! outcome, not a bug.

#[cfg(any(test, target_os = "linux"))]
use super::super::capabilities::Support;
#[cfg(any(test, target_os = "linux"))]
use super::super::contract::SecretBackend;
#[cfg(any(test, target_os = "linux"))]
use anyhow::Result;

/// Attribute name every Yana-managed entry is stored under; `key`
/// becomes the attribute's value, mirroring macOS's `service`/`account`
/// split with `secret-tool`'s flat attribute-list model.
#[cfg(any(test, target_os = "linux"))]
const ATTRIBUTE_NAME: &str = "yana-ai-key";

#[cfg(any(test, target_os = "linux"))]
const COMMAND_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(4);

/// Phase 18 (host-native-os program, Cross-Platform Test Matrix): before
/// this phase, every item in this file was gated `cfg(target_os =
/// "linux")` only — meaning none of it, not even a syntax/type check,
/// ever compiled on the macOS machine this program has been developed
/// on. `windows::secrets`'s `target_name()` already had `cfg(any(test,
/// target_os = "windows"))` parity; this file did not. `Backend` and its
/// inherent `is_available()` are now `cfg(any(test, ...))` too, closing
/// that gap — `SecretBackend`'s trait impl (the part that actually shells
/// out to `secret-tool lookup`) stays Linux-only, since running it on a
/// non-Linux host would only ever hit "command not found," not exercise
/// real logic.
#[cfg(any(test, target_os = "linux"))]
pub struct Backend;

#[cfg(any(test, target_os = "linux"))]
impl Backend {
    pub fn is_available(&self) -> Support {
        if std::process::Command::new("secret-tool")
            .arg("--version")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .is_ok_and(|status| status.success())
        {
            Support::Supported
        } else {
            Support::Unsupported
        }
    }
}

#[cfg(target_os = "linux")]
impl SecretBackend for Backend {
    fn has_entry(&self, key: &str) -> Result<bool> {
        use std::process::{Command, Stdio};
        use std::time::Instant;
        let mut child = Command::new("secret-tool")
            .args(["lookup", ATTRIBUTE_NAME, key])
            .stdin(Stdio::null())
            // Deliberately discarded at the OS level, never read into
            // this process: `secret-tool lookup` prints the secret value
            // itself on a match.
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| anyhow::anyhow!("starting secret-tool: {error}"))?;
        let deadline = Instant::now() + COMMAND_TIMEOUT;
        let status = loop {
            if let Some(status) = child.try_wait()? {
                break status;
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                anyhow::bail!(
                    "secret-tool lookup timed out after {}s",
                    COMMAND_TIMEOUT.as_secs()
                );
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        };
        Ok(status.success())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_available_reports_unsupported_rather_than_panicking_when_the_binary_is_absent() {
        // Runs on every host this workspace builds on, not only Linux —
        // that is the point (Phase 18). On a host without `secret-tool`
        // on PATH (this session's own macOS machine included), the
        // command fails to report success and is_available() must return
        // the honest Unsupported outcome, not panic or hang. This proves
        // the failure path of "host capability unknown semantics" works,
        // independent of which OS actually runs it.
        let backend = Backend;
        // Assertion is conditional on absence, not hardcoded to
        // Unsupported, so this test also passes truthfully on a real
        // Linux host that happens to have secret-tool installed.
        let has_binary = std::process::Command::new("secret-tool")
            .arg("--version")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .is_ok_and(|status| status.success());
        let expected = if has_binary {
            Support::Supported
        } else {
            Support::Unsupported
        };
        assert_eq!(backend.is_available(), expected);
    }

    #[test]
    fn attribute_name_is_stable_and_namespaced() {
        // A pure-data regression guard: a future edit that accidentally
        // changes this constant would silently orphan every secret
        // already stored under the old attribute name in a real Secret
        // Service keyring. Cross-platform on purpose (Phase 18) -- this
        // constant's value matters regardless of which host compiles it.
        assert_eq!(ATTRIBUTE_NAME, "yana-ai-key");
    }
}
