//! What of the working directory the container may see, and how (WS6 E1, contract section 5).
//!
//! The working directory is bind-mounted at `/work`. On top of it:
//! - the paths a later host-side step would trust (`.yana-ai`, `.git/hooks`, `.git/config`)
//!   are read-only, and an absent one is created empty first so it cannot be planted;
//! - files and directories whose names say they hold secrets are hidden, at any depth
//!   (an empty file or an empty tmpfs over them);
//! - everything fails closed: if something that must be hidden or protected cannot be, the
//!   run is refused rather than started with a secret visible.

use crate::capability::CapabilityError;
use std::path::{Path, PathBuf};

pub(super) const WORK: &str = "/work";
/// Paths inside the working directory that stay read-only in the container.
pub(super) const READ_ONLY_PATHS: [&str; 3] = [".yana-ai", ".git/hooks", ".git/config"];
/// Most directory entries looked at when hiding secret-named files; more and the run is refused.
const MAX_SCANNED: usize = 20_000;
/// Deepest directory level looked at (the working directory itself is level 0).
const MAX_DEPTH: usize = 8;
/// Most files and directories hidden in one run (each is a mount); more and the run is refused.
const MAX_HIDDEN: usize = 64;
/// Vendored and build directories not searched for secret names (they are large and hold other
/// people's files); the disclosure says so.
pub(super) const NOT_SEARCHED: [&str; 8] = ["node_modules", "target", ".venv", "venv", "__pycache__", "dist", "build", ".next"];

fn invalid(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::InvalidInput { detail: detail.into() }
}

/// A path that can be put in a `--mount` value without being read as another option.
pub(super) fn mountable(path: &Path) -> Result<&str, CapabilityError> {
    let text = path.to_str().ok_or_else(|| invalid("a path that is not valid UTF-8 cannot be mounted"))?;
    if text.contains([',', '\n', '\r', '\0', '"']) || !path.is_absolute() {
        return Err(invalid("a path has a character a container mount cannot carry (a comma, quote or line break)"));
    }
    Ok(text)
}

/// The working directory must be a project, not the machine: refuse `/`, the home directory,
/// and any directory that contains the home directory.
pub(super) fn check_root(root: &Path, home: Option<&Path>) -> Result<(), CapabilityError> {
    let too_wide = root.parent().is_none() || home.is_some_and(|home| home.starts_with(root));
    if too_wide {
        return Err(invalid("the working directory is the home directory, one that contains it, or the root of the disk: a container would see far more than a project, so the command is not run in one"));
    }
    Ok(())
}

/// Refuse any symbolic link among the components of `relative` below `root`; `Ok(false)` when
/// the path (or a parent of it) does not exist.
fn exists_without_links(root: &Path, relative: &str) -> Result<bool, CapabilityError> {
    let mut path = root.to_path_buf();
    for part in relative.split('/') {
        path.push(part);
        match std::fs::symlink_metadata(&path) {
            Ok(meta) if meta.file_type().is_symlink() => {
                return Err(invalid(format!("{relative} goes through a symbolic link: it cannot be kept read-only, so the command is not run in a container")));
            }
            Ok(_) => {}
            Err(_) => return Ok(false),
        }
    }
    Ok(true)
}

fn read_only_bind(source: &Path, target: &str) -> Result<[String; 2], CapabilityError> {
    Ok(["--mount".to_string(), format!("type=bind,source={},target={target},readonly", mountable(source)?)])
}

/// The `--mount` arguments for everything protected or hidden under `root` (already canonical).
pub(super) fn mount_args(root: &Path) -> Result<Vec<String>, CapabilityError> {
    let mut args: Vec<String> = Vec::new();
    for protected in READ_ONLY_PATHS {
        let source = root.join(protected);
        if !exists_without_links(root, protected)? {
            // An absent `.yana-ai`, or `.git/hooks` inside a real `.git`, is made (empty) so it
            // can be mounted read-only. With no `.git` at all nothing is created (that would
            // turn a plain directory into something git half-recognises) and a command can
            // still plant `.git/...` there: documented, and said in the disclosure.
            let make = protected == ".yana-ai" || (protected == ".git/hooks" && root.join(".git").is_dir());
            if !make {
                continue;
            }
            std::fs::create_dir(&source).map_err(|error| invalid(format!("cannot create {protected} to keep it read-only: {error}")))?;
        }
        args.extend(read_only_bind(&source, &format!("{WORK}/{protected}"))?);
    }
    let covered: Vec<PathBuf> = READ_ONLY_PATHS.iter().map(|p| root.join(p)).collect();
    let mut hidden: Vec<(PathBuf, bool)> = Vec::new();
    let mut scanned = 0usize;
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        let entries = std::fs::read_dir(&dir).map_err(|error| invalid(format!("cannot list {} to hide secret files: {error}", dir.display())))?;
        for entry in entries {
            scanned += 1;
            if scanned > MAX_SCANNED {
                return Err(invalid(format!("more than {MAX_SCANNED} entries to check for secret files: the command is not run in a container")));
            }
            let Ok(entry) = entry else { continue };
            let Ok(kind) = entry.file_type() else { continue };
            let path = entry.path();
            if kind.is_symlink() || covered.iter().any(|c| c == &path || path.starts_with(c)) || path == root.join(".git") {
                continue;
            }
            let name = entry.file_name().into_string().map_err(|_| invalid("a name that is not valid UTF-8 cannot be checked for secrets"))?;
            let relative = path.strip_prefix(root).ok().and_then(Path::to_str).unwrap_or(&name).to_string();
            if crate::lsp_client::operation::sensitive_path(&relative) {
                if hidden.len() >= MAX_HIDDEN {
                    return Err(invalid(format!("more than {MAX_HIDDEN} secret-looking files: the command is not run in a container")));
                }
                mountable(&path).map_err(|_| invalid(format!("the secret-looking name {relative:?} has a character a container mount cannot carry")))?;
                hidden.push((path, kind.is_dir()));
            } else if kind.is_dir() && depth < MAX_DEPTH && !NOT_SEARCHED.contains(&name.as_str()) && name != ".git" {
                stack.push((path, depth + 1));
            }
        }
    }
    hidden.sort();
    for (path, is_dir) in hidden {
        let relative = path.strip_prefix(root).ok().and_then(Path::to_str).unwrap_or_default();
        let target = format!("{WORK}/{relative}");
        if is_dir {
            args.extend(["--mount".to_string(), format!("type=tmpfs,destination={target},tmpfs-size=4096,readonly")]);
        } else {
            args.extend(["--mount".to_string(), format!("type=bind,source=/dev/null,target={target},readonly")]);
        }
    }
    Ok(args)
}
