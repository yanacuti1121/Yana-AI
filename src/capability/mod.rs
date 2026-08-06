//! Provider-agnostic, read-only local capabilities for Program J.

use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

const MAX_TREE_ENTRIES: usize = 500;
const MAX_READ_BYTES: u64 = 256 * 1024;
const MAX_SEARCH_RESULTS: usize = 200;
const MAX_SEARCH_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_DIFF_BYTES: usize = 64 * 1024;

#[derive(Serialize)]
struct Envelope<T: Serialize> {
    capability: &'static str,
    data: T,
    truncated: bool,
}

fn encode<T: Serialize>(
    capability: &'static str,
    data: T,
    truncated: bool,
) -> Result<String, String> {
    serde_json::to_string(&Envelope {
        capability,
        data,
        truncated,
    })
    .map_err(|e| format!("serialize observation: {e}"))
}

pub fn resolve_existing(root: &Path, requested: &str) -> Result<PathBuf, String> {
    let root = root
        .canonicalize()
        .map_err(|e| format!("resolve repo root: {e}"))?;
    let path = root
        .join(requested)
        .canonicalize()
        .map_err(|e| format!("resolve '{requested}': {e}"))?;
    if !path.starts_with(&root) {
        return Err(format!(
            "path escapes repository root (Gate L5): {requested}"
        ));
    }
    Ok(path)
}

#[derive(Serialize)]
struct TreeEntry {
    path: String,
    kind: &'static str,
    size_bytes: Option<u64>,
}

pub fn repo_tree(root: &Path, requested: &str, depth: usize) -> Result<String, String> {
    let base = resolve_existing(root, requested)?;
    if !base.is_dir() {
        return Err(format!("not a directory: {requested}"));
    }
    let mut entries = Vec::new();
    let truncated = walk(root, &base, 0, depth.min(5), &mut entries)?;
    encode(
        "repo.tree",
        serde_json::json!({"path": requested, "depth": depth.min(5), "entries": entries}),
        truncated,
    )
}

fn walk(
    root: &Path,
    current: &Path,
    level: usize,
    max_depth: usize,
    out: &mut Vec<TreeEntry>,
) -> Result<bool, String> {
    let mut children = fs::read_dir(current)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    children.sort_by_key(|e| e.file_name());
    for child in children {
        if out.len() >= MAX_TREE_ENTRIES {
            return Ok(true);
        }
        let name = child.file_name();
        if matches!(
            name.to_str(),
            Some(".git" | "target" | "node_modules" | ".venv" | "__pycache__")
        ) {
            continue;
        }
        let path = child.path();
        let meta = child.metadata().map_err(|e| e.to_string())?;
        out.push(TreeEntry {
            path: path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .into_owned(),
            kind: if meta.is_dir() { "directory" } else { "file" },
            size_bytes: meta.is_file().then_some(meta.len()),
        });
        if meta.is_dir() && level < max_depth && walk(root, &path, level + 1, max_depth, out)? {
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn read_file(root: &Path, requested: &str) -> Result<String, String> {
    let path = resolve_existing(root, requested)?;
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err(format!("not a file: {requested}"));
    }
    if meta.len() > MAX_READ_BYTES {
        return Err(format!("file too large: {} bytes", meta.len()));
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("read UTF-8 file: {e}"))?;
    encode(
        "repo.read",
        serde_json::json!({"path": requested, "size_bytes": meta.len(), "content": content}),
        false,
    )
}

pub fn search_code(root: &Path, requested: &str, query: &str) -> Result<String, String> {
    if query.trim().is_empty() {
        return Err("query must not be empty".into());
    }
    let base = resolve_existing(root, requested)?;
    let mut stack = vec![base];
    let mut matches = Vec::new();
    let needle = query.to_lowercase();
    let mut truncated = false;
    while let Some(path) = stack.pop() {
        if matches.len() >= MAX_SEARCH_RESULTS {
            truncated = true;
            break;
        }
        let meta = match fs::symlink_metadata(&path) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            if matches!(
                path.file_name().and_then(|s| s.to_str()),
                Some(".git" | "target" | "node_modules" | ".venv" | "__pycache__")
            ) {
                continue;
            }
            if let Ok(rd) = fs::read_dir(&path) {
                stack.extend(rd.filter_map(Result::ok).map(|e| e.path()));
            }
            continue;
        }
        if !meta.is_file() || meta.len() > MAX_SEARCH_FILE_BYTES {
            continue;
        }
        let text = match fs::read_to_string(&path) {
            Ok(v) => v,
            Err(_) => continue,
        };
        for (idx, line) in text.lines().enumerate() {
            if line.to_lowercase().contains(&needle) {
                matches.push(serde_json::json!({"path": path.strip_prefix(root).unwrap_or(&path), "line": idx + 1, "text": line.chars().take(500).collect::<String>()}));
                if matches.len() >= MAX_SEARCH_RESULTS {
                    truncated = true;
                    break;
                }
            }
        }
    }
    encode(
        "repo.search",
        serde_json::json!({"path": requested, "query": query, "matches": matches}),
        truncated,
    )
}

fn run(program: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("start {program}: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    String::from_utf8(output.stdout).map_err(|e| format!("non-UTF-8 output: {e}"))
}

pub fn git_status(root: &Path) -> Result<String, String> {
    let root = root.to_string_lossy();
    encode(
        "git.status",
        serde_json::json!({"output": run("git", &["-C", &root, "status", "--porcelain=v2", "--branch"])?}),
        false,
    )
}

pub fn git_diff(root: &Path, staged: bool) -> Result<String, String> {
    let root = root.to_string_lossy();
    let mut text = if staged {
        run("git", &["-C", &root, "diff", "--no-ext-diff", "--cached"])?
    } else {
        run("git", &["-C", &root, "diff", "--no-ext-diff"])?
    };
    let truncated = text.len() > MAX_DIFF_BYTES;
    if truncated {
        let mut end = MAX_DIFF_BYTES;
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        text.truncate(end);
    }
    encode(
        "git.diff",
        serde_json::json!({"staged": staged, "output": text}),
        truncated,
    )
}

pub fn host_summary(root: &Path) -> Result<String, String> {
    let uptime = run("uptime", &[]).ok().map(|s| s.trim().to_owned());
    let disk = run("df", &["-k", &root.to_string_lossy()]).ok();
    let memory = if cfg!(target_os = "macos") {
        serde_json::json!({"total_bytes": run("sysctl", &["-n", "hw.memsize"]).ok().map(|s| s.trim().to_owned()), "vm_stat": run("vm_stat", &[]).ok()})
    } else if cfg!(target_os = "linux") {
        serde_json::json!({"proc_meminfo": fs::read_to_string("/proc/meminfo").ok()})
    } else {
        serde_json::json!({"available": false})
    };
    encode(
        "host.summary",
        serde_json::json!({"os": std::env::consts::OS, "arch": std::env::consts::ARCH, "cpu_parallelism": std::thread::available_parallelism().ok().map(|n| n.get()), "uptime": uptime, "memory": memory, "disk": disk}),
        false,
    )
}

pub fn list_processes(sort: &str, limit: usize) -> Result<String, String> {
    if !cfg!(unix) {
        return Err("process listing supports macOS/Linux only".into());
    }
    let key = match sort {
        "cpu" => "-pcpu",
        "memory" => "-pmem",
        _ => return Err("sort must be cpu or memory".into()),
    };
    let text = run("ps", &["-axo", "pid=,ppid=,pcpu=,pmem=,etime=,comm=", key])?;
    let all = text.lines().map(str::to_owned).collect::<Vec<_>>();
    let limit = limit.clamp(1, 100);
    let truncated = all.len() > limit;
    encode(
        "process.list",
        serde_json::json!({"sort": sort, "rows": all.into_iter().take(limit).collect::<Vec<_>>()}),
        truncated,
    )
}

pub fn process_details(pid: u32) -> Result<String, String> {
    if pid == 0 {
        return Err("pid must be greater than zero".into());
    }
    let output = run(
        "ps",
        &[
            "-p",
            &pid.to_string(),
            "-o",
            "pid=,ppid=,user=,pcpu=,pmem=,etime=,command=",
        ],
    )?;
    if output.trim().is_empty() {
        return Err(format!("process not found: {pid}"));
    }
    encode(
        "process.inspect",
        serde_json::json!({"pid": pid, "output": output.trim()}),
        false,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn denies_path_escape() {
        let root = std::env::temp_dir().join(format!("yana-cap-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let outside = root
            .parent()
            .unwrap()
            .join(format!("outside-{}", uuid::Uuid::new_v4()));
        fs::write(&outside, "secret").unwrap();
        let req = format!("../{}", outside.file_name().unwrap().to_string_lossy());
        assert!(resolve_existing(&root, &req).is_err());
        fs::remove_file(outside).ok();
        fs::remove_dir_all(root).ok();
    }
    #[test]
    fn tree_and_search_work() {
        let root = std::env::temp_dir().join(format!("yana-cap-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src/lib.rs"), "const TOKEN_BUDGET: usize = 1;").unwrap();
        assert!(repo_tree(&root, ".", 2).unwrap().contains("src/lib.rs"));
        assert!(search_code(&root, ".", "token_budget")
            .unwrap()
            .contains("TOKEN_BUDGET"));
        fs::remove_dir_all(root).ok();
    }
}
