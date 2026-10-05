//! Docker backend tests. No real Docker: the `docker` program is a small `sh` script that
//! records what it was asked and behaves as a control file says.

use super::docker::{DockerBackend, DockerConfig, Limits, Network, RunContext};
use super::{ExecBackend, ExecRequest};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

pub(super) const DIGEST: &str = "alpine@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

pub(super) fn config(program: &Path) -> DockerConfig {
    DockerConfig {
        program: program.to_path_buf(),
        image: DIGEST.into(),
        user: Some("1000:1000".into()),
        limits: Limits::default(),
        network: Network::None,
        env_names: Vec::new(),
    }
}

pub(super) fn argv(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|p| p.to_string()).collect()
}

pub(super) fn pinned(dir: &Path) -> PathBuf {
    dir.canonicalize().unwrap()
}

/// The per-run values, fixed so the argument list can be compared whole.
pub(super) fn ctx() -> RunContext {
    RunContext { run_id: "0123456789abcdef".into(), owner_pid: 4242, deadline_unix: 1_000_000, home: Some(PathBuf::from("/nonexistent-home")) }
}

fn args_for(root: &Path) -> Result<Vec<String>, crate::capability::CapabilityError> {
    config(Path::new("/usr/bin/docker")).run_args(root, &argv(&["true"]), &ctx())
}

#[test]
fn the_argument_list_is_exactly_this() {
    let dir = tempfile::tempdir().unwrap();
    let root = pinned(dir.path());
    let args = config(Path::new("/usr/bin/docker")).run_args(&root, &argv(&["ls", "-la"]), &ctx()).unwrap();
    let expected: Vec<String> = [
        "run", "--rm", "--init", "--pull", "never", "--name", "yana-0123456789abcdef", "--label", "yana.run=0123456789abcdef", "--label", "yana.owner=4242",
        "--label", "yana.deadline=1000000", "--user", "1000:1000", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges", "--pids-limit", "128", "--memory", "512m", "--memory-swap", "512m", "--cpus", "1.00", "--network", "none",
        "-w", "/work", "-e", "HOME=/tmp", "-e", "YANA_AGENT_CHILD=1",
    ]
    .iter()
    .map(|s| s.to_string())
    .chain([
        "--mount".to_string(),
        format!("type=bind,source={},target=/work", root.display()),
        "--mount".to_string(),
        format!("type=bind,source={}/.yana-ai,target=/work/.yana-ai,readonly", root.display()),
        DIGEST.to_string(),
        "ls".into(),
        "-la".into(),
    ])
    .collect();
    assert_eq!(args, expected);
    assert!(root.join(".yana-ai").is_dir(), "an absent .yana-ai is made empty so it can be mounted read-only");
}

#[test]
fn config_and_secret_paths_are_kept_read_only_or_hidden_at_any_depth() {
    let dir = tempfile::tempdir().unwrap();
    let root = pinned(dir.path());
    std::fs::create_dir_all(root.join(".yana-ai")).unwrap();
    std::fs::create_dir_all(root.join(".git/hooks")).unwrap();
    std::fs::write(root.join(".git/config"), "[core]").unwrap();
    std::fs::write(root.join(".env"), "SECRET=1").unwrap();
    std::fs::create_dir_all(root.join(".ssh")).unwrap();
    std::fs::create_dir_all(root.join("config/prod")).unwrap();
    std::fs::write(root.join("config/prod/id_rsa"), "key").unwrap();
    std::fs::create_dir_all(root.join("node_modules/x")).unwrap();
    std::fs::write(root.join("node_modules/x/.env"), "not searched").unwrap();
    std::fs::write(root.join("main.rs"), "fn main() {}").unwrap();
    let args = args_for(&root).unwrap().join(" ");
    for protected in [".yana-ai", ".git/hooks", ".git/config"] {
        let want = format!("source={}/{protected},target=/work/{protected},readonly", root.display());
        assert!(args.contains(&want), "{protected}: {args}");
    }
    assert!(args.contains("source=/dev/null,target=/work/.env,readonly"), "{args}");
    assert!(args.contains("source=/dev/null,target=/work/config/prod/id_rsa,readonly"), "a nested secret is hidden too: {args}");
    assert!(args.contains("type=tmpfs,destination=/work/.ssh,tmpfs-size=4096,readonly"), "{args}");
    assert!(!args.contains("main.rs") && !args.contains("node_modules"), "ordinary files and vendored folders are not mounted separately: {args}");
}

#[test]
fn a_git_directory_stays_usable_with_only_its_hooks_and_config_read_only() {
    let dir = tempfile::tempdir().unwrap();
    let root = pinned(dir.path());
    std::fs::create_dir_all(root.join(".git")).unwrap();
    std::fs::write(root.join(".git/config"), "[core]").unwrap();
    let args = args_for(&root).unwrap();
    assert!(args.iter().all(|a| !a.contains("target=/work/.git,") && !a.contains("destination=/work/.git,")), "the whole .git must not be hidden or read-only: {args:?}");
    assert!(root.join(".git/hooks").is_dir(), ".git/hooks is made inside a real .git so it can be read-only");
    assert!(args.iter().any(|a| a.contains("target=/work/.git/hooks,readonly")), "{args:?}");
}

#[test]
fn without_a_git_directory_nothing_git_is_created_on_the_host() {
    let dir = tempfile::tempdir().unwrap();
    let root = pinned(dir.path());
    args_for(&root).unwrap();
    assert!(!root.join(".git").exists());
}

#[test]
fn secret_hiding_fails_closed_instead_of_leaving_a_secret_visible() {
    let dir = tempfile::tempdir().unwrap();
    let root = pinned(dir.path());
    // A secret-named file a mount option cannot carry.
    std::fs::write(root.join("a,b.pem"), "S=1").unwrap();
    let error = args_for(&root).unwrap_err();
    assert!(error.to_string().contains("mount cannot carry"), "{error}");
    std::fs::remove_file(root.join("a,b.pem")).unwrap();
    // Too many secret-looking files to hide.
    std::fs::create_dir_all(root.join("keys")).unwrap();
    for n in 0..70 {
        std::fs::write(root.join(format!("keys/k{n}.pem")), "").unwrap();
    }
    let error = args_for(&root).unwrap_err();
    assert!(error.to_string().contains("secret-looking files"), "{error}");
}

#[cfg(unix)]
#[test]
fn a_protected_path_that_is_or_goes_through_a_symbolic_link_stops_the_run() {
    let elsewhere = tempfile::tempdir().unwrap();
    std::fs::write(elsewhere.path().join("config"), "host secret").unwrap();
    // `.yana-ai` itself, `.git` as a link (so `.git/config` resolves outside the repository),
    // and `.git/hooks` as a link inside a real `.git`.
    for (link, make_git) in [(".yana-ai", false), (".git", false), (".git/hooks", true)] {
        let dir = tempfile::tempdir().unwrap();
        let root = pinned(dir.path());
        if make_git {
            std::fs::create_dir_all(root.join(".git")).unwrap();
        }
        std::os::unix::fs::symlink(elsewhere.path(), root.join(link)).unwrap();
        let error = args_for(&root).unwrap_err();
        assert!(error.to_string().contains("symbolic link"), "{link}: {error}");
    }
}

#[test]
fn a_working_directory_that_is_the_home_a_parent_of_it_or_the_disk_is_refused() {
    let outer = tempfile::tempdir().unwrap();
    let home = pinned(outer.path()).join("home/me");
    let project = home.join("project");
    std::fs::create_dir_all(&project).unwrap();
    let c = config(Path::new("/usr/bin/docker"));
    let with_home = |root: &Path| c.run_args(root, &argv(&["true"]), &RunContext { home: Some(home.clone()), ..ctx() });
    assert!(with_home(&project).is_ok(), "a project under the home directory is the normal case");
    for root in [home.clone(), home.parent().unwrap().to_path_buf(), PathBuf::from("/")] {
        let error = with_home(&root).unwrap_err();
        assert!(error.to_string().contains("home directory"), "{}: {error}", root.display());
    }
}

#[test]
fn no_variant_of_the_argument_list_widens_what_the_container_can_reach() {
    let dir = tempfile::tempdir().unwrap();
    let root = pinned(dir.path());
    std::fs::create_dir_all(root.join(".yana-ai")).unwrap();
    for network in [Network::None, Network::Open] {
        for user in [None, Some("2000:3000".to_string())] {
            let mut c = config(Path::new("/usr/bin/docker"));
            c.network = network;
            c.user = user;
            c.env_names = vec!["GITHUB_TOKEN".into(), "LANG".into()];
            let args = c.run_args(&root, &argv(&["sh", "-c", "id"]), &ctx()).unwrap();
            let image_at = args.iter().position(|a| a == DIGEST).unwrap();
            let mine = &args[..image_at];
            let joined = mine.join(" ");
            // Whole options that would widen the container, matched as whole arguments.
            for forbidden in ["--privileged", "--cap-add", "--device", "--pid", "--ipc", "--uts", "--userns", "--volume", "-v", "host"] {
                assert!(!mine.iter().any(|a| a == forbidden), "{forbidden}: {joined}");
            }
            for forbidden in ["docker.sock"] {
                assert!(!joined.contains(forbidden), "{forbidden}: {joined}");
            }
            // Every mount source is the working directory (or something under it) or /dev/null.
            for mount in mine.iter().filter(|a| a.starts_with("type=bind")) {
                let source = mount.split(',').find_map(|p| p.strip_prefix("source=")).unwrap();
                assert!(source == "/dev/null" || Path::new(source).starts_with(&root), "{mount}");
            }
            // Variables go by name only, apart from two constants.
            for pair in mine.windows(2).filter(|w| w[0] == "-e") {
                assert!(!pair[1].contains('=') || pair[1] == "HOME=/tmp" || pair[1] == "YANA_AGENT_CHILD=1", "{}", pair[1]);
            }
            let user = &mine[mine.iter().position(|a| a == "--user").unwrap() + 1];
            assert!(!user.starts_with("0:") && !user.ends_with(":0") && !user.contains("root"), "{user}");
            assert_eq!(mine[mine.iter().position(|a| a == "--network").unwrap() + 1], if network == Network::None { "none" } else { "bridge" });
        }
    }
}

#[test]
fn a_configuration_that_could_widen_access_is_refused() {
    let base = config(Path::new("/usr/bin/docker"));
    assert!(base.validate().is_ok());
    let cases: Vec<(&str, DockerConfig)> = vec![
        ("relative program", DockerConfig { program: "docker".into(), ..base.clone() }),
        ("movable tag", DockerConfig { image: "alpine:latest".into(), ..base.clone() }),
        ("upper-case digest", DockerConfig { image: DIGEST.replace('a', "A"), ..base.clone() }),
        ("option-looking image", DockerConfig { image: format!("-v/:/x@sha256:{}", "a".repeat(64)), ..base.clone() }),
        ("root user", DockerConfig { user: Some("0:0".into()), ..base.clone() }),
        ("root group", DockerConfig { user: Some("1000:0".into()), ..base.clone() }),
        ("named user", DockerConfig { user: Some("root".into()), ..base.clone() }),
        ("uid only", DockerConfig { user: Some("1000".into()), ..base.clone() }),
        ("memory too big", DockerConfig { limits: Limits { memory_mb: 100_000, ..Limits::default() }, ..base.clone() }),
        ("no time limit", DockerConfig { limits: Limits { wall: Duration::from_secs(0), ..Limits::default() }, ..base.clone() }),
        ("cpus zero", DockerConfig { limits: Limits { cpus: 0.0, ..Limits::default() }, ..base.clone() }),
    ];
    for (label, config) in cases {
        assert!(config.validate().is_err(), "{label}");
        assert!(DockerBackend::new(config).is_err(), "{label}");
    }
    for name in ["HOME", "PATH", "USER", "YANA_X", "DOCKER_HOST", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "SSH_AUTH_SOCK", "1BAD", "A=B", "", "a b"] {
        let c = DockerConfig { env_names: vec![name.into()], ..base.clone() };
        assert!(c.validate().is_err(), "{name:?}");
    }
}

#[test]
fn a_working_directory_a_mount_option_could_misread_is_refused() {
    let outer = tempfile::tempdir().unwrap();
    let odd = pinned(outer.path()).join("a,source=/etc");
    std::fs::create_dir_all(&odd).unwrap();
    let error = config(Path::new("/usr/bin/docker")).run_args(&odd, &argv(&["true"]), &ctx()).unwrap_err();
    assert!(error.to_string().contains("mount cannot carry"), "{error}");
}

#[test]
fn the_disclosure_names_the_image_the_reach_the_network_and_the_limits() {
    let mut c = config(Path::new("/usr/bin/docker"));
    c.env_names = vec!["GITHUB_TOKEN".into()];
    let text = DockerBackend::new(c.clone()).unwrap().disclosure().notes.join("\n");
    for needle in [DIGEST, "not your home directory", ".yana-ai, .git/hooks, .git/config", "network: none", "120 s", "GITHUB_TOKEN"] {
        assert!(text.contains(needle), "{needle}: {text}");
    }
    c.network = Network::Open;
    assert!(DockerBackend::new(c).unwrap().disclosure().notes.join("\n").contains("OPEN"));
}

/// With a real Docker and a real pinned image; run by hand: `DOCKER_IMAGE=... cargo test -- --ignored`.
#[test]
#[ignore = "needs Docker and an image pinned by digest in $YANA_TEST_DOCKER_IMAGE"]
fn a_real_container_cannot_see_the_home_directory() {
    let Ok(image) = std::env::var("YANA_TEST_DOCKER_IMAGE") else { return };
    let work = tempfile::tempdir().unwrap();
    let mut c = config(Path::new("/usr/local/bin/docker"));
    c.image = image;
    c.user = None;
    let out = DockerBackend::new(c).unwrap().run(&ExecRequest { root: work.path().to_path_buf(), argv: argv(&["sh", "-c", "ls /Users /home /root 2>&1; id -u"]) }).unwrap();
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    assert!(!text.lines().last().unwrap_or("").trim().eq("0"), "{text}");
}
