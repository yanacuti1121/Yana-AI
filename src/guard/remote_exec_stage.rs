//! The command-word logic of a parsed stage: which words are prefixes, assignments or keywords.

use super::Stage;

/// A word that prefixes a command without being it: the options that take a value, and how many plain
/// arguments (a duration, a lock file, a mask, a new root) come before the command.
type Prefix = (&'static str, &'static [&'static str], usize);
const PREFIXES: [Prefix; 20] = [
    ("pkexec", &["--user"], 0),
    ("chroot", &[], 1),
    (
        "sudo",
        &[
            "-u", "-g", "-h", "-p", "-r", "-t", "-c", "-d", "--user", "--group", "--host",
            "--prompt", "--role", "--type", "--chdir",
        ],
        0,
    ),
    ("doas", &["-u", "-c"], 0),
    ("env", &["-u", "-c", "-s"], 0),
    ("command", &[], 0),
    ("exec", &["-a"], 0),
    ("nohup", &[], 0),
    ("nice", &["-n"], 0),
    ("time", &[], 0),
    ("stdbuf", &["-i", "-o", "-e"], 0),
    (
        "xargs",
        &["-n", "-i", "-l", "-p", "-d", "-e", "-s", "-a"],
        0,
    ),
    ("builtin", &[], 0),
    ("setsid", &[], 0),
    ("timeout", &["-s", "-k", "--signal", "--kill-after"], 1),
    ("ionice", &["-c", "-n", "-p"], 0),
    ("taskset", &["-p"], 1),
    ("flock", &["-w", "-e", "-s"], 1),
    ("unshare", &[], 0),
    ("busybox", &[], 0),
];
/// Commands that start a shell when nothing follows them (`sudo -i`, `su`, `pkexec`).
const SHELL_LAUNCHERS: [&str; 4] = ["sudo", "doas", "su", "pkexec"];
/// Reserved words that start a command position without being the command.
const KEYWORDS: [&str; 10] = [
    "!", "{", "}", "then", "do", "else", "elif", "if", "while", "until",
];
/// A pipe into one of these feeds a group of commands, not a single command.
const GROUP_OPENERS: [&str; 7] = ["{", "while", "until", "for", "if", "case", "do"];

/// `NAME=value` before a command: the text before the first `=` is a variable name.
fn is_assignment(word: &str) -> bool {
    word.split_once('=').is_some_and(|(name, _)| {
        name.chars()
            .next()
            .is_some_and(|first| first.is_ascii_alphabetic() || first == '_')
            && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
    })
}

/// `-u`, a cluster ending in a valued flag (`-nu`, `-Eu`), or a listed long option.
fn takes_value(option: &str, valued: &[&str]) -> bool {
    if valued.contains(&option) {
        return true;
    }
    match option
        .strip_prefix('-')
        .filter(|rest| !rest.starts_with('-'))
    {
        Some(cluster) if cluster.chars().count() > 1 => cluster
            .chars()
            .last()
            .is_some_and(|last| valued.contains(&format!("-{last}").as_str())),
        _ => false,
    }
}

impl Stage {
    /// The command word and its arguments, after assignments, keywords and prefixes such as `sudo -u x`.
    pub fn command(&self) -> Option<(&str, &[String])> {
        let mut at = 0;
        loop {
            let word = self.words.get(at)?;
            let name = word.rsplit('/').next().unwrap_or(word);
            if is_assignment(word) || KEYWORDS.contains(&word.as_str()) {
                at += 1;
            } else if let Some((_, valued, positionals)) =
                PREFIXES.iter().find(|(prefix, ..)| *prefix == name)
            {
                let next = self.skip_options(at + 1, valued, name == "env");
                if let Some(split) = self.env_split_string(name, at + 1, next) {
                    return Some(split);
                }
                if name == "sudo" && next >= self.words.len() && self.has_login_flag(at + 1, next) {
                    return Some(("sh", &[])); // `sudo -i`, `sudo -s`: a root shell
                }
                at = next + positionals;
            } else if SHELL_LAUNCHERS.contains(&name) && at + 1 >= self.words.len() {
                return Some(("sh", &[])); // `su`, `pkexec`, `doas` alone start a shell
            } else {
                return Some((word.as_str(), &self.words[at + 1..]));
            }
        }
    }

    /// Index of the first word after the options (and their values) that start at `at`.
    fn skip_options(&self, mut at: usize, valued: &[&str], skip_assignments: bool) -> usize {
        while let Some(option) = self.words.get(at) {
            if skip_assignments && is_assignment(option) {
                at += 1;
            } else if option.starts_with('-') {
                at += 1 + usize::from(takes_value(option, valued));
            } else {
                break;
            }
        }
        at
    }

    /// `env -S 'bash -s'` and `env --split-string=bash` run the text they are given as a command line.
    fn env_split_string(&self, name: &str, from: usize, to: usize) -> Option<(&str, &[String])> {
        if name != "env" {
            return None;
        }
        let options = &self.words[from..to.min(self.words.len())];
        let value = options.iter().enumerate().find_map(|(index, option)| {
            if option == "-s" {
                options.get(index + 1).map(String::as_str)
            } else {
                option.strip_prefix("--split-string=")
            }
        })?;
        Some((value.split_whitespace().next().unwrap_or("sh"), &[]))
    }

    fn has_login_flag(&self, from: usize, to: usize) -> bool {
        self.words[from..to.min(self.words.len())]
            .iter()
            .any(|option| {
                option == "--login"
                    || option == "--shell"
                    || option
                        .strip_prefix('-')
                        .is_some_and(|f| !f.starts_with('-') && f.contains(['i', 's']))
            })
    }

    /// Bodies of `$( )` and backtick substitutions anywhere in this command.
    pub fn substitutions(&self) -> impl Iterator<Item = &str> {
        self.subs.iter().map(String::as_str)
    }

    /// Bodies of `<( )` process substitutions anywhere in this command.
    pub fn process_substitutions(&self) -> impl Iterator<Item = &str> {
        self.procs.iter().map(String::as_str)
    }

    /// Bodies of `>( )` process substitutions: they receive what this command writes.
    pub fn sinks(&self) -> impl Iterator<Item = &str> {
        self.sinks.iter().map(String::as_str)
    }

    /// Nothing to run in this position: a group close `}` or `)` that a pipe leaves.
    pub fn is_group_source(&self) -> bool {
        self.command().is_none()
    }

    /// A pipe into this stage feeds a whole group: `| { ...; }`, `| ( ... )`, `| while ...; do ...`.
    pub fn opens_group(&self) -> bool {
        self.subshell
            || self
                .words
                .first()
                .is_some_and(|w| GROUP_OPENERS.contains(&w.as_str()))
    }

    pub fn words(&self) -> &[String] {
        &self.words
    }
}
