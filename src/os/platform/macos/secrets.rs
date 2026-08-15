//! macOS Keychain presence backend (Phase 11 of the host-native-os
//! program).
//!
//! Live-verified on this machine before being encoded here (see this
//! program's Phase 10 lesson: verify a security-relevant claim against
//! the real mechanism, not just against documentation): ran
//! `security add-generic-password -s <service> -a <key> -w <value>`,
//! then `security find-generic-password -s <service> -a <key>` WITHOUT
//! the `-w` flag — the output contains only keychain metadata (service
//! label, account, timestamps), never the password value; a lookup for a
//! nonexistent entry exits 44 (`SecKeychainSearchCopyNext` "item could
//! not be found"), a real one exits 0. This is exactly the presence-only
//! contract `SecretBackend::has_entry` needs, confirmed against the real
//! `security` binary, not assumed.
//!
//! This module only checks presence — it never calls `-w` to retrieve a
//! value, and never will; see `contract.rs`'s `SecretBackend` doc for why
//! that boundary is the whole point of this trait.

#[cfg(target_os = "macos")]
use super::super::contract::SecretBackend;
#[cfg(target_os = "macos")]
use anyhow::Result;

/// Fixed Keychain service label every Yana-managed entry is stored under;
/// `key` (the caller's credential name, e.g. a provider's env var name)
/// becomes the Keychain "account" attribute. One shared service label
/// with distinct accounts, rather than one service label per key, keeps
/// every Yana entry groupable in Keychain Access without inventing a
/// naming scheme per caller.
#[cfg(target_os = "macos")]
const SERVICE_LABEL: &str = "yana-ai";

/// `security find-generic-password` exit code for "no matching item" —
/// `errSecItemNotFound`. Any other non-zero exit is a real error
/// (permissions, a locked keychain, etc.), not "absent," and is
/// propagated rather than silently treated as `false`.
#[cfg(target_os = "macos")]
const ITEM_NOT_FOUND_EXIT_CODE: i32 = 44;

/// Same bounded-wait discipline as `platform::run()` (this file
/// deliberately doesn't reuse that helper: `run()` collapses the result
/// to a `success: bool`, but this backend needs to distinguish exit 0
/// from exit 44 from any other code — see `ITEM_NOT_FOUND_EXIT_CODE`'s
/// doc comment). `security` should never prompt interactively for a
/// non-interactive `find-generic-password` lookup, but a hard timeout is
/// cheap insurance against it hanging this call forever if it ever does.
#[cfg(target_os = "macos")]
const COMMAND_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(4);

#[cfg(target_os = "macos")]
pub struct Backend;

#[cfg(target_os = "macos")]
impl SecretBackend for Backend {
    fn has_entry(&self, key: &str) -> Result<bool> {
        use std::process::{Command, Stdio};
        use std::time::Instant;
        let mut child = Command::new("security")
            .args(["find-generic-password", "-s", SERVICE_LABEL, "-a", key])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| anyhow::anyhow!("starting security: {error}"))?;
        let deadline = Instant::now() + COMMAND_TIMEOUT;
        let status = loop {
            if let Some(status) = child.try_wait()? {
                break status;
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                anyhow::bail!(
                    "security find-generic-password timed out after {}s",
                    COMMAND_TIMEOUT.as_secs()
                );
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        };
        match status.code() {
            Some(0) => Ok(true),
            Some(ITEM_NOT_FOUND_EXIT_CODE) => Ok(false),
            Some(code) => Err(anyhow::anyhow!(
                "security find-generic-password exited {code} (neither found nor confirmed absent)"
            )),
            None => Err(anyhow::anyhow!(
                "security find-generic-password terminated by signal"
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "macos")]
    #[test]
    fn has_entry_reports_false_for_a_key_that_was_never_stored() {
        // No add-generic-password call anywhere in this test — a random
        // key is, with overwhelming probability, never present. This is
        // a real call to the real `security` binary (not mocked), the
        // same live mechanism verified manually before writing this file.
        let backend = Backend;
        let key = format!("yana-phase11-test-absent-{}", uuid::Uuid::new_v4());
        assert!(!backend.has_entry(&key).unwrap());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn has_entry_reports_true_for_a_real_stored_entry_and_never_reads_its_value() {
        // Full round trip against the real macOS Keychain on this
        // machine: add a real entry via `security` directly (not through
        // this backend, which deliberately has no write path), confirm
        // has_entry finds it, then remove it. has_entry's own return
        // type is `bool` -- there is no code path here through which the
        // secret value `"do-not-print-this-value"` could reach this
        // test's assertions even if it wanted to.
        let key = format!("yana-phase11-test-present-{}", uuid::Uuid::new_v4());
        let add = std::process::Command::new("security")
            .args([
                "add-generic-password",
                "-s",
                SERVICE_LABEL,
                "-a",
                &key,
                "-w",
                "do-not-print-this-value",
            ])
            .status()
            .unwrap();
        assert!(add.success(), "test setup: failed to seed a Keychain entry");

        let backend = Backend;
        let result = backend.has_entry(&key);

        let _ = std::process::Command::new("security")
            .args(["delete-generic-password", "-s", SERVICE_LABEL, "-a", &key])
            .status();

        assert!(result.unwrap());
    }
}
