//! RAII terminal-mode guard for the chat TUI.
//!
//! Leans on ratatui's own `try_init()`/`restore()` rather than hand-rolling
//! raw-mode/alternate-screen calls. Crucially, `ratatui::try_init()`
//! already installs a panic hook that wraps *whatever hook is currently
//! installed* (via `std::panic::take_hook()` at call time) with "restore
//! the terminal, then call the original hook." `chat::dispatch()` always
//! runs after `main.rs` installs its own panic hook — which unconditionally
//! calls `std::process::exit()` on every panic. A pure `Drop`-based guard
//! cannot save the terminal from that on its own: `exit()` terminates the
//! process without running unwind-driven `Drop`s for frames still on the
//! stack, so `Drop::drop` would never be reached. Ratatui's wrapping fires
//! *first* (it becomes the active hook, and calls the wrapped one itself),
//! restoring the terminal before `main.rs`'s hook gets to exit the process.
//! This closes the "panic mid-session leaves the terminal hỏng" gap without
//! this module needing to touch `main.rs` at all.

use anyhow::{Context, Result};
use ratatui::DefaultTerminal;
use std::ops::{Deref, DerefMut};

pub struct TerminalGuard {
    terminal: DefaultTerminal,
}

impl TerminalGuard {
    /// Enter raw mode + alternate screen via `ratatui::try_init()`. On
    /// non-TTY stdout (piped/CI usage), this fails fast — surfaced here as
    /// a clear "chat requires an interactive terminal" message rather than
    /// a raw crossterm/ratatui error. `try_init()` itself doesn't guarantee
    /// raw mode is disabled again if it fails partway (raw mode succeeds,
    /// then entering the alternate screen doesn't) — a rare case, but a
    /// defensive `ratatui::restore()` call on any `Err` closes it anyway,
    /// since restore is idempotent and harmless even when nothing was
    /// actually engaged.
    pub fn new() -> Result<Self> {
        match ratatui::try_init() {
            Ok(terminal) => Ok(Self { terminal }),
            Err(e) => {
                ratatui::restore();
                Err(e).context("chat requires an interactive terminal")
            }
        }
    }
}

impl Deref for TerminalGuard {
    type Target = DefaultTerminal;
    fn deref(&self) -> &DefaultTerminal {
        &self.terminal
    }
}

impl DerefMut for TerminalGuard {
    fn deref_mut(&mut self) -> &mut DefaultTerminal {
        &mut self.terminal
    }
}

impl Drop for TerminalGuard {
    fn drop(&mut self) {
        ratatui::restore();
    }
}
