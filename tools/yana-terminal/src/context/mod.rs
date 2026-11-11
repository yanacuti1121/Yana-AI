// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextItem {
    pub source: String,
    pub content: String,
    pub priority: u8,
}

#[derive(Debug, Clone)]
pub struct Context {
    budget: usize,
    items: Vec<ContextItem>,
    locked: bool,
}

impl Context {
    pub fn new(budget: usize) -> Self {
        Self {
            budget: budget.max(1),
            items: Vec::new(),
            locked: false,
        }
    }

    pub fn lock(&mut self) {
        self.locked = true;
    }

    pub fn unlock(&mut self) {
        self.locked = false;
    }

    pub fn is_locked(&self) -> bool {
        self.locked
    }

    pub fn add(&mut self, item: ContextItem) -> Result<(), &'static str> {
        if self.locked {
            return Err("context scope is locked");
        }
        self.items.push(item);
        self.items
            .sort_by(|left, right| right.priority.cmp(&left.priority));
        self.items.truncate(self.budget);
        Ok(())
    }

    pub fn items(&self) -> &[ContextItem] {
        &self.items
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_highest_priority_items() {
        let mut context = Context::new(2);
        for (source, priority) in [("low", 10), ("high", 90), ("mid", 50)] {
            context
                .add(ContextItem {
                    source: source.into(),
                    content: source.into(),
                    priority,
                })
                .unwrap();
        }

        assert_eq!(context.items()[0].source, "high");
        assert_eq!(context.items()[1].source, "mid");
    }

    #[test]
    fn rejects_expansion_when_locked() {
        let mut context = Context::new(2);
        context.lock();
        assert!(context
            .add(ContextItem {
                source: "file".into(),
                content: "content".into(),
                priority: 50,
            })
            .is_err());
    }
}
