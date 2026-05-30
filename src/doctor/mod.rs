use clap::Subcommand;
use std::path::Path;

#[derive(Subcommand, Debug)]
pub enum DoctorAction {
    /// Run all health checks
    Run {
        #[arg(default_value = ".")] target: String,
        #[arg(long)] json: bool,
    },
}

pub fn dispatch(action: DoctorAction) {
    match action {
        DoctorAction::Run { target, json } => cmd_doctor(&target, json),
    }
}

struct Check {
    label:  &'static str,
    status: Status,
    detail: String,
    fix:    String,
}

enum Status { Pass, Warn, Fail, Skip }

impl Check {
    fn pass(label: &'static str, detail: impl Into<String>) -> Self {
        Self { label, status: Status::Pass, detail: detail.into(), fix: String::new() }
    }
    fn warn(label: &'static str, detail: impl Into<String>, fix: impl Into<String>) -> Self {
        Self { label, status: Status::Warn, detail: detail.into(), fix: fix.into() }
    }
    fn fail(label: &'static str, detail: impl Into<String>, fix: impl Into<String>) -> Self {
        Self { label, status: Status::Fail, detail: detail.into(), fix: fix.into() }
    }
    fn skip(label: &'static str, detail: impl Into<String>) -> Self {
        Self { label, status: Status::Skip, detail: detail.into(), fix: String::new() }
    }
    fn icon(&self) -> &str {
        match self.status { Status::Pass => "✓", Status::Warn => "⚠", Status::Fail => "✗", Status::Skip => "–" }
    }
    fn color_code(&self) -> &str {
        match self.status {
            Status::Pass => "\x1b[32m", Status::Warn => "\x1b[33m",
            Status::Fail => "\x1b[31m", Status::Skip => "\x1b[2m",
        }
    }
}

fn cmd_doctor(target: &str, as_json: bool) {
    let checks = vec![
        check_git_installed(),
        check_git_repo(target),
        check_git_clean(target),
        check_gitignore(target),
        check_claude_settings(target),
        check_mcp_config(target),
        check_env_secrets(target),
        check_anthropic_key(),
        check_python(),
        check_node(),
    ];

    if as_json {
        let out: Vec<_> = checks.iter().map(|c| {
            serde_json::json!({
                "label": c.label,
                "status": match c.status { Status::Pass => "pass", Status::Warn => "warn", Status::Fail => "fail", Status::Skip => "skip" },
                "detail": c.detail,
                "fix": c.fix,
            })
        }).collect();
        println!("{}", serde_json::to_string_pretty(&out).unwrap());
        return;
    }

    println!("\n  yamtam doctor\n");
    let mut fails = 0usize;
    let mut warns = 0usize;
    for c in &checks {
        println!("  {}{}  {}\x1b[0m  {}", c.color_code(), c.icon(), c.label, c.detail);
        if !c.fix.is_empty() { println!("        → {}", c.fix); }
        match c.status { Status::Fail => fails += 1, Status::Warn => warns += 1, _ => {} }
    }
    println!();
    if fails > 0       { println!("  \x1b[31m{} check(s) failed\x1b[0m, {} warning(s)\n", fails, warns); }
    else if warns > 0  { println!("  \x1b[33mAll checks pass with {} warning(s)\x1b[0m\n", warns); }
    else               { println!("  \x1b[32mAll checks passed\x1b[0m\n"); }
}

fn check_git_installed() -> Check {
    match std::process::Command::new("git").arg("--version").output() {
        Ok(o) if o.status.success() => Check::pass("git installed", "ok"),
        _ => Check::fail("git installed", "git not found", "Install git: https://git-scm.com"),
    }
}

fn check_git_repo(target: &str) -> Check {
    if Path::new(target).join(".git").exists() {
        Check::pass("git repository", "found .git/")
    } else {
        Check::fail("git repository", "not a git repo", "Run: git init")
    }
}

fn check_git_clean(target: &str) -> Check {
    let out = std::process::Command::new("git")
        .args(["status", "--short"])
        .current_dir(target)
        .output();
    match out {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout);
            if s.trim().is_empty() { Check::pass("git working tree", "clean") }
            else { Check::warn("git working tree", format!("{} uncommitted file(s)", s.lines().count()), "Commit or stash changes") }
        }
        Err(_) => Check::skip("git working tree", "git unavailable"),
    }
}

fn check_gitignore(target: &str) -> Check {
    let path = Path::new(target).join(".gitignore");
    if !path.exists() {
        return Check::fail("gitignore", "no .gitignore found", "Create .gitignore with .env entries");
    }
    let content = std::fs::read_to_string(&path).unwrap_or_default();
    if content.contains(".env") {
        Check::pass("gitignore", ".env entries present")
    } else {
        Check::warn("gitignore", "no .env entry", "Add '.env*' to .gitignore")
    }
}

fn check_claude_settings(target: &str) -> Check {
    let paths = [
        Path::new(target).join(".claude/settings.json"),
        Path::new(target).join(".claude/settings.local.json"),
    ];
    if paths.iter().any(|p| p.exists()) {
        Check::pass("claude settings", "found .claude/settings.json")
    } else {
        Check::warn("claude settings", "no .claude/settings.json", "Run: yamtam init")
    }
}

fn check_mcp_config(target: &str) -> Check {
    let paths = [".mcp.json", ".claude/mcp.json"];
    for p in &paths {
        if Path::new(target).join(p).exists() {
            return Check::pass("MCP config", format!("found {}", p));
        }
    }
    Check::skip("MCP config", "no .mcp.json (optional)")
}

fn check_env_secrets(target: &str) -> Check {
    // Check if .env is tracked by git
    let out = std::process::Command::new("git")
        .args(["ls-files", ".env"])
        .current_dir(target)
        .output();
    if let Ok(o) = out {
        if !String::from_utf8_lossy(&o.stdout).trim().is_empty() {
            return Check::fail("env secrets", ".env is tracked by git!", "Run: git rm --cached .env && add to .gitignore");
        }
    }
    // Check for common secret files committed
    let dangerous = [".env", ".env.local", ".env.production", "secrets.json"];
    for f in &dangerous {
        if Path::new(target).join(f).exists() {
            let tracked = std::process::Command::new("git")
                .args(["ls-files", f])
                .current_dir(target)
                .output()
                .map(|o| !String::from_utf8_lossy(&o.stdout).trim().is_empty())
                .unwrap_or(false);
            if tracked {
                return Check::fail("env secrets", format!("{} is tracked by git!", f),
                    "Run: git rm --cached <file>");
            }
        }
    }
    Check::pass("env secrets", "no secret files tracked")
}

fn check_anthropic_key() -> Check {
    if std::env::var("ANTHROPIC_API_KEY").is_ok() {
        Check::pass("ANTHROPIC_API_KEY", "set")
    } else {
        Check::warn("ANTHROPIC_API_KEY", "not set", "export ANTHROPIC_API_KEY=sk-...")
    }
}

fn check_python() -> Check {
    let cmds = ["python3", "python"];
    for cmd in &cmds {
        if let Ok(o) = std::process::Command::new(cmd).arg("--version").output() {
            if o.status.success() {
                let v = String::from_utf8_lossy(&o.stdout).trim().to_string() +
                        &String::from_utf8_lossy(&o.stderr).trim();
                return Check::pass("python", v);
            }
        }
    }
    Check::warn("python", "not found (yamtam audit uses Python)", "Install python3")
}

fn check_node() -> Check {
    match std::process::Command::new("node").arg("--version").output() {
        Ok(o) if o.status.success() => {
            Check::pass("node", String::from_utf8_lossy(&o.stdout).trim().to_string())
        }
        _ => Check::skip("node", "not installed (optional)"),
    }
}
