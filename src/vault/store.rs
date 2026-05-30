use crate::vault::note::Note;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultConfig {
    pub vault_name: String,
    #[serde(default = "default_lang")]
    pub default_lang: String,
    #[serde(default = "default_langs")]
    pub langs: Vec<String>,
    #[serde(default = "default_notes_dir")]
    pub notes_dir: String,
}

fn default_lang() -> String { "vi".to_string() }
fn default_langs() -> Vec<String> { vec!["vi".to_string(), "en".to_string()] }
fn default_notes_dir() -> String { "notes".to_string() }

impl VaultConfig {
    pub fn config_path(dir: &str) -> PathBuf {
        Path::new(dir).join(".vault.yaml")
    }

    pub fn load(dir: &str) -> Result<Self> {
        let path = Self::config_path(dir);
        let s = std::fs::read_to_string(&path)
            .map_err(|_| anyhow::anyhow!("No vault found at '{}'. Run: yamtam-rt vault init {}", dir, dir))?;
        Ok(serde_yaml::from_str(&s)?)
    }

    pub fn notes_path(&self, dir: &str) -> PathBuf {
        Path::new(dir).join(&self.notes_dir)
    }
}

pub fn init_vault(dir: &str, name: &str) -> Result<()> {
    let config_path = VaultConfig::config_path(dir);
    if config_path.exists() {
        println!("Vault already initialized at '{}'", dir);
        return Ok(());
    }
    let config = VaultConfig {
        vault_name: name.to_string(),
        default_lang: "vi".to_string(),
        langs: vec!["vi".to_string(), "en".to_string(), "zh".to_string(), "ja".to_string()],
        notes_dir: "notes".to_string(),
    };
    let notes_dir = config.notes_path(dir);
    std::fs::create_dir_all(&notes_dir)?;
    std::fs::write(&config_path, serde_yaml::to_string(&config)?)?;
    println!("Vault '{}' initialized", name);
    println!("  config : {}", config_path.display());
    println!("  notes  : {}", notes_dir.display());
    Ok(())
}

pub fn load_notes(dir: &str, config: &VaultConfig) -> Result<Vec<Note>> {
    let notes_dir = config.notes_path(dir);
    if !notes_dir.exists() { return Ok(vec![]); }
    let mut notes = Vec::new();
    for entry in WalkDir::new(&notes_dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            if let Ok(note) = Note::from_file(path) {
                notes.push(note);
            }
        }
    }
    notes.sort_by(|a, b| b.meta.created.cmp(&a.meta.created));
    Ok(notes)
}

pub fn note_path(dir: &str, config: &VaultConfig, slug: &str) -> PathBuf {
    config.notes_path(dir).join(format!("{}.md", slug))
}
