//! yana-rt WASM library
//!
//! Exposes core guard logic as WebAssembly for use in browsers,
//! VS Code extensions, and other JS environments.
//!
//! Build: `wasm-pack build --target web --features wasm`

// Always compiled, no feature gate: pure command-string judgment, the
// single source of truth for `check_command`. Depends only on `regex`
// and `std::sync::LazyLock`, both WASM-safe — see the module's own doc
// comment. `main.rs`'s binary crate reaches this same file via
// `yana_rt::command_safety::check_command` (the same cross-crate pattern
// `flock_v1` below already established), so there is exactly one copy of
// this logic, not one per build target.
pub mod command_safety;

#[cfg(feature = "flock-v1")]
pub mod flock_v1;

#[cfg(feature = "wasm")]
mod wasm {
    use wasm_bindgen::prelude::*;

    // ── Exported functions ────────────────────────────────────────────────────

    /// Check whether a shell command is safe to execute.
    ///
    /// Thin wrapper over `crate::command_safety::check_command` — the same
    /// function the native CLI guard, `capability::command`, and MCP call.
    /// This file used to hand-maintain a separate 7-pattern regex list here
    /// that had already drifted from native guard (missing `git clean -f`,
    /// `TRUNCATE TABLE`, and inline-script-eval detection); there is now
    /// nothing left to drift, since both build targets call this one
    /// function.
    ///
    /// Input:  raw command string
    /// Output: JSON `{"allowed": bool, "reason": string | null}`
    ///
    /// ```js
    /// import init, { check_command } from './pkg/yana_rt.js';
    /// await init();
    /// const result = JSON.parse(check_command('rm -rf /'));
    /// // → { allowed: false, reason: "Blocked: 'rm -rf' is irreversible..." }
    /// ```
    #[wasm_bindgen]
    pub fn check_command(cmd: &str) -> String {
        match crate::command_safety::check_command(cmd) {
            Some(reason) => serde_json::json!({ "allowed": false, "reason": reason }).to_string(),
            None => serde_json::json!({ "allowed": true, "reason": null }).to_string(),
        }
    }

    /// Batch-check a JSON array of command strings.
    ///
    /// Input:  JSON string — array of command strings
    /// Output: JSON array of `{cmd, allowed, reason}` objects
    ///
    /// ```js
    /// const results = JSON.parse(check_commands('["ls", "rm -rf /"]'));
    /// ```
    #[wasm_bindgen]
    pub fn check_commands(cmds_json: &str) -> String {
        let cmds: Vec<String> = match serde_json::from_str(cmds_json) {
            Ok(v) => v,
            Err(e) => {
                return serde_json::json!({
                    "error": format!("invalid JSON: {e}")
                })
                .to_string()
            }
        };
        let results: Vec<serde_json::Value> = cmds
            .iter()
            .map(|cmd| match crate::command_safety::check_command(cmd) {
                Some(reason) => {
                    serde_json::json!({ "cmd": cmd, "allowed": false, "reason": reason })
                }
                None => serde_json::json!({ "cmd": cmd, "allowed": true, "reason": null }),
            })
            .collect();
        serde_json::to_string(&results).unwrap_or_default()
    }

    /// Returns library version string.
    #[wasm_bindgen]
    pub fn version() -> String {
        env!("CARGO_PKG_VERSION").to_string()
    }
}
