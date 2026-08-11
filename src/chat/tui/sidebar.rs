//! Sidebar panels for the chat TUI — real data only, no mock placeholders.
//! Split out of `tui.rs` for line-count budget, same convention as
//! `approval.rs`/`model_command.rs` (a submodule reaching `App`'s private
//! fields via `super::App`).
//!
//! Panel choice and the "real data only" rule both carry over from
//! `docs/UI_REWRITE_SPEC.md` (the sibling `Yana-AI-Chat_Teminal`
//! prototype this was first adapted from) — no "Memory" panel with fake
//! entries, no "Skills" count that isn't read from the actual manifest.
//! The specific four tabs (Activity/Approval/Memory/Project) are a
//! reconciliation of two independent redesigns that landed on the same
//! files at the same time: the sibling `codex/redesign-chat-tui` branch
//! built a fixed Session+Activity sidebar with a compact header and an
//! animated input border (kept — see `render.rs`'s palette and
//! `draw_spectrum_border`); this file's own earlier version built a
//! Tab-switchable Approval/Memory/Project sidebar reading real session
//! and repo state. Activity is folded in here as a fourth tab rather than
//! dropped, since the pending-turn/keybinding summary it shows is real
//! and useful — the Session box (fixed, not tabbed) absorbs the other
//! branch's persistent provider/session identity display.

mod data;

pub(super) use data::{read_memory_facts, read_project_counts, MemoryFact, ProjectCounts};

use super::render::{AMBER, JADE, SLATE, VIOLET, WATER};
use super::{App, TurnState};
use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, Paragraph, Wrap};
use ratatui::Frame;

/// Fixed-height Session box above the Tab-switched panel — always visible
/// regardless of `sidebar_tab`. Merges what were two separate persistent
/// boxes across the two source designs (Provider identity + Session id).
pub(super) fn render_session_box(frame: &mut Frame, area: Rect, app: &App) {
    let locality = if app.provider.requires_key() {
        "REMOTE"
    } else {
        "LOCAL"
    };
    let lines = vec![
        Line::styled(
            "● Local chat",
            Style::default().fg(JADE).add_modifier(Modifier::BOLD),
        ),
        Line::raw(app.provider.name().to_string()),
        Line::styled(app.model.clone(), Style::default().fg(WATER)),
        Line::raw(""),
        Line::styled(
            format!(
                "{locality} · {}",
                &app.session_id[..8.min(app.session_id.len())]
            ),
            Style::default().fg(SLATE),
        ),
    ];
    frame.render_widget(
        Paragraph::new(lines).block(
            Block::bordered()
                .title(" Session ")
                .border_style(Style::default().fg(JADE)),
        ),
        area,
    );
}

/// Splits `area` into the Session box (fixed) and the Tab-switched panel
/// (remaining height), dispatching to the panel for `app.sidebar_tab`.
pub(super) fn render_sidebar(frame: &mut Frame, area: Rect, app: &App) {
    let [session_area, panel_area] =
        Layout::vertical([Constraint::Length(6), Constraint::Min(4)]).areas(area);
    render_session_box(frame, session_area, app);
    match app.sidebar_tab {
        SidebarTab::Activity => render_activity_panel(frame, panel_area, app),
        SidebarTab::Approval => render_approval_panel(frame, panel_area, app),
        SidebarTab::Memory => render_memory_panel(frame, panel_area, app),
        SidebarTab::Project => render_project_panel(frame, panel_area, app),
    }
}

fn panel_block(title: String, accent: Color) -> Block<'static> {
    Block::default()
        .title(format!(" {title} · Tab "))
        .borders(Borders::ALL)
        .border_style(Style::default().fg(accent))
}

fn render_activity_panel(frame: &mut Frame, area: Rect, app: &App) {
    let (status, tone) = match &app.turn {
        TurnState::Idle => ("Ready for your message", JADE),
        TurnState::Streaming { .. } => ("Receiving response", AMBER),
        TurnState::AwaitingApproval(_) => ("Approval required", AMBER),
        TurnState::ExecutingTool { .. } => ("Running approved tool", AMBER),
    };
    let lines = vec![
        Line::styled(
            status,
            Style::default().fg(tone).add_modifier(Modifier::BOLD),
        ),
        Line::raw(""),
        Line::styled("Controls", Style::default().add_modifier(Modifier::BOLD)),
        Line::raw("Enter    send"),
        Line::raw("PgUp/Dn  scroll"),
        Line::raw("Tab      cycle sidebar"),
        Line::raw("/model   switch model"),
        Line::raw("/memory  search L1 facts"),
        Line::raw("/status  project counts"),
        Line::raw("Ctrl-C   quit"),
    ];
    frame.render_widget(
        Paragraph::new(lines)
            .wrap(Wrap { trim: true })
            .block(panel_block(SidebarTab::Activity.label().to_string(), tone)),
        area,
    );
}

fn render_approval_panel(frame: &mut Frame, area: Rect, app: &App) {
    let lines = match &app.turn {
        TurnState::AwaitingApproval(pending) => vec![
            Line::from(Span::styled(
                "AWAITING APPROVAL",
                Style::default().fg(AMBER).add_modifier(Modifier::BOLD),
            )),
            Line::from(""),
            Line::from(Span::styled(
                &pending.command,
                Style::default().add_modifier(Modifier::BOLD),
            )),
            Line::from(""),
            Line::from(Span::styled(
                if pending.guard_verdict.is_some() {
                    "guard denied — Enter/Esc to acknowledge"
                } else {
                    "y = run · n/Esc = decline"
                },
                Style::default().fg(SLATE),
            )),
        ],
        TurnState::ExecutingTool { .. } => vec![Line::from(Span::styled(
            "Tool executing…",
            Style::default().fg(WATER),
        ))],
        TurnState::Idle | TurnState::Streaming { .. } => vec![
            Line::from(Span::styled(
                "No pending approval",
                Style::default().fg(SLATE),
            )),
            Line::from(""),
            Line::from(Span::styled(
                "run_command proposals appear here — y to run, n/Esc to decline",
                Style::default().fg(SLATE),
            )),
        ],
    };
    let accent = if matches!(app.turn, TurnState::AwaitingApproval(_)) {
        AMBER
    } else {
        JADE
    };
    frame.render_widget(
        Paragraph::new(lines)
            .wrap(Wrap { trim: false })
            .block(panel_block(
                SidebarTab::Approval.label().to_string(),
                accent,
            )),
        area,
    );
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
            Style::default().fg(SLATE),
        )))]
    } else {
        app.memory_results
            .iter()
            .map(|fact| {
                ListItem::new(vec![
                    Line::from(Span::styled(
                        &fact.id,
                        Style::default().fg(VIOLET).add_modifier(Modifier::BOLD),
                    )),
                    Line::from(Span::styled(
                        &fact.statement,
                        Style::default().fg(Color::White),
                    )),
                ])
            })
            .collect()
    };
    frame.render_widget(List::new(items).block(panel_block(title, VIOLET)), area);
}

fn render_project_panel(frame: &mut Frame, area: Rect, app: &App) {
    let lines = match &app.project_counts {
        Some(c) => vec![
            Line::from(Span::styled(
                format!("v{}", c.version),
                Style::default().add_modifier(Modifier::BOLD),
            )),
            Line::from(""),
            Line::from(format!("{} agents", c.agents)),
            Line::from(format!("{} skills", c.skills)),
            Line::from(format!("{} rules", c.rules)),
            Line::from(format!("{} hooks", c.hooks)),
            Line::from(format!("{} scripts", c.scripts)),
            Line::from(format!("{} commands", c.commands)),
        ],
        None => vec![Line::from(Span::styled(
            "MANIFEST.json unavailable",
            Style::default().fg(SLATE),
        ))],
    };
    frame.render_widget(
        Paragraph::new(lines).block(panel_block(SidebarTab::Project.label().to_string(), WATER)),
        area,
    );
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
            format!(
                "{} L1 fact(s) — Tab to cycle sidebar",
                self.memory_results.len()
            )
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(super) enum SidebarTab {
    #[default]
    Activity,
    Approval,
    Memory,
    Project,
}

impl SidebarTab {
    pub(super) fn label(self) -> &'static str {
        match self {
            SidebarTab::Activity => "Activity",
            SidebarTab::Approval => "Approval",
            SidebarTab::Memory => "Memory",
            SidebarTab::Project => "Project",
        }
    }

    pub(super) fn next(self) -> Self {
        match self {
            SidebarTab::Activity => SidebarTab::Approval,
            SidebarTab::Approval => SidebarTab::Memory,
            SidebarTab::Memory => SidebarTab::Project,
            SidebarTab::Project => SidebarTab::Activity,
        }
    }
}
