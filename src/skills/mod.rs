//! Skills: folders that hold a `SKILL.md`, in the format Claude Code and Codex use, so a skill written for either
//! works here. A skill is a user-added instruction for the model, which makes its text an untrusted input. This module
//! therefore only finds and reads skills inside two folders, never follows a symbolic link, and caps how much it reads.
//! Deciding whether a skill's text is shown to a model, and wrapping it as untrusted data, is the caller's job.

pub mod cli;
mod frontmatter;

use anyhow::{bail, Context, Result};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Most skill folders read from one root. A larger folder is cut and reported.
pub const MAX_SKILLS_PER_ROOT: usize = 500;
/// Largest `SKILL.md` accepted, in bytes.
pub const MAX_SKILL_FILE_BYTES: u64 = 256 * 1024;
/// Longest description kept, in characters. The index of all skills must stay small enough for a system prompt.
pub const MAX_DESCRIPTION_CHARS: usize = 1024;
const MAX_NAME_CHARS: usize = 64;
const MAX_FRONTMATTER_BYTES: usize = 8 * 1024;
const FRONTMATTER_FENCE: &str = "---";
const SKILL_FILE: &str = "SKILL.md";
const PROJECT_SKILLS_DIR: &str = ".yana-ai/skills";
const USER_SKILLS_DIR: &str = "skills";

/// Where a skill comes from. A user skill wins over a project skill with the same name, so a repository the user opened
/// cannot take over a command the user wrote for themselves.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    Project,
    User,
}

impl Scope {
    pub fn word(self) -> &'static str {
        match self {
            Scope::Project => "project",
            Scope::User => "user",
        }
    }
}

#[derive(Clone, Debug)]
pub struct Root {
    pub scope: Scope,
    pub dir: PathBuf,
}

#[derive(Serialize, Clone, Debug)]
pub struct Skill {
    pub name: String,
    pub description: String,
    pub scope: Scope,
    pub user_invocable: bool,
    pub allowed_tools: Vec<String>,
    /// The `SKILL.md` file.
    pub path: PathBuf,
}

/// Something found in a skills folder that was not loaded, with the reason, so it can be shown and fixed.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Problem {
    pub dir: String,
    pub reason: String,
}

#[derive(Debug, Default)]
pub struct Discovery {
    pub skills: Vec<Skill>,
    pub problems: Vec<Problem>,
}

/// The folders skills are read from, in order of precedence: `<yana home>/skills` first, then the project's `.yana-ai/skills`.
pub fn roots(project: Option<&Path>, yana_home: Option<&Path>) -> Vec<Root> {
    let mut found = Vec::new();
    if let Some(home) = yana_home {
        found.push(Root { scope: Scope::User, dir: home.join(USER_SKILLS_DIR) });
    }
    if let Some(project) = project {
        found.push(Root { scope: Scope::Project, dir: project.join(PROJECT_SKILLS_DIR) });
    }
    found
}

pub fn discover(roots: &[Root]) -> Discovery {
    discover_with_limit(roots, MAX_SKILLS_PER_ROOT)
}

pub fn discover_with_limit(roots: &[Root], limit: usize) -> Discovery {
    let mut found = Discovery::default();
    let mut first_scope_of: HashMap<String, Scope> = HashMap::new();
    for root in roots {
        for entry in candidate_folders(root, limit, &mut found.problems) {
            match load_skill(&entry, root.scope) {
                Ok(skill) => match first_scope_of.get(&skill.name) {
                    Some(earlier) => found.problems.push(Problem {
                        dir: entry.display().to_string(),
                        reason: format!("'{}' is shadowed by the {} skill of the same name", skill.name, earlier.word()),
                    }),
                    None => {
                        first_scope_of.insert(skill.name.clone(), root.scope);
                        found.skills.push(skill);
                    }
                },
                Err(reason) => found.problems.push(Problem { dir: entry.display().to_string(), reason }),
            }
        }
    }
    found.skills.sort_by(|a, b| a.name.cmp(&b.name));
    found
}

/// The subfolders of `root` worth trying, in name order, at most `limit`. A missing root is normal and not reported.
fn candidate_folders(root: &Root, limit: usize, problems: &mut Vec<Problem>) -> Vec<PathBuf> {
    let Ok(read) = fs::read_dir(&root.dir) else { return Vec::new() };
    let mut names: Vec<PathBuf> = read.filter_map(|entry| entry.ok().map(|e| e.path())).collect();
    names.sort();
    let mut folders = Vec::new();
    for path in names {
        let Some(name) = path.file_name().and_then(|n| n.to_str()).map(str::to_string) else { continue };
        let Ok(meta) = fs::symlink_metadata(&path) else { continue };
        if name.starts_with('.') || (!meta.is_dir() && !meta.file_type().is_symlink()) {
            continue;
        }
        if meta.file_type().is_symlink() {
            problems.push(Problem { dir: path.display().to_string(), reason: "is a symbolic link; not followed".into() });
            continue;
        }
        if folders.len() >= limit {
            problems.push(Problem { dir: root.dir.display().to_string(), reason: format!("more than {limit} skill folders; the rest were not read") });
            break;
        }
        folders.push(path);
    }
    folders
}

fn valid_name(name: &str) -> bool {
    let mut chars = name.chars();
    let starts_well = chars.next().is_some_and(|c| c.is_ascii_alphanumeric());
    starts_well && name.chars().count() <= MAX_NAME_CHARS && !name.contains("..") && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// Control characters become spaces and runs of whitespace one space, so a description is one clean line.
fn clean(text: &str, max_chars: usize) -> String {
    let spaced: String = text.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    spaced.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(max_chars).collect()
}

/// `(frontmatter, body)` of a file that starts with a `---` block.
fn split_frontmatter(text: &str) -> Option<(&str, &str)> {
    let rest = text.strip_prefix(FRONTMATTER_FENCE)?.strip_prefix('\n').or_else(|| text.strip_prefix("---\r\n"))?;
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        if line.trim_end() == FRONTMATTER_FENCE {
            let front = &rest[..offset];
            return (front.len() <= MAX_FRONTMATTER_BYTES).then_some((front, &rest[offset + line.len()..]));
        }
        offset += line.len();
    }
    None
}

fn check_file(path: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path).map_err(|_| format!("has no {SKILL_FILE}"))?;
    if meta.file_type().is_symlink() {
        return Err(format!("{SKILL_FILE} is a symbolic link; not followed"));
    }
    if !meta.is_file() {
        return Err(format!("{SKILL_FILE} is not a regular file"));
    }
    if meta.len() > MAX_SKILL_FILE_BYTES {
        return Err(format!("{SKILL_FILE} is too large ({} bytes, limit {MAX_SKILL_FILE_BYTES})", meta.len()));
    }
    Ok(())
}

fn load_skill(folder: &Path, scope: Scope) -> Result<Skill, String> {
    let folder_name = folder.file_name().and_then(|n| n.to_str()).unwrap_or_default();
    if !valid_name(folder_name) {
        return Err("the folder name is not a valid skill name".into());
    }
    let path = folder.join(SKILL_FILE);
    check_file(&path)?;
    let text = fs::read_to_string(&path).map_err(|_| format!("{SKILL_FILE} is not valid UTF-8 text"))?;
    let (front, _) = split_frontmatter(&text).ok_or_else(|| "no frontmatter: the file must start with a --- block".to_string())?;
    let meta = frontmatter::parse(front).map_err(|why| format!("the frontmatter is not valid: {why}"))?;
    if meta.name != folder_name {
        return Err(format!("name '{}' does not match the folder name '{folder_name}'", clean(&meta.name, MAX_NAME_CHARS)));
    }
    let description = clean(&meta.description, MAX_DESCRIPTION_CHARS);
    if description.is_empty() {
        return Err("the description is missing".into());
    }
    Ok(Skill {
        name: meta.name,
        description,
        scope,
        user_invocable: meta.user_invocable.unwrap_or(true),
        allowed_tools: meta.allowed_tools.iter().map(|tool| clean(tool, MAX_NAME_CHARS)).filter(|tool| !tool.is_empty()).collect(),
        path,
    })
}

/// The instructions of a skill, without its frontmatter. Checked again here, not trusted from discovery: the file may
/// have been replaced by a symbolic link since.
pub fn read_body(skill: &Skill) -> Result<String> {
    check_file(&skill.path).map_err(|reason| anyhow::anyhow!("{}: {reason}", skill.path.display()))?;
    let text = fs::read_to_string(&skill.path).with_context(|| format!("cannot read {}", skill.path.display()))?;
    match split_frontmatter(&text) {
        Some((_, body)) => Ok(body.to_string()),
        None => bail!("{} no longer starts with a frontmatter block", skill.path.display()),
    }
}

#[cfg(test)]
mod tests;
