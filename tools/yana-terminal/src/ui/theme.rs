// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

use ratatui::style::Color;

#[derive(Debug, Clone, Copy)]
pub struct SkyLake {
    pub background: Color,
    pub surface: Color,
    pub border: Color,
    pub text: Color,
    pub muted: Color,
    pub yana_pink: Color,
    pub lake_blue: Color,
    pub sky_cyan: Color,
    pub mint: Color,
    pub amber: Color,
}

impl Default for SkyLake {
    fn default() -> Self {
        Self {
            background: Color::Rgb(7, 26, 36),
            surface: Color::Rgb(11, 36, 48),
            border: Color::Rgb(45, 88, 108),
            text: Color::Rgb(232, 247, 255),
            muted: Color::Rgb(145, 178, 194),
            yana_pink: Color::Rgb(255, 205, 232),
            lake_blue: Color::Rgb(191, 233, 255),
            sky_cyan: Color::Rgb(114, 219, 244),
            mint: Color::Rgb(154, 232, 202),
            amber: Color::Rgb(244, 205, 134),
        }
    }
}
