//! Sidebar panels for the chat TUI — real data only, no mock placeholders.
//! Split out of `tui.rs` for line-count budget, same convention as
//! `approval.rs`/`model_command.rs` (a submodule reaching `App`'s private
//! fields via `super::App`).
//!
//! Design constraint carried over from `docs/UI_REWRITE_SPEC.md` (the
//! sibling `Yana-AI-Chat_Teminal` prototype this was adapted from): every
//! panel must show real data or not exist — no "Memory" panel with fake
//! entries, no "Skills" count that isn't read from the actual manifest.

use super::{App, TurnState};
use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, BorderType, Borders, List, ListItem, Paragraph, Wrap};
use ratatui::Frame;
use std::fs;
use std::path::Path;

const PANEL_BORDER: Color = Color::Rgb(90, 90, 100);
const MUTED: Color = Color::Rgb(160, 160, 160);
const ACCENT: Color = Color::Rgb(200, 180, 230);

/// Fixed-height Provider box above the Tab-switched panel — always
/// visible regardless of `sidebar_tab`, same as the prototype's
/// persistent Provider box.
pub(super) fn render_provider_box(frame: &mut Frame, area: Rect, app: &App) {
    let locality = if app.provider.requires_key() { "REMOTE" } else { "LOCAL" };
    let lines = vec![
        Line::from(vec![
            Span::styled("● ", Style::default().fg(Color::Green)),
            Span::styled(app.provider.name(), Style::default().add_modifier(Modifier::BOLD)),
        ]),
        Line::from(Span::styled(&app.model, Style::default().fg(MUTED))),
        Line::from(Span::styled(locality, Style::default().fg(MUTED))),
    ];
    frame.render_widget(
        Paragraph::new(lines).block(
            Block::default()
                .title(" Provider ")
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .border_style(Style::default().fg(PANEL_BORDER)),
        ),
        area,
    );
}

/// Splits `area` into the Provider box (fixed) and the Tab-switched panel
/// (remaining height), dispatching to the panel for `app.sidebar_tab`.
pub(super) fn render_sidebar(frame: &mut Frame, area: Rect, app: &App) {
    let [provider_area, panel_area] =
        Layout::vertical([Constraint::Length(5), Constraint::Min(4)]).areas(area);
    render_provider_box(frame, provider_area, app);
    match app.sidebar_tab {
        SidebarTab::Approval => render_approval_panel(frame, panel_area, app),
        SidebarTab::Memory => render_memory_panel(frame, panel_area, app),
        SidebarTab::Project => render_project_panel(frame, panel_area, app),
    }
}

fn panel_block(title: String) -> Block<'static> {
    Block::default()
        .title(format!(" {title} · Tab "))
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(PANEL_BORDER))
}

fn render_approval_panel(frame: &mut Frame, area: Rect, app: &App) {
    let lines = match &app.turn {
        TurnState::AwaitingApproval(pending) => vec![
            Line::from(Span::styled("AWAITING APPROVAL", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD))),
            Line::from(""),
            Line::from(Span::styled(&pending.command, Style::default().add_modifier(Modifier::BOLD))),
            Line::from(""),
            Line::from(Span::styled(
                if pending.guard_verdict.is_some() { "guard denied — Enter/Esc to acknowledge" } else { "y = run · n/Esc = decline" },
                Style::default().fg(MUTED),
            )),
        ],
        TurnState::ExecutingTool { .. } => vec![Line::from(Span::styled("Tool executing…", Style::default().fg(Color::Cyan)))],
        TurnState::Idle | TurnState::Streaming(_) => vec![
            Line::from(Span::styled("No pending approval", Style::default().fg(MUTED))),
            Line::from(""),
            Line::from(Span::styled(
                "run_command proposals appear here — y to run, n/Esc to decline",
                Style::default().fg(MUTED),
            )),
        ],
    };
    frame.render_widget(Paragraph::new(lines).wrap(Wrap { trim: false }).block(panel_block(SidebarTab::Approval.label().to_string())), area);
}

fn render_memory_panel(frame: &mut Frame, area: Rect, app: &App) {
    let title = if app.memory_filter.is_empty() {
        "Memory (L1)".to_string()
    } else {
        format!("Memory · '{}'", app.memory_filter)
    };
    let items: Vec<ListItem> = if app.memory_results.is_empty() {
        vec![ListItem::new(Line::from(Span::styled(
            "/memory [query] to search L1 facts",
            Style::default().fg(MUTED),
        )))]
    } else {
        app.memory_results
            .iter()
            .map(|fact| {
                ListItem::new(vec![
                    Line::from(Span::styled(&fact.id, Style::default().fg(ACCENT).add_modifier(Modifier::BOLD))),
                    Line::from(Span::styled(&fact.statement, Style::default().fg(Color::White))),
                ])
            })
            .collect()
    };
    frame.render_widget(List::new(items).block(panel_block(title)), area);
}

fn render_project_panel(frame: &mut Frame, area: Rect, app: &App) {
    let lines = match &app.project_counts {
        Some(c) => vec![
            Line::from(Span::styled(format!("v{}", c.version), Style::default().add_modifier(Modifier::BOLD))),
            Line::from(""),
            Line::from(format!("{} agents", c.agents)),
            Line::from(format!("{} skills", c.skills)),
            Line::from(format!("{} rules", c.rules)),
            Line::from(format!("{} hooks", c.hooks)),
            Line::from(format!("{} scripts", c.scripts)),
            Line::from(format!("{} commands", c.commands)),
        ],
        None => vec![Line::from(Span::styled("MANIFEST.json unavailable", Style::default().fg(MUTED)))],
    };
    frame.render_widget(Paragraph::new(lines).block(panel_block(SidebarTab::Project.label().to_string())), area);
}

const MEMORY_RESULTS_LIMIT: usize = 12;

impl App {
    /// `/memory [query]` — switches the sidebar to the Memory panel and
    /// (re-)runs `read_memory_facts` against the current query. An empty
    /// query shows the most recent facts rather than nothing.
    pub(super) fn handle_memory_command(&mut self, query: &str) {
        self.memory_filter = query.to_string();
        self.memory_results = read_memory_facts(&self.repo_root, query, MEMORY_RESULTS_LIMIT);
        self.sidebar_tab = SidebarTab::Memory;
        self.status = if self.memory_results.is_empty() {
            format!("no L1 facts match '{query}'")
        } else {
            format!("{} L1 fact(s) — Tab to cycle sidebar", self.memory_results.len())
        };
    }

    /// `/status` — one-line MANIFEST.json summary in the status bar, no
    /// tab switch (a quick glance, not a navigation).
    pub(super) fn handle_status_command(&mut self) {
        self.status = match &self.project_counts {
            Some(c) => format!(
                "v{} · {} agents · {} skills · {} rules · {} hooks · {} scripts · {} commands",
                c.version, c.agents, c.skills, c.rules, c.hooks, c.scripts, c.commands
            ),
            None => "MANIFEST.json unavailable — run from the repo root".to_string(),
        };
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum SidebarTab {
    Approval,
    Memory,
    Project,
}

impl SidebarTab {
    pub(super) fn label(self) -> &'static str {
        match self {
            SidebarTab::Approval => "Approval",
            SidebarTab::Memory => "Memory",
            SidebarTab::Project => "Project",
        }
    }

    pub(super) fn next(self) -> Self {
        match self {
            SidebarTab::Approval => SidebarTab::Memory,
            SidebarTab::Memory => SidebarTab::Project,
            SidebarTab::Project => SidebarTab::Approval,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub(super) struct ProjectCounts {
    pub agents: u64,
    pub skills: u64,
    pub rules: u64,
    pub hooks: u64,
    pub scripts: u64,
    pub commands: u64,
    pub version: String,
}

/// Reads `MANIFEST.json`'s canonical counts — the same file
/// `core/scripts/check_counts.py` treats as the source of truth. Returns
/// `None` rather than a zeroed struct on any read/parse failure, so the
/// panel can show "unavailable" instead of a misleading "0 skills".
pub(super) fn read_project_counts(repo_root: &Path) -> Option<ProjectCounts> {
    let raw = fs::read_to_string(repo_root.join("MANIFEST.json")).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let get_u64 = |key: &str| value.get(key).and_then(serde_json::Value::as_u64).unwrap_or(0);
    Some(ProjectCounts {
        agents: get_u64("agents_count"),
        skills: get_u64("skills_count"),
        rules: get_u64("rules_count"),
        hooks: get_u64("hooks_count"),
        scripts: get_u64("scripts_count"),
        commands: get_u64("commands_count"),
        version: value.get("version").and_then(serde_json::Value::as_str).unwrap_or("?").to_string(),
    })
}

#[derive(Debug, Clone)]
pub(super) struct MemoryFact {
    pub id: String,
    pub statement: String,
}

/// Reads `memory/L1_atomic/*.md` frontmatter directly (line-scan, not a
/// full YAML parser — the frontmatter shape is small and stable, see
/// `memory/L1_atomic/SCHEMA.md`) and returns facts whose `id` or
/// `statement` contains `filter` (case-insensitive), most-recently-named
/// file first, capped at `limit`. Empty `filter` matches everything.
pub(super) fn read_memory_facts(repo_root: &Path, filter: &str, limit: usize) -> Vec<MemoryFact> {
    let l1_dir = repo_root.join("memory/L1_atomic");
    let Ok(entries) = fs::read_dir(&l1_dir) else { return Vec::new() };

    let mut paths: Vec<_> = entries
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            p.extension().and_then(|e| e.to_str()) == Some("md")
                && p.file_stem().and_then(|s| s.to_str()).is_some_and(|s| s.starts_with("fact-"))
        })
        .collect();
    paths.sort();
    paths.reverse(); // newest fact-<timestamp>.md filenames first

    let filter_lower = filter.to_lowercase();
    let mut out = Vec::new();
    for path in paths {
        let Ok(content) = fs::read_to_string(&path) else { continue };
        let id = parse_frontmatter_field(&content, "id").unwrap_or_else(|| {
            path.file_stem().and_then(|s| s.to_str()).unwrap_or("?").to_string()
        });
        let statement = parse_frontmatter_field(&content, "statement").unwrap_or_default();
        if statement.is_empty() {
            continue;
        }
        if !filter_lower.is_empty()
            && !id.to_lowercase().contains(&filter_lower)
            && !statement.to_lowercase().contains(&filter_lower)
        {
            continue;
        }
        out.push(MemoryFact { id, statement });
        if out.len() >= limit {
            break;
        }
    }
    out
}

/// Extracts `key: value` from a YAML frontmatter block (between the first
/// two `---` lines). Values are expected on a single line — every field
/// this panel reads (`id`, `statement`) is documented as single-line in
/// `memory/L1_atomic/SCHEMA.md`, so this deliberately doesn't handle
/// multi-line YAML scalars.
fn parse_frontmatter_field(content: &str, key: &str) -> Option<String> {
    let mut in_frontmatter = false;
    let prefix = format!("{key}:");
    for line in content.lines() {
        if line.trim() == "---" {
            if in_frontmatter {
                break;
            }
            in_frontmatter = true;
            continue;
        }
        if in_frontmatter {
            if let Some(rest) = line.strip_prefix(&prefix) {
                return Some(rest.trim().to_string());
            }
        }
    }
    None
}
