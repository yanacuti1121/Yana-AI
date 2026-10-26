//! What a stage does with its input: shells and interpreters that read a program from stdin, and the
//! inline scripts a command hands to a shell. Split out of `remote_exec` to keep each file small.

use super::parse::Stage;
use super::{base, is_lang, is_shell, name_of, short_flags};

/// Flags that make an interpreter run text from its command line instead of reading stdin.
const INLINE_FLAGS: [&str; 8] = [
    "-c", "-e", "-m", "-p", "-r", "--eval", "--print", "-command",
];

/// Interpreter options that take a value, so the next word is not a script path.
const LANG_VALUED_FLAGS: [&str; 4] = ["-w", "-x", "--require", "--import"];

/// Script paths that are the program's own standard input.
const STDIN_PATHS: [&str; 4] = [
    "/dev/stdin",
    "/dev/fd/0",
    "/proc/self/fd/0",
    "/proc/self/fd/0/",
];

/// Words in an interpreter's inline script that read standard input.
const STDIN_WORDS: [&str; 8] = [
    "stdin", "gets", "readline", "argf", "<>", "readfile", "input(", "fgets",
];

/// Words in an inline script that run text as code.
const EXEC_WORDS: [&str; 7] = [
    "exec", "eval", "system", "popen", "spawn", "compile", "source",
];

/// `deno run -` and `bun run -` start with a subcommand.
const RUN_SUBCOMMAND: &str = "run";

fn is_inline_flag(name: &str, arg: &str) -> bool {
    INLINE_FLAGS.contains(&arg)
        || (is_shell(name) || name == "su") && short_flags(arg).is_some_and(|f| f.contains('c'))
}

fn shell_reads_stdin(args: &[String]) -> bool {
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        if matches!(arg.as_str(), "-s" | "--" | "-") {
            return true;
        }
        if !arg.starts_with('-') && !arg.starts_with('+') {
            return STDIN_PATHS.contains(&arg.as_str()); // a script path: stdin is data, unless the path is stdin
        }
        let plus_option = arg.strip_prefix('+').filter(|f| !f.is_empty());
        match short_flags(arg).or(plus_option) {
            Some(flags) if flags.contains('c') && arg.starts_with('-') => return false, // `-c`, `-lc`: the program is the next argument
            Some(flags) if flags.ends_with('o') => {
                args.next(); // `-o pipefail`, `-euo pipefail`: the next word belongs to the option
            }
            _ => {}
        }
        if arg == "--rcfile" || arg == "--init-file" {
            args.next();
        }
    }
    true
}

fn lang_reads_stdin(name: &str, args: &[String]) -> bool {
    let mut args = args.iter().peekable();
    if matches!(name, "deno" | "bun") && args.peek().is_some_and(|a| a.as_str() == RUN_SUBCOMMAND) {
        args.next();
    }
    while let Some(arg) = args.next() {
        if arg == "-" {
            return true;
        }
        if STDIN_PATHS.contains(&arg.as_str()) {
            return true;
        }
        if !arg.starts_with('-') || INLINE_FLAGS.contains(&arg.as_str()) {
            return false; // a script path, or a program on the command line
        }
        if LANG_VALUED_FLAGS.contains(&arg.as_str()) {
            args.next();
        }
    }
    true
}

/// The stage runs a program that arrives on stdin: `bash`, `sh -s -- --flag`, `python3 -`, `node`.
pub(super) fn reads_program_from_stdin(stage: &Stage) -> bool {
    let Some((word, args)) = stage.command() else {
        return false;
    };
    let name = base(word);
    if is_shell(name) {
        shell_reads_stdin(args)
    } else {
        is_lang(name) && lang_reads_stdin(name, args)
    }
}

/// Texts this stage hands to a shell: `eval ...`, `sh -c '...'` at any position (so `docker exec c sh -c ...`
/// and `sudo su -c ...` are found) and the remote command of `ssh host '...'`.
pub(super) fn inline_scripts(stage: &Stage) -> Vec<String> {
    let words = stage.words();
    let mut found = Vec::new();
    for (at, word) in words.iter().enumerate() {
        let name = base(word);
        let rest = &words[at + 1..];
        if name == "eval" {
            found.push(rest.join(" "));
        } else if is_shell(name) || is_lang(name) || name == "su" {
            if let Some(flag) = rest.iter().position(|a| is_inline_flag(name, a)) {
                // `-c -- 'cmd'`, `-c -x 'cmd'`: options may sit between the flag and the script
                let script = rest[flag + 1..].iter().find(|a| !a.starts_with(['-', '+']));
                found.extend(script.cloned());
            }
        } else if name == "ssh" {
            let mut operands = rest.iter().filter(|a| !a.starts_with('-'));
            operands.next(); // the host
            let command: Vec<&str> = operands.map(String::as_str).collect();
            if !command.is_empty() {
                found.push(command.join(" "));
            }
        }
    }
    found
}

/// A shell or `ssh` given an inline script whose own commands read stdin (`sh -c bash`, `ssh host bash`), or an
/// interpreter given an inline script that reads stdin (`python3 -c 'exec(sys.stdin.read())'`).
pub(super) fn fed_inline_reads_stdin(
    stage: &Stage,
    shell_script_reads: &dyn Fn(&str) -> bool,
) -> bool {
    let Some(name) = name_of(stage) else {
        return false;
    };
    let scripts = inline_scripts(stage);
    if is_lang(name) {
        // Reading stdin as data (`json.load(sys.stdin)`) is fine; reading it and running it is not.
        return scripts.iter().any(|s| {
            STDIN_WORDS.iter().any(|w| s.contains(w)) && EXEC_WORDS.iter().any(|w| s.contains(w))
        });
    }
    scripts.iter().any(|s| shell_script_reads(s))
}

pub(super) fn executes_text(stage: &Stage) -> bool {
    name_of(stage).is_some_and(|name| {
        matches!(name, "eval" | "source" | ".") || is_shell(name) || is_lang(name)
    })
}
