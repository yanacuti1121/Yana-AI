//! Pins for external MCP tool definitions: the guard against a "rug pull".
//!
//! A server that was reviewed once can later change what a tool says it does (or what it
//! accepts) and keep the same name. The first time a tool is seen its definition is hashed and
//! recorded in `.yana-ai/mcp-tool-pins.json`; a later call to the same tool with a different
//! hash is refused until a person looks at it and removes the entry. Which fields count is
//! fixed below: `_meta` is left out because servers put volatile values there.
//!
//! This file is a protected config (`capability::file_mutation`): a model cannot rewrite it.
//! An unreadable, oversized, symlinked or malformed file REFUSES the call. Treating a broken
//! file as "nothing pinned yet" would let anyone who can corrupt it skip the check.

use crate::capability::CapabilityError;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

const PINS_PATH: &str = ".yana-ai/mcp-tool-pins.json";
const MAX_PINS_BYTES: u64 = 1024 * 1024;
/// What a tool says it is and what it takes. Anything else on the object is ignored.
const HASHED_FIELDS: [&str; 6] = ["name", "title", "description", "inputSchema", "outputSchema", "annotations"];

/// Same value, same text, whatever order the keys arrived in.
fn canonical(value: &Value) -> String {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let parts: Vec<String> = keys.iter().map(|k| format!("{}:{}", Value::String((*k).clone()), canonical(&map[*k]))).collect();
            format!("{{{}}}", parts.join(","))
        }
        Value::Array(items) => format!("[{}]", items.iter().map(canonical).collect::<Vec<_>>().join(",")),
        other => other.to_string(),
    }
}

/// Hash of the parts of a serialized tool that define it.
pub fn hash_definition(tool: &Value) -> String {
    let mut picked = Map::new();
    if let Some(object) = tool.as_object() {
        for field in HASHED_FIELDS {
            if let Some(value) = object.get(field) {
                picked.insert(field.to_string(), value.clone());
            }
        }
    }
    let digest = Sha256::digest(canonical(&Value::Object(picked)).as_bytes());
    format!("{digest:x}")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pin {
    /// Never seen for this server.
    New,
    Match,
    /// Seen before with a different definition.
    Changed,
}

#[derive(Default, Serialize, Deserialize)]
struct File {
    #[serde(default)]
    servers: BTreeMap<String, BTreeMap<String, String>>,
}

pub struct PinStore {
    path: PathBuf,
}

fn classify(file: &File, server: &str, tool: &str, hash: &str) -> Pin {
    match file.servers.get(server).and_then(|tools| tools.get(tool)) {
        None => Pin::New,
        Some(known) if known == hash => Pin::Match,
        Some(_) => Pin::Changed,
    }
}

fn refuse(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::External { detail: detail.into() }
}

impl PinStore {
    pub fn for_root(root: &Path) -> Self {
        Self { path: root.join(PINS_PATH) }
    }

    fn read(&self) -> Result<File, CapabilityError> {
        let meta = match std::fs::symlink_metadata(&self.path) {
            Ok(meta) => meta,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(File::default()),
            Err(_) => return Err(refuse("the MCP tool pin file cannot be read; nothing was started")),
        };
        if !meta.file_type().is_file() || meta.len() > MAX_PINS_BYTES {
            return Err(refuse("the MCP tool pin file is not a plain file within the size limit; nothing was started"));
        }
        let bytes = std::fs::read(&self.path).map_err(|_| refuse("the MCP tool pin file cannot be read; nothing was started"))?;
        serde_json::from_slice(&bytes).map_err(|_| refuse("the MCP tool pin file is not valid JSON; fix or remove it. Nothing was started"))
    }

    fn write(&self, file: &File) -> Result<(), CapabilityError> {
        let text = serde_json::to_string_pretty(file).map_err(|e| CapabilityError::Serialize { detail: e.to_string() })?;
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| CapabilityError::Io { detail: format!("cannot create {}: {}", dir.display(), e.kind()) })?;
        }
        // Write beside the file and rename, so a crash never leaves half a file that would then refuse every call.
        let temp = self.path.with_extension(format!("json.tmp-{}", std::process::id()));
        std::fs::write(&temp, text).and_then(|_| std::fs::rename(&temp, &self.path)).map_err(|e| {
            let _ = std::fs::remove_file(&temp);
            CapabilityError::Io { detail: format!("cannot save the MCP tool pins: {}", e.kind()) }
        })
    }

    /// How `hash` compares with what was recorded for this tool. Records nothing.
    /// The gateway checks whole listings with `check_all`; only the tests check one tool, so
    /// this is built for tests alone.
    #[cfg(test)]
    pub fn check(&self, server: &str, tool: &str, hash: &str) -> Result<Pin, CapabilityError> {
        Ok(classify(&self.read()?, server, tool, hash))
    }

    /// `check` for a whole listing, reading the file once. Same order as `tools` (name, hash).
    pub fn check_all(&self, server: &str, tools: &[(String, String)]) -> Result<Vec<Pin>, CapabilityError> {
        let file = self.read()?;
        Ok(tools.iter().map(|(name, hash)| classify(&file, server, name, hash)).collect())
    }

    /// Records the tools never seen before. It never overwrites a recorded hash: only a person
    /// removing the entry can accept a changed definition.
    pub fn record_new(&self, server: &str, tools: &[(String, String)]) -> Result<(), CapabilityError> {
        let mut file = self.read()?;
        let entry = file.servers.entry(server.to_string()).or_default();
        let before = entry.len();
        for (name, hash) in tools {
            entry.entry(name.clone()).or_insert_with(|| hash.clone());
        }
        if entry.len() == before {
            return Ok(());
        }
        self.write(&file)
    }
}

#[cfg(test)]
mod tests;
