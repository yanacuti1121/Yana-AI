//! Typed local-chat preferences stored alongside other Yana workspace state.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct ChatSettings {
    pub restore_session: bool,
    pub autosave: bool,
    pub show_metrics: bool,
    pub theme: ThemeName,
    pub default_provider: String,
    pub default_model: Option<String>,
    pub privacy: PrivacySettings,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ThemeName {
    Yana,
    YanaLight,
    Terminal,
    HighContrast,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct PrivacySettings {
    pub log_messages: bool,
    pub telemetry: bool,
}

impl Default for ChatSettings {
    fn default() -> Self {
        Self {
            restore_session: true,
            autosave: true,
            show_metrics: true,
            theme: ThemeName::Yana,
            default_provider: "ollama".to_string(),
            default_model: None,
            privacy: PrivacySettings::default(),
        }
    }
}

impl Default for PrivacySettings {
    fn default() -> Self {
        Self {
            log_messages: true,
            telemetry: false,
        }
    }
}

pub fn settings_path(repo_root: &Path) -> PathBuf {
    repo_root.join(".yana-ai").join("chat-settings.json")
}

pub fn load(repo_root: &Path) -> Result<ChatSettings> {
    let path = settings_path(repo_root);
    if !path.exists() {
        return Ok(ChatSettings::default());
    }
    let text = fs::read_to_string(&path)
        .with_context(|| format!("failed to read chat settings at {}", path.display()))?;
    serde_json::from_str(&text)
        .with_context(|| format!("invalid chat settings at {}", path.display()))
}

pub fn save(repo_root: &Path, settings: &ChatSettings) -> Result<()> {
    let path = settings_path(repo_root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, serde_json::to_vec_pretty(settings)?)?;
    fs::rename(&temporary, &path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_config_uses_private_local_defaults() {
        let temp = tempfile::tempdir().unwrap();
        let settings = load(temp.path()).unwrap();
        assert_eq!(settings, ChatSettings::default());
        assert!(!settings.privacy.telemetry);
    }

    #[test]
    fn invalid_config_is_reported_instead_of_silently_overwritten() {
        let temp = tempfile::tempdir().unwrap();
        let path = settings_path(temp.path());
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "{").unwrap();
        assert!(load(temp.path())
            .unwrap_err()
            .to_string()
            .contains("invalid chat settings"));
    }
}
