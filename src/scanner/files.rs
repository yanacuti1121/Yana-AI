use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use glob::glob;

pub fn resolve_files(target: &str, patterns: &[String], excludes: &[String]) -> Vec<PathBuf> {
    let mut matched: HashSet<PathBuf> = HashSet::new();
    for pattern in patterns {
        let full = format!("{target}/{pattern}");
        if let Ok(paths) = glob(&full) {
            for p in paths.flatten() {
                if p.is_file() {
                    if let Ok(canon) = p.canonicalize() { matched.insert(canon); }
                    else { matched.insert(p); }
                }
            }
        }
    }
    let mut excluded: HashSet<PathBuf> = HashSet::new();
    for pattern in excludes {
        let full = format!("{target}/{pattern}");
        if let Ok(paths) = glob(&full) {
            for p in paths.flatten() {
                if let Ok(canon) = p.canonicalize() { excluded.insert(canon); }
                else { excluded.insert(p); }
            }
        }
    }
    let mut result: Vec<PathBuf> = matched.difference(&excluded).cloned().collect();
    result.sort();
    result
}

pub fn read_file_safe(path: &Path) -> Option<String> {
    match fs::read(path) {
        Ok(bytes) => Some(String::from_utf8_lossy(&bytes).into_owned()),
        Err(_)    => None,
    }
}

pub fn load_yamtamignore(target: &str) -> Vec<String> {
    let ignore_path = Path::new(target).join(".yamtamignore");
    if !ignore_path.is_file() { return vec![]; }
    fs::read_to_string(&ignore_path).unwrap_or_default()
        .lines()
        .map(|l| l.split('#').next().unwrap_or("").trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

pub fn is_ignored(rel_path: &str, patterns: &[String]) -> bool {
    if patterns.is_empty() { return false; }
    let rp = rel_path.replace('\\', "/");
    let base = Path::new(&rp).file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    for pat in patterns {
        let p = pat.replace('\\', "/");
        if glob_match(&rp, &p) || glob_match(&base, &p) { return true; }
        if p.ends_with('/') && rp.starts_with(&p)       { return true; }
    }
    false
}

fn glob_match(text: &str, pattern: &str) -> bool {
    // Simple glob: * = any sequence (not /), ** = any sequence including /
    let re_pat = regex::escape(pattern)
        .replace("\\*\\*", "\x00")
        .replace("\\*", "[^/]*")
        .replace('\x00', ".*");
    regex::Regex::new(&format!("^{re_pat}$")).ok()
        .map(|r| r.is_match(text))
        .unwrap_or(false)
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
            .map(|o| String::from_utf8_lossy(&o.stdout)
                .lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect())
            .unwrap_or_default()
    };
    for f in run(&["diff", "--name-only", base]) { files.insert(f); }
    for f in run(&["diff", "--name-only", "--cached"]) { files.insert(f); }
    files
}
