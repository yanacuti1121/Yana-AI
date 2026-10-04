//! One line, shown to the person, for each tool that is configured in this
//! repository but hidden from the model because nobody confirmed the
//! configuration yet. Hiding it silently would leave a person who set up web
//! search wondering why it stopped working.

use crate::capability::config_trust::{is_trusted, ConfigKind};
use std::path::Path;

/// The lines to show for `root`. Empty when nothing is configured-but-unconfirmed,
/// so a repository without these files sees nothing at all.
pub fn hidden_tool_notices(root: &Path) -> Vec<String> {
    let mut notices = Vec::new();
    if crate::capability::web_search::is_configured(root) && !is_trusted(root, ConfigKind::WebSearch) {
        notices.push(notice("web_search", ConfigKind::WebSearch));
    }
    // Only in builds that have the client: otherwise the tool is not offered for a reason a confirmation cannot fix.
    if cfg!(feature = "mcp") && ConfigKind::McpServers.exists_in(root) && !is_trusted(root, ConfigKind::McpServers) {
        notices.push(notice("mcp_call", ConfigKind::McpServers));
    }
    if cfg!(feature = "lsp") && ConfigKind::LspServers.exists_in(root) && !is_trusted(root, ConfigKind::LspServers) {
        notices.push(notice("lsp_query", ConfigKind::LspServers));
    }
    notices
}

fn notice(tool: &str, kind: ConfigKind) -> String {
    format!("{tool} chưa được xác nhận cho repo này: chạy `yana-rt trust allow {}`", kind.label())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capability::config_trust::{empty_store_in_test, forget_all_trust_in_test, trust_in_test};

    fn repo(files: &[(&str, &str)]) -> (tempfile::TempDir, std::path::PathBuf) {
        let outer = tempfile::tempdir().unwrap();
        let root = outer.path().join("ws");
        std::fs::create_dir_all(root.join(".yana-ai")).unwrap();
        for (name, text) in files {
            std::fs::write(root.join(".yana-ai").join(name), text).unwrap();
        }
        (outer, root)
    }

    const SEARCH: &str = r#"{"endpoint":"https://s.example/q"}"#;
    const SERVERS: &str = r#"{"servers":[{"name":"gh","command":"npx"}]}"#;

    #[test]
    fn a_configured_but_unconfirmed_search_says_so_and_names_the_command() {
        let (_k, root) = repo(&[("web-search.json", SEARCH)]);
        empty_store_in_test();
        assert_eq!(hidden_tool_notices(&root), ["web_search chưa được xác nhận cho repo này: chạy `yana-rt trust allow web-search`"]);
    }

    #[test]
    fn a_configuration_that_changed_after_it_was_confirmed_says_so_again() {
        let (_k, root) = repo(&[("web-search.json", SEARCH)]);
        trust_in_test(&root);
        assert!(hidden_tool_notices(&root).is_empty(), "confirmed: nothing to say");
        std::fs::write(root.join(".yana-ai/web-search.json"), r#"{"endpoint":"https://evil.example/q"}"#).unwrap();
        assert_eq!(hidden_tool_notices(&root).len(), 1, "a changed file is hidden again, and the person is told");
    }

    #[test]
    fn nothing_is_said_when_nothing_is_configured() {
        let (_k, root) = repo(&[]);
        empty_store_in_test();
        assert!(hidden_tool_notices(&root).is_empty());
    }

    #[cfg(feature = "mcp")]
    #[test]
    fn an_unconfirmed_server_list_says_so_and_names_its_command() {
        let (_k, root) = repo(&[("mcp-servers.json", SERVERS)]);
        empty_store_in_test();
        assert_eq!(hidden_tool_notices(&root), ["mcp_call chưa được xác nhận cho repo này: chạy `yana-rt trust allow mcp-servers`"]);
        trust_in_test(&root);
        assert!(hidden_tool_notices(&root).is_empty());
    }

    #[cfg(feature = "lsp")]
    #[test]
    fn an_unconfirmed_language_server_list_says_so_and_names_its_command() {
        let (_k, root) = repo(&[("lsp-servers.json", SERVERS)]);
        empty_store_in_test();
        assert_eq!(hidden_tool_notices(&root), ["lsp_query chưa được xác nhận cho repo này: chạy `yana-rt trust allow lsp-servers`"]);
        trust_in_test(&root);
        assert!(hidden_tool_notices(&root).is_empty());
    }

    #[cfg(not(feature = "mcp"))]
    #[test]
    fn without_the_client_no_confirmation_is_asked_for() {
        let (_k, root) = repo(&[("mcp-servers.json", SERVERS)]);
        empty_store_in_test();
        assert!(hidden_tool_notices(&root).is_empty(), "confirming would not make the tool appear");
    }

    #[test]
    fn both_unconfirmed_give_two_lines_in_a_stable_order() {
        let (_k, root) = repo(&[("web-search.json", SEARCH), ("mcp-servers.json", SERVERS), ("lsp-servers.json", SERVERS)]);
        empty_store_in_test();
        let lines = hidden_tool_notices(&root);
        assert_eq!(lines.len(), 1 + usize::from(cfg!(feature = "mcp")) + usize::from(cfg!(feature = "lsp")));
        assert!(lines[0].starts_with("web_search"));
    }

    /// The notice and the catalog must agree for every combination: a tool is either
    /// offered, or hidden WITH a notice, or not configured at all (nothing to say).
    #[test]
    fn the_notice_and_the_catalog_agree_for_every_combination() {
        let offered = |root: &std::path::Path, name: &str| {
            let ctx = crate::session_context::SessionContext::new("s", root.to_path_buf(), "ollama", "m", false);
            super::super::catalog(&ctx).iter().any(|t| t.name == name)
        };
        for (configure, confirm) in [(false, false), (true, false), (true, true), (false, true)] {
            let files: Vec<(&str, &str)> = if configure { vec![("web-search.json", SEARCH), ("mcp-servers.json", SERVERS), ("lsp-servers.json", SERVERS)] } else { Vec::new() };
            let (_k, root) = repo(&files);
            forget_all_trust_in_test();
            if confirm {
                trust_in_test(&root);
            }
            let notices = hidden_tool_notices(&root);
            let said = |tool: &str| notices.iter().any(|n| n.starts_with(tool));
            assert_eq!(offered(&root, "web_search"), configure && confirm, "web_search offered (configured {configure}, confirmed {confirm})");
            assert_eq!(said("web_search"), configure && !confirm, "web_search notice (configured {configure}, confirmed {confirm})");
            assert!(!(offered(&root, "web_search") && said("web_search")), "never both offered and announced as hidden");
            if cfg!(feature = "mcp") {
                assert_eq!(offered(&root, "mcp_call"), configure && confirm, "mcp_call offered (configured {configure}, confirmed {confirm})");
                assert_eq!(said("mcp_call"), configure && !confirm, "mcp_call notice (configured {configure}, confirmed {confirm})");
            } else {
                assert!(!said("mcp_call") && !offered(&root, "mcp_call"), "without the client: neither");
            }
            if cfg!(feature = "lsp") {
                assert_eq!(offered(&root, "lsp_query"), configure && confirm, "lsp_query offered (configured {configure}, confirmed {confirm})");
                assert_eq!(said("lsp_query"), configure && !confirm, "lsp_query notice (configured {configure}, confirmed {confirm})");
            } else {
                assert!(!said("lsp_query") && !offered(&root, "lsp_query"), "without the client: neither");
            }
        }
    }
}
