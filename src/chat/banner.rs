//! Compact header content for the chat TUI.
//!
//! Everything here is gathered once at session start (`BannerInfo::gather`)
//! and cached on `App`, not recomputed every frame — matches the bash
//! banner's own one-shot-per-invocation behavior, and avoids spawning
//! `git` subprocesses on every ~50-250ms render tick.

use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};
use std::process::Command;

pub struct BannerInfo {
    /// Product version from `.claude-plugin/plugin.json`, or the crate's
    /// own `CARGO_PKG_VERSION` if that file isn't reachable from cwd
    /// (e.g. a globally npm-installed `yana-ai` used outside this repo).
    pub version: String,
    pub git_branch: Option<String>,
    /// `Some(0)` = clean, `Some(n)` = n changed files, `None` = not a git repo.
    pub git_dirty: Option<usize>,
    pub cwd: String,
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
    let out = Command::new("git")
        .args(args)
        .stdin(std::process::Stdio::null())
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

fn read_plugin_version() -> String {
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
        return env!("CARGO_PKG_VERSION").to_string();
    };
    json.get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string())
}

impl BannerInfo {
    pub fn gather() -> Self {
        let version = read_plugin_version();

        let git_branch = git_output(&["branch", "--show-current"]);
        let git_dirty = Command::new("git")
            .args(["status", "--porcelain"])
            .stdin(std::process::Stdio::null())
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).lines().count());

        let cwd = std::env::current_dir()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|_| ".".to_string());

        Self {
            version,
            git_branch,
            git_dirty,
            cwd,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{header_lines, BannerInfo};

    #[test]
    fn compact_header_stays_two_lines_and_truncates_on_narrow_terminals() {
        let info = BannerInfo {
            version: "1.3.3".to_string(),
            git_branch: Some("feature/very-long-branch-name".to_string()),
            git_dirty: Some(0),
            cwd: "/a/very/long/project/path".to_string(),
        };
        let lines = header_lines(&info, "ollama", "qwen2.5-coder:14b", "12345678-abcdef", 24);
        assert_eq!(lines.len(), 2);
        assert!(lines[0].to_string().contains("YANA AI"));
        assert!(lines[0].to_string().chars().count() <= 24);
        assert!(lines[1].to_string().ends_with('…'));
    }
}

pub fn header_lines(
    info: &BannerInfo,
    provider: &str,
    model: &str,
    session_id: &str,
    width: u16,
) -> Vec<Line<'static>> {
    let max_width = width.saturating_sub(2) as usize;
    let branch_display = info
        .git_branch
        .clone()
        .unwrap_or_else(|| "(no branch)".to_string());
    let status_txt = match info.git_dirty {
        Some(0) => "clean".to_string(),
        Some(n) => format!("{n} changed"),
        None => "no git".to_string(),
    };
    let session_short = &session_id[..8.min(session_id.len())];
    let identity = format!("{provider} · {model} · session {session_short}");
    let context = format!("{branch_display} · {status_txt} · {}", info.cwd);
    let cut = |text: String, available: usize| -> String {
        if text.chars().count() <= available {
            return text;
        }
        let keep = available.saturating_sub(1);
        format!("{}…", text.chars().take(keep).collect::<String>())
    };
    let chat_label = if max_width >= 32 {
        format!(" chat  v{}", info.version)
    } else {
        " chat".to_string()
    };
    let brand = format!(" YANA AI {chat_label}  ");
    let identity_width = max_width.saturating_sub(brand.chars().count());
    vec![
        Line::from(vec![
            Span::styled(
                " YANA AI ",
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(ratatui::style::Modifier::BOLD),
            ),
            Span::styled(chat_label, Style::default().fg(Color::DarkGray)),
            Span::raw(format!("  {}", cut(identity, identity_width))),
        ]),
        Line::styled(
            cut(context, max_width),
            Style::default().fg(Color::DarkGray),
        ),
    ]
}
