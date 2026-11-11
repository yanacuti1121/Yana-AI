// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionSnapshot {
    pub id: String,
    pub title: String,
    pub workspace: String,
    pub active_scope: Vec<String>,
    pub pending_actions: Vec<u64>,
    pub created_at: u64,
}

#[derive(Debug, Default)]
pub struct Harbor {
    snapshots: BTreeMap<String, SessionSnapshot>,
    active: Option<String>,
}

impl Harbor {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn dock(&mut self, snapshot: SessionSnapshot) {
        self.active = Some(snapshot.id.clone());
        self.snapshots.insert(snapshot.id.clone(), snapshot);
    }

    pub fn resume(&mut self, id: &str) -> Result<&SessionSnapshot, HarborError> {
        if !self.snapshots.contains_key(id) {
            return Err(HarborError::UnknownSession(id.to_owned()));
        }
        self.active = Some(id.to_owned());
        Ok(self.snapshots.get(id).expect("session checked above"))
    }

    pub fn active(&self) -> Option<&SessionSnapshot> {
        self.active.as_ref().and_then(|id| self.snapshots.get(id))
    }

    pub fn snapshots(&self) -> impl Iterator<Item = &SessionSnapshot> {
        self.snapshots.values()
    }

    pub fn remove(&mut self, id: &str) -> Option<SessionSnapshot> {
        if self.active.as_deref() == Some(id) {
            self.active = None;
        }
        self.snapshots.remove(id)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HarborError {
    UnknownSession(String),
}

impl std::fmt::Display for HarborError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownSession(id) => write!(formatter, "unknown session: {id}"),
        }
    }
}

impl std::error::Error for HarborError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_can_be_resumed() {
        let mut harbor = Harbor::new();
        harbor.dock(SessionSnapshot {
            id: "session-1".into(),
            title: "Sky Lake UI".into(),
            workspace: "Yana-AI".into(),
            active_scope: vec!["src/ui/mod.rs".into()],
            pending_actions: vec![7],
            created_at: 1,
        });

        let resumed = harbor.resume("session-1").unwrap();
        assert_eq!(resumed.title, "Sky Lake UI");
        assert_eq!(harbor.active().unwrap().id, "session-1");
    }
}
