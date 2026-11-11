// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalMode {
    Auto,
    Ask,
    Never,
}

impl ApprovalMode {
    pub const ALL: [ApprovalMode; 3] = [ApprovalMode::Auto, ApprovalMode::Ask, ApprovalMode::Never];

    pub fn label(self) -> &'static str {
        match self {
            ApprovalMode::Auto => "AUTO",
            ApprovalMode::Ask => "ASK",
            ApprovalMode::Never => "NEVER",
        }
    }
}

#[derive(Debug)]
pub struct ApprovalEngine {
    current: ApprovalMode,
}

impl Default for ApprovalEngine {
    fn default() -> Self {
        Self {
            current: ApprovalMode::Ask,
        }
    }
}

impl ApprovalEngine {
    pub fn cycle(&mut self) {
        self.current = match self.current {
            ApprovalMode::Auto => ApprovalMode::Ask,
            ApprovalMode::Ask => ApprovalMode::Never,
            ApprovalMode::Never => ApprovalMode::Auto,
        };
    }

    pub fn select(&mut self, name: &str) -> Result<ApprovalMode, String> {
        let normalized = name.trim().to_ascii_lowercase();
        let mode = match normalized.as_str() {
            "auto" => ApprovalMode::Auto,
            "ask" => ApprovalMode::Ask,
            "never" => ApprovalMode::Never,
            _ => return Err(format!("unknown approval mode: {name}")),
        };
        self.current = mode;
        Ok(self.current)
    }

    pub fn current(&self) -> ApprovalMode {
        self.current
    }
}
