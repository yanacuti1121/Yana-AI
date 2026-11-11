// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderProfile {
    pub name: String,
    pub model: String,
    pub local: bool,
}

#[derive(Debug)]
pub struct ProviderEngine {
    profiles: Vec<ProviderProfile>,
    selected: usize,
}

impl Default for ProviderEngine {
    fn default() -> Self {
        Self {
            profiles: vec![
                ProviderProfile {
                    name: "Claude".into(),
                    model: "claude-sonnet-5".into(),
                    local: false,
                },
                ProviderProfile {
                    name: "OpenAI".into(),
                    model: "Not connected".into(),
                    local: false,
                },
                ProviderProfile {
                    name: "Gemini".into(),
                    model: "Not connected".into(),
                    local: false,
                },
                ProviderProfile {
                    name: "Ollama".into(),
                    model: "Not connected".into(),
                    local: true,
                },
            ],
            selected: 0,
        }
    }
}

impl ProviderEngine {
    pub fn current(&self) -> &ProviderProfile {
        &self.profiles[self.selected]
    }

    pub fn select(&mut self, name: &str) -> Result<&ProviderProfile, String> {
        let normalized = name.trim().to_ascii_lowercase();
        let index = self
            .profiles
            .iter()
            .position(|profile| profile.name.to_ascii_lowercase().contains(&normalized))
            .ok_or_else(|| format!("unknown provider: {name}"))?;
        self.selected = index;
        Ok(self.current())
    }

    pub fn labels(&self) -> impl Iterator<Item = &str> {
        self.profiles.iter().map(|profile| profile.name.as_str())
    }
}
