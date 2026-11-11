// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Attachment {
    pub path: String,
}

#[derive(Debug, Default)]
pub struct AttachmentEngine {
    pending: Vec<Attachment>,
}

impl AttachmentEngine {
    pub fn attach(&mut self, path: &str) -> Result<(), &'static str> {
        let path = path.trim();
        if path.is_empty() {
            return Err("attachment path is empty");
        }
        if path.starts_with('/') || path.split('/').any(|part| part == "..") {
            return Err("attachment must be workspace-relative");
        }
        if !self.pending.iter().any(|item| item.path == path) {
            self.pending.push(Attachment { path: path.into() });
        }
        Ok(())
    }

    pub fn pending(&self) -> &[Attachment] {
        &self.pending
    }
}
