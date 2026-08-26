//! Real-data readers for the sidebar panels — split out of `sidebar.rs`
//! for line-count budget. Pure file I/O + parsing, no rendering.

use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Default)]
pub(in crate::chat::tui) struct ProjectCounts {
    pub agents: u64,
    pub skills: u64,
    pub rules: u64,
    pub hooks: u64,
    pub scripts: u64,
    pub commands: u64,
    pub version: String,
}

/// Reads `MANIFEST.json`'s canonical counts — the same file
/// `core/scripts/check_counts.py` treats as the source of truth. Returns
/// `None` rather than a zeroed struct on any read/parse failure, so the
/// panel can show "unavailable" instead of a misleading "0 skills".
pub(in crate::chat::tui) fn read_project_counts(repo_root: &Path) -> Option<ProjectCounts> {
    let raw = fs::read_to_string(repo_root.join("MANIFEST.json")).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let get_u64 = |key: &str| {
        value
            .get(key)
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(0)
    };
    Some(ProjectCounts {
        agents: get_u64("agents_count"),
        skills: get_u64("skills_count"),
        rules: get_u64("rules_count"),
        hooks: get_u64("hooks_count"),
        scripts: get_u64("scripts_count"),
        commands: get_u64("commands_count"),
        version: value
            .get("version")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("?")
            .to_string(),
    })
}

#[derive(Debug, Clone)]
pub(in crate::chat::tui) struct MemoryFact {
    pub id: String,
    pub statement: String,
}

/// Reads `memory/L1_atomic/*.md` frontmatter directly (line-scan, not a
/// full YAML parser — the frontmatter shape is small and stable, see
/// `memory/L1_atomic/SCHEMA.md`) and returns facts whose `id` or
/// `statement` contains `filter` (case-insensitive), most-recently-named
/// file first, capped at `limit`. Empty `filter` matches everything.
pub(in crate::chat::tui) fn read_memory_facts(
    repo_root: &Path,
    filter: &str,
    limit: usize,
) -> Vec<MemoryFact> {
    let l1_dir = repo_root.join("memory/L1_atomic");
    let Ok(entries) = fs::read_dir(&l1_dir) else {
        return Vec::new();
    };

    let mut paths: Vec<_> = entries
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            p.extension().and_then(|e| e.to_str()) == Some("md")
                && p.file_stem()
                    .and_then(|s| s.to_str())
                    .is_some_and(|s| s.starts_with("fact-"))
        })
        .collect();
    paths.sort();
    paths.reverse(); // newest fact-<timestamp>.md filenames first

    let filter_lower = filter.to_lowercase();
    let mut out = Vec::new();
    for path in paths {
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let id = parse_frontmatter_field(&content, "id").unwrap_or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("?")
                .to_string()
        });
        let statement = parse_frontmatter_field(&content, "statement").unwrap_or_default();
        if statement.is_empty() {
            continue;
        }
        if !filter_lower.is_empty()
            && !id.to_lowercase().contains(&filter_lower)
            && !statement.to_lowercase().contains(&filter_lower)
        {
            continue;
        }
        out.push(MemoryFact { id, statement });
        if out.len() >= limit {
            break;
        }
    }
    out
}

/// Extracts `key: value` from a YAML frontmatter block (between the first
/// two `---` lines). Values are expected on a single line — every field
/// this panel reads (`id`, `statement`) is documented as single-line in
/// `memory/L1_atomic/SCHEMA.md`, so this deliberately doesn't handle
/// multi-line YAML scalars.
fn parse_frontmatter_field(content: &str, key: &str) -> Option<String> {
    let mut in_frontmatter = false;
    let prefix = format!("{key}:");
    for line in content.lines() {
        if line.trim() == "---" {
            if in_frontmatter {
                break;
            }
            in_frontmatter = true;
            continue;
        }
        if in_frontmatter {
            if let Some(rest) = line.strip_prefix(&prefix) {
                return Some(rest.trim().to_string());
            }
        }
    }
    None
}
