//! Pluggable long-term memory (WS4 step 3, docs/contracts/ws4-state.md
//! section 6). `LocalMemory` wraps the existing `.yana-ai/l3.jsonl` file and
//! keeps its format, so the `yana-rt memory ...` commands and this provider
//! read and write the same facts.
//!
//! Known limit, shared with the CLI: two processes updating the same key at
//! the same moment can lose one update. Rewrites are atomic (temp file then
//! rename), so a crash never leaves a half-written file.

use super::{now, rank_facts, L3Fact, RankedFact};
use crate::session_db::{StateKind, StateRoot};
use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;
use uuid::Uuid;

pub type FactId = String;

/// Shortest id prefix `forget` accepts, matching the 8 characters the CLI prints.
const MIN_ID_PREFIX: usize = 8;

#[derive(Debug, Clone)]
pub struct NewFact {
    pub key: String,
    pub value: String,
    pub tags: Vec<String>,
    pub agent: Option<String>,
    pub confidence: String,
    pub scope: String,
}

#[derive(Debug, Clone, Default)]
pub struct FactFilter {
    pub tag: Option<String>,
    pub agent: Option<String>,
    /// Keep only the last N matches, in file order (same as `memory list --last`).
    pub last: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MemoryError {
    /// The fact must not be stored (credential, or rule 68 confidential).
    Refused(String),
    /// A required field was empty.
    Empty(&'static str),
    Io(String),
}

impl std::fmt::Display for MemoryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Refused(why) => write!(f, "memory refused: {why}"),
            Self::Empty(field) => write!(f, "memory needs a non-empty {field}"),
            Self::Io(why) => write!(f, "memory storage error: {why}"),
        }
    }
}

impl std::error::Error for MemoryError {}

pub trait MemoryProvider {
    fn name(&self) -> &str;
    /// Store a fact, or update the existing one with the same key.
    fn remember(&self, fact: NewFact) -> Result<FactId, MemoryError>;
    fn recall(&self, query: &str, limit: usize) -> Result<Vec<RankedFact>, MemoryError>;
    /// True when a fact was removed. `id` is a full id or a unique prefix of at least 8 characters.
    fn forget(&self, id: &str) -> Result<bool, MemoryError>;
    fn list(&self, filter: FactFilter) -> Result<Vec<L3Fact>, MemoryError>;
}

pub struct LocalMemory {
    path: PathBuf,
}

impl LocalMemory {
    /// Opens the memory file of a profile, creating its directory after the
    /// containment check in `StateRoot::ensure_dir`.
    pub fn open(root: &StateRoot) -> Result<Self, MemoryError> {
        root.ensure_dir().map_err(|error| MemoryError::Io(error.to_string()))?;
        Ok(Self { path: root.path(StateKind::MemoryL3) })
    }

    /// A provider on an explicit file. For tests and callers that already
    /// resolved the path.
    pub fn at(path: PathBuf) -> Self {
        Self { path }
    }
}

impl MemoryProvider for LocalMemory {
    fn name(&self) -> &str {
        "local"
    }

    fn remember(&self, fact: NewFact) -> Result<FactId, MemoryError> {
        if fact.key.trim().is_empty() {
            return Err(MemoryError::Empty("key"));
        }
        if fact.value.trim().is_empty() {
            return Err(MemoryError::Empty("value"));
        }
        let mut texts: Vec<&str> = vec![&fact.key, &fact.value];
        texts.extend(fact.tags.iter().map(String::as_str));
        if let Some(why) = super::guard::refusal_reason(&texts) {
            return Err(MemoryError::Refused(why));
        }
        let mut entries = self.read_entries()?;
        let existing = entries
            .iter_mut()
            .find_map(|entry| match entry {
                Entry::Fact(stored) if stored.key == fact.key => Some(stored),
                _ => None,
            });
        let id = match existing {
            Some(stored) => {
                stored.value = fact.value;
                stored.tags = fact.tags;
                stored.agent = fact.agent;
                stored.confidence = fact.confidence;
                stored.scope = fact.scope;
                stored.updated_at = now();
                stored.promoted = false;
                stored.id.clone()
            }
            None => {
                let created = new_l3_fact(fact);
                let id = created.id.clone();
                entries.push(Entry::Fact(Box::new(created)));
                id
            }
        };
        self.write_entries(&entries)?;
        Ok(id)
    }

    fn recall(&self, query: &str, limit: usize) -> Result<Vec<RankedFact>, MemoryError> {
        Ok(rank_facts(&self.read_facts()?, query, limit))
    }

    fn forget(&self, id: &str) -> Result<bool, MemoryError> {
        if id.len() < MIN_ID_PREFIX {
            return Ok(false);
        }
        let mut entries = self.read_entries()?;
        let matching: Vec<usize> = entries
            .iter()
            .enumerate()
            .filter(|(_, entry)| matches!(entry, Entry::Fact(f) if f.id == id || f.id.starts_with(id)))
            .map(|(index, _)| index)
            .collect();
        let [index] = matching[..] else {
            return Ok(false);
        };
        entries.remove(index);
        self.write_entries(&entries)?;
        Ok(true)
    }

    fn list(&self, filter: FactFilter) -> Result<Vec<L3Fact>, MemoryError> {
        let mut facts: Vec<L3Fact> = self
            .read_facts()?
            .into_iter()
            .filter(|f| filter.tag.as_ref().is_none_or(|tag| f.tags.iter().any(|t| t == tag)))
            .filter(|f| filter.agent.as_ref().is_none_or(|agent| f.agent.as_deref() == Some(agent)))
            .collect();
        if let Some(last) = filter.last {
            facts.drain(..facts.len().saturating_sub(last));
        }
        Ok(facts)
    }
}

/// One line of `l3.jsonl`: a fact, or a line this code cannot read and keeps
/// verbatim so a rewrite never drops data it does not understand.
enum Entry {
    Fact(Box<L3Fact>),
    Raw(String),
}

fn new_l3_fact(fact: NewFact) -> L3Fact {
    let timestamp = now();
    L3Fact {
        id: Uuid::new_v4().to_string(),
        key: fact.key,
        value: fact.value,
        tags: fact.tags,
        agent: fact.agent,
        confidence: fact.confidence,
        scope: fact.scope,
        created_at: timestamp.clone(),
        updated_at: timestamp,
        promoted: false,
    }
}

impl LocalMemory {
    fn read_entries(&self) -> Result<Vec<Entry>, MemoryError> {
        let text = match fs::read_to_string(&self.path) {
            Ok(text) => text,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(MemoryError::Io(format!("reading {}: {error}", self.path.display()))),
        };
        Ok(text
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|line| match serde_json::from_str::<L3Fact>(line) {
                Ok(fact) => Entry::Fact(Box::new(fact)),
                Err(_) => Entry::Raw(line.to_string()),
            })
            .collect())
    }

    fn read_facts(&self) -> Result<Vec<L3Fact>, MemoryError> {
        Ok(self
            .read_entries()?
            .into_iter()
            .filter_map(|entry| match entry {
                Entry::Fact(fact) => Some(*fact),
                Entry::Raw(_) => None,
            })
            .collect())
    }

    /// Atomic: write a temp file next to the target, then rename over it.
    fn write_entries(&self, entries: &[Entry]) -> Result<(), MemoryError> {
        let io = |what: &str, error: std::io::Error| MemoryError::Io(format!("{what}: {error}"));
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|e| io("creating the memory directory", e))?;
        }
        let mut body = String::new();
        for entry in entries {
            let line = match entry {
                Entry::Fact(fact) => serde_json::to_string(fact).map_err(|e| MemoryError::Io(e.to_string()))?,
                Entry::Raw(raw) => raw.clone(),
            };
            body.push_str(&line);
            body.push('\n');
        }
        let temporary = self.path.with_extension("jsonl.tmp");
        fs::write(&temporary, body).map_err(|e| io("writing the temporary memory file", e))?;
        fs::rename(&temporary, &self.path).map_err(|e| io("replacing the memory file", e))
    }
}

#[cfg(test)]
mod tests;
