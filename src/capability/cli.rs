//! `yana-rt capability <subcommand>` — the scriptable, one-shot CLI surface
//! this repo's own `tests/integration_runtime.rs` convention already uses
//! for `bus`/`memory`/`cost` (`Command::new(bin()).args([...])`, JSON on
//! stdout, exit code as the outcome). This is what
//! `tools/yana-desktop/main.js` shells out to instead of reimplementing
//! the Gate L5 path-sandbox natively in Node (AD-11's Desktop half).
//!
//! Deliberately not the MCP server (`src/mcp.rs`, `mcp` feature): that's
//! documented as "Phase 9 spike ONLY — not wired into any live client
//! path" (`Cargo.toml`), and wiring Desktop through it would pull `tokio`
//! into a process that has no other need for an async runtime.

use clap::Subcommand;
use std::path::PathBuf;

#[derive(Subcommand)]
pub enum CapabilityAction {
    /// Bounded repository tree — same guarantee (Gate L5, generated-dir
    /// skip, entry cap) as MCP's `repo_tree` tool.
    Tree {
        /// Repository root to anchor the sandbox to.
        #[arg(long)]
        root: PathBuf,
        /// Path within the repository to list, relative to `--root`.
        #[arg(long, default_value = ".")]
        path: String,
        /// Recursion depth (capped at 5 by the capability itself).
        #[arg(long, default_value_t = 2)]
        depth: usize,
    },
}

pub fn dispatch(action: CapabilityAction) {
    let code = match action {
        CapabilityAction::Tree { root, path, depth } => cmd_tree(&root, &path, depth),
    };
    std::process::exit(code);
}

fn cmd_tree(root: &std::path::Path, path: &str, depth: usize) -> i32 {
    // `repo_tree`'s entries are reported relative to whatever `root` it's
    // given (see `walk()`) — canonicalize first so a relative `--root`
    // (e.g. ".") still produces repo-relative entries instead of falling
    // back to absolute paths. MCP's caller already always passes a
    // canonicalized root; this makes the CLI robust the same way
    // regardless of how it's invoked, without changing `repo_tree`/`walk`
    // themselves.
    let root = match root.canonicalize() {
        Ok(canonical) => canonical,
        Err(error) => {
            eprintln!("resolve --root {}: {error}", root.display());
            return 1;
        }
    };
    match super::repo_tree(&root, path, depth) {
        Ok(json) => {
            println!("{json}");
            0
        }
        Err(error) => {
            eprintln!("{error}");
            1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn cmd_tree_prints_json_envelope_on_success() {
        let root = std::env::temp_dir().join(format!("yana-cap-cli-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src/main.rs"), "fn main() {}").unwrap();

        let json = super::super::repo_tree(&root, ".", 2).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["capability"], "repo.tree");
        assert!(json.contains("src/main.rs"));

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn cmd_tree_reports_error_for_missing_root() {
        let missing =
            std::env::temp_dir().join(format!("yana-cap-cli-missing-{}", uuid::Uuid::new_v4()));
        let code = cmd_tree(&missing, ".", 2);
        assert_eq!(code, 1);
    }
}
