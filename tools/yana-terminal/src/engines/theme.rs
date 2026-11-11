// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThemeName {
    SkyLake,
    Mono,
}

#[derive(Debug)]
pub struct ThemeEngine {
    current: ThemeName,
}

impl Default for ThemeEngine {
    fn default() -> Self {
        Self {
            current: ThemeName::SkyLake,
        }
    }
}

impl ThemeEngine {
    pub fn toggle(&mut self) {
        self.current = match self.current {
            ThemeName::SkyLake => ThemeName::Mono,
            ThemeName::Mono => ThemeName::SkyLake,
        };
    }

    pub fn current(&self) -> ThemeName {
        self.current
    }
}
