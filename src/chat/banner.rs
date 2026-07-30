//! Header content for the chat TUI — ported from `bin/yana`'s bash
//! `banner()` (lines ~205-306) so `yana chat` feels continuous with the
//! banner shown by plain `yana-ai`, not a different product. Originally
//! kept content parity only (identity/version, live asset counts, git
//! branch+status, cwd, release note) and dropped the 2-column ASCII-art
//! layout for lack of header room. Reversed 2026-07-31 on explicit
//! request (a pasted mockup of the exact bash layout) — now ports the
//! wordmark and the 2-column tips/what's-new layout too, so header height
//! grows accordingly; `render.rs` sizes the header region from real
//! content length, not a small fixed clamp, to match.
//!
//! Everything here is gathered once at session start (`BannerInfo::gather`)
//! and cached on `App`, not recomputed every frame — matches the bash
//! banner's own one-shot-per-invocation behavior, and avoids spawning
//! `git` subprocesses on every ~50-250ms render tick.

use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};
use std::process::Command;

/// 6-row block-letter "YANA AI" wordmark, ported verbatim (same
/// box-drawing characters) from `bin/yana`'s own `_banner_art()` so the
/// chat TUI's header matches the plain `yana-ai` banner exactly.
const ASCII_ART: [&str; 6] = [
    "██╗   ██╗ █████╗ ███╗   ██╗ █████╗     █████╗ ██╗",
    "╚██╗ ██╔╝██╔══██╗████╗  ██║██╔══██╗   ██╔══██╗██║",
    " ╚████╔╝ ███████║██╔██╗ ██║███████║   ███████║██║",
    "  ╚██╔╝  ██╔══██║██║╚██╗██║██╔══██║   ██╔══██║██║",
    "   ██║   ██║  ██║██║ ╚████║██║  ██║   ██║  ██║██║",
    "   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝  ╚═╝╚═╝",
];

/// Pink→purple→blue gradient across the 6 art rows — piecewise linear
/// through `render.rs`'s 3-color trio (LIGHT_PINK 255,192,210 → LIGHT_PURPLE
/// 200,180,230 → LIGHT_BLUE 165,210,235), so the wordmark ties directly to
/// the border palette. Third anchor color (purple) added on request — a
/// straight 2-point pink→blue lerp read as "missing a color, not
/// harmonious"; the middle hue rounds it into a real 3-color scheme.
const ART_GRADIENT: [Color; 6] = [
    Color::Rgb(255, 192, 210),
    Color::Rgb(237, 188, 217),
    Color::Rgb(218, 184, 223),
    Color::Rgb(200, 180, 230),
    Color::Rgb(182, 195, 232),
    Color::Rgb(165, 210, 235),
];

/// Greedy word-wrap, no dependency — bash's banner uses `fold -s`, this is
/// the same idea (fill each line up to `width`, break on whitespace only).
fn wrap_text(text: &str, width: usize) -> Vec<String> {
    if width == 0 {
        return vec![text.to_string()];
    }
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in text.split_whitespace() {
        if current.is_empty() {
            current.push_str(word);
        } else if current.chars().count() + 1 + word.chars().count() <= width {
            current.push(' ');
            current.push_str(word);
        } else {
            lines.push(std::mem::take(&mut current));
            current.push_str(word);
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

/// Truncates to `width` with a trailing ellipsis, then right-pads with
/// spaces to exactly `width` — keeps the two-column layout aligned no
/// matter how long a dynamic value (cwd, branch, release note) gets.
fn pad_to(s: &str, width: usize) -> String {
    let len = s.chars().count();
    if width == 0 {
        return String::new();
    }
    if len > width {
        let keep = width.saturating_sub(1);
        let truncated: String = s.chars().take(keep).collect();
        format!("{truncated}…")
    } else {
        format!("{s}{}", " ".repeat(width - len))
    }
}

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

/// Builds the header's content lines: the ASCII wordmark, then a 2-column
/// block (left: identity/stats/git/cwd, right: tips + what's new) ported
/// from `bin/yana`'s `banner()`, then a TUI-only provider/session line
/// underneath (bash has no such concept — this is chat-specific). `width`
/// is the header area's *inner* width (already minus the block's own left/
/// right border, see `render.rs`), used to size the two columns the same
/// way bash sizes `LEFT_W`/`RIGHT_W` from `tput cols`. Line count varies
/// (git info, counts, release note are each omitted when unavailable) —
/// callers size the header region's `Constraint::Length` from
/// `lines.len()`, not a fixed constant, so nothing gets clipped.
pub fn header_lines(info: &BannerInfo, provider: &str, model: &str, session_id: &str, width: u16) -> Vec<Line<'static>> {
    let mut lines = Vec::with_capacity(20);

    // Wordmark, pink→blue gradient per row.
    for (i, art_line) in ASCII_ART.iter().enumerate() {
        lines.push(Line::styled(*art_line, Style::default().fg(ART_GRADIENT[i])));
    }
    lines.push(Line::raw(""));

    // Column widths mirror bash's `LEFT_W = BANNER_W * 32 / 100` (floored at
    // 28) / `RIGHT_W = BANNER_W - LEFT_W - 1` (the 1 is the " │ " divider).
    let inner_w = width as usize;
    let left_w = ((inner_w * 32 / 100).max(28)).min(inner_w.saturating_sub(4));
    let right_w = inner_w.saturating_sub(left_w + 3); // 3 = " │ "

    let version_style = Style::default().fg(ART_GRADIENT[5]);

    // Left column, exact content/order as bash's `left_plain`/`left_colored`.
    let mut left: Vec<(String, Option<Style>)> = vec![
        (format!("v{} · chào {}", info.version, info.username), Some(version_style)),
        ("Personal Agent OS".to_string(), None),
        (String::new(), None),
    ];
    if let Some(c) = &info.counts {
        left.push((format!("{} agents · {} skills", c.agents, c.skills), None));
        left.push((format!("{} rules · {} hooks", c.rules, c.hooks), None));
        left.push((format!("{} scripts · {} checks", c.scripts, c.checks), None));
        left.push((String::new(), None));
    }
    let branch_display = info.git_branch.clone().unwrap_or_else(|| "(no branch)".to_string());
    let status_txt = match info.git_dirty {
        Some(0) => "clean".to_string(),
        Some(n) => format!("{n} changed"),
        None => "no git".to_string(),
    };
    left.push((format!("{branch_display} ({status_txt})"), None));
    left.push((info.cwd.clone(), None));

    // Right column: tips + what's new, exact content/order as bash's
    // `right_plain`/`right_colored`.
    let mut right: Vec<(String, Option<Style>)> = vec![
        ("Tips for getting started".to_string(), None),
        ("yana-ai doctor".to_string(), None),
        ("yana-ai init".to_string(), None),
        (String::new(), None),
        ("What's new".to_string(), None),
    ];
    let note = info.release_note.clone().unwrap_or_else(|| "(no release notes found)".to_string());
    for wrapped in wrap_text(&note, right_w.max(1)) {
        right.push((wrapped, None));
    }

    let rows = left.len().max(right.len());
    for i in 0..rows {
        let (ltext, lstyle) = left.get(i).cloned().unwrap_or_default();
        let (rtext, rstyle) = right.get(i).cloned().unwrap_or_default();
        let mut spans = vec![Span::styled(pad_to(&ltext, left_w), lstyle.unwrap_or_default())];
        spans.push(Span::raw(" │ "));
        spans.push(Span::styled(pad_to(&rtext, right_w), rstyle.unwrap_or_default()));
        lines.push(Line::from(spans));
    }

    // TUI-only addition (bash's banner has no provider/session concept).
    let session_short = &session_id[..8.min(session_id.len())];
    lines.push(Line::raw(""));
    lines.push(Line::from(vec![
        Span::styled(format!("{provider} / {model}"), Style::default().fg(Color::Yellow)),
        Span::raw(format!(" · session {session_short} · /model to switch")),
    ]));

    lines
}
