// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

use std::path::{Component, Path};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActionKind {
    Read,
    Search,
    Create,
    Patch,
    Rename,
    Delete,
    Run,
    Git,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActionStatus {
    Proposed,
    Approved,
    Completed,
    Rejected,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActionRequest {
    pub id: u64,
    pub kind: ActionKind,
    pub target: String,
    pub reason: String,
    pub status: ActionStatus,
}

#[derive(Debug, Default)]
pub struct Forge {
    next_id: u64,
    actions: Vec<ActionRequest>,
}

impl Forge {
    pub fn new() -> Self {
        Self {
            next_id: 1,
            actions: Vec::new(),
        }
    }

    pub fn propose(
        &mut self,
        kind: ActionKind,
        target: impl Into<String>,
        reason: impl Into<String>,
    ) -> Result<u64, ForgeError> {
        let target = target.into();
        validate_target(kind, &target)?;

        let id = self.next_id;
        self.next_id += 1;
        self.actions.push(ActionRequest {
            id,
            kind,
            target,
            reason: reason.into(),
            status: ActionStatus::Proposed,
        });
        Ok(id)
    }

    pub fn approve(&mut self, id: u64) -> Result<(), ForgeError> {
        self.set_status(id, ActionStatus::Approved)
    }

    pub fn complete(&mut self, id: u64) -> Result<(), ForgeError> {
        let action = self.action(id).ok_or(ForgeError::UnknownAction(id))?;
        if action.status != ActionStatus::Approved {
            return Err(ForgeError::InvalidTransition {
                id,
                from: action.status,
                to: ActionStatus::Completed,
            });
        }
        self.set_status(id, ActionStatus::Completed)
    }

    pub fn reject(&mut self, id: u64) -> Result<(), ForgeError> {
        self.set_status(id, ActionStatus::Rejected)
    }

    pub fn fail(&mut self, id: u64) -> Result<(), ForgeError> {
        self.set_status(id, ActionStatus::Failed)
    }

    pub fn action(&self, id: u64) -> Option<&ActionRequest> {
        self.actions.iter().find(|action| action.id == id)
    }

    pub fn actions(&self) -> &[ActionRequest] {
        &self.actions
    }

    pub fn pending(&self) -> impl Iterator<Item = &ActionRequest> {
        self.actions
            .iter()
            .filter(|action| action.status == ActionStatus::Proposed)
    }

    fn set_status(&mut self, id: u64, status: ActionStatus) -> Result<(), ForgeError> {
        let action = self
            .actions
            .iter_mut()
            .find(|action| action.id == id)
            .ok_or(ForgeError::UnknownAction(id))?;
        action.status = status;
        Ok(())
    }
}

fn validate_target(kind: ActionKind, target: &str) -> Result<(), ForgeError> {
    if target.trim().is_empty() {
        return Err(ForgeError::EmptyTarget);
    }

    if matches!(kind, ActionKind::Run | ActionKind::Git) {
        return Ok(());
    }

    let path = Path::new(target);
    if path.is_absolute() {
        return Err(ForgeError::AbsolutePath(target.to_owned()));
    }

    if path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(ForgeError::EscapesWorkspace(target.to_owned()));
    }

    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ForgeError {
    EmptyTarget,
    AbsolutePath(String),
    EscapesWorkspace(String),
    UnknownAction(u64),
    InvalidTransition {
        id: u64,
        from: ActionStatus,
        to: ActionStatus,
    },
}

impl std::fmt::Display for ForgeError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmptyTarget => write!(formatter, "action target cannot be empty"),
            Self::AbsolutePath(path) => write!(formatter, "absolute path is not allowed: {path}"),
            Self::EscapesWorkspace(path) => {
                write!(formatter, "path escapes the workspace boundary: {path}")
            }
            Self::UnknownAction(id) => write!(formatter, "unknown action id: {id}"),
            Self::InvalidTransition { id, from, to } => {
                write!(
                    formatter,
                    "invalid action transition for {id}: {from:?} -> {to:?}"
                )
            }
        }
    }
}

impl std::error::Error for ForgeError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_paths_outside_workspace() {
        let mut forge = Forge::new();
        let result = forge.propose(ActionKind::Read, "../secret", "inspect");
        assert!(matches!(result, Err(ForgeError::EscapesWorkspace(_))));
    }

    #[test]
    fn completed_action_must_be_approved_first() {
        let mut forge = Forge::new();
        let id = forge
            .propose(ActionKind::Patch, "src/ui/mod.rs", "apply Sky Lake")
            .unwrap();
        assert!(forge.complete(id).is_err());
        forge.approve(id).unwrap();
        forge.complete(id).unwrap();
        assert_eq!(forge.action(id).unwrap().status, ActionStatus::Completed);
    }
}
