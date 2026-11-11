// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Default)]
pub struct Atlas {
    modules: BTreeMap<String, BTreeSet<String>>,
}

impl Atlas {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_symbol(&mut self, module: impl Into<String>, symbol: impl Into<String>) {
        self.modules
            .entry(module.into())
            .or_default()
            .insert(symbol.into());
    }

    pub fn symbols_in(&self, module: &str) -> impl Iterator<Item = &str> {
        self.modules
            .get(module)
            .into_iter()
            .flat_map(|symbols| symbols.iter().map(String::as_str))
    }

    pub fn module_count(&self) -> usize {
        self.modules.len()
    }

    pub fn symbol_count(&self) -> usize {
        self.modules.values().map(BTreeSet::len).sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_unique_symbols() {
        let mut atlas = Atlas::new();
        atlas.record_symbol("ui", "draw");
        atlas.record_symbol("ui", "draw");
        atlas.record_symbol("ui", "theme");

        assert_eq!(atlas.module_count(), 1);
        assert_eq!(atlas.symbol_count(), 2);
    }
}
