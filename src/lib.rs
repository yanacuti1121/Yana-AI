//! yana-rt WASM library
//!
//! Exposes core guard logic as WebAssembly for use in browsers,
//! VS Code extensions, and other JS environments.
//!
//! Build: `wasm-pack build --target web --features wasm`

#[cfg(feature = "flock-v1")]
pub mod flock_v1;

#[cfg(feature = "wasm")]
#[path = "guard/portable.rs"]
mod portable_guard;

#[cfg(feature = "wasm")]
mod wasm {
    use super::portable_guard;
    use wasm_bindgen::prelude::*;

    // ── Exported functions ────────────────────────────────────────────────────

    /// Check whether a shell command is safe to execute.
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
        let reason = portable_guard::check_command(cmd);
        serde_json::json!({ "allowed": reason.is_none(), "reason": reason }).to_string()
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
            .map(|cmd| {
                let reason = portable_guard::check_command(cmd);
                serde_json::json!({ "cmd": cmd, "allowed": reason.is_none(), "reason": reason })
            })
            .collect();
        serde_json::to_string(&results).unwrap_or_default()
    }

    /// Returns library version string.
    #[wasm_bindgen]
    pub fn version() -> String {
        env!("CARGO_PKG_VERSION").to_string()
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn wasm_json_surface_matches_portable_guard_source() {
            for command in [
                "ls -la",
                "rm --recursive --force /tmp/x",
                "git -C /tmp push --force origin topic",
                "git reset --hard",
                "DROP TABLE users",
                "bash -c 'rm -rf /tmp/x'",
                "echo tiếng Việt",
            ] {
                let value: serde_json::Value =
                    serde_json::from_str(&check_command(command)).unwrap();
                let reason = portable_guard::check_command(command);
                assert_eq!(value["allowed"], reason.is_none());
                assert_eq!(value["reason"].as_str(), reason);
            }
        }
    }
}
