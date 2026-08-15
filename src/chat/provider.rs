//! Compatibility re-export (Phase 6, host-native-os program). The real
//! content moved to `crate::model::provider` — "model plane owns
//! provider/model abstractions, chat consumes model plane." Every
//! pre-existing internal caller (`chat::provider::ask_once`,
//! `crate::chat::try_select_provider`, `chat/tui/*`) keeps resolving
//! through this re-export unchanged; new code should reach these types
//! via `crate::model::provider` directly.

pub(crate) use crate::model::provider::*;
