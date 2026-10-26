//! Signal helpers for `remote_exec`: which commands undo an encoding, and which `chmod` modes are world-writable.

use super::parse::Stage;
use super::{base, short_flags};

/// Commands that undo an encoding or compression.
const TRANSFORMS: [&str; 6] = ["rev", "gunzip", "zcat", "gzcat", "bunzip2", "unxz"];
/// Length of a `\xHH` or `\NNN` escape sequence as written in text (backslash, then three characters).
const ESCAPE_LEN: usize = 4;
/// The sticky, world-writable mode every system `/tmp` has; the one `7xx`-ending mode that is not a finding.
const STICKY_TMP_MODE: &str = "1777";
/// Octal digits that give every user read, write and execute.
const WORLD_RWX_SUFFIX: &str = "777";

fn has_escape(word: &str) -> bool {
    word.as_bytes().windows(ESCAPE_LEN).any(|w| {
        w[0] == b'\\'
            && ((w[1] == b'x' && w[2].is_ascii_hexdigit() && w[3].is_ascii_hexdigit())
                || w[1..].iter().all(|b| (b'0'..=b'7').contains(b)))
    })
}

pub(super) fn decodes(stage: &Stage) -> bool {
    let Some((word, args)) = stage.command() else {
        return false;
    };
    let name = base(word);
    let flag = |letters: &[char]| {
        args.iter()
            .any(|a| short_flags(a).is_some_and(|f| f.contains(letters)) || a == "--decode")
    };
    match name {
        "base64" | "base32" => flag(&['d']),
        "xxd" => flag(&['r']),
        "openssl" => {
            args.iter().any(|a| a == "enc" || a == "base64") && args.iter().any(|a| a == "-d")
        }
        "printf" | "echo" => stage.ansi_c || args.iter().any(|a| has_escape(a)),
        other => TRANSFORMS.contains(&other),
    }
}

/// Only modes that name the `others` class explicitly count: without a class (`+rwx`, `=rwx`) the shell
/// applies the umask, so the result is not world-writable on a normal system.
pub(super) fn mode_is_world_writable(mode: &str) -> bool {
    if !mode.is_empty() && mode.bytes().all(|b| (b'0'..=b'7').contains(&b)) {
        let digits = mode.trim_start_matches('0');
        return digits.len() >= WORLD_RWX_SUFFIX.len()
            && digits.ends_with(WORLD_RWX_SUFFIX)
            && digits != STICKY_TMP_MODE;
    }
    mode.split(',').any(|clause| {
        let Some(split) = clause.find(['+', '=']) else {
            return false;
        };
        let (who, perms) = (&clause[..split], &clause[split + 1..]);
        who.contains(['a', 'o']) && ['r', 'w', 'x'].iter().all(|p| perms.contains(*p))
    })
}

/// `chmod [options] MODE FILE...`: the first word that is not an option is the mode.
pub(super) fn world_writable(stage: &Stage) -> bool {
    stage.command().is_some_and(|(word, args)| {
        base(word) == "chmod"
            && args
                .iter()
                .find(|a| !a.starts_with('-'))
                .is_some_and(|mode| mode_is_world_writable(mode))
    })
}
