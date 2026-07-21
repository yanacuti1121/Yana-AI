//! Header content for the chat TUI — ported from `bin/yana`'s bash
//! `banner()` (lines ~205-306) so `yana chat` feels continuous with the
//! banner shown by plain `yana-ai`, not a different product. Keeps the
//! same *content and order* (identity/version, 6 live asset counts, git
//! branch+status, cwd, release note) but drops the 2-column ASCII-art
//! layout entirely — there's no room for it in a TUI header region, and
//! the brief this was built from explicitly asked for content parity, not
//! pixel parity.
//!
//! Everything here is gathered once at session start (`BannerInfo::gather`)
//! and cached on `App`, not recomputed every frame — matches the bash
//! banner's own one-shot-per-invocation behavior, and avoids spawning
//! `git` subprocesses on every ~50-250ms render tick.

use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};
use std::process::Command;

pub struct PluginCounts {
    pub agents: u64,
    pub skills: u64,
    pub rules: u64,
    pub hooks: u64,
    pub scripts: u64,
    pub checks: u64,
}

pub struct BannerInfo {
    /// Product version from `.claude-plugin/plugin.json`, or the crate's
    /// own `CARGO_PKG_VERSION` if that file isn't reachable from cwd
    /// (e.g. a globally npm-installed `yana-ai` used outside this repo).
    pub version: String,
    pub counts: Option<PluginCounts>,
    pub username: String,
    pub git_branch: Option<String>,
    /// `Some(0)` = clean, `Some(n)` = n changed files, `None` = not a git repo.
    pub git_dirty: Option<usize>,
    pub cwd: String,
    pub release_note: Option<String>,
}

/// Every `Command` in this file runs `.stdin(Stdio::null())`: this code
/// runs inside `BannerInfo::gather()`, which `App::new()` calls only after
/// the TUI's raw-mode/alternate-screen has already been entered
/// (`terminal_guard::TerminalGuard::new()` runs before `App::new()` in
/// `mod.rs`'s `dispatch()`). Without an explicit null stdin, these `git`
/// subprocesses would inherit that raw-mode pty as their own stdin — if
/// `git` ever needed interactive input for any reason (an ownership/
/// "safe.directory" prompt is the realistic case), the whole TUI would
/// hang waiting on a prompt nothing is answering, with no visible way out
/// short of killing the process. A header-info helper must never be able
/// to block on stdin under any circumstance.
fn git_output(args: &[&str]) -> Option<String> {
    let out = Command::new("git").args(args).stdin(std::process::Stdio::null()).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() { None } else { Some(s) }
}

/// Port of `_banner_release_note()`: the subject line of the most recent
/// commit matching `^release:`, with that prefix stripped.
fn release_note() -> Option<String> {
    let out = Command::new("git")
        .args(["log", "--format=%s", "-1", "--grep=^release:"])
        .stdin(std::process::Stdio::null())
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let subject = String::from_utf8_lossy(&out.stdout).trim().to_string();
    subject.strip_prefix("release: ").map(|s| s.to_string())
        .or((!subject.is_empty()).then_some(subject))
}

fn read_plugin_info() -> (String, Option<PluginCounts>) {
    let path = std::env::current_dir()
        .unwrap_or_default()
        .join(".claude-plugin")
        .join("plugin.json");
    let parsed = std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());
    let Some(json) = parsed else {
        // Bare version, not "yana-rt v..." — header_lines() already
        // prepends its own "Yana AI v" below; a prefix here double-stacked
        // into "Yana AI vyana-rt v1.3.3" (found by verify-agent testing
        // the no-plugin.json fallback path — a realistic path, not just a
        // test artifact: a globally npm-installed `yana-ai` run outside
        // this repo hits it every time).
        return (env!("CARGO_PKG_VERSION").to_string(), None);
    };
    let version = json.get("version").and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());
    let counts = json.get("contents").and_then(|c| {
        Some(PluginCounts {
            agents: c.get("agents")?.as_u64()?,
            skills: c.get("skills")?.as_u64()?,
            rules: c.get("rules")?.as_u64()?,
            hooks: c.get("hooks")?.as_u64()?,
            scripts: c.get("scripts")?.as_u64()?,
            checks: c.get("checks")?.as_u64()?,
        })
    });
    (version, counts)
}

impl BannerInfo {
    pub fn gather() -> Self {
        let (version, counts) = read_plugin_info();

        // Same fallback chain as `bin/yana`'s banner(): git user.name,
        // then `whoami`, then a fixed placeholder.
        let username = git_output(&["config", "user.name"])
            .or_else(|| Command::new("whoami").stdin(std::process::Stdio::null()).output().ok()
                .and_then(|o| o.status.success().then(|| String::from_utf8_lossy(&o.stdout).trim().to_string()))
                .filter(|s| !s.is_empty()))
            .unwrap_or_else(|| "bạn".to_string());

        let git_branch = git_output(&["branch", "--show-current"]);
        let git_dirty = Command::new("git").args(["status", "--porcelain"]).stdin(std::process::Stdio::null()).output().ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).lines().count());

        let cwd = std::env::current_dir()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|_| ".".to_string());

        Self {
            version,
            counts,
            username,
            git_branch,
            git_dirty,
            cwd,
            release_note: release_note(),
        }
    }
}

/// Builds the header's content lines. Line count varies (git info and
/// release note are each omitted when unavailable) — callers size the
/// header region's `Constraint::Length` from `lines.len()`, not a fixed
/// constant, so nothing gets clipped when a line is skipped or shown.
pub fn header_lines(info: &BannerInfo, provider: &str, model: &str, session_id: &str) -> Vec<Line<'static>> {
    let mut lines = Vec::with_capacity(5);

    lines.push(Line::raw(format!("Yana AI v{} · chào {}", info.version, info.username)));

    if let Some(c) = &info.counts {
        lines.push(Line::raw(format!(
            "{} agents · {} skills · {} rules · {} hooks · {} scripts · {} checks",
            c.agents, c.skills, c.rules, c.hooks, c.scripts, c.checks
        )));
    }

    if let Some(branch) = &info.git_branch {
        let status = match info.git_dirty {
            Some(0) => "clean".to_string(),
            Some(n) => format!("{n} changed"),
            None => "no git".to_string(),
        };
        lines.push(Line::raw(format!("{branch} ({status}) · {}", info.cwd)));
    } else {
        lines.push(Line::raw(info.cwd.clone()));
    }

    if let Some(note) = &info.release_note {
        lines.push(Line::raw(format!("What's new: {note}")));
    }

    let session_short = &session_id[..8.min(session_id.len())];
    lines.push(Line::from(vec![
        Span::styled(format!("{provider} / {model}"), Style::default().fg(Color::Yellow)),
        Span::raw(format!(" · session {session_short} · /model to switch")),
    ]));

    lines
}
