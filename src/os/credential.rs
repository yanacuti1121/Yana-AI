//! Presence-only credential inventory backed by the canonical model-plane
//! catalog (`crate::model::catalog` — moved there from `crate::chat` in
//! Phase 6 of the host-native-os program, since this file, `os::`, has no
//! business depending on the chat UI layer just to enumerate providers).
//!
//! Phase 11 (host-native-os program): "configured" now also consults the
//! host-native secret backend (`platform::secret_backend()` —
//! macOS Keychain / Linux Secret Service / Windows Credential Manager),
//! not only the environment variable. Environment variables remain full
//! compatibility — either source satisfying presence is enough. Values
//! are still never read here: `has_entry()` (like `std::env::var(...)
//! .is_ok()`) only ever answers a yes/no question.

use anyhow::Result;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CredentialStatus {
    pub provider: String,
    pub runtime: String,
    pub credential_required: bool,
    pub environment_variable: Option<String>,
    /// True if a host-native secret store (Keychain / Secret Service /
    /// Credential Manager) has an entry for this provider's env var name
    /// — checked by presence only, the value is never read.
    pub native_secret_configured: bool,
    pub configured: bool,
}

pub fn inventory() -> Vec<CredentialStatus> {
    use crate::os::platform::contract::SecretBackend;
    let secret_backend = crate::os::platform::secret_backend();
    crate::model::catalog::provider_catalog()
        .into_iter()
        .map(|provider| {
            let env_configured = provider
                .env_var
                .as_deref()
                .is_some_and(|name| std::env::var(name).is_ok_and(|value| !value.is_empty()));
            let native_secret_configured = provider
                .env_var
                .as_deref()
                .is_some_and(|name| secret_backend.has_entry(name).unwrap_or(false));
            let configured =
                provider.env_var.is_none() || env_configured || native_secret_configured;
            CredentialStatus {
                provider: provider.name,
                runtime: provider.runtime,
                credential_required: provider.requires_key,
                environment_variable: provider.env_var,
                native_secret_configured,
                configured,
            }
        })
        .collect()
}

pub fn status(json: bool) -> Result<()> {
    let inventory = inventory();
    if json {
        println!("{}", serde_json::to_string_pretty(&inventory)?);
        return Ok(());
    }
    println!("Credential status  (presence only — values are never printed)");
    println!("{}", "─".repeat(68));
    for item in inventory {
        let detail = match (&item.environment_variable, item.configured) {
            (None, _) => "keyless local runtime".to_string(),
            (Some(name), true) if item.native_secret_configured => {
                format!("configured (native secret store, {name})")
            }
            (Some(name), true) => format!("configured ({name})"),
            (Some(name), false) => format!("not set ({name})"),
        };
        println!("  {:<18} {:<8} {detail}", item.provider, item.runtime);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inventory_includes_every_local_provider_without_secret_values() {
        let items = inventory();
        for expected in ["ollama", "lmstudio", "llamacpp", "turbofieldfare"] {
            let item = items.iter().find(|item| item.provider == expected).unwrap();
            assert_eq!(item.runtime, "LOCAL");
            assert!(!item.credential_required);
            assert!(item.environment_variable.is_none());
        }
    }
}
