//! Provider-agnostic local capabilities for Program J.

use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Output},
};

const MAX_TREE_ENTRIES: usize = 500;
const MAX_READ_BYTES: u64 = 256 * 1024;
const MAX_SEARCH_RESULTS: usize = 200;
const MAX_SEARCH_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_DIFF_BYTES: usize = 64 * 1024;
const MAX_COMMAND_OUTPUT_BYTES: usize = 32 * 1024;

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

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct FileReadObservation {
    pub path: String,
    pub size_bytes: u64,
    pub content: String,
}

pub fn read_file_observation(root: &Path, requested: &str) -> Result<FileReadObservation, String> {
    let path = resolve_existing(root, requested)?;
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err(format!("not a file: {requested}"));
    }
    if meta.len() > MAX_READ_BYTES {
        return Err(format!("file too large: {} bytes", meta.len()));
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("read UTF-8 file: {e}"))?;
    Ok(FileReadObservation {
        path: requested.to_string(),
        size_bytes: meta.len(),
        content,
    })
}

pub fn read_file(root: &Path, requested: &str) -> Result<String, String> {
    let observation = read_file_observation(root, requested)?;
    encode("repo.read", observation, false)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedCommand {
    pub argv: Vec<String>,
    pub guard_verdict: Option<&'static str>,
}

pub fn validate_command(command: &str) -> Result<ValidatedCommand, String> {
    let argv = shell_words::split(command).map_err(|e| format!("cannot parse command: {e}"))?;
    if argv.is_empty() {
        return Err("empty command".to_string());
    }
    Ok(ValidatedCommand {
        argv,
        guard_verdict: crate::guard::check_command(command),
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandOutcome {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub truncated: bool,
}

pub fn execute_command(
    root: &Path,
    argv: &[String],
    use_sandbox: bool,
) -> Result<CommandOutcome, String> {
    if argv.is_empty() {
        return Err("empty command".to_string());
    }
    let root = root
        .canonicalize()
        .map_err(|error| format!("resolve command root: {error}"))?;
    if !root.is_dir() {
        return Err(format!(
            "command root is not a directory: {}",
            root.display()
        ));
    }
    let mut command = if use_sandbox {
        let mut command = Command::new("bash");
        command
            .arg(root.join("core/scripts/sandbox-exec.sh"))
            .args(argv);
        command
    } else {
        let mut command = Command::new(&argv[0]);
        command.args(&argv[1..]);
        command
    };
    let output = command
        .current_dir(root)
        .output()
        .map_err(|error| format!("failed to spawn: {error}"))?;
    Ok(cap_command_output(output))
}

fn cap_command_output(output: Output) -> CommandOutcome {
    let (stdout, stdout_truncated) = cap_command_bytes(&output.stdout);
    let (stderr, stderr_truncated) = cap_command_bytes(&output.stderr);
    CommandOutcome {
        stdout,
        stderr,
        exit_code: output.status.code(),
        truncated: stdout_truncated || stderr_truncated,
    }
}

fn cap_command_bytes(bytes: &[u8]) -> (String, bool) {
    if bytes.len() > MAX_COMMAND_OUTPUT_BYTES {
        (
            String::from_utf8_lossy(&bytes[..MAX_COMMAND_OUTPUT_BYTES]).to_string(),
            true,
        )
    } else {
        (String::from_utf8_lossy(bytes).to_string(), false)
    }
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

    fn tmp_repo(tag: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("yana-capability-{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn denies_path_escape() {
        let root = tmp_repo("escape");
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
        let root = tmp_repo("tree");
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src/lib.rs"), "const TOKEN_BUDGET: usize = 1;").unwrap();
        assert!(repo_tree(&root, ".", 2).unwrap().contains("src/lib.rs"));
        assert!(search_code(&root, ".", "token_budget")
            .unwrap()
            .contains("TOKEN_BUDGET"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn read_observation_and_mcp_envelope_share_one_implementation() {
        let root = tmp_repo("read");
        fs::write(root.join("a.txt"), "hello").unwrap();
        let observation = read_file_observation(&root, "a.txt").unwrap();
        assert_eq!(observation.path, "a.txt");
        assert_eq!(observation.size_bytes, 5);
        assert_eq!(observation.content, "hello");

        let envelope: serde_json::Value =
            serde_json::from_str(&read_file(&root, "a.txt").unwrap()).unwrap();
        assert_eq!(envelope["capability"], "repo.read");
        assert_eq!(envelope["data"]["path"], "a.txt");
        assert_eq!(envelope["data"]["size_bytes"], 5);
        assert_eq!(envelope["data"]["content"], "hello");
        assert_eq!(envelope["truncated"], false);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn read_rejects_dotdot_escape() {
        let root = tmp_repo("read-dotdot");
        let outside = root
            .parent()
            .unwrap()
            .join(format!("outside-{}.txt", uuid::Uuid::new_v4()));
        fs::write(&outside, "secret").unwrap();
        let requested = format!("../{}", outside.file_name().unwrap().to_string_lossy());
        assert!(read_file_observation(&root, &requested)
            .unwrap_err()
            .contains("escapes repository root"));
        fs::remove_file(outside).ok();
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn read_rejects_oversized_file() {
        let root = tmp_repo("read-errors");
        fs::write(
            root.join("big.txt"),
            vec![b'x'; (MAX_READ_BYTES + 1) as usize],
        )
        .unwrap();
        assert!(read_file_observation(&root, "big.txt")
            .unwrap_err()
            .contains("too large"));
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn read_missing_file_is_a_clean_error() {
        let root = tmp_repo("read-missing");
        assert!(read_file_observation(&root, "missing.txt").is_err());
        fs::remove_dir_all(root).ok();
    }

    #[cfg(unix)]
    #[test]
    fn read_rejects_symlink_escape() {
        let root = tmp_repo("symlink");
        let outside = root
            .parent()
            .unwrap()
            .join(format!("outside-{}.txt", uuid::Uuid::new_v4()));
        fs::write(&outside, "secret").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("escape.txt")).unwrap();
        assert!(read_file_observation(&root, "escape.txt").is_err());
        fs::remove_file(outside).ok();
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn command_validation_allows_benign_command() {
        let benign = validate_command("git status --short").unwrap();
        assert_eq!(benign.argv, ["git", "status", "--short"]);
        assert!(benign.guard_verdict.is_none());
    }

    #[test]
    fn command_validation_denies_rm_rf() {
        assert!(validate_command("rm -rf /tmp/x")
            .unwrap()
            .guard_verdict
            .is_some());
    }

    #[test]
    fn command_validation_denies_force_push() {
        assert!(validate_command("git push --force origin main")
            .unwrap()
            .guard_verdict
            .is_some());
    }

    #[test]
    fn command_validation_denies_inline_python_bypass() {
        assert!(
            validate_command("python3 -c \"import os; os.system('rm -rf /')\"")
                .unwrap()
                .guard_verdict
                .is_some()
        );
    }

    #[test]
    fn command_validation_rejects_empty_command() {
        assert!(validate_command("").is_err());
    }

    #[test]
    fn command_validation_rejects_unbalanced_quotes() {
        assert!(validate_command("echo \"unterminated").is_err());
    }

    #[test]
    fn command_execution_runs_direct_argv() {
        let root = tmp_repo("command-direct");
        let argv = ["echo".into(), "hello".into()];
        let outcome = execute_command(&root, &argv, false).unwrap();
        assert_eq!(outcome.stdout.trim(), "hello");
        assert_eq!(outcome.exit_code, Some(0));
        assert!(!outcome.truncated);
        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn command_execution_is_rooted_in_the_repository() {
        let root = tmp_repo("command");
        let init = Command::new("git")
            .args(["init", "-q"])
            .current_dir(&root)
            .status()
            .unwrap();
        assert!(init.success());

        let argv = ["git".into(), "rev-parse".into(), "--show-toplevel".into()];
        let outcome = execute_command(&root, &argv, false).unwrap();
        assert_eq!(outcome.exit_code, Some(0));
        assert_eq!(
            PathBuf::from(outcome.stdout.trim()).canonicalize().unwrap(),
            root.canonicalize().unwrap()
        );
        assert!(!outcome.truncated);

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn command_execution_captures_nonzero_exit_code() {
        let root = tmp_repo("command-nonzero");
        let init = Command::new("git")
            .args(["init", "-q"])
            .current_dir(&root)
            .status()
            .unwrap();
        assert!(init.success());
        let failing = [
            "git".into(),
            "cat-file".into(),
            "-e".into(),
            "refs/heads/definitely-missing".into(),
        ];
        let outcome = execute_command(&root, &failing, false).unwrap();
        assert_ne!(outcome.exit_code, Some(0));
        fs::remove_dir_all(root).ok();
    }
}
