//! Inventory of the agent and skill files a project carries.
//!
//! Read-only: walks `core/` and `.claude/` under a root, parses each file's frontmatter and
//! fingerprints its content. Nothing here calls a model or touches the network (invariants I1, I6).

use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// The two trees that carry harness files; `core/` is the source, `.claude/` the installed mirror.
pub const ROOTS: [&str; 2] = ["core", ".claude"];
/// Files in an `agents/` tree that are documentation, not agent definitions.
const NON_AGENT_FILES: [&str; 3] = ["README.md", "INDEX.md", "CLAUDE.md"];
/// A harness file larger than this is skipped (and reported) instead of being read into memory.
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Kind {
    Agent,
    Skill,
}

impl Kind {
    pub fn label(self) -> &'static str {
        match self {
            Kind::Agent => "agent",
            Kind::Skill => "skill",
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct Frontmatter {
    /// True when the file opens with a `---` block that is closed.
    pub present: bool,
    pub name: Option<String>,
    pub description: Option<String>,
    pub tools: Vec<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Entry {
    pub kind: Kind,
    /// `core` or `.claude`.
    pub root: &'static str,
    /// Path relative to the project root, with `/` separators.
    pub path: String,
    /// Path relative to the `agents/` or `skills/` directory; equal for a mirrored pair.
    pub rel: String,
    /// For a skill, the directory that holds `SKILL.md`.
    pub dir_name: Option<String>,
    pub frontmatter: Frontmatter,
    pub lines: usize,
    pub sha256: String,
    pub text: String,
}

#[derive(Debug, Default)]
pub struct Inventory {
    pub entries: Vec<Entry>,
    /// Files skipped because they could not be read or were too large: (path, reason).
    pub skipped: Vec<(String, String)>,
}

/// Parses the top-level `key: value` lines of a leading `---` block. Indented lines and list
/// items are ignored: harness frontmatter is flat, and a full YAML parser is not needed to read it.
pub fn parse_frontmatter(text: &str) -> Frontmatter {
    let mut lines = text.lines();
    if lines.next().map(str::trim_end) != Some("---") {
        return Frontmatter::default();
    }
    let mut out = Frontmatter::default();
    for line in lines {
        let line = line.trim_end();
        if line == "---" {
            out.present = true;
            return out;
        }
        if line.starts_with(' ') || line.starts_with('\t') {
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let value = value
            .trim()
            .trim_matches(|c| c == '"' || c == '\'')
            .to_string();
        match key.trim() {
            "name" => out.name = Some(value).filter(|v| !v.is_empty()),
            "description" => out.description = Some(value).filter(|v| !v.is_empty()),
            "model" => out.model = Some(value).filter(|v| !v.is_empty()),
            "tools" => {
                out.tools = value
                    .split(',')
                    .map(|tool| tool.trim().to_string())
                    .filter(|tool| !tool.is_empty())
                    .collect();
            }
            _ => {}
        }
    }
    // Opened but never closed: treat as absent so the audit reports it.
    Frontmatter {
        present: false,
        ..out
    }
}

/// `IDENTITY.md`, `SOUL.md` and the like sit next to agent files as persona documents, not agents.
pub(super) fn is_persona_doc(file_name: &str) -> bool {
    let stem = file_name.trim_end_matches(".md");
    !stem.is_empty()
        && stem
            .chars()
            .all(|c| c.is_ascii_uppercase() || c == '_' || c == '-' || c.is_ascii_digit())
}

fn sha256_hex(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

fn read_entry(
    project: &Path,
    path: &Path,
    kind: Kind,
    root: &'static str,
    rel: String,
    dir_name: Option<String>,
) -> Result<Entry, String> {
    let meta = fs::metadata(path).map_err(|error| error.to_string())?;
    if meta.len() > MAX_FILE_BYTES {
        return Err(format!("larger than {MAX_FILE_BYTES} bytes"));
    }
    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    Ok(Entry {
        kind,
        root,
        path: relative(project, path),
        rel,
        dir_name,
        frontmatter: parse_frontmatter(&text),
        lines: text.lines().count(),
        sha256: sha256_hex(&text),
        text,
    })
}

/// Walks one `<root>/<agents|skills>` tree. Symlinks are not followed (a link must not lead the
/// scan outside the project).
fn scan_tree(project: &Path, root: &'static str, kind: Kind, inventory: &mut Inventory) {
    let base = project.join(root).join(if kind == Kind::Agent {
        "agents"
    } else {
        "skills"
    });
    if !base.is_dir() {
        return;
    }
    for item in WalkDir::new(&base).follow_links(false).sort_by_file_name() {
        let Ok(item) = item else { continue };
        if !item.file_type().is_file() {
            continue;
        }
        let path = item.path();
        let file_name = item.file_name().to_string_lossy();
        let rel = relative(&base, path);
        let dir_name = match kind {
            Kind::Agent => {
                if !file_name.ends_with(".md")
                    || NON_AGENT_FILES.contains(&file_name.as_ref())
                    || is_persona_doc(&file_name)
                {
                    continue;
                }
                None
            }
            Kind::Skill => {
                // Only `<skill>/SKILL.md`: references and examples inside a skill are not skills.
                let parts: Vec<&str> = rel.split('/').collect();
                if parts.len() != 2 || parts[1] != "SKILL.md" {
                    continue;
                }
                Some(parts[0].to_string())
            }
        };
        match read_entry(project, path, kind, root, rel, dir_name) {
            Ok(entry) => inventory.entries.push(entry),
            Err(reason) => inventory.skipped.push((relative(project, path), reason)),
        }
    }
}

pub fn scan(project: &Path) -> Inventory {
    let mut inventory = Inventory::default();
    for root in ROOTS {
        scan_tree(project, root, Kind::Agent, &mut inventory);
        scan_tree(project, root, Kind::Skill, &mut inventory);
    }
    inventory
}

/// Canonical project root: an existing directory, resolved so later paths cannot escape it.
pub fn resolve_root(requested: &Path) -> Result<PathBuf, String> {
    let canonical = requested
        .canonicalize()
        .map_err(|error| format!("{}: {error}", requested.display()))?;
    if canonical.is_dir() {
        Ok(canonical)
    } else {
        Err(format!("{} is not a directory", canonical.display()))
    }
}
