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
    let observation = read_file_observation(&canonical_root, &query.path)?;
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

/// Files whose contents are secrets or credentials by name (the same families the
/// privilege-isolation rule protects). A server cannot get their lines shown to the
/// model, and a model cannot have them sent to a server.
pub fn sensitive_path(relative: &str) -> bool {
    relative.split(['/', '\\']).any(|part| {
        let lower = part.to_ascii_lowercase();
        lower == ".git"
            || lower == ".env"
            || lower.starts_with(".env.")
            || lower.ends_with(".env")
            || [".pem", ".key", ".p12", ".pfx", ".crt"].iter().any(|ext| lower.ends_with(ext))
            || ["secret", "credential", "token"].iter().any(|word| lower.contains(word))
            || lower == ".npmrc"
            || lower == "id_rsa"
            || lower == "id_ed25519"
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(extra: Value) -> Value {
        let mut base = json!({"server": "rust", "operation": "definition", "path": "src/main.rs", "line": 10, "character": 4});
        for (k, v) in extra.as_object().unwrap() {
            base[k] = v.clone();
        }
        base
    }

    #[test]
    fn a_valid_query_is_parsed_and_positions_are_one_based() {
        let query = parse_query(&args(json!({}))).unwrap();
        assert_eq!((query.server.as_str(), query.operation, query.path.as_str(), query.line, query.character), ("rust", Operation::Definition, "src/main.rs", 10, 4));
        let symbols = parse_query(&args(json!({"operation": "document_symbols", "line": null, "character": null}))).unwrap();
        assert_eq!(symbols.operation, Operation::DocumentSymbols, "a position is not needed for a document's symbols");
    }

    #[test]
    fn anything_malformed_is_refused_before_a_server_is_involved() {
        let bad = [
            json!({"server": "Rust Server"}),
            json!({"server": ""}),
            json!({"operation": "rename"}),
            json!({"operation": "applyEdit"}),
            json!({"path": ""}),
            json!({"path": "/etc/passwd"}),
            json!({"path": "../outside.rs"}),
            json!({"path": "a/../../b.rs"}),
            json!({"path": "C:\\x.rs"}),
            json!({"path": "a\nb.rs"}),
            json!({"path": "a\u{202e}b.rs"}),
            json!({"path": "x".repeat(MAX_PATH_CHARS + 1)}),
            json!({"line": 0}),
            json!({"line": -1}),
            json!({"line": "ten"}),
            json!({"line": 10_000_001u64}),
            json!({"character": 0}),
            json!({"character": 1.5}),
        ];
        for case in bad {
            assert!(parse_query(&args(case.clone())).is_err(), "{case}");
        }
        for missing in ["server", "operation", "path", "line", "character"] {
            let mut incomplete = args(json!({}));
            incomplete.as_object_mut().unwrap().remove(missing);
            assert!(parse_query(&incomplete).is_err(), "missing {missing}");
        }
        assert!(parse_query(&json!("not an object")).is_err());
    }

    #[test]
    fn columns_convert_between_characters_and_utf16_units() {
        assert_eq!(utf16_offset("let x = 1;", 5), 4, "ASCII: character 5 is offset 4");
        // U+1F600 is two UTF-16 units: the character after it is at offset 2, not 1.
        assert_eq!(utf16_offset("\u{1f600}ab", 2), 2);
        assert_eq!(utf16_offset("\u{4e2d}ab", 2), 1, "a BMP character is one unit");
        assert_eq!(utf16_offset("abc", 99), 3, "past the end is the end");
        assert_eq!(utf16_offset("abc", 0), 0);
        assert_eq!(character_at("\u{1f600}ab", 2), 2, "offset 2 is the second character");
        assert_eq!(character_at("abc", 0), 1);
        assert_eq!(character_at("abc", 3), 4, "the end of the line");
    }

    #[test]
    fn request_params_have_the_shape_servers_expect_and_zero_based_positions() {
        let query = parse_query(&args(json!({"operation": "references"}))).unwrap();
        let params = request_params(&query, "file:///r/src/main.rs", "    let value = 1;");
        assert_eq!(params["position"], json!({"line": 9, "character": 3}));
        assert_eq!(params["context"]["includeDeclaration"], true);
        let symbols = parse_query(&args(json!({"operation": "document_symbols"}))).unwrap();
        assert_eq!(request_params(&symbols, "file:///r/a.rs", ""), json!({"textDocument": {"uri": "file:///r/a.rs"}}));
    }

    #[cfg(unix)]
    #[test]
    fn uris_inside_the_repository_become_relative_paths_and_everything_else_is_refused() {
        let root = Path::new("/work/repo");
        assert_eq!(relative_from_uri(root, "file:///work/repo/src/lib.rs"), Some("src/lib.rs".into()));
        assert_eq!(relative_from_uri(root, "file:///work/repo/a%20b/c.rs"), Some("a b/c.rs".into()), "percent-encoding is decoded");
        for outside in [
            "file:///work/other/x.rs",
            "file:///work/repo",
            "file:///work/repo/../other/x.rs",
            "file:///work/repo/..%2f..%2fetc/passwd",
            "file:///work/repo/%2e%2e%2f%2e%2e%2fetc/passwd",
            "file:///work/repo/a%5c..%5cb.rs",
            "file:///work/repo/a%00b.rs",
            "file:///etc/passwd",
            "file:///work/repository/x.rs",
            "http://work/repo/x.rs",
            "https://evil.example/work/repo/x.rs",
            "untitled:Untitled-1",
            "not a uri",
            "",
        ] {
            assert_eq!(relative_from_uri(root, outside), None, "{outside}");
        }
    }

    #[test]
    fn files_that_hold_secrets_are_recognised_by_name() {
        for secret in [".env", "app/.env.production", "prod.env", "certs/server.pem", "a/b/private.key", "id_rsa", ".npmrc", ".git/config", "src/api_token.rs", "credentials.json", "my_secret.txt"] {
            assert!(sensitive_path(secret), "{secret}");
        }
        for fine in ["src/main.rs", "README.md", "docs/environment.md", "src/lib/envelope.rs"] {
            assert!(!sensitive_path(fine), "{fine}");
        }
        assert!(parse_query(&args(json!({"path": "config/.env"}))).is_err(), "a query about a secrets file is refused");
    }

    #[cfg(unix)]
    #[test]
    fn a_path_becomes_a_file_uri_under_the_root() {
        let uri = file_uri(Path::new("/work/repo"), "src/my file.rs").unwrap();
        assert_eq!(uri, "file:///work/repo/src/my%20file.rs");
        assert_eq!(relative_from_uri(Path::new("/work/repo"), &uri), Some("src/my file.rs".into()), "round trip");
    }
}
