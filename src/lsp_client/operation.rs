//! What a model may ask a language server, and how that is turned into LSP
//! requests (WS3, contract section 17). Everything here is read-only.

use crate::capability::{read_file_observation, resolve_existing, CapabilityError};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

/// Longest repository-relative path accepted in a query (it is shown to an approver).
const MAX_PATH_CHARS: usize = 200;
/// Largest line or column accepted; real files are nowhere near this.
const MAX_POSITION: u64 = 10_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Operation {
    Definition,
    References,
    Hover,
    DocumentSymbols,
}

impl Operation {
    pub fn parse(text: &str) -> Option<Self> {
        match text {
            "definition" => Some(Self::Definition),
            "references" => Some(Self::References),
            "hover" => Some(Self::Hover),
            "document_symbols" => Some(Self::DocumentSymbols),
            _ => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Definition => "definition",
            Self::References => "references",
            Self::Hover => "hover",
            Self::DocumentSymbols => "document_symbols",
        }
    }

    pub fn method(self) -> &'static str {
        match self {
            Self::Definition => "textDocument/definition",
            Self::References => "textDocument/references",
            Self::Hover => "textDocument/hover",
            Self::DocumentSymbols => "textDocument/documentSymbol",
        }
    }

    pub fn needs_position(self) -> bool {
        !matches!(self, Self::DocumentSymbols)
    }
}

/// A validated question. `line` and `character` are 1-based and count Unicode
/// characters (what an editor shows); they are converted to the protocol's 0-based
/// UTF-16 offsets only when the request is built.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Query {
    pub server: String,
    pub operation: Operation,
    pub path: String,
    pub line: u32,
    pub character: u32,
}

fn invalid(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::InvalidInput { detail: detail.into() }
}

fn position(arguments: &Value, name: &str) -> Result<u32, CapabilityError> {
    let value = arguments.get(name).and_then(Value::as_u64).filter(|v| (1..=MAX_POSITION).contains(v));
    value.map(|v| v as u32).ok_or_else(|| invalid(format!("'{name}' must be a whole number from 1 (1-based)")))
}

fn valid_path(path: &str) -> Result<(), CapabilityError> {
    if path.is_empty() || path.chars().count() > MAX_PATH_CHARS {
        return Err(invalid(format!("'path' must be 1 to {MAX_PATH_CHARS} characters")));
    }
    if path.chars().any(|c| c.is_control() || crate::capability::untrusted::is_invisible_format_char(c)) {
        return Err(invalid("'path' must not contain control or invisible characters"));
    }
    let relative = !path.starts_with('/') && !path.starts_with('\\') && !path.contains(':');
    if !relative || path.split(['/', '\\']).any(|part| part == "..") {
        return Err(invalid("'path' must be relative to the repository, without '..'"));
    }
    Ok(())
}

/// The arguments of an `lsp_query` call: `{"server","operation","path","line","character"}`.
pub fn parse_query(arguments: &Value) -> Result<Query, CapabilityError> {
    let text = |name: &str| arguments.get(name).and_then(Value::as_str).ok_or_else(|| invalid(format!("missing required argument '{name}'")));
    let server = text("server")?;
    if !crate::capability::mcp_config::valid_server_name(server) {
        return Err(invalid(format!("{server:?} is not a valid server name")));
    }
    let operation_name = text("operation")?;
    let operation = Operation::parse(operation_name).ok_or_else(|| invalid("'operation' must be definition, references, hover or document_symbols"))?;
    let path = text("path")?;
    valid_path(path)?;
    if sensitive_path(path) {
        return Err(invalid("'path' names a file that holds secrets or credentials; it is not sent to a language server"));
    }
    let (line, character) = if operation.needs_position() { (position(arguments, "line")?, position(arguments, "character")?) } else { (1, 1) };
    Ok(Query { server: server.to_string(), operation, path: path.to_string(), line, character })
}

/// What a question is about, read from the repository.
pub struct Target {
    pub canonical_root: PathBuf,
    /// The file's path inside the repository, as a server will see it.
    pub relative: String,
    pub text: String,
    /// The text of the asked-about line (empty when the operation needs no position).
    pub line_text: String,
}

/// Read what the question is about. Fails when the file is not a readable file inside the
/// repository, holds secrets by name, or does not have the line. Used both to decide whether
/// a question may be shown to an approver and, before a program is started, to run it.
pub fn check_target(root: &Path, query: &Query) -> Result<Target, CapabilityError> {
    let canonical_root = root.canonicalize().map_err(|e| CapabilityError::Io { detail: format!("resolve repository: {e}") })?;
    let resolved = resolve_existing(&canonical_root, &query.path)?;
    let relative = resolved.strip_prefix(&canonical_root).map_err(|_| CapabilityError::PathEscape { requested: query.path.clone() })?;
    let relative = relative.to_str().ok_or_else(|| invalid("that path is not valid text"))?.to_string();
    if sensitive_path(&relative) {
        return Err(invalid("that file holds secrets or credentials; it is not sent to a language server"));
    }
    // Read through the RESOLVED path, so the file that was checked is the file that is read.
    let observation = read_file_observation(&canonical_root, &relative)?;
    let line_text = if query.operation.needs_position() {
        let total = observation.content.lines().count();
        observation
            .content
            .lines()
            .nth((query.line as usize).saturating_sub(1))
            .map(str::to_string)
            .ok_or_else(|| invalid(format!("line {} is beyond the end of {} ({total} lines)", query.line, query.path)))?
    } else {
        String::new()
    };
    Ok(Target { canonical_root, relative, text: observation.content, line_text })
}

/// The 0-based UTF-16 offset of the 1-based `character`th character of `line_text`.
/// A column past the end of the line is the end of the line.
pub fn utf16_offset(line_text: &str, character: u32) -> u32 {
    line_text.chars().take(character.saturating_sub(1) as usize).map(|c| c.len_utf16() as u32).sum()
}

/// The inverse, for showing a server's position: a 0-based UTF-16 offset as a 1-based character.
pub fn character_at(line_text: &str, utf16: u32) -> u32 {
    let mut units = 0;
    let mut chars = 0;
    for c in line_text.chars() {
        if units >= utf16 {
            break;
        }
        units += c.len_utf16() as u32;
        chars += 1;
    }
    chars + 1
}

/// The `params` of the LSP request for `query`; `line_text` is the text of the asked-about line.
pub fn request_params(query: &Query, uri: &str, line_text: &str) -> Value {
    let document = json!({"uri": uri});
    let at = json!({"line": query.line.saturating_sub(1), "character": utf16_offset(line_text, query.character)});
    match query.operation {
        Operation::Definition | Operation::Hover => json!({"textDocument": document, "position": at}),
        Operation::References => json!({"textDocument": document, "position": at, "context": {"includeDeclaration": true}}),
        Operation::DocumentSymbols => json!({"textDocument": document}),
    }
}

/// A `file:` URI for a path inside `root` (which must already be canonical).
pub fn file_uri(root: &Path, relative: &str) -> Result<String, CapabilityError> {
    url::Url::from_file_path(root.join(relative)).map(String::from).map_err(|_| invalid("that path cannot be written as a file URI"))
}

/// A server's URI as a path relative to `root`; `None` for anything that is not a
/// `file:` URI inside the repository. The result is only ever shown, never opened.
pub fn relative_from_uri(root: &Path, uri: &str) -> Option<String> {
    let url = url::Url::parse(uri).ok().filter(|u| u.scheme() == "file")?;
    let path = url.to_file_path().ok()?;
    let relative = path.strip_prefix(root).ok()?;
    // Decoding can turn "%2e%2e%2f" into "../": only plain names are accepted, so a path
    // that climbs out of the repository (or hides a separator or NUL) is "outside".
    let plain = relative.components().all(|c| matches!(c, std::path::Component::Normal(name) if !name.to_string_lossy().contains(['\\', '\0'])));
    let text = relative.to_str().filter(|t| plain && !t.is_empty())?;
    Some(text.to_string())
}

/// A name that holds data or settings rather than source code: only these are judged by the
/// words "secret", "credential" and "token", so `tokenizer.rs` is a source file, not a secret.
fn config_like(lower_name: &str) -> bool {
    let extension = std::path::Path::new(lower_name).extension().and_then(|e| e.to_str()).unwrap_or("");
    matches!(extension, "" | "json" | "yaml" | "yml" | "txt" | "toml" | "ini" | "cfg" | "conf" | "properties" | "xml" | "plist" | "pem" | "key")
}

/// Files whose contents are secrets or credentials by name (the same families the
/// privilege-isolation rule protects, and the usual credential files of common tools).
/// A server cannot get their lines shown to the model, and a model cannot have them sent
/// to a server. Applied to the path as written AND to where it resolves, so a link with an
/// innocent name pointing at one of them is caught.
pub fn sensitive_path(relative: &str) -> bool {
    const NAMES: [&str; 18] = [
        ".envrc", ".netrc", ".pgpass", ".htpasswd", ".pypirc", ".npmrc", ".yarnrc", ".yarnrc.yml", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "leases.json",
        "pending-approvals.json", ".git", ".env", "credentials.json", "secrets.json",
    ];
    const DIRECTORIES: [&str; 5] = [".aws", ".kube", ".ssh", ".gnupg", ".docker"];
    const SUFFIXES: [&str; 11] = [".pem", ".key", ".p12", ".pfx", ".crt", ".p8", ".jks", ".keystore", ".tfstate", ".tfvars", ".env"];
    relative.split(['/', '\\']).any(|part| {
        let lower = part.trim_end_matches(['.', ' ']).to_ascii_lowercase();
        NAMES.contains(&lower.as_str())
            || DIRECTORIES.contains(&lower.as_str())
            || lower.starts_with(".env.")
            || lower.starts_with(".env_")
            || SUFFIXES.iter().any(|suffix| lower.ends_with(suffix))
            || (config_like(&lower) && ["secret", "credential", "token"].iter().any(|word| lower.contains(word)))
    })
}

#[cfg(test)]
mod tests;
