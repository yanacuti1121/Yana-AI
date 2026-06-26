//! guard self-mod — quarantine writes to Yana AI's own safety surface.
//!
//! The gap blast-radius doesn't close
//! -----------------------------------
//! blast_radius catches BULK write/delete (>50 files, or any file in a
//! protected path via a *Bash* command). But an agent can still do:
//!
//!     Write("core/rules/00-meta.md", "...weakened rule...")
//!     str_replace_editor on gates/truth_gate.md
//!     Edit(".claude-plugin/hooks/hooks.json", ...)
//!
//! These are single-file writes via the Write/Edit/str_replace tools —
//! they never touch Bash, so blast_radius never sees them. And they target
//! exactly the files that define what Yana AI is allowed to do.
//!
//! What this guard does
//! --------------------
//! Reads a PreToolUse(Write|Edit|str_replace_based_edit) payload, extracts
//! the target path, and denies if it falls inside the protected safety
//! surface. Every deny is appended to a tamper ledger so you have an audit
//! trail of self-modification attempts.
//!
//! Honest scope: this is advisory (prompt-enforced hook). A fully
//! compromised agent that skips hooks entirely bypasses it. But it closes
//! the "one quiet str_replace weakens the gate" attack that is the most
//! likely real-world self-modification path.

use serde::Deserialize;
use std::io::Read;
use std::path::PathBuf;

// Re-use the same path-normalisation logic as blast_radius — repo-relative
// folding so absolute paths don't slip through.
use super::blast_paths::protected_hit;

/// Protected prefixes for *write* operations — stricter than blast_radius
/// because even a single-file write to these paths is dangerous.
fn write_protected() -> Vec<String> {
    let mut v = vec![
        // Core safety surface — rules, hooks, gates
        "core/rules".to_string(),
        "core/hooks".to_string(),
        "core/gates".to_string(),
        "gates".to_string(),
        // Hook registry — changing this rewires the entire guard stack
        ".claude-plugin/hooks/hooks.json".to_string(),
        ".claude-plugin".to_string(),
        // Git history
        ".git".to_string(),
        // L1 atomic memory — ground truth for the session
        "memory/L1_atomic".to_string(),
        // Evidence crypto — weakening this breaks receipt verification
        "src/evidence".to_string(),
        // The guards themselves
        "src/guard".to_string(),
    ];
    if let Ok(extra) = std::env::var("YANA_SELFMOD_PROTECTED") {
        v.extend(extra.split(':').filter(|s| !s.is_empty()).map(String::from));
    }
    v
}

/// Path to the tamper ledger. Kept outside the protected surface so the
/// guard can always write to it even if core/ is locked.
fn ledger_path() -> PathBuf {
    std::env::var("YANA_TAMPER_LEDGER")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("ledger/selfmod-tamper.log"))
}

// ── Hook envelope ─────────────────────────────────────────────────────────────

#[derive(Deserialize, Default)]
struct ToolInput {
    // Write / create_file tools use `path`
    path: Option<String>,
    // str_replace_based_edit uses `path` too, but some variants use `file_path`
    file_path: Option<String>,
    // Edit tool sometimes carries `target_file`
    target_file: Option<String>,
}

#[derive(Deserialize, Default)]
struct HookEvent {
    tool_name: Option<String>,
    #[serde(default)]
    tool_input: ToolInput,
}

fn deny_json(reason: &str, path: &str, tool: &str) -> i32 {
    let msg = format!(
        "Blocked self-modification: tool '{}' tried to write '{}'. {}",
        tool, path, reason
    );
    let out = serde_json::json!({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": msg
        }
    });
    println!("{out}");
    // Append to tamper ledger (best-effort — never fail the guard on I/O error)
    append_ledger(&msg);
    2
}

fn append_ledger(entry: &str) {
    use std::fs::OpenOptions;
    use std::io::Write;
    let path = ledger_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let ts = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ");
        let _ = writeln!(f, "{ts} {entry}");
    }
}

/// Extract the target path from any write-class tool input.
fn extract_path(input: &ToolInput) -> Option<String> {
    input
        .path
        .clone()
        .or_else(|| input.file_path.clone())
        .or_else(|| input.target_file.clone())
}

/// Is this tool name a write/edit-class tool?
fn is_write_tool(name: &str) -> bool {
    matches!(
        name,
        "write_file"
            | "Write"
            | "create_file"
            | "edit_file"
            | "Edit"
            | "str_replace_based_edit"
            | "str_replace_editor"
            | "overwrite_file"
            | "patch_file"
    )
}

pub fn cmd_self_mod() -> i32 {
    let mut buf = String::new();
    if std::io::stdin().read_to_string(&mut buf).is_err() {
        // Can't read payload — fail closed
        let out = serde_json::json!({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason":
                    "self-mod guard: could not read hook payload. Failing closed."
            }
        });
        println!("{out}");
        return 2;
    }

    let event: HookEvent = serde_json::from_str(&buf).unwrap_or_default();
    let tool = event.tool_name.as_deref().unwrap_or("");

    // Only guard write-class tools — pass everything else straight through
    if !is_write_tool(tool) {
        return 0;
    }

    let target = match extract_path(&event.tool_input) {
        Some(p) if !p.is_empty() => p,
        _ => return 0, // no path in payload — not our concern
    };

    let protected = write_protected();
    if let Some(hit) = protected_hit(&target, &protected) {
        return deny_json(
            &format!(
                "Path '{hit}' is part of Yana AI's safety surface. \
                 Direct edits to rules, hooks, gates, guards, or the hook registry \
                 must go through a human-reviewed PR, not an agent write tool. \
                 Use `git diff` + PR if this change is intentional."
            ),
            &target,
            tool,
        );
    }

    0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_payload(tool: &str, path: &str) -> String {
        serde_json::json!({
            "tool_name": tool,
            "tool_input": { "path": path }
        })
        .to_string()
    }

    fn run(payload: &str) -> i32 {
        // parse directly without going through stdin in tests
        let event: HookEvent = serde_json::from_str(payload).unwrap_or_default();
        let tool = event.tool_name.as_deref().unwrap_or("");
        if !is_write_tool(tool) {
            return 0;
        }
        let target = match extract_path(&event.tool_input) {
            Some(p) if !p.is_empty() => p,
            _ => return 0,
        };
        let protected = write_protected();
        if protected_hit(&target, &protected).is_some() {
            return 2;
        }
        0
    }

    #[test]
    fn blocks_rule_edit() {
        assert_eq!(run(&make_payload("Write", "core/rules/00-meta.md")), 2);
    }

    #[test]
    fn blocks_gate_edit() {
        assert_eq!(run(&make_payload("str_replace_editor", "gates/truth_gate.md")), 2);
    }

    #[test]
    fn blocks_hook_registry_edit() {
        assert_eq!(
            run(&make_payload("Edit", ".claude-plugin/hooks/hooks.json")),
            2
        );
    }

    #[test]
    fn blocks_guard_source_edit() {
        assert_eq!(
            run(&make_payload("write_file", "src/guard/blast_radius.rs")),
            2
        );
    }

    #[test]
    fn allows_normal_source_file() {
        assert_eq!(run(&make_payload("Write", "src/main.rs")), 0);
    }

    #[test]
    fn allows_docs_edit() {
        assert_eq!(run(&make_payload("Edit", "docs/README.md")), 0);
    }

    #[test]
    fn read_tool_always_passes() {
        assert_eq!(run(&make_payload("Read", "core/rules/00-meta.md")), 0);
    }

    #[test]
    fn blocks_absolute_path_to_rules() {
        std::env::set_var("YANA_REPO_ROOT", "/workspaces/Yana-AI");
        let result = run(&make_payload(
            "Write",
            "/workspaces/Yana-AI/core/rules/00-meta.md",
        ));
        std::env::remove_var("YANA_REPO_ROOT");
        assert_eq!(result, 2);
    }
}
