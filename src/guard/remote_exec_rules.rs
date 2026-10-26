//! Signal helpers for `remote_exec`: which commands undo an encoding, and which `chmod` modes are world-writable.

use super::parse::Stage;
use super::{base, short_flags};

/// Commands that undo an encoding or compression.
const TRANSFORMS: [&str; 6] = ["rev", "gunzip", "zcat", "gzcat", "bunzip2", "unxz"];
/// Length of a `\xHH` or `\NNN` escape sequence as written in text (backslash, then three characters).
const ESCAPE_LEN: usize = 4;
/// The sticky, world-writable mode every system `/tmp` has; the one `7xx`-ending mode that is not a finding.
const STICKY_TMP_MODE: &str = "1777";
/// The write bit of an octal permission digit.
const OTHERS_WRITE_BIT: u8 = 2;

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
        "gzip" | "bzip2" | "xz" | "zstd" | "lzma" | "uncompress" => flag(&['d']),
        "tr" => args.iter().any(|a| a.contains("n-za-m")), // rot13
        "printf" | "echo" => stage.ansi_c || args.iter().any(|a| has_escape(a)),
        other => TRANSFORMS.contains(&other),
    }
}

/// The mode gives the `others` class write access. Only modes that name that class explicitly count in
/// symbolic form: without a class (`+w`, `=rwx`) the shell applies the umask, so a normal system does not
/// make the file world-writable.
pub(super) fn mode_is_world_writable(mode: &str) -> bool {
    if let Some(last) = mode
        .bytes()
        .last()
        .filter(|_| mode.bytes().all(|b| (b'0'..=b'7').contains(&b)))
    {
        return (last - b'0') & OTHERS_WRITE_BIT != 0 && mode != STICKY_TMP_MODE;
    }
    mode.split(',').any(|clause| {
        let Some(split) = clause.find(['+', '=']) else {
            return false;
        };
        let (who, perms) = (&clause[..split], &clause[split + 1..]);
        who.contains(['a', 'o']) && perms.contains('w')
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
