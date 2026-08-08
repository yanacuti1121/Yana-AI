//! yana-rt WASM library
//!
//! Exposes core guard logic as WebAssembly for use in browsers,
//! VS Code extensions, and other JS environments.
//!
//! Build: `wasm-pack build --target web --features wasm`

#[cfg(feature = "flock-v1")]
pub mod flock_v1;

#[cfg(feature = "wasm")]
mod wasm {
    use wasm_bindgen::prelude::*;

    // ── Destructive command patterns (mirrors guard/mod.rs) ──────────────────

    struct Pattern {
        re: regex::Regex,
        reason: &'static str,
    }

    fn destructive_patterns() -> Vec<Pattern> {
        let rules: &[(&str, &str)] = &[
            (
                r"(?i)(^|[;&|])\s*rm\s+-[a-zA-Z]*r[a-zA-Z]*f|rm\s+-[a-zA-Z]*f[a-zA-Z]*r",
                "Blocked: 'rm -rf' is irreversible. Use targeted 'rm' with explicit paths.",
            ),
            (
                r"(?i)git\s+push\s+.*--force|git\s+push\s+.*-f\b",
                "Blocked: force-push can destroy shared history. Requires explicit approval.",
            ),
            (
                r"(?i)git\s+reset\s+--hard",
                "Blocked: 'git reset --hard' discards all uncommitted changes permanently.",
            ),
            (
                r"(?i)(curl|wget)\s+.*\|\s*(ba)?sh",
                "Blocked: pipe-to-shell is a supply chain attack vector.",
            ),
            (
                r"(?i)DROP\s+(TABLE|DATABASE|SCHEMA)\s+",
                "Blocked: DDL DROP is irreversible without a prior backup.",
            ),
            (
                r"(?i)npm\s+publish\b",
                "Blocked: 'npm publish' requires explicit human gate approval.",
            ),
            (
                r"(?i)git\s+push\s+.*origin\s+main|git\s+push\s+.*origin\s+master",
                "Blocked: push to main/master requires explicit authorization.",
            ),
        ];
        rules
            .iter()
            .filter_map(|(pat, reason)| {
                regex::Regex::new(pat).ok().map(|re| Pattern { re, reason })
            })
            .collect()
    }

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
        for p in &destructive_patterns() {
            if p.re.is_match(cmd) {
                return serde_json::json!({
                    "allowed": false,
                    "reason": p.reason
                })
                .to_string();
            }
        }
        serde_json::json!({ "allowed": true, "reason": null }).to_string()
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
                for p in &destructive_patterns() {
                    if p.re.is_match(cmd) {
                        return serde_json::json!({
                            "cmd": cmd,
                            "allowed": false,
                            "reason": p.reason
                        });
                    }
                }
                serde_json::json!({ "cmd": cmd, "allowed": true, "reason": null })
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
