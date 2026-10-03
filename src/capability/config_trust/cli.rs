//! `yana-rt trust ...`: the human-facing half of the trust store.

use super::*;
use crate::capability::untrusted::is_invisible_format_char;
use anyhow::{bail, Context, Result};
use std::io::{BufRead, IsTerminal, Write};

/// Most of the file shown for review. A longer file is refused rather than shown cut off.
pub(super) const MAX_REVIEW_BYTES: usize = 8 * 1024;

fn parse_kind(text: &str) -> Result<ConfigKind> {
    ConfigKind::parse(text).with_context(|| format!("unknown configuration {text:?}; use web-search or mcp-servers"))
}

/// Control, invisible and direction-changing characters shown as `?`: what is
/// printed must neither rewrite the terminal nor reorder or hide what a person reads.
pub(super) fn printable(text: &str) -> String {
    text.chars().map(|c| if (c.is_control() && c != '\n') || is_invisible_format_char(c) { '?' } else { c }).collect()
}

fn project_root() -> Result<PathBuf> {
    std::env::current_dir().context("cannot resolve project root")
}

pub fn cmd_trust_status() -> Result<()> {
    let root = project_root()?;
    for kind in ConfigKind::ALL {
        let state = match require(&root, kind) {
            Ok(()) => "trusted".to_string(),
            Err(CapabilityError::Unsupported { .. }) => "not present".to_string(),
            Err(error) => format!("NOT trusted: {error}"),
        };
        println!("{:<12} {state}", kind.label());
    }
    Ok(())
}

/// What a person is shown, and the hash of exactly those bytes (from one read).
pub(super) fn review_text(root: &Path, kind: ConfigKind) -> Result<(String, String)> {
    let (bytes, hash) = read_config(root, kind)?;
    if bytes.len() > MAX_REVIEW_BYTES {
        bail!("{} is larger than {MAX_REVIEW_BYTES} bytes; it is too long to review here", kind.file_name());
    }
    let text = printable(&String::from_utf8_lossy(&bytes));
    Ok((format!("{}:\n{text}\n\nsha256 {hash}", kind.path(root).display()), hash))
}

pub fn cmd_trust_show(kind: &str) -> Result<()> {
    println!("{}", review_text(&project_root()?, parse_kind(kind)?)?.0);
    Ok(())
}

/// The confirmation itself, with its input and output passed in so it can be tested.
/// Refuses unless a person is at a terminal and types `yes`. What is recorded is the
/// hash of the bytes that were shown: a file rewritten while the person was reading is refused.
pub fn confirm_and_allow(
    store: &Path,
    root: &Path,
    kind: ConfigKind,
    interactive: bool,
    input: &mut dyn BufRead,
    output: &mut dyn Write,
) -> Result<bool> {
    if !interactive {
        bail!("confirming a configuration must be done by a person in a terminal (stdin is not one)");
    }
    let (shown, hash) = review_text(root, kind)?;
    writeln!(output, "{shown}\n")?;
    write!(output, "Trust this exact content for {}? Type 'yes' to confirm: ", kind.file_name())?;
    output.flush()?;
    let mut answer = String::new();
    input.read_line(&mut answer)?;
    if answer.trim() != "yes" {
        bail!("not confirmed; nothing was recorded");
    }
    Ok(allow_hash_in(store, root, kind, &hash)?)
}

/// Defence in depth: a command the agent started carries the marker, and confirming is for a person.
pub(super) fn refuse_inside_agent_command(marker_set: bool) -> Result<()> {
    if marker_set {
        bail!("this was started by an agent's command; a person must run `yana-rt trust allow` in their own terminal");
    }
    Ok(())
}

pub fn cmd_trust_allow(kind: &str) -> Result<()> {
    refuse_inside_agent_command(std::env::var_os(crate::capability::command::AGENT_CHILD_ENV).is_some())?;
    let (root, kind) = (project_root()?, parse_kind(kind)?);
    let store = store_dir()?;
    let interactive = std::io::stdin().is_terminal() && std::io::stdout().is_terminal();
    let changed = confirm_and_allow(&store, &root, kind, interactive, &mut std::io::stdin().lock(), &mut std::io::stdout())?;
    println!("\nTrusted. {}", if changed { "Leases for this capability were revoked; grant them again if needed." } else { "Content was already trusted." });
    Ok(())
}

pub fn cmd_trust_revoke(kind: &str) -> Result<()> {
    let (root, kind) = (project_root()?, parse_kind(kind)?);
    revoke_in(&store_dir()?, &root, kind)?;
    println!("Trust for {} revoked (and its leases).", kind.file_name());
    Ok(())
}
