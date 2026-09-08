use regex::Regex;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::{DirEntry, WalkDir};

// Directories that are never audit targets — VCS internals, build output,
// installed dependencies. The per-rule `excludes` param is wired to `&[]` at
// every call site today, so without this hard skip, every recursive `**`
// pattern walks (and reads, and regex-scans) the full contents of .git/,
// target/, and node_modules/ on every single rule — the actual cause of
// multi-minute `audit .` runs on this repo (2500+ files under target/,
// 1300+ under node_modules/).
const ALWAYS_SKIP_DIRS: &[&str] = &[".git", "target", "node_modules"];

fn should_descend(entry: &DirEntry) -> bool {
    entry.depth() == 0
        || !entry.file_type().is_dir()
        || entry
            .file_name()
            .to_str()
            .is_none_or(|name| !ALWAYS_SKIP_DIRS.contains(&name))
}

fn compile_glob(pattern: &str) -> Option<Regex> {
    let normalized = pattern.replace('\\', "/");
    let chars: Vec<char> = normalized.chars().collect();
    let mut regex = String::from("^");
    let mut index = 0;

    while index < chars.len() {
        match chars[index] {
            '*' if chars.get(index + 1) == Some(&'*') => {
                index += 2;
                if chars.get(index) == Some(&'/') {
                    regex.push_str("(?:.*/)?");
                    index += 1;
                } else {
                    regex.push_str(".*");
                }
            }
            '*' => {
                regex.push_str("[^/]*");
                index += 1;
            }
            '?' => {
                regex.push_str("[^/]");
                index += 1;
            }
            character => {
                regex.push_str(&regex::escape(&character.to_string()));
                index += 1;
            }
        }
    }

    regex.push('$');
    Regex::new(&regex).ok()
}

pub struct PathMatcher {
    patterns: Vec<Regex>,
    directory_prefixes: Vec<String>,
}

impl PathMatcher {
    pub fn new(patterns: &[String]) -> Self {
        Self {
            patterns: patterns
                .iter()
                .filter_map(|pattern| compile_glob(pattern))
                .collect(),
            directory_prefixes: patterns
                .iter()
                .map(|pattern| pattern.replace('\\', "/"))
                .filter(|pattern| pattern.ends_with('/'))
                .collect(),
        }
    }

    pub fn matches(&self, path: &str) -> bool {
        let normalized = path.replace('\\', "/");
        self.patterns
            .iter()
            .any(|pattern| pattern.is_match(&normalized))
    }

    pub fn matches_path_or_basename(&self, path: &str) -> bool {
        let normalized = path.replace('\\', "/");
        let basename = Path::new(&normalized)
            .file_name()
            .map(|name| name.to_string_lossy())
            .unwrap_or_default();
        self.directory_prefixes
            .iter()
            .any(|prefix| normalized.starts_with(prefix))
            || self
                .patterns
                .iter()
                .any(|pattern| pattern.is_match(&normalized) || pattern.is_match(basename.as_ref()))
    }
}

pub struct FileInventory {
    files: Vec<(PathBuf, String)>,
}

impl FileInventory {
    pub fn new(target: &str) -> Self {
        let root = fs::canonicalize(target).unwrap_or_else(|_| PathBuf::from(target));
        let mut files = WalkDir::new(&root)
            .follow_links(false)
            .into_iter()
            .filter_entry(should_descend)
            .filter_map(Result::ok)
            .filter(|entry| {
                entry.file_type().is_file()
                    || (entry.file_type().is_symlink() && entry.path().is_file())
            })
            .filter_map(|entry| {
                let path = entry.into_path();
                let relative = path
                    .strip_prefix(&root)
                    .ok()?
                    .to_string_lossy()
                    .replace('\\', "/");
                Some((path, relative))
            })
            .collect::<Vec<_>>();
        files.sort_by(|left, right| left.0.cmp(&right.0));
        Self { files }
    }

    pub fn resolve(&self, patterns: &[String], excludes: &[String]) -> Vec<PathBuf> {
        // Preserve the existing `glob()` traversal contract: a pattern ending
        // in `/**` yields directory entries, not files directly beneath that
        // directory. FileInventory indexes files only, so those patterns must
        // not broaden the scan during this performance-only refactor.
        let file_patterns = patterns
            .iter()
            .filter(|pattern| !pattern.replace('\\', "/").ends_with("/**"))
            .cloned()
            .collect::<Vec<_>>();
        let include = PathMatcher::new(&file_patterns);
        let exclude = PathMatcher::new(excludes);
        self.files
            .iter()
            .filter(|(_, relative)| include.matches(relative))
            .filter(|(_, relative)| excludes.is_empty() || !exclude.matches(relative))
            .map(|(path, _)| path.clone())
            .collect()
    }
}

pub fn resolve_files(target: &str, patterns: &[String], excludes: &[String]) -> Vec<PathBuf> {
    FileInventory::new(target).resolve(patterns, excludes)
}

pub fn read_file_safe(path: &Path) -> Option<String> {
    match fs::read(path) {
        Ok(bytes) => Some(String::from_utf8_lossy(&bytes).into_owned()),
        Err(_) => None,
    }
}

pub fn load_yana_aiignore(target: &str) -> Vec<String> {
    let ignore_path = Path::new(target).join(".yana-aiignore");
    if !ignore_path.is_file() {
        return vec![];
    }
    fs::read_to_string(&ignore_path)
        .unwrap_or_default()
        .lines()
        .map(|l| l.split('#').next().unwrap_or("").trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

pub fn is_ignored(rel_path: &str, patterns: &[String]) -> bool {
    PathMatcher::new(patterns).matches_path_or_basename(rel_path)
}

pub fn get_diff_files(base: &str, target: &str) -> HashSet<String> {
    use std::process::Command;
    let mut files = HashSet::new();
    let run = |args: &[&str]| -> Vec<String> {
        Command::new("git")
            .args(args)
            .current_dir(target)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .lines()
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty())
                    .collect()
            })
            .unwrap_or_default()
    };
    for f in run(&["diff", "--name-only", base]) {
        files.insert(f);
    }
    for f in run(&["diff", "--name-only", "--cached"]) {
        files.insert(f);
    }
    files
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_files_normalizes_root_once_and_applies_exclusions() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(temp.path().join("src/nested")).expect("create src");
        fs::create_dir_all(temp.path().join("target/debug")).expect("create target");
        fs::write(temp.path().join("src/keep.rs"), "keep").expect("write keep");
        fs::write(temp.path().join("src/nested/drop.rs"), "drop").expect("write drop");
        fs::write(temp.path().join("target/debug/ignored.rs"), "ignored").expect("write ignored");

        let relative_target = temp.path().join("src/..");
        let files = resolve_files(
            relative_target.to_str().expect("utf-8 path"),
            &["**/*.rs".to_string()],
            &["src/nested/*.rs".to_string()],
        );

        let canonical_root = fs::canonicalize(temp.path()).expect("canonical temp root");
        assert_eq!(files, vec![canonical_root.join("src/keep.rs")]);
        assert!(files.iter().all(|path| path.is_absolute()));
    }

    #[test]
    fn path_matcher_preserves_recursive_and_directory_ignore_semantics() {
        let recursive = PathMatcher::new(&["**/*.rs".to_string()]);
        assert!(recursive.matches("root.rs"));
        assert!(recursive.matches("src/nested.rs"));
        assert!(!recursive.matches("src/nested.py"));

        let directory = PathMatcher::new(&["generated/".to_string()]);
        assert!(directory.matches_path_or_basename("generated/output.rs"));
        assert!(!directory.matches_path_or_basename("src/generated/output.rs"));
    }

    #[test]
    fn inventory_preserves_trailing_recursive_glob_file_behavior() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(temp.path().join("scripts")).expect("create scripts");
        fs::write(temp.path().join("scripts/task.py"), "print('task')").expect("write task");

        let inventory = FileInventory::new(temp.path().to_str().expect("utf-8 path"));
        assert!(inventory
            .resolve(&["**/scripts/**".to_string()], &[])
            .is_empty());
    }
}
