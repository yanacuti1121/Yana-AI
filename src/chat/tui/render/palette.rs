use crossterm::style::available_color_count;
use ratatui::style::{Color, Modifier, Style};
use std::sync::OnceLock;

pub(super) const LOTUS_BLUE: Color = Color::Rgb(56, 189, 248);
pub(super) const SAKURA_PINK: Color = Color::Rgb(244, 143, 177);
pub(super) const MATCHA_GREEN: Color = Color::Rgb(74, 222, 128);
pub(super) const OBSIDIAN: Color = Color::Rgb(15, 23, 42);
const INDIGO_LOTUS: Color = Color::Rgb(37, 99, 235);
const SOFT_SAKURA: Color = Color::Rgb(255, 183, 197);
const BAMBOO_GLOW: Color = Color::Rgb(134, 239, 172);
const CYBER_VIOLET: Color = Color::Rgb(167, 139, 250);
const WARNING_AMBER: Color = Color::Rgb(251, 191, 36);
const DANGER_ROSE: Color = Color::Rgb(251, 113, 133);
const MUTED_SLATE: Color = Color::Rgb(148, 163, 184);
const INK_TEXT: Color = Color::Rgb(226, 232, 240);
const TRUE_COLOR_PROCESSING_RING: [Color; 7] = [
    INDIGO_LOTUS,
    LOTUS_BLUE,
    CYBER_VIOLET,
    SAKURA_PINK,
    SOFT_SAKURA,
    MATCHA_GREEN,
    BAMBOO_GLOW,
];
const ANSI_256_PROCESSING_RING: [Color; 7] = [
    Color::Indexed(27),
    Color::Indexed(39),
    Color::Indexed(141),
    Color::Indexed(211),
    Color::Indexed(218),
    Color::Indexed(83),
    Color::Indexed(120),
];
const ANSI_PROCESSING_RING: [Color; 7] = [
    Color::Blue,
    Color::Cyan,
    Color::Magenta,
    Color::Red,
    Color::Yellow,
    Color::Green,
    Color::White,
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ColorMode {
    TrueColor,
    Ansi256,
    Ansi,
    NoColor,
}

#[derive(Debug, Clone, Copy)]
pub(in crate::chat::tui) struct Palette {
    pub(in crate::chat::tui) system_blue: Color,
    pub(in crate::chat::tui) user_pink: Color,
    pub(in crate::chat::tui) runtime_green: Color,
    pub(in crate::chat::tui) obsidian: Color,
    pub(in crate::chat::tui) text: Color,
    pub(in crate::chat::tui) muted: Color,
    pub(in crate::chat::tui) warning: Color,
    pub(in crate::chat::tui) danger: Color,
    pub(in crate::chat::tui) violet: Color,
    pub(super) processing_ring: [Color; 7],
    mode: ColorMode,
}

impl Palette {
    fn detect() -> Self {
        let no_color = std::env::var("NO_COLOR")
            .map(|value| !value.is_empty())
            .unwrap_or(false);
        let dumb_terminal = std::env::var("TERM")
            .map(|value| value == "dumb")
            .unwrap_or(false);
        if no_color || dumb_terminal {
            return Self::for_mode(ColorMode::NoColor);
        }
        let mode = match available_color_count() {
            u16::MAX => ColorMode::TrueColor,
            count if count >= 256 => ColorMode::Ansi256,
            _ => ColorMode::Ansi,
        };
        Self::for_mode(mode)
    }

    pub(super) fn for_mode(mode: ColorMode) -> Self {
        match mode {
            ColorMode::TrueColor => Self {
                system_blue: LOTUS_BLUE,
                user_pink: SAKURA_PINK,
                runtime_green: MATCHA_GREEN,
                obsidian: OBSIDIAN,
                text: INK_TEXT,
                muted: MUTED_SLATE,
                warning: WARNING_AMBER,
                danger: DANGER_ROSE,
                violet: CYBER_VIOLET,
                processing_ring: TRUE_COLOR_PROCESSING_RING,
                mode,
            },
            ColorMode::Ansi256 => Self {
                system_blue: Color::Indexed(39),
                user_pink: Color::Indexed(211),
                runtime_green: Color::Indexed(83),
                obsidian: Color::Indexed(234),
                text: Color::Indexed(252),
                muted: Color::Indexed(245),
                warning: Color::Indexed(221),
                danger: Color::Indexed(204),
                violet: Color::Indexed(141),
                processing_ring: ANSI_256_PROCESSING_RING,
                mode,
            },
            ColorMode::Ansi => Self {
                system_blue: Color::Blue,
                user_pink: Color::Magenta,
                runtime_green: Color::Green,
                obsidian: Color::Black,
                text: Color::White,
                muted: Color::DarkGray,
                warning: Color::Yellow,
                danger: Color::Red,
                violet: Color::Magenta,
                processing_ring: ANSI_PROCESSING_RING,
                mode,
            },
            ColorMode::NoColor => Self {
                system_blue: Color::Reset,
                user_pink: Color::Reset,
                runtime_green: Color::Reset,
                obsidian: Color::Reset,
                text: Color::Reset,
                muted: Color::Reset,
                warning: Color::Reset,
                danger: Color::Reset,
                violet: Color::Reset,
                processing_ring: [Color::Reset; 7],
                mode,
            },
        }
    }

    pub(in crate::chat::tui) fn badge_style(self, accent: Color) -> Style {
        match self.mode {
            ColorMode::NoColor => {
                Style::default().add_modifier(Modifier::BOLD | Modifier::REVERSED)
            }
            ColorMode::Ansi => Style::default()
                .fg(accent)
                .add_modifier(Modifier::BOLD | Modifier::REVERSED),
            ColorMode::TrueColor | ColorMode::Ansi256 => Style::default()
                .fg(self.obsidian)
                .bg(accent)
                .add_modifier(Modifier::BOLD),
        }
    }

    pub(super) fn colors_enabled(self) -> bool {
        self.mode != ColorMode::NoColor
    }
}

static ACTIVE_PALETTE: OnceLock<Palette> = OnceLock::new();

pub(super) fn active_palette() -> Palette {
    *ACTIVE_PALETTE.get_or_init(Palette::detect)
}
