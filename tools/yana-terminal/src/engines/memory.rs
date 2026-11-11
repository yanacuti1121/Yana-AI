// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

// Zero-Memory UI: no LLM, no backend. Static sample data only, so the
// Memory panel has something real to render. See docs/UI_REWRITE_SPEC.md.

#[derive(Debug)]
pub struct MemoryEngine {
    recent_evidence: Vec<&'static str>,
    timeline: Vec<&'static str>,
    entities: Vec<&'static str>,
    related: Vec<&'static str>,
    retrieved: Vec<&'static str>,
}

impl Default for MemoryEngine {
    fn default() -> Self {
        Self {
            recent_evidence: vec!["src/ui/mod.rs edited", "Provider switched to Claude"],
            timeline: vec!["09:41 session started", "09:44 prompt #1 rendered"],
            entities: vec!["Yana Core", "Bridge", "Session #1"],
            related: vec!["docs/UI_REWRITE_SPEC.md", "DESIGN.md"],
            retrieved: vec!["No retrieval performed yet"],
        }
    }
}

impl MemoryEngine {
    pub fn recent_evidence(&self) -> &[&'static str] {
        &self.recent_evidence
    }

    pub fn timeline(&self) -> &[&'static str] {
        &self.timeline
    }

    pub fn entities(&self) -> &[&'static str] {
        &self.entities
    }

    pub fn related(&self) -> &[&'static str] {
        &self.related
    }

    pub fn retrieved(&self) -> &[&'static str] {
        &self.retrieved
    }
}
