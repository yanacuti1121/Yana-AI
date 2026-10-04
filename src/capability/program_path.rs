//! Which program a command name really starts (WS3: language servers and MCP servers).
//!
//! A repository you cloned can name a program in its configuration. A bare name such as
//! `npx` or `rust-analyzer` is looked up on PATH, and PATH may contain entries that point
//! INTO the repository (a shell adds `.` or `./node_modules/.bin`): the program that
//! starts would then be one the repository supplied, while an approver sees only the
//! name. So the lookup is done here, in this process, before the working directory is
//! changed, ignoring such entries; the absolute path found is what the approver is shown
//! and what runs. The same filtering is applied to the PATH the child process inherits,
//! so a program it starts by name is not looked up in the repository either.

use super::CapabilityError;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};

fn invalid(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::InvalidInput { detail: detail.into() }
}

/// A command with no path separator or drive marker: the kind that is looked up on PATH.
pub fn is_bare_name(command: &str) -> bool {
    !command.is_empty() && !command.contains(['/', '\\', ':'])
}

/// `path` without the entries a repository could use to supply a program: empty and relative
/// entries, directories inside `root`, and directories that do not exist. `None` when nothing is left.
pub fn safe_path_var(path: &OsStr, root: &Path) -> Option<OsString> {
    let repository = root.canonicalize().ok()?;
    let kept: Vec<PathBuf> = std::env::split_paths(path)
        .filter(|dir| dir.is_absolute() && dir.canonicalize().map(|c| !c.starts_with(&repository)).unwrap_or(false))
        .collect();
    std::env::join_paths(kept).ok().filter(|joined| !joined.is_empty())
}

/// The absolute path of the program that would run for `command`, decided in this process
/// BEFORE the working directory is changed to the repository. An absolute command is itself.
/// A bare name is looked for in the PATH entries that are absolute and outside the repository:
/// a relative or empty entry (which a shell may add for `.` or `./node_modules/.bin`) and a
/// directory inside the repository are skipped, so the repository cannot supply the program
/// by putting one where PATH would find it. The result is what an approver is shown and what is run.
pub fn resolve_program(command: &str, root: &Path) -> Result<String, CapabilityError> {
    resolve_program_in(command, root, std::env::var_os("PATH").as_deref())
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else { return false };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.is_file() && meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        meta.is_file()
    }
}

pub(crate) fn resolve_program_in(command: &str, root: &Path, path_var: Option<&OsStr>) -> Result<String, CapabilityError> {
    if Path::new(command).is_absolute() {
        return Ok(command.to_string());
    }
    let repository = root.canonicalize().map_err(|e| CapabilityError::Io { detail: format!("resolve repository: {e}") })?;
    for dir in std::env::split_paths(path_var.unwrap_or_default()) {
        if !dir.is_absolute() {
            continue;
        }
        let candidate = dir.join(command);
        // Neither the directory nor, through links, the program itself may be inside the repository.
        let inside = |p: &Path| p.canonicalize().map(|c| c.starts_with(&repository)).unwrap_or(true);
        if inside(&dir) || !is_executable_file(&candidate) || inside(&candidate) {
            continue;
        }
        match candidate.to_str() {
            Some(text) => return Ok(text.to_string()),
            None => continue, // a path that is not valid text cannot be shown to an approver: try the next entry
        }
    }
    Err(invalid(format!("'{command}' was not found in PATH (relative entries and directories inside the repository are ignored); give an absolute path")))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A directory of programs, with one executable file named `name` in it.
    fn bin_with(parent: &std::path::Path, dir: &str, name: &str) -> std::path::PathBuf {
        let bin = parent.join(dir);
        std::fs::create_dir_all(&bin).unwrap();
        let program = bin.join(name);
        std::fs::write(&program, "#!/bin/sh\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        bin
    }

    #[cfg(unix)]
    #[test]
    fn a_bare_name_is_resolved_outside_the_repository_and_never_from_a_relative_or_inside_entry() {
        let outer = tempfile::tempdir().unwrap();
        let root = outer.path().canonicalize().unwrap().join("repo");
        std::fs::create_dir_all(&root).unwrap();
        let inside = bin_with(&root, "node_modules/.bin", "lsp-x");
        let trusted = bin_with(&outer.path().canonicalize().unwrap(), "usr-bin", "lsp-x");
        let join = |dirs: &[&std::path::Path]| std::env::join_paths(dirs.iter().map(|d| d.as_os_str())).unwrap();
        let resolve = |path: &std::ffi::OsStr| resolve_program_in("lsp-x", &root, Some(path));
        // A relative entry ("." or "node_modules/.bin"), an empty entry and an in-repository entry are all skipped.
        let path = join(&[std::path::Path::new("."), std::path::Path::new("node_modules/.bin"), std::path::Path::new(""), &inside, &trusted]);
        assert_eq!(resolve(&path).unwrap(), trusted.join("lsp-x").to_str().unwrap(), "the program outside the repository wins");
        // With only skipped entries nothing resolves, and the repository's program is NOT used.
        let only_bad = join(&[std::path::Path::new("."), &inside]);
        assert!(resolve(&only_bad).unwrap_err().to_string().contains("not found in PATH"));
        assert!(resolve_program_in("lsp-x", &root, None).is_err(), "no PATH at all");
        // A file that is not executable is not a program.
        let plain = outer.path().canonicalize().unwrap().join("plain");
        std::fs::create_dir_all(&plain).unwrap();
        std::fs::write(plain.join("lsp-x"), "x").unwrap();
        assert!(resolve(&join(&[&plain])).is_err());
        // A link outside the repository that points back into it is skipped as well.
        let linked = outer.path().canonicalize().unwrap().join("linked");
        std::fs::create_dir_all(&linked).unwrap();
        std::os::unix::fs::symlink(inside.join("lsp-x"), linked.join("lsp-x")).unwrap();
        assert!(resolve(&join(&[&linked])).is_err(), "a link into the repository is the repository's program");
        // An absolute command is itself, whatever PATH says.
        assert_eq!(resolve_program_in("/bin/sh", &root, Some(&path)).unwrap(), "/bin/sh");
    }


    #[test]
    fn only_bare_names_are_looked_up_on_path() {
        for bare in ["npx", "rust-analyzer", "typescript-language-server"] {
            assert!(is_bare_name(bare), "{bare}");
        }
        for other in ["", "./x", "bin/x", "/usr/bin/x", ".\\x.exe", "C:x.exe", "a:b"] {
            assert!(!is_bare_name(other), "{other:?}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn the_path_a_child_inherits_loses_relative_empty_missing_and_in_repository_entries() {
        let outer = tempfile::tempdir().unwrap();
        let base = outer.path().canonicalize().unwrap();
        let root = base.join("repo");
        std::fs::create_dir_all(root.join("node_modules/.bin")).unwrap();
        let good = base.join("usr-bin");
        let also_good = base.join("other-bin");
        std::fs::create_dir_all(&good).unwrap();
        std::fs::create_dir_all(&also_good).unwrap();
        let inside = root.join("node_modules/.bin");
        let joined = std::env::join_paths([Path::new("."), Path::new("node_modules/.bin"), Path::new(""), &inside, &good, &base.join("missing"), &also_good]).unwrap();
        let safe = safe_path_var(&joined, &root).unwrap();
        let kept: Vec<PathBuf> = std::env::split_paths(&safe).collect();
        assert_eq!(kept, [good, also_good], "order is kept, only safe entries remain");
        assert!(safe_path_var(&std::env::join_paths([Path::new(".")]).unwrap(), &root).is_none(), "nothing safe left");
    }
}
