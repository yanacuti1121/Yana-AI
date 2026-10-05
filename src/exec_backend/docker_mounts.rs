//! The few facts about mounts the Docker backend still needs (WS6 E1b): where the private
//! copy appears, what may be put in a `--mount` value, and which working directories are
//! refused. What the container may see of the project is decided by `staging.rs`.

use crate::capability::CapabilityError;
use std::path::Path;

/// Where the private copy of the working directory appears inside the container.
pub(super) const WORK: &str = "/work";

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

/// Parts of the disk that hold other things than projects.
const NOT_PROJECTS: [&str; 6] = ["/etc", "/private/etc", "/var/db", "/private/var/db", "/System", "/Library"];

/// The working directory must be a project, not the machine: refuse `/`, the home directory,
/// any directory that contains the home directory, folders of the system or of the user's
/// settings (`~/Library`), folders whose own path says they hold secrets (`~/.ssh`,
/// `~/.aws`), the folder the private copies live in, and any run where the home directory
/// cannot be determined (the check would have nothing to compare with).
pub(super) fn check_root(root: &Path, home: Option<&Path>, copies: &Path) -> Result<(), CapabilityError> {
    let Some(home) = home else {
        return Err(invalid("the home directory could not be determined, so it cannot be checked that the working directory is not it: the command is not run in a container"));
    };
    if root.parent().is_none() || home.starts_with(root) {
        return Err(invalid("the working directory is the home directory, one that contains it, or the root of the disk: it is not copied for a container"));
    }
    let below_home = root.strip_prefix(home).unwrap_or(root);
    let kept_for_settings = root.starts_with(home.join("Library")) || NOT_PROJECTS.iter().any(|p| root.starts_with(p));
    let secret_path = below_home.to_str().is_some_and(crate::lsp_client::operation::sensitive_path);
    if kept_for_settings || secret_path || copies.starts_with(root) {
        return Err(invalid("the working directory is a system or settings folder, one named like a secret, or one that holds the private copies: it is not copied for a container"));
    }
    Ok(())
}
