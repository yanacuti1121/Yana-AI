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
    if cfg!(feature = "mcp") && root.join(".yana-ai").join("mcp-servers.json").is_file() && !is_trusted(root, ConfigKind::McpServers) {
        notices.push(notice("mcp_call", ConfigKind::McpServers));
    }
    notices
}

fn notice(tool: &str, kind: ConfigKind) -> String {
    format!("{tool} chưa được xác nhận cho repo này: chạy `yana-rt trust allow {}`", kind.label())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capability::config_trust::{empty_store_in_test, trust_in_test};

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

    #[cfg(not(feature = "mcp"))]
    #[test]
    fn without_the_client_no_confirmation_is_asked_for() {
        let (_k, root) = repo(&[("mcp-servers.json", SERVERS)]);
        empty_store_in_test();
        assert!(hidden_tool_notices(&root).is_empty(), "confirming would not make the tool appear");
    }

    #[test]
    fn both_unconfirmed_give_two_lines_in_a_stable_order() {
        let (_k, root) = repo(&[("web-search.json", SEARCH), ("mcp-servers.json", SERVERS)]);
        empty_store_in_test();
        let lines = hidden_tool_notices(&root);
        assert_eq!(lines.len(), if cfg!(feature = "mcp") { 2 } else { 1 });
        assert!(lines[0].starts_with("web_search"));
    }
}
