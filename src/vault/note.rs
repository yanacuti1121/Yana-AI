use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NoteMeta {
    pub title: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default = "default_lang")]
    pub lang: String,
    pub created: Option<DateTime<Utc>>,
    pub updated: Option<DateTime<Utc>>,
    /// Parallel translations (WMT23-inspired): {"en": "note-slug-en", "zh": "note-slug-zh"}
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub translations: HashMap<String, String>,
}

fn default_lang() -> String {
    "vi".to_string()
}

#[derive(Debug, Clone)]
pub struct Note {
    pub id: String,
    pub meta: NoteMeta,
    pub body: String,
    pub path: PathBuf,
}

impl Note {
    pub fn from_file(path: &Path) -> anyhow::Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("untitled")
            .to_string();
        let (meta, body) = parse_frontmatter(&content)?;
        Ok(Note { id, meta, body, path: path.to_path_buf() })
    }

    pub fn to_file_content(&self) -> anyhow::Result<String> {
        let front = serde_yaml::to_string(&self.meta)?;
        Ok(format!("---\n{}---\n\n{}", front, self.body))
    }

    pub fn word_count(&self) -> usize {
        self.body.split_whitespace().count()
    }
}

pub fn parse_frontmatter(content: &str) -> anyhow::Result<(NoteMeta, String)> {
    if let Some(rest) = content.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---\n") {
            let yaml = &rest[..end];
            let body = rest[end + 5..].trim_start().to_string();
            let meta: NoteMeta = serde_yaml::from_str(yaml).unwrap_or_else(|_| default_meta());
            return Ok((meta, body));
        }
    }
    Ok((default_meta(), content.to_string()))
}

pub fn default_meta() -> NoteMeta {
    NoteMeta {
        title: "Untitled".to_string(),
        tags: vec![],
        lang: "vi".to_string(),
        created: Some(Utc::now()),
        updated: Some(Utc::now()),
        translations: HashMap::new(),
    }
}
