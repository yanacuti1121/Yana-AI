// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkspaceHealth {
    Initializing,
    Healthy,
    Degraded,
}

#[derive(Debug, Clone)]
pub struct WorkspaceSnapshot {
    pub root: PathBuf,
    pub display_name: String,
    pub health: WorkspaceHealth,
    pub indexed_files: usize,
    pub changed_files: usize,
}

#[derive(Debug, Clone)]
pub struct Workspace {
    snapshot: WorkspaceSnapshot,
}

impl Workspace {
    pub fn open(root: impl Into<PathBuf>) -> Self {
        let root = root.into();
        let display_name = root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("workspace")
            .to_owned();

        Self {
            snapshot: WorkspaceSnapshot {
                root,
                display_name,
                health: WorkspaceHealth::Initializing,
                indexed_files: 0,
                changed_files: 0,
            },
        }
    }

    pub fn current() -> std::io::Result<Self> {
        Ok(Self::open(std::env::current_dir()?))
    }

    pub fn mark_ready(&mut self) {
        self.snapshot.health = WorkspaceHealth::Healthy;
    }

    pub fn update_counts(&mut self, indexed_files: usize, changed_files: usize) {
        self.snapshot.indexed_files = indexed_files;
        self.snapshot.changed_files = changed_files;
    }

    pub fn snapshot(&self) -> &WorkspaceSnapshot {
        &self.snapshot
    }

    pub fn root(&self) -> &Path {
        &self.snapshot.root
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_display_name_from_root() {
        let workspace = Workspace::open("/tmp/yana-terminal");
        assert_eq!(workspace.snapshot().display_name, "yana-terminal");
    }

    #[test]
    fn transitions_to_healthy() {
        let mut workspace = Workspace::open(".");
        workspace.mark_ready();
        assert_eq!(workspace.snapshot().health, WorkspaceHealth::Healthy);
    }
}
