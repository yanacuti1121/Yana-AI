//! Which language servers exist (WS3, docs/contracts/ws3-tools.md section 17).
//!
//! The list comes only from `<repo>/.yana-ai/lsp-servers.json`, the same shape as the
//! MCP server list plus the file extensions a server answers for. A model cannot add
//! or change an entry (governed writes refuse that path), and a repository you only
//! cloned can ship its own file, so nothing in it is used until a person confirmed
//! this exact content (`yana-rt trust allow lsp-servers`). Every entry gets the MCP
//! checks (printable ASCII only, length limits, no code-loading variables, a time
//! limit cap) and one more: a command written as a relative path is refused,
//! because a program inside the repository could then be started by name.

use super::config_trust::{self, ConfigKind};
use super::mcp_config::{validate, ServerConfig};
use super::CapabilityError;
use serde::Deserialize;
use std::path::Path;

const MAX_SERVERS: usize = 32;
const MAX_EXTENSIONS: usize = 16;
const MAX_EXTENSION_CHARS: usize = 16;
/// Used when a server does not say how long a question may take: language servers
/// index before they can answer, so this is longer than the MCP default.
pub const DEFAULT_TIMEOUT_SECS: u64 = 60;

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct LspServer {
    #[serde(flatten)]
    pub server: ServerConfig,
    /// File extensions (without the dot) this server answers for, such as `rs`.
    #[serde(default)]
    pub extensions: Vec<String>,
}

#[derive(Deserialize)]
struct File {
    servers: Vec<LspServer>,
}

fn invalid(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::InvalidInput { detail: detail.into() }
}

fn validate_server(entry: &LspServer) -> Result<(), CapabilityError> {
    validate(&entry.server)?;
    let name = &entry.server.name;
    let command = &entry.server.command;
    // A bare name is looked up on PATH and an absolute path is explicit; "./x" or "bin/x"
    // would start whatever the repository put at that place.
    if command.contains('/') && !command.starts_with('/') {
        return Err(invalid(format!("server '{name}': the command must be a program name or an absolute path, not a relative path")));
    }
    if command.starts_with('-') {
        return Err(invalid(format!("server '{name}': the command must not start with '-'")));
    }
    let bad_extension = |e: &String| e.is_empty() || e.chars().count() > MAX_EXTENSION_CHARS || !e.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '+');
    if entry.extensions.len() > MAX_EXTENSIONS || entry.extensions.iter().any(bad_extension) {
        return Err(invalid(format!("server '{name}': extensions must be up to {MAX_EXTENSIONS} short lower-case names such as \"rs\" (no dot)")));
    }
    Ok(())
}

fn parse(bytes: &[u8]) -> Result<Vec<LspServer>, CapabilityError> {
    let file: File = serde_json::from_slice(bytes).map_err(|e| invalid(format!(".yana-ai/lsp-servers.json is not valid: {e}")))?;
    if file.servers.len() > MAX_SERVERS {
        return Err(invalid(format!(".yana-ai/lsp-servers.json lists more than {MAX_SERVERS} servers")));
    }
    let mut seen = std::collections::BTreeSet::new();
    for entry in &file.servers {
        validate_server(entry)?;
        if !seen.insert(entry.server.name.as_str()) {
            return Err(invalid(format!("server name '{}' appears twice", entry.server.name)));
        }
    }
    Ok(file.servers)
}

/// The one server called `name`. What is parsed here is the very bytes that were
/// checked against the confirmation.
pub fn find_lsp_server(root: &Path, name: &str) -> Result<LspServer, CapabilityError> {
    let bytes = config_trust::trusted_bytes(root, ConfigKind::LspServers)?;
    parse(&bytes)?.into_iter().find(|s| s.server.name == name).ok_or_else(|| CapabilityError::NotFound {
        requested: format!("language server '{name}' (not listed in .yana-ai/lsp-servers.json)"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo(json: &str) -> (tempfile::TempDir, std::path::PathBuf) {
        let outer = tempfile::tempdir().unwrap();
        let root = outer.path().join("ws");
        std::fs::create_dir_all(root.join(".yana-ai")).unwrap();
        std::fs::write(root.join(".yana-ai/lsp-servers.json"), json).unwrap();
        config_trust::trust_in_test(&root);
        (outer, root)
    }

    #[test]
    fn a_valid_entry_is_read_with_its_extensions_and_flattened_server_fields() {
        let (_k, root) = repo(r#"{"servers":[{"name":"rust","command":"rust-analyzer","args":["--stdio"],"env":["RUST_LOG"],"timeout_secs":90,"extensions":["rs","toml"]}]}"#);
        let found = find_lsp_server(&root, "rust").unwrap();
        assert_eq!((found.server.command.as_str(), found.server.timeout_secs, found.extensions.as_slice()), ("rust-analyzer", Some(90), ["rs".to_string(), "toml".to_string()].as_slice()));
        assert_eq!(found.server.args, ["--stdio"]);
        assert!(matches!(find_lsp_server(&root, "go"), Err(CapabilityError::NotFound { .. })));
    }

    #[test]
    fn an_unconfirmed_list_is_not_used_at_all() {
        let outer = tempfile::tempdir().unwrap();
        let root = outer.path().join("ws");
        std::fs::create_dir_all(root.join(".yana-ai")).unwrap();
        std::fs::write(root.join(".yana-ai/lsp-servers.json"), r#"{"servers":[{"name":"rust","command":"rust-analyzer"}]}"#).unwrap();
        config_trust::empty_store_in_test();
        let error = find_lsp_server(&root, "rust").unwrap_err().to_string();
        assert!(error.contains("not trusted") && error.contains("yana-rt trust allow lsp-servers"), "{error}");
    }

    #[test]
    fn invalid_entries_are_refused_whole() {
        let cases = [
            r#"{"servers":[{"name":"Bad Name","command":"x"}]}"#,
            r#"{"servers":[{"name":"a","command":"./server"}]}"#,
            r#"{"servers":[{"name":"a","command":"bin/server"}]}"#,
            r#"{"servers":[{"name":"a","command":"../server"}]}"#,
            r#"{"servers":[{"name":"a","command":"-x"}]}"#,
            r#"{"servers":[{"name":"a","command":"x","env":["LD_PRELOAD"]}]}"#,
            r#"{"servers":[{"name":"a","command":"x","timeout_secs":9999}]}"#,
            r#"{"servers":[{"name":"a","command":"café"}]}"#,
            r#"{"servers":[{"name":"a","command":"x","extensions":[".rs"]}]}"#,
            r#"{"servers":[{"name":"a","command":"x","extensions":["RS"]}]}"#,
            r#"{"servers":[{"name":"a","command":"x","extensions":[""]}]}"#,
            r#"{"servers":[{"name":"a","command":"x","extensions":["aaaaaaaaaaaaaaaaa"]}]}"#,
            r#"{"servers":[{"name":"a","command":"x"},{"name":"a","command":"y"}]}"#,
            r#"{"servers":"no"}"#,
            "not json",
        ];
        for json in cases {
            let (_k, root) = repo(json);
            assert!(find_lsp_server(&root, "a").is_err(), "{json}");
        }
        let many: Vec<String> = (0..=MAX_EXTENSIONS).map(|n| format!("e{n}")).collect();
        let (_k, root) = repo(&serde_json::json!({"servers": [{"name": "a", "command": "x", "extensions": many}]}).to_string());
        assert!(find_lsp_server(&root, "a").is_err(), "too many extensions");
    }

    #[test]
    fn an_absolute_path_and_a_bare_name_are_both_fine() {
        for command in ["/usr/local/bin/rust-analyzer", "rust-analyzer", "typescript-language-server"] {
            let (_k, root) = repo(&serde_json::json!({"servers": [{"name": "a", "command": command}]}).to_string());
            assert!(find_lsp_server(&root, "a").is_ok(), "{command}");
        }
    }
}
