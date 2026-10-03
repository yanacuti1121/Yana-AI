//! The shadow repository's own files, re-asserted before every `git add`.
//!
//! The shadow lives inside the workspace (`.yana-ai/checkpoints/`), so any tool
//! that can write there could otherwise change its `config` (for example to
//! define a `filter` command that `git add` would then run) or its exclude
//! list. Rewriting both from constants before each use closes that, and also
//! means a longer exclude list reaches shadows created by an older version.

use super::{CheckpointError, CheckpointStore};
use std::fs;

/// Only what a bare repository needs. No filters, no aliases, no commands.
const SAFE_CONFIG: &str = "[core]\n\trepositoryformatversion = 0\n\tbare = true\n";

/// Never captured: the user's own git data, this tool's state, build output,
/// caches, and files that commonly hold credentials or keys.
pub(super) const EXCLUDES: &str = "\
.git
.yana-ai/
node_modules/
target/
.venv/
__pycache__/
.next/
dist/
.env
.env.*
.envrc
*.env
*.pem
*.key
*.p12
*.p8
*.pfx
*.ppk
*.jks
*.keystore
*.kdbx
*.gpg
*.asc
*.tfstate
*.tfstate.*
*.tfvars
id_rsa
id_ed25519
id_ecdsa
id_dsa
credentials.json
service-account*.json
token.json
.git-credentials
.htpasswd
.pgpass
.vault-token
.boto
kubeconfig
.npmrc
.netrc
.pypirc
.ssh/
.aws/
.azure/
.kube/
.gnupg/
.docker/config.json
";

impl CheckpointStore {
    /// Rewrite the shadow's config, exclude list, and attributes from constants.
    pub(super) fn harden(&self) -> Result<(), CheckpointError> {
        let io = |what: &str, e: std::io::Error| CheckpointError::Io(format!("{what}: {e}"));
        let info = self.shadow.join("info");
        fs::create_dir_all(&info).map_err(|e| io("creating the shadow info directory", e))?;
        fs::write(self.shadow.join("config"), SAFE_CONFIG).map_err(|e| io("writing the shadow config", e))?;
        fs::write(info.join("exclude"), EXCLUDES).map_err(|e| io("writing the exclude list", e))?;
        // Attributes inside the shadow are not used; an empty file means nothing
        // planted there applies.
        fs::write(info.join("attributes"), "").map_err(|e| io("writing the shadow attributes", e))
    }

    /// `git add -A` of the project into the shadow, after `harden`.
    pub(super) fn add_all(&self) -> Result<(), CheckpointError> {
        self.harden()?;
        self.run(self.cmd(true).args(["add", "-A"])).map(|_| ())
    }
}
