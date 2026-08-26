mod dispatch_check;

use clap::Subcommand;
use regex::Regex;
use std::path::Path;

#[derive(Subcommand, Debug)]
pub enum DoctorAction {
    /// Run all health checks
    Run {
        #[arg(default_value = ".")]
        target: String,
        #[arg(long)]
        json: bool,
    },
    /// Cross-check src/main.rs's Commands enum against bin/yana's dispatch
    /// table — catches commands that look ported but aren't wired up
    Dispatch {
        #[arg(default_value = ".")]
        target: String,
        #[arg(long)]
        json: bool,
    },
}

pub fn dispatch(action: DoctorAction) {
    match action {
        DoctorAction::Run { target, json } => {
            let code = cmd_doctor(&target, json);
            if code != 0 {
                std::process::exit(code);
            }
        }
        DoctorAction::Dispatch { target, json } => {
            dispatch_check::cmd_doctor_dispatch(&target, json)
        }
    }
}

struct Check {
    label: &'static str,
    status: Status,
    detail: String,
    fix: String,
}

enum Status {
    Pass,
    Warn,
    Fail,
    Info,
}

impl Check {
    fn pass(label: &'static str, detail: impl Into<String>) -> Self {
        Self {
            label,
            status: Status::Pass,
            detail: detail.into(),
            fix: String::new(),
        }
    }
    fn warn(label: &'static str, detail: impl Into<String>, fix: impl Into<String>) -> Self {
        Self {
            label,
            status: Status::Warn,
            detail: detail.into(),
            fix: fix.into(),
        }
    }
    fn fail(label: &'static str, detail: impl Into<String>, fix: impl Into<String>) -> Self {
        Self {
            label,
            status: Status::Fail,
            detail: detail.into(),
            fix: fix.into(),
        }
    }
    fn info(label: &'static str, detail: impl Into<String>) -> Self {
        Self {
            label,
            status: Status::Info,
            detail: detail.into(),
            fix: String::new(),
        }
    }
    fn icon(&self) -> &str {
        match self.status {
            Status::Pass => "✓",
            Status::Warn => "⚠",
            Status::Fail => "✗",
            Status::Info => "·",
        }
    }
    fn color_code(&self) -> &str {
        match self.status {
            Status::Pass => "\x1b[32m",
            Status::Warn => "\x1b[33m",
            Status::Fail => "\x1b[31m",
            Status::Info => "\x1b[2m",
        }
    }

    fn status_name(&self) -> &'static str {
        match self.status {
            Status::Pass => "OK",
            Status::Warn => "WARN",
            Status::Fail => "FAIL",
            Status::Info => "INFO",
        }
    }
}

fn cmd_doctor(target: &str, as_json: bool) -> i32 {
    let checks = vec![
        check_python(),
        check_git_installed(),
        check_git_repo(target),
        check_git_clean(target),
        check_git_branch(target),
        check_gitignore(target),
        check_claude_settings(target),
        check_mcp_config(target),
        check_env_secrets(target),
        check_github_token(),
        check_anthropic_key(),
        check_node(),
        check_ci_env(),
        check_yana_ai_scanners(target),
        check_yana_ai_version(),
        check_yana_ai_hooks_wired(target),
    ];

    let fails = checks
        .iter()
        .filter(|check| matches!(check.status, Status::Fail))
        .count();
    let warns = checks
        .iter()
        .filter(|check| matches!(check.status, Status::Warn))
        .count();
    let info = checks
        .iter()
        .filter(|check| matches!(check.status, Status::Info))
        .count();
    let passes = checks.len() - fails - warns - info;

    if as_json {
        let out: Vec<_> = checks
            .iter()
            .map(|c| {
                serde_json::json!({
                    "label": c.label,
                    "status": c.status_name(),
                    "detail": c.detail,
                    "fix": c.fix,
                })
            })
            .collect();
        let absolute_target =
            std::fs::canonicalize(target).unwrap_or_else(|_| Path::new(target).to_path_buf());
        let report = serde_json::json!({
            "target": absolute_target,
            "healthy": fails == 0,
            "counts": {"OK": passes, "WARN": warns, "FAIL": fails, "INFO": info},
            "checks": out,
        });
        println!("{}", serde_json::to_string_pretty(&report).unwrap());
        return if fails > 0 {
            2
        } else if warns > 0 {
            1
        } else {
            0
        };
    }

    println!("\n  yana-ai doctor\n");
    for c in &checks {
        println!(
            "  {}{}  {}\x1b[0m  {}",
            c.color_code(),
            c.icon(),
            c.label,
            c.detail
        );
        if !c.fix.is_empty() {
            println!("        → {}", c.fix);
        }
    }
    println!();
    if fails > 0 {
        println!(
            "  \x1b[31m{} check(s) failed\x1b[0m, {} warning(s)\n",
            fails, warns
        );
    } else if warns > 0 {
        println!(
            "  \x1b[33mAll checks pass with {} warning(s)\x1b[0m\n",
            warns
        );
    } else {
        println!("  \x1b[32mAll checks passed\x1b[0m\n");
    }
    if fails > 0 {
        2
    } else if warns > 0 {
        1
    } else {
        0
    }
}

fn check_git_installed() -> Check {
    match std::process::Command::new("git").arg("--version").output() {
        Ok(o) if o.status.success() => Check::pass("git", "available"),
        _ => Check::fail("git", "not found", "Install git: https://git-scm.com"),
    }
}

fn check_git_repo(target: &str) -> Check {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(target)
        .output();
    if output.is_ok_and(|output| output.status.success()) {
        Check::pass("git repo", "valid git repository")
    } else {
        Check::warn(
            "git repo",
            "target is not a git repository",
            "Run: git init",
        )
    }
}

fn check_git_clean(target: &str) -> Check {
    let out = std::process::Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(target)
        .output();
    match out {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout);
            let lines: Vec<_> = s.lines().filter(|line| !line.trim().is_empty()).collect();
            if lines.is_empty() {
                return Check::pass("working tree", "clean — no uncommitted changes");
            }
            let staged = lines
                .iter()
                .filter(|line| !line.starts_with(' ') && !line.starts_with('?'))
                .count();
            let unstaged = lines
                .iter()
                .filter(|line| {
                    line.as_bytes().get(1).is_some_and(|byte| *byte != b' ')
                        && !line.starts_with('?')
                })
                .count();
            let untracked = lines.iter().filter(|line| line.starts_with("??")).count();
            let mut parts = Vec::new();
            if staged > 0 {
                parts.push(format!("{staged} staged"));
            }
            if unstaged > 0 {
                parts.push(format!("{unstaged} unstaged"));
            }
            if untracked > 0 {
                parts.push(format!("{untracked} untracked"));
            }
            Check::warn(
                "working tree",
                format!("{} changed files ({})", lines.len(), parts.join(", ")),
                "Commit or stash before starting an agent session to avoid unintended changes.",
            )
        }
        Err(_) => Check::info("working tree", "git unavailable"),
    }
}

fn check_git_branch(target: &str) -> Check {
    let output = std::process::Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(target)
        .output();
    let Ok(output) = output else {
        return Check::info("git branch", "unavailable");
    };
    let branch = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    if branch.is_empty() {
        Check::info("git branch", "detached HEAD state")
    } else if matches!(branch.as_str(), "main" | "master" | "develop" | "dev") {
        Check::warn(
            "git branch",
            format!("on '{branch}' — agent changes will land directly on the default branch"),
            "Create a feature branch before starting an agent session",
        )
    } else {
        Check::pass("git branch", format!("on '{branch}'"))
    }
}

fn check_gitignore(target: &str) -> Check {
    let path = Path::new(target).join(".gitignore");
    if !path.exists() {
        return Check::warn(
            ".gitignore",
            "not found — .env files may be committed accidentally",
            "Create .gitignore and add: .env, .env.*, *.env, *.pem, *.key",
        );
    }
    let content = std::fs::read_to_string(&path).unwrap_or_default();
    let missing: Vec<_> = [".env", "*.pem", "*.key", "credentials.json", "token.json"]
        .into_iter()
        .filter(|pattern| !content.contains(pattern))
        .collect();
    if missing.is_empty() {
        Check::pass(".gitignore", "covers .env, credentials, key files")
    } else {
        Check::warn(
            ".gitignore",
            format!("missing entries: {}", missing.join(", ")),
            format!("Add to .gitignore: {}", missing.join("\n")),
        )
    }
}

fn check_claude_settings(target: &str) -> Check {
    let path = Path::new(target).join(".claude/settings.json");
    if !path.exists() {
        return Check::info(
            "claude settings",
            ".claude/settings.json not found — using defaults",
        );
    }
    let data: serde_json::Value = match std::fs::read_to_string(&path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
    {
        Some(data) => data,
        None => {
            return Check::fail(
                "claude settings",
                ".claude/settings.json is invalid JSON",
                "Fix JSON syntax",
            )
        }
    };
    let permissions = data
        .get("permissions")
        .and_then(serde_json::Value::as_object);
    let allow = permissions
        .and_then(|value| value.get("allow"))
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut issues = Vec::new();
    if allow
        .iter()
        .any(|value| matches!(value.as_str(), Some("Bash(*)" | "Bash")))
    {
        issues.push("unrestricted Bash access".to_string());
    }
    if permissions
        .and_then(|value| value.get("dangerouslyAllowAll"))
        .and_then(serde_json::Value::as_bool)
        == Some(true)
    {
        issues.push("dangerouslyAllowAll: true".to_string());
    }
    if allow.len() > 15 {
        issues.push(format!("{} tools auto-approved", allow.len()));
    }
    if issues.is_empty() {
        Check::pass(
            "claude settings",
            format!("found, {} allowed tools", allow.len()),
        )
    } else {
        Check::warn(
            "claude settings",
            format!("risky config: {}", issues.join(", ")),
            "Run: yana-ai audit . --only agent-config for details",
        )
    }
}

fn check_mcp_config(target: &str) -> Check {
    let found = [".mcp.json", ".cursor/mcp.json", "mcp.json"]
        .into_iter()
        .map(|candidate| Path::new(target).join(candidate))
        .find(|path| path.exists());
    let Some(path) = found else {
        return Check::info("MCP config", "no MCP config found");
    };
    let data: serde_json::Value = match std::fs::read_to_string(&path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
    {
        Some(data) => data,
        None => {
            return Check::fail(
                "MCP config",
                "MCP config is invalid JSON",
                "Fix JSON syntax before running agent",
            )
        }
    };
    let servers = data
        .get("mcpServers")
        .and_then(serde_json::Value::as_object)
        .cloned()
        .unwrap_or_default();
    let database = Regex::new(r"(?i)(postgres|mysql|sqlite|bigquery|cloudsql|database|sql|db)")
        .expect("valid database regex");
    let mut issues = Vec::new();
    for (name, config) in &servers {
        let command = config
            .get("command")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("");
        let read_only = config.get("read_only").and_then(serde_json::Value::as_bool) == Some(true);
        if (database.is_match(name) || database.is_match(command)) && !read_only {
            issues.push(format!("'{name}' is a DB server with no read_only: true"));
        }
    }
    if servers.len() >= 4 {
        issues.push(format!(
            "{} servers active — large blast radius",
            servers.len()
        ));
    }
    let relative = path.strip_prefix(target).unwrap_or(&path).display();
    if issues.is_empty() {
        Check::pass(
            "MCP config",
            format!("{relative}: {} server(s)", servers.len()),
        )
    } else {
        Check::warn(
            "MCP config",
            format!("{relative}: {}", issues.join("; ")),
            "Run: yana-ai audit . --only mcp-config for details",
        )
    }
}

fn check_env_secrets(target: &str) -> Check {
    let out = std::process::Command::new("git")
        .args(["ls-files", "--error-unmatch", ".env"])
        .current_dir(target)
        .output();
    if out.is_ok_and(|output| output.status.success()) {
        return Check::fail(
            ".env tracking",
            ".env is tracked by git — secrets may be committed",
            "Remove: git rm --cached .env then add to .gitignore",
        );
    }
    let path = Path::new(target).join(".env");
    if !path.exists() {
        return Check::info(".env", "no .env file found");
    }
    let content = std::fs::read_to_string(path).unwrap_or_default();
    let live_key = Regex::new(
        r"sk-ant-[a-zA-Z0-9\-_]{20,}|sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|AKIA[0-9A-Z]{16}",
    )
    .expect("valid secret regex");
    if live_key.is_match(&content) {
        Check::warn(
            ".env",
            ".env contains what looks like a live API key",
            "Verify .env is in .gitignore and rotate committed keys",
        )
    } else {
        Check::pass(".env", "present, not tracked by git")
    }
}

fn check_anthropic_key() -> Check {
    if std::env::var("ANTHROPIC_API_KEY").is_ok() {
        Check::pass("Anthropic key", "set")
    } else {
        Check::info(
            "Anthropic key",
            "ANTHROPIC_API_KEY not set — LLM-assisted features unavailable",
        )
    }
}

fn check_github_token() -> Check {
    if std::env::var("GITHUB_TOKEN").is_ok() || std::env::var("GH_TOKEN").is_ok() {
        Check::pass("GitHub token", "set")
    } else {
        Check::info(
            "GitHub token",
            "GITHUB_TOKEN not set — PR scan and CI checks unavailable",
        )
    }
}

fn check_python() -> Check {
    let output = std::process::Command::new("python3")
        .arg("--version")
        .output();
    let Ok(output) = output else {
        return Check::fail(
            "python3",
            "not found — required for yana-ai audit",
            "Install python3",
        );
    };
    if !output.status.success() {
        return Check::fail(
            "python3",
            "not found — required for yana-ai audit",
            "Install python3",
        );
    }
    let version = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout).trim(),
        String::from_utf8_lossy(&output.stderr).trim()
    );
    let yaml_available = std::process::Command::new("python3")
        .args(["-c", "import yaml"])
        .output()
        .is_ok_and(|output| output.status.success());
    if yaml_available {
        Check::pass("python3", format!("{version}, PyYAML available"))
    } else {
        Check::warn(
            "python3",
            format!("{version} found but PyYAML missing"),
            "Install: pip install pyyaml",
        )
    }
}

fn check_node() -> Check {
    match std::process::Command::new("node").arg("--version").output() {
        Ok(o) if o.status.success() => Check::pass(
            "node.js",
            String::from_utf8_lossy(&o.stdout).trim().to_string(),
        ),
        _ => Check::info("node.js", "not found — JS/TS projects may need it"),
    }
}

fn check_ci_env() -> Check {
    let found: Vec<_> = ["CI", "GITHUB_ACTIONS", "GITLAB_CI", "CIRCLECI", "TRAVIS"]
        .into_iter()
        .filter(|name| std::env::var_os(name).is_some())
        .collect();
    if found.is_empty() {
        Check::pass("CI environment", "local development environment")
    } else {
        Check::info(
            "CI environment",
            format!("running in CI ({})", found.join(", ")),
        )
    }
}

fn check_yana_ai_scanners(target: &str) -> Check {
    let scanner_dir = Path::new(target).join("scanner");
    if !scanner_dir.exists() {
        return Check::warn(
            "yana-ai scanners",
            "scanner/ directory not found — audit will use built-in rules only",
            "Restore the scanner/ directory",
        );
    }
    let count = std::fs::read_dir(&scanner_dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().and_then(|value| value.to_str()) == Some("yml"))
        .count();
    if count == 0 {
        Check::warn(
            "yana-ai scanners",
            "scanner/ found but contains no .yml rule files",
            "Restore scanner rule files",
        )
    } else {
        Check::pass(
            "yana-ai scanners",
            format!("{count} rule file(s) in scanner/"),
        )
    }
}

fn check_yana_ai_version() -> Check {
    Check::pass(
        "yana-ai CLI",
        format!("yana-ai {}", env!("CARGO_PKG_VERSION")),
    )
}

fn check_yana_ai_hooks_wired(target: &str) -> Check {
    let path = Path::new(target).join(".claude/settings.json");
    if !path.exists() {
        return Check::warn(
            "yana-ai hooks",
            ".claude/settings.json not found — no hooks active",
            "Run: yana-ai init . or yana-ai guard install all",
        );
    }
    let data: serde_json::Value = match std::fs::read_to_string(&path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
    {
        Some(data) => data,
        None => {
            return Check::warn(
                "yana-ai hooks",
                "Could not parse .claude/settings.json",
                "Fix settings JSON",
            )
        }
    };
    let Some(hooks) = data.get("hooks") else {
        return Check::warn(
            "yana-ai hooks",
            "settings.json found but no hooks configured",
            "Run: yana-ai guard install all --target .",
        );
    };
    match count_hook_commands(hooks) {
        Ok(0) => Check::warn(
            "yana-ai hooks",
            "settings.json found but no hooks configured",
            "Run: yana-ai guard install all --target .",
        ),
        Ok(count) => Check::pass("yana-ai hooks", format!("{count} hook(s) configured")),
        Err(error) => Check::warn(
            "yana-ai hooks",
            format!("Invalid hooks configuration: {error}"),
            "Fix settings JSON",
        ),
    }
}

fn count_hook_commands(hooks: &serde_json::Value) -> Result<usize, &'static str> {
    let event_groups: Vec<&serde_json::Value> = match hooks {
        serde_json::Value::Object(events) => events.values().collect(),
        serde_json::Value::Array(_) => vec![hooks],
        _ => return Err("hooks must be an object or array"),
    };
    let mut count = 0;
    for event in event_groups {
        let groups = event
            .as_array()
            .ok_or("each hook event must contain an array")?;
        for group in groups {
            let commands = group
                .as_object()
                .and_then(|value| value.get("hooks"))
                .and_then(serde_json::Value::as_array)
                .ok_or("hook group 'hooks' must be an array")?;
            count += commands.len();
        }
    }
    Ok(count)
}
