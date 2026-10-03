//! What an approver must see before a language server is started (WS3, contract
//! section 17), and what the gateway compares against so that it runs exactly that.
//!
//! Like `mcp_disclosure`, this lives outside the `mcp` feature: the chat approval
//! prompt needs it in every build. It is built from the trusted configuration and the
//! validated question, and says, in this order: what program starts (the exact quoted
//! command line), which variables it is given, and then what is asked and about which
//! file and position. The model-chosen part comes last.

use super::lsp_config::{find_lsp_server, LspServer, DEFAULT_TIMEOUT_SECS};
use super::CapabilityError;
use crate::lsp_client::operation::{check_target, parse_query, Operation, Query};
use serde_json::Value;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LspDisclosure {
    pub server: String,
    pub command: String,
    pub args: Vec<String>,
    pub env_names: Vec<String>,
    pub timeout_secs: u64,
    pub operation: Operation,
    pub path: String,
    pub line: u32,
    pub character: u32,
}

impl LspDisclosure {
    /// The program and its arguments as one quoted line: `a "b c"` and `a b c` read differently.
    pub fn command_line(&self) -> String {
        shell_words::join(std::iter::once(self.command.as_str()).chain(self.args.iter().map(String::as_str)))
    }

    /// The variable names passed on, or `none`.
    pub fn env_note(&self) -> String {
        if self.env_names.is_empty() {
            "none".to_string()
        } else {
            self.env_names.join(", ")
        }
    }

    /// What is asked, about where.
    pub fn question(&self) -> String {
        match self.operation {
            Operation::DocumentSymbols => format!("document_symbols of {}", self.path),
            op => format!("{} at {}:{}:{}", op.label(), self.path, self.line, self.character),
        }
    }

    /// One line for a stored reason or a denial message.
    pub fn summary(&self) -> String {
        let env = if self.env_names.is_empty() { "no extra variables".to_string() } else { format!("variables {}", self.env_names.join(", ")) };
        format!(
            "LSP: start external program `{}` (server '{}', {env} passed, timeout {}s) and ask for {}",
            self.command_line(),
            self.server,
            self.timeout_secs,
            self.question()
        )
    }
}

/// The disclosure for `server` answering `query`.
pub fn disclosure_of(server: &LspServer, query: &Query) -> LspDisclosure {
    LspDisclosure {
        server: server.server.name.clone(),
        command: server.server.command.clone(),
        args: server.server.args.clone(),
        env_names: server.server.env.clone(),
        timeout_secs: server.server.timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS),
        operation: query.operation,
        path: query.path.clone(),
        line: query.line,
        character: query.character,
    }
}

/// Validates the arguments, finds the CONFIRMED server and checks that the file and
/// line exist, with the same checks `lsp_query` applies, so a question that could
/// never run is never put in front of an approver.
pub fn disclose(root: &Path, arguments: &Value) -> Result<LspDisclosure, CapabilityError> {
    let query = parse_query(arguments)?;
    let server = find_lsp_server(root, &query.server)?;
    check_target(root, &query)?;
    Ok(disclosure_of(&server, &query))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capability::config_trust::{forget_all_trust_in_test, trust_in_test};
    use serde_json::json;

    fn repo(servers: Value) -> (tempfile::TempDir, std::path::PathBuf) {
        let outer = tempfile::tempdir().unwrap();
        let root = outer.path().join("ws");
        std::fs::create_dir_all(root.join(".yana-ai")).unwrap();
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("src/lib.rs"), "pub fn alpha() {}\nlet beta = 1;\n").unwrap();
        std::fs::write(root.join(".yana-ai/lsp-servers.json"), json!({"servers": servers}).to_string()).unwrap();
        trust_in_test(&root);
        (outer, root)
    }

    fn one() -> Value {
        json!([{"name": "rust", "command": "rust-analyzer", "args": ["--log file", "x"], "env": ["RUST_LOG"], "timeout_secs": 90, "extensions": ["rs"]}])
    }

    fn call(operation: &str, path: &str, line: u32) -> Value {
        json!({"server": "rust", "operation": operation, "path": path, "line": line, "character": 5})
    }

    #[test]
    fn the_summary_names_the_program_first_and_the_question_last() {
        let (_k, root) = repo(one());
        let d = disclose(&root, &call("definition", "src/lib.rs", 2)).unwrap();
        assert_eq!(d.command_line(), "rust-analyzer '--log file' x", "quoted, so two arguments cannot pass for one");
        assert_eq!(d.summary(), "LSP: start external program `rust-analyzer '--log file' x` (server 'rust', variables RUST_LOG passed, timeout 90s) and ask for definition at src/lib.rs:2:5");
        let symbols = disclose(&root, &json!({"server": "rust", "operation": "document_symbols", "path": "src/lib.rs"})).unwrap();
        assert!(symbols.summary().ends_with("ask for document_symbols of src/lib.rs"), "{}", symbols.summary());
    }

    #[test]
    fn the_default_timeout_applies_when_the_entry_has_none() {
        let (_k, root) = repo(json!([{"name": "rust", "command": "rust-analyzer"}]));
        assert_eq!(disclose(&root, &call("hover", "src/lib.rs", 1)).unwrap().timeout_secs, DEFAULT_TIMEOUT_SECS);
    }

    #[test]
    fn a_question_that_could_never_run_is_refused_before_anything_is_shown() {
        let (_k, root) = repo(one());
        let bad = [
            json!({"server": "other", "operation": "hover", "path": "src/lib.rs", "line": 1, "character": 1}),
            call("rename", "src/lib.rs", 1),
            call("hover", "src/missing.rs", 1),
            call("hover", "src/lib.rs", 99),
            call("hover", "../outside.rs", 1),
            call("hover", ".env", 1),
        ];
        for arguments in bad {
            assert!(disclose(&root, &arguments).is_err(), "{arguments}");
        }
    }

    #[test]
    fn nothing_is_disclosed_for_a_list_nobody_confirmed() {
        let (_k, root) = repo(one());
        forget_all_trust_in_test();
        let error = disclose(&root, &call("hover", "src/lib.rs", 1)).unwrap_err().to_string();
        assert!(error.contains("not trusted"), "{error}");
    }

    #[test]
    fn disclosures_differ_when_anything_that_matters_differs() {
        let (_k, root) = repo(one());
        let base = disclose(&root, &call("definition", "src/lib.rs", 2)).unwrap();
        assert_eq!(base, disclose(&root, &call("definition", "src/lib.rs", 2)).unwrap());
        assert_ne!(base, disclose(&root, &call("references", "src/lib.rs", 2)).unwrap(), "another operation");
        assert_ne!(base, disclose(&root, &call("definition", "src/lib.rs", 1)).unwrap(), "another line");
        std::fs::write(root.join(".yana-ai/lsp-servers.json"), json!({"servers": [{"name": "rust", "command": "/tmp/other", "env": ["RUST_LOG"], "timeout_secs": 90}]}).to_string()).unwrap();
        trust_in_test(&root);
        assert_ne!(base, disclose(&root, &call("definition", "src/lib.rs", 2)).unwrap(), "another program");
    }
}
