//! Which AI coding engines are running on this machine, found by the name of their program.
//!
//! Matching is case-sensitive on purpose: the desktop app `Claude` and the helper
//! `Codex (Service)` are not coding sessions. This says a program is *alive*, not that it is
//! busy; the answer for "busy" has to come from an engine's own hooks.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RunningEngine {
    pub name: &'static str,
    pub count: usize,
}

struct Rule {
    name: &'static str,
    matches: fn(path: &str, base: &str) -> bool,
}

/// Only Claude Code, Codex, Antigravity and Yana Studio were seen on a real machine when these
/// rules were written. Cursor, Gemini CLI and OpenCode are the usual program names, not yet checked.
const RULES: &[Rule] = &[
    Rule { name: "Claude Code", matches: |_, base| base == "claude" || base == "claude.exe" },
    Rule { name: "Codex", matches: |_, base| base == "codex" },
    Rule {
        name: "Antigravity",
        matches: |path, base| base == "agy" || path.ends_with("Antigravity IDE.app/Contents/MacOS/Electron"),
    },
    Rule { name: "Cursor", matches: |path, _| path.ends_with("Cursor.app/Contents/MacOS/Cursor") },
    Rule { name: "Gemini CLI", matches: |_, base| base == "gemini" },
    Rule { name: "OpenCode", matches: |_, base| base == "opencode" },
    // The main program of the app has been named both `Yana` and `Yana Studio`; helpers sit in Frameworks.
    Rule { name: "Yana Studio", matches: |path, _| path.contains("Yana Studio.app/Contents/MacOS/") },
];

/// Counts engines in a list of program paths (one per process), in the fixed order of `RULES`.
pub fn tally<I, S>(paths: I) -> Vec<RunningEngine>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut counts = vec![0usize; RULES.len()];
    for raw in paths {
        let path = raw.as_ref().trim();
        let base = path.rsplit('/').next().unwrap_or(path);
        for (slot, rule) in counts.iter_mut().zip(RULES) {
            if (rule.matches)(path, base) {
                *slot += 1;
            }
        }
    }
    RULES
        .iter()
        .zip(counts)
        .filter(|(_, count)| *count > 0)
        .map(|(rule, count)| RunningEngine { name: rule.name, count })
        .collect()
}

/// Reads the process list. `None` means it could not be read, which is different from
/// "nothing is running" and must not be shown as calm.
#[cfg(unix)]
pub fn scan() -> Option<Vec<RunningEngine>> {
    let output = std::process::Command::new("ps").args(["-axo", "comm="]).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    Some(tally(text.lines()))
}

#[cfg(not(unix))]
pub fn scan() -> Option<Vec<RunningEngine>> {
    None
}
