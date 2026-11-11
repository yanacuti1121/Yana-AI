// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

use crate::forge::{ActionKind, ActionRequest};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum PermissionLevel {
    ReadOnly,
    WorkspaceWrite,
    Execute,
    Dangerous,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GuardDecision {
    Allow,
    RequireApproval(String),
    Deny(String),
}

#[derive(Debug, Clone)]
pub struct Guard {
    permission: PermissionLevel,
    protected_paths: Vec<String>,
}

impl Guard {
    pub fn new(permission: PermissionLevel) -> Self {
        Self {
            permission,
            protected_paths: vec![
                ".git".into(),
                ".env".into(),
                "secrets".into(),
                "credentials".into(),
            ],
        }
    }

    pub fn permission(&self) -> PermissionLevel {
        self.permission
    }

    pub fn set_permission(&mut self, permission: PermissionLevel) {
        self.permission = permission;
    }

    pub fn protect(&mut self, path: impl Into<String>) {
        let path = path.into();
        if !self.protected_paths.contains(&path) {
            self.protected_paths.push(path);
        }
    }

    pub fn evaluate(&self, action: &ActionRequest) -> GuardDecision {
        if self.is_protected(&action.target) {
            return GuardDecision::Deny(format!(
                "target is protected by workspace policy: {}",
                action.target
            ));
        }

        match action.kind {
            ActionKind::Read | ActionKind::Search => GuardDecision::Allow,
            ActionKind::Create | ActionKind::Patch | ActionKind::Rename => {
                if self.permission >= PermissionLevel::WorkspaceWrite {
                    GuardDecision::RequireApproval("workspace mutation".into())
                } else {
                    GuardDecision::Deny("write permission is disabled".into())
                }
            }
            ActionKind::Run => {
                if self.permission >= PermissionLevel::Execute {
                    GuardDecision::RequireApproval("command execution".into())
                } else {
                    GuardDecision::Deny("execute permission is disabled".into())
                }
            }
            ActionKind::Git | ActionKind::Delete => {
                if self.permission >= PermissionLevel::Dangerous {
                    GuardDecision::RequireApproval("high-impact action".into())
                } else {
                    GuardDecision::Deny("dangerous permission is disabled".into())
                }
            }
        }
    }

    fn is_protected(&self, target: &str) -> bool {
        self.protected_paths.iter().any(|protected| {
            target == protected
                || target.starts_with(&format!("{protected}/"))
                || target.contains(&format!("/{protected}/"))
        })
    }
}

impl Default for Guard {
    fn default() -> Self {
        Self::new(PermissionLevel::ReadOnly)
    }
}

#[cfg(test)]
mod tests {
    use crate::forge::{ActionKind, ActionRequest, ActionStatus};

    use super::*;

    fn request(kind: ActionKind, target: &str) -> ActionRequest {
        ActionRequest {
            id: 1,
            kind,
            target: target.into(),
            reason: "test".into(),
            status: ActionStatus::Proposed,
        }
    }

    #[test]
    fn read_only_allows_read_and_denies_write() {
        let guard = Guard::default();
        assert_eq!(
            guard.evaluate(&request(ActionKind::Read, "src/lib.rs")),
            GuardDecision::Allow
        );
        assert!(matches!(
            guard.evaluate(&request(ActionKind::Patch, "src/lib.rs")),
            GuardDecision::Deny(_)
        ));
    }

    #[test]
    fn protected_paths_are_always_denied() {
        let guard = Guard::new(PermissionLevel::Dangerous);
        assert!(matches!(
            guard.evaluate(&request(ActionKind::Read, ".env")),
            GuardDecision::Deny(_)
        ));
    }
}
