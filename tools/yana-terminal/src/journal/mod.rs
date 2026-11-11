// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JournalKind {
    Observe,
    Decide,
    Act,
    Verify,
    Reflect,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JournalEntry {
    pub sequence: u64,
    pub timestamp: u64,
    pub kind: JournalKind,
    pub summary: String,
    pub detail: String,
}

#[derive(Debug, Default)]
pub struct Journal {
    next_sequence: u64,
    entries: Vec<JournalEntry>,
}

impl Journal {
    pub fn new() -> Self {
        Self {
            next_sequence: 1,
            entries: Vec::new(),
        }
    }

    pub fn record(
        &mut self,
        timestamp: u64,
        kind: JournalKind,
        summary: impl Into<String>,
        detail: impl Into<String>,
    ) -> u64 {
        let sequence = self.next_sequence;
        self.next_sequence += 1;
        self.entries.push(JournalEntry {
            sequence,
            timestamp,
            kind,
            summary: summary.into(),
            detail: detail.into(),
        });
        sequence
    }

    pub fn entries(&self) -> &[JournalEntry] {
        &self.entries
    }

    pub fn since(&self, sequence: u64) -> impl Iterator<Item = &JournalEntry> {
        self.entries
            .iter()
            .filter(move |entry| entry.sequence >= sequence)
    }

    pub fn latest(&self) -> Option<&JournalEntry> {
        self.entries.last()
    }

    pub fn reflection(&self) -> impl Iterator<Item = &JournalEntry> {
        self.entries
            .iter()
            .filter(|entry| entry.kind == JournalKind::Reflect)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_monotonic_sequence() {
        let mut journal = Journal::new();
        let first = journal.record(10, JournalKind::Observe, "scan", "workspace");
        let second = journal.record(11, JournalKind::Decide, "scope", "ui only");
        assert_eq!(first, 1);
        assert_eq!(second, 2);
        assert_eq!(journal.latest().unwrap().summary, "scope");
    }
}
