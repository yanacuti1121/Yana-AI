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

impl LspServer {
    /// How long a question may take: the entry's own limit, else the default for language servers.
    pub fn timeout_secs(&self) -> u64 {
        self.server.timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS)
    }

    /// A server with a list of extensions answers only for those files; an entry with no
    /// list answers for any file.
    pub fn check_extension(&self, path: &str) -> Result<(), CapabilityError> {
        if self.extensions.is_empty() {
            return Ok(());
        }
        let extension = Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
        if self.extensions.iter().any(|allowed| *allowed == extension) {
            return Ok(());
        }
        Err(invalid(format!("language server '{}' is listed for .{} files, not for {path}", self.server.name, self.extensions.join(", ."))))
    }
}

/// Every key an entry may have; anything else (a misspelling such as "extension" or
/// "timeout") is refused instead of being silently ignored.
const ENTRY_KEYS: [&str; 6] = ["name", "command", "args", "env", "timeout_secs", "extensions"];

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
    // An absolute path is explicit and a bare name is resolved on PATH (see `resolve_program`);
    // anything else, in either path style ("./x", "bin/x", ".\\x", "C:x"), would start whatever the
    // repository put at that place. The approver is shown the resolved program, so this is
    // defence in depth rather than the only guard.
    if !Path::new(command).is_absolute() && command.contains(['/', '\\', ':']) {
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
    let value: serde_json::Value = serde_json::from_slice(bytes).map_err(|e| invalid(format!(".yana-ai/lsp-servers.json is not valid: {e}")))?;
    if let Some(key) = value.as_object().into_iter().flat_map(|map| map.keys()).find(|key| key.as_str() != "servers") {
        return Err(invalid(format!(".yana-ai/lsp-servers.json: unknown field {key:?} (the only key is \"servers\")")));
    }
    for entry in value.get("servers").and_then(serde_json::Value::as_array).into_iter().flatten() {
        if let Some(key) = entry.as_object().into_iter().flat_map(|map| map.keys()).find(|key| !ENTRY_KEYS.contains(&key.as_str())) {
            return Err(invalid(format!(".yana-ai/lsp-servers.json: unknown field {key:?} in an entry (allowed: {})", ENTRY_KEYS.join(", "))));
        }
    }
    let file: File = serde_json::from_value(value).map_err(|e| invalid(format!(".yana-ai/lsp-servers.json is not valid: {e}")))?;
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

/// The absolute path of the program that would run for `command`, decided in this process
/// BEFORE the working directory is changed to the repository. An absolute command is itself.
/// A bare name is looked for in the PATH entries that are absolute and outside the repository:
/// a relative or empty entry (which a shell may add for `.` or `./node_modules/.bin`) and a
/// directory inside the repository are skipped, so the repository cannot supply the program
/// by putting one where PATH would find it. The result is what an approver is shown and what is run.
pub fn resolve_program(command: &str, root: &Path) -> Result<String, CapabilityError> {
    resolve_program_in(command, root, std::env::var_os("PATH").as_deref())
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else { return false };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.is_file() && meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        meta.is_file()
    }
}

pub(crate) fn resolve_program_in(command: &str, root: &Path, path_var: Option<&std::ffi::OsStr>) -> Result<String, CapabilityError> {
    if Path::new(command).is_absolute() {
        return Ok(command.to_string());
    }
    let repository = root.canonicalize().map_err(|e| CapabilityError::Io { detail: format!("resolve repository: {e}") })?;
    for dir in std::env::split_paths(path_var.unwrap_or_default()) {
        if !dir.is_absolute() {
            continue;
        }
        let candidate = dir.join(command);
        // Neither the directory nor, through links, the program itself may be inside the repository.
        let inside = |p: &Path| p.canonicalize().map(|c| c.starts_with(&repository)).unwrap_or(true);
        if inside(&dir) || !is_executable_file(&candidate) || inside(&candidate) {
            continue;
        }
        return candidate.to_str().map(str::to_string).ok_or_else(|| invalid("that program's path is not valid text"));
    }
    Err(invalid(format!("'{command}' was not found in PATH (relative entries and directories inside the repository are ignored); give an absolute path")))
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
        config_trust::forget_all_trust_in_test();
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
            r#"{"servers":[{"name":"a","command":".\\server.exe"}]}"#,
            r#"{"servers":[{"name":"a","command":"sub\\server.exe"}]}"#,
            r#"{"servers":[{"name":"a","command":"C:server.exe"}]}"#,
            r#"{"servers":[],"other":1}"#,
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
            let error = find_lsp_server(&root, "a").unwrap_err().to_string();
            assert!(!error.contains("not trusted"), "rejected by a rule of its own, not by the missing confirmation: {json}: {error}");
        }
        let many: Vec<String> = (0..=MAX_EXTENSIONS).map(|n| format!("e{n}")).collect();
        let (_k, root) = repo(&serde_json::json!({"servers": [{"name": "a", "command": "x", "extensions": many}]}).to_string());
        assert!(find_lsp_server(&root, "a").is_err(), "too many extensions");
    }

    #[test]
    fn a_misspelled_key_is_refused_not_silently_ignored() {
        for json in [
            r#"{"servers":[{"name":"a","command":"x","extension":["rs"]}]}"#,
            r#"{"servers":[{"name":"a","command":"x","timeout":5}]}"#,
            r#"{"servers":[{"name":"a","command":"x","arg":["--stdio"]}]}"#,
        ] {
            let (_k, root) = repo(json);
            let error = find_lsp_server(&root, "a").unwrap_err().to_string();
            assert!(error.contains("unknown field"), "{json}: {error}");
        }
    }

    #[test]
    fn a_server_listed_for_some_extensions_refuses_other_files_and_an_empty_list_means_any() {
        let (_k, root) = repo(r#"{"servers":[{"name":"rust","command":"x","extensions":["rs","toml"]},{"name":"any","command":"x"}]}"#);
        let rust = find_lsp_server(&root, "rust").unwrap();
        for ok in ["src/lib.rs", "Cargo.TOML", "a/b/c.rs"] {
            assert!(rust.check_extension(ok).is_ok(), "{ok}");
        }
        for bad in ["src/app.py", "Makefile", "lib.rs.bak", ".rs"] {
            assert!(rust.check_extension(bad).is_err(), "{bad}");
        }
        assert!(find_lsp_server(&root, "any").unwrap().check_extension("anything.xyz").is_ok());
    }

    /// A directory of programs, with one executable file named `name` in it.
    fn bin_with(parent: &std::path::Path, dir: &str, name: &str) -> std::path::PathBuf {
        let bin = parent.join(dir);
        std::fs::create_dir_all(&bin).unwrap();
        let program = bin.join(name);
        std::fs::write(&program, "#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        bin
    }

    #[cfg(unix)]
    #[test]
    fn a_bare_name_is_resolved_outside_the_repository_and_never_from_a_relative_or_inside_entry() {
        let outer = tempfile::tempdir().unwrap();
        let root = outer.path().canonicalize().unwrap().join("repo");
        std::fs::create_dir_all(&root).unwrap();
        let inside = bin_with(&root, "node_modules/.bin", "lsp-x");
        let trusted = bin_with(&outer.path().canonicalize().unwrap(), "usr-bin", "lsp-x");
        let join = |dirs: &[&std::path::Path]| std::env::join_paths(dirs.iter().map(|d| d.as_os_str())).unwrap();
        let resolve = |path: &std::ffi::OsStr| resolve_program_in("lsp-x", &root, Some(path));
        // A relative entry ("." or "node_modules/.bin"), an empty entry and an in-repository entry are all skipped.
        let path = join(&[std::path::Path::new("."), std::path::Path::new("node_modules/.bin"), std::path::Path::new(""), &inside, &trusted]);
        assert_eq!(resolve(&path).unwrap(), trusted.join("lsp-x").to_str().unwrap(), "the program outside the repository wins");
        // With only skipped entries nothing resolves, and the repository's program is NOT used.
        let only_bad = join(&[std::path::Path::new("."), &inside]);
        assert!(resolve(&only_bad).unwrap_err().to_string().contains("not found in PATH"));
        assert!(resolve_program_in("lsp-x", &root, None).is_err(), "no PATH at all");
        // A file that is not executable is not a program.
        let plain = outer.path().canonicalize().unwrap().join("plain");
        std::fs::create_dir_all(&plain).unwrap();
        std::fs::write(plain.join("lsp-x"), "x").unwrap();
        assert!(resolve(&join(&[&plain])).is_err());
        // A link outside the repository that points back into it is skipped as well.
        let linked = outer.path().canonicalize().unwrap().join("linked");
        std::fs::create_dir_all(&linked).unwrap();
        std::os::unix::fs::symlink(inside.join("lsp-x"), linked.join("lsp-x")).unwrap();
        assert!(resolve(&join(&[&linked])).is_err(), "a link into the repository is the repository's program");
        // An absolute command is itself, whatever PATH says.
        assert_eq!(resolve_program_in("/bin/sh", &root, Some(&path)).unwrap(), "/bin/sh");
    }

    #[test]
    fn an_absolute_path_and_a_bare_name_are_both_fine() {
        for command in ["/usr/local/bin/rust-analyzer", "rust-analyzer", "typescript-language-server"] {
            let (_k, root) = repo(&serde_json::json!({"servers": [{"name": "a", "command": command}]}).to_string());
            assert!(find_lsp_server(&root, "a").is_ok(), "{command}");
        }
    }
}
