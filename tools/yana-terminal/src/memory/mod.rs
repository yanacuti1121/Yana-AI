// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

use std::collections::VecDeque;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MemoryKind {
    Working,
    Project,
    Decision,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryEntry {
    pub kind: MemoryKind,
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone)]
pub struct Memory {
    capacity: usize,
    entries: VecDeque<MemoryEntry>,
}

impl Memory {
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            entries: VecDeque::new(),
        }
    }

    pub fn remember(&mut self, entry: MemoryEntry) {
        if let Some(position) = self
            .entries
            .iter()
            .position(|current| current.kind == entry.kind && current.key == entry.key)
        {
            self.entries.remove(position);
        }

        self.entries.push_back(entry);
        while self.entries.len() > self.capacity {
            self.entries.pop_front();
        }
    }

    pub fn recall(&self, kind: MemoryKind, key: &str) -> Option<&str> {
        self.entries
            .iter()
            .rev()
            .find(|entry| entry.kind == kind && entry.key == key)
            .map(|entry| entry.value.as_str())
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

impl Default for Memory {
    fn default() -> Self {
        Self::with_capacity(256)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_memory_with_same_identity() {
        let mut memory = Memory::with_capacity(4);
        memory.remember(MemoryEntry {
            kind: MemoryKind::Decision,
            key: "sidebar".into(),
            value: "avoid".into(),
        });
        memory.remember(MemoryEntry {
            kind: MemoryKind::Decision,
            key: "sidebar".into(),
            value: "overlay-only".into(),
        });

        assert_eq!(memory.len(), 1);
        assert_eq!(
            memory.recall(MemoryKind::Decision, "sidebar"),
            Some("overlay-only")
        );
    }
}
