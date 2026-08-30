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
    /// Bounded `git status` (porcelain v2 + branch header) — same canonical
    /// implementation (`crate::capability::git::git_status`) chat's
    /// `git_status` tool uses. A passive UI read, no mutation, no
    /// authority decision — same category as `Tree` above, not a second
    /// execution path.
    ///
    /// TEMPORARY TRANSPORT ADAPTER, not a new architectural pattern:
    /// verified before adding this that neither this CLI (`Tree` is its
    /// only existing variant) nor `ChatCapabilityExecutor`
    /// (`src/chat/tui/tool_dispatch.rs`, a hardcoded `match call.name`)
    /// has a generic "invoke capability by name" dispatcher today —
    /// `CapabilityDescriptor` carries no handler/fn pointer, only
    /// metadata. Building that generic dispatcher is real, valuable work
    /// but is its own refactor across two already-tested call sites, out
    /// of scope for a single Context Panel field. If more capabilities
    /// need a UI-facing read path (Files/Tasks/Git full views, Phase 2+),
    /// build the generic `capability invoke <name>` path then, instead of
    /// adding a third, fourth, ... one-off variant here.
    GitStatus {
        /// Repository root to run `git status` in.
        #[arg(long)]
        root: PathBuf,
    },
    /// Bounded, UTF-8-only file read — same canonical implementation
    /// (`crate::capability::repo::read_file`) chat's `read_file` tool
    /// already uses: path-sandboxed via `resolve_existing`, size-capped
    /// via `MAX_READ_BYTES`, rejects binary/non-UTF-8 content rather than
    /// mangling it. Same "temporary transport adapter, not a new
    /// dispatcher pattern" reasoning as `GitStatus` above — Desktop's
    /// File Workspace (roadmap Phase 5) needs a UI-facing read path and
    /// this is the smallest addition that reuses the existing capability
    /// exactly as-is.
    ReadFile {
        /// Repository root to sandbox the read to.
        #[arg(long)]
        root: PathBuf,
        /// File path to read, relative to `--root`.
        #[arg(long)]
        path: String,
    },
    /// Roadmap Phase 6 item 21 — ZIP Inspector. Same canonical
    /// implementation (`crate::capability::archive::inspect_zip`) —
    /// entry list, sizes, and security warnings (bomb ratio, symlink
    /// entries, nested archives), never extracts anything.
    ZipInspect {
        /// Path to the .zip file to inspect.
        #[arg(long)]
        zip_path: PathBuf,
    },
    /// Roadmap Phase 6 item 22 — Safe Extraction. Same canonical
    /// implementation (`crate::capability::archive::extract_zip`) — Zip
    /// Slip/symlink/bomb-protected, see that module's own doc comment.
    ZipExtract {
        /// Path to the .zip file to extract.
        #[arg(long)]
        zip_path: PathBuf,
        /// Destination directory — must already exist.
        #[arg(long)]
        dest: PathBuf,
    },
    /// Roadmap Phase 7 item 27 — Git Inspector. Diff for one file, not
    /// the whole tree (`crate::capability::git::git_diff_path`).
    GitDiffPath {
        #[arg(long)]
        root: PathBuf,
        #[arg(long)]
        staged: bool,
        #[arg(long)]
        path: String,
    },
    /// Roadmap Phase 7 item 28 — Git Actions. See git.rs's own doc
    /// comment on why staging/committing stays outside RuntimeAuthority
    /// (same trust tier as the human PTY, not an AI tool call).
    GitStage {
        #[arg(long)]
        root: PathBuf,
        #[arg(long = "path")]
        paths: Vec<String>,
    },
    GitUnstage {
        #[arg(long)]
        root: PathBuf,
        #[arg(long = "path")]
        paths: Vec<String>,
    },
    GitCommit {
        #[arg(long)]
        root: PathBuf,
        #[arg(long)]
        message: String,
    },
}

pub fn dispatch(action: CapabilityAction) {
    let code = match action {
        CapabilityAction::Tree { root, path, depth } => cmd_tree(&root, &path, depth),
        CapabilityAction::GitStatus { root } => cmd_git_status(&root),
        CapabilityAction::ReadFile { root, path } => cmd_read_file(&root, &path),
        CapabilityAction::ZipInspect { zip_path } => cmd_zip_inspect(&zip_path),
        CapabilityAction::ZipExtract { zip_path, dest } => cmd_zip_extract(&zip_path, &dest),
        CapabilityAction::GitDiffPath { root, staged, path } => cmd_git_diff_path(&root, staged, &path),
        CapabilityAction::GitStage { root, paths } => cmd_git_stage(&root, &paths),
        CapabilityAction::GitUnstage { root, paths } => cmd_git_unstage(&root, &paths),
        CapabilityAction::GitCommit { root, message } => cmd_git_commit(&root, &message),
    };
    std::process::exit(code);
}

fn cmd_git_diff_path(root: &std::path::Path, staged: bool, path: &str) -> i32 {
    let root = match root.canonicalize() {
        Ok(canonical) => canonical,
        Err(error) => {
            eprintln!("resolve --root {}: {error}", root.display());
            return 1;
        }
    };
    match super::git_diff_path(&root, staged, path) {
        Ok(json) => { println!("{json}"); 0 }
        Err(error) => { eprintln!("{error}"); 1 }
    }
}

fn cmd_git_stage(root: &std::path::Path, paths: &[String]) -> i32 {
    let root = match root.canonicalize() {
        Ok(canonical) => canonical,
        Err(error) => {
            eprintln!("resolve --root {}: {error}", root.display());
            return 1;
        }
    };
    match super::git_stage(&root, paths) {
        Ok(json) => { println!("{json}"); 0 }
        Err(error) => { eprintln!("{error}"); 1 }
    }
}

fn cmd_git_unstage(root: &std::path::Path, paths: &[String]) -> i32 {
    let root = match root.canonicalize() {
        Ok(canonical) => canonical,
        Err(error) => {
            eprintln!("resolve --root {}: {error}", root.display());
            return 1;
        }
    };
    match super::git_unstage(&root, paths) {
        Ok(json) => { println!("{json}"); 0 }
        Err(error) => { eprintln!("{error}"); 1 }
    }
}

fn cmd_git_commit(root: &std::path::Path, message: &str) -> i32 {
    let root = match root.canonicalize() {
        Ok(canonical) => canonical,
        Err(error) => {
            eprintln!("resolve --root {}: {error}", root.display());
            return 1;
        }
    };
    match super::git_commit(&root, message) {
        Ok(json) => { println!("{json}"); 0 }
        Err(error) => { eprintln!("{error}"); 1 }
    }
}

fn cmd_zip_inspect(zip_path: &std::path::Path) -> i32 {
    match super::inspect_zip(zip_path) {
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

fn cmd_zip_extract(zip_path: &std::path::Path, dest: &std::path::Path) -> i32 {
    match super::extract_zip(zip_path, dest) {
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

fn cmd_read_file(root: &std::path::Path, path: &str) -> i32 {
    let root = match root.canonicalize() {
        Ok(canonical) => canonical,
        Err(error) => {
            eprintln!("resolve --root {}: {error}", root.display());
            return 1;
        }
    };
    match super::read_file(&root, path) {
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

fn cmd_git_status(root: &std::path::Path) -> i32 {
    let root = match root.canonicalize() {
        Ok(canonical) => canonical,
        Err(error) => {
            eprintln!("resolve --root {}: {error}", root.display());
            return 1;
        }
    };
    match super::git::git_status(&root) {
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

    #[test]
    fn cmd_git_status_prints_json_envelope_on_success() {
        let root = std::env::temp_dir().join(format!("yana-cap-cli-git-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        std::process::Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(&root)
            .status()
            .unwrap();

        let json = super::super::git::git_status(&root.canonicalize().unwrap()).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["capability"], "git.status");

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn cmd_git_status_reports_error_for_missing_root() {
        let missing =
            std::env::temp_dir().join(format!("yana-cap-cli-git-missing-{}", uuid::Uuid::new_v4()));
        let code = cmd_git_status(&missing);
        assert_eq!(code, 1);
    }

    #[test]
    fn cmd_read_file_prints_json_envelope_on_success() {
        let root = std::env::temp_dir().join(format!("yana-cap-cli-read-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("hello.txt"), "hello world").unwrap();

        let json = super::super::read_file(&root.canonicalize().unwrap(), "hello.txt").unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["capability"], "repo.read");
        assert!(json.contains("hello world"));

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn cmd_read_file_reports_error_for_missing_root() {
        let missing =
            std::env::temp_dir().join(format!("yana-cap-cli-read-missing-{}", uuid::Uuid::new_v4()));
        let code = cmd_read_file(&missing, "hello.txt");
        assert_eq!(code, 1);
    }

    #[test]
    fn cmd_read_file_reports_error_for_path_escape() {
        let root = std::env::temp_dir().join(format!("yana-cap-cli-read-escape-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();

        let code = cmd_read_file(&root, "../../../../etc/passwd");
        assert_eq!(code, 1);

        fs::remove_dir_all(root).ok();
    }
}
