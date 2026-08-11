//! Presence-only credential inventory backed by the canonical chat catalog.

use anyhow::Result;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CredentialStatus {
    pub provider: String,
    pub runtime: String,
    pub credential_required: bool,
    pub environment_variable: Option<String>,
    pub configured: bool,
}

pub fn inventory() -> Vec<CredentialStatus> {
    crate::chat::provider_catalog()
        .into_iter()
        .map(|provider| {
            let configured = provider
                .env_var
                .as_deref()
                .is_none_or(|name| std::env::var(name).is_ok_and(|value| !value.is_empty()));
            CredentialStatus {
                provider: provider.name,
                runtime: provider.runtime,
                credential_required: provider.requires_key,
                environment_variable: provider.env_var,
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
