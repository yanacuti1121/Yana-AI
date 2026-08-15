//! Windows Credential Manager presence backend, via `cmdkey` — Phase 11
//! of the host-native-os program.
//!
//! Honesty note (same as `platform::linux::secrets`): NOT live-verified
//! this session — no Windows machine is available. `cmdkey` never prints
//! a stored password in plaintext (a hard Windows Credential Manager
//! guarantee — there is no `cmdkey` flag that reveals one), so this
//! mechanism is safe from a secret-exposure standpoint regardless of the
//! exact output shape; what is NOT independently confirmed here is the
//! precise exit-code contract for `/list:<target>` against a
//! nonexistent target. Documented best-known behavior: `cmdkey
//! /list:<target>` against a target that does not exist prints a
//! "Credential does not exist" style message and does not report the
//! target as listed; a present target's stored entry (type, target name
//! — never the secret) is printed instead. This should be confirmed
//! against a real Windows host before being trusted in production, the
//! same way `security`'s contract was confirmed on macOS this session.
//! Matches this program's established, already-accepted pattern for
//! Windows code written without live Windows access (`platform::windows::
//! {telemetry,service,profile}`).

#[cfg(any(test, target_os = "windows"))]
use super::super::contract::SecretBackend;
#[cfg(any(test, target_os = "windows"))]
use anyhow::Result;

/// `cmdkey` target-name prefix every Yana-managed entry is stored under;
/// `key` is appended to form the full target name.
#[cfg(any(test, target_os = "windows"))]
const TARGET_PREFIX: &str = "yana-ai:";

#[cfg(target_os = "windows")]
const COMMAND_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(4);

#[cfg(any(test, target_os = "windows"))]
pub struct Backend;

#[cfg(any(test, target_os = "windows"))]
fn target_name(key: &str) -> String {
    format!("{TARGET_PREFIX}{key}")
}

#[cfg(target_os = "windows")]
impl SecretBackend for Backend {
    fn has_entry(&self, key: &str) -> Result<bool> {
        use std::process::{Command, Stdio};
        use std::time::Instant;
        let mut child = Command::new("cmdkey")
            .arg(format!("/list:{}", target_name(key)))
            .stdin(Stdio::null())
            // Discarded, not parsed: cmdkey never prints a stored
            // password in plaintext, so reading this would only ever
            // yield target-name/type metadata -- but this backend has no
            // need for it, so it is never captured at all.
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| anyhow::anyhow!("starting cmdkey: {error}"))?;
        let deadline = Instant::now() + COMMAND_TIMEOUT;
        let status = loop {
            if let Some(status) = child.try_wait()? {
                break status;
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                anyhow::bail!(
                    "cmdkey /list timed out after {}s",
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
    fn target_name_namespaces_the_key_under_the_yana_prefix() {
        assert_eq!(
            target_name("ANTHROPIC_API_KEY"),
            "yana-ai:ANTHROPIC_API_KEY"
        );
    }
}
