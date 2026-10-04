//! Docker backend tests. No real Docker: the `docker` program is a small `sh` script that
//! records what it was asked and behaves as a control file says.

use super::docker::{DockerBackend, DockerConfig, Limits, Network};
use super::{ExecBackend, ExecRequest};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const DIGEST: &str = "alpine@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

fn config(program: &Path) -> DockerConfig {
    DockerConfig {
        program: program.to_path_buf(),
        image: DIGEST.into(),
        user: Some("1000:1000".into()),
        limits: Limits::default(),
        network: Network::None,
        env_names: Vec::new(),
    }
}

fn argv(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|p| p.to_string()).collect()
}

fn pinned(dir: &Path) -> PathBuf {
    dir.canonicalize().unwrap()
}

#[test]
fn the_argument_list_is_exactly_this() {
    let dir = tempfile::tempdir().unwrap();
    let root = pinned(dir.path());
    let args = config(Path::new("/usr/bin/docker")).run_args(&root, &argv(&["ls", "-la"]), "0123456789abcdef", 4242).unwrap();
    let expected: Vec<String> = [
        "run", "--rm", "--init", "--name", "yana-0123456789abcdef", "--label", "yana.run=0123456789abcdef", "--label", "yana.owner=4242",
        "--user", "1000:1000", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--pids-limit", "128", "--memory", "512m", "--memory-swap", "512m", "--cpus", "1.00", "--network", "none",
        "-w", "/work", "-e", "HOME=/tmp", "-e", "YANA_AGENT_CHILD=1",
    ]
    .iter()
    .map(|s| s.to_string())
    .chain([format!("--mount"), format!("type=bind,source={},target=/work", root.display()), DIGEST.to_string(), "ls".into(), "-la".into()])
    .collect();
    assert_eq!(args, expected);
}

#[test]
fn config_and_secret_paths_are_kept_read_only_or_hidden() {
    let dir = tempfile::tempdir().unwrap();
    let root = pinned(dir.path());
    std::fs::create_dir_all(root.join(".yana-ai")).unwrap();
    std::fs::create_dir_all(root.join(".git/hooks")).unwrap();
    std::fs::write(root.join(".git/config"), "[core]").unwrap();
    std::fs::write(root.join(".env"), "SECRET=1").unwrap();
    std::fs::create_dir_all(root.join(".ssh")).unwrap();
    std::fs::write(root.join("main.rs"), "fn main() {}").unwrap();
    let args = config(Path::new("/usr/bin/docker")).run_args(&root, &argv(&["true"]), "0123456789abcdef", 1).unwrap().join(" ");
    for protected in [".yana-ai", ".git/hooks", ".git/config"] {
        let want = format!("source={}/{protected},target=/work/{protected},readonly", root.display());
        assert!(args.contains(&want), "{protected}: {args}");
    }
    assert!(args.contains("source=/dev/null,target=/work/.env,readonly"), "{args}");
    assert!(args.contains("--tmpfs /work/.ssh:ro,size=4k"), "{args}");
    assert!(!args.contains("main.rs"), "ordinary files are not mounted separately");
    // Nothing protected exists: nothing extra is mounted (a missing source would be created on the host).
    let bare = tempfile::tempdir().unwrap();
    let plain = config(Path::new("/usr/bin/docker")).run_args(&pinned(bare.path()), &argv(&["true"]), "0123456789abcdef", 1).unwrap();
    assert_eq!(plain.iter().filter(|a| a.as_str() == "--mount").count(), 1);
}

#[cfg(unix)]
#[test]
fn a_protected_path_that_is_a_symbolic_link_stops_the_run() {
    let dir = tempfile::tempdir().unwrap();
    let root = pinned(dir.path());
    let elsewhere = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(elsewhere.path(), root.join(".yana-ai")).unwrap();
    let error = config(Path::new("/usr/bin/docker")).run_args(&root, &argv(&["true"]), "0123456789abcdef", 1).unwrap_err();
    assert!(error.to_string().contains("symbolic link"), "{error}");
}

#[test]
fn no_variant_of_the_argument_list_widens_what_the_container_can_reach() {
    let dir = tempfile::tempdir().unwrap();
    let root = pinned(dir.path());
    std::fs::create_dir_all(root.join(".yana-ai")).unwrap();
    let home = std::env::var("HOME").unwrap_or_else(|_| "/Users".into());
    for network in [Network::None, Network::Open] {
        for user in [None, Some("2000:3000".to_string())] {
            let mut c = config(Path::new("/usr/bin/docker"));
            c.network = network;
            c.user = user;
            c.env_names = vec!["GITHUB_TOKEN".into(), "LANG".into()];
            let args = c.run_args(&root, &argv(&["sh", "-c", "id"]), "0123456789abcdef", 1).unwrap();
            let image_at = args.iter().position(|a| a == DIGEST).unwrap();
            let mine = &args[..image_at];
            let joined = mine.join(" ");
            // Whole options that would widen the container, matched as whole arguments.
            for forbidden in ["--privileged", "--cap-add", "--device", "--pid", "--ipc", "--uts", "--userns", "--volume", "-v", "host"] {
                assert!(!mine.iter().any(|a| a == forbidden), "{forbidden}: {joined}");
            }
            for forbidden in ["docker.sock", home.as_str()] {
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
    let error = config(Path::new("/usr/bin/docker")).run_args(&odd, &argv(&["true"]), "0123456789abcdef", 1).unwrap_err();
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

// ---- with a fake `docker` ----

#[cfg(unix)]
mod fake {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    /// A `docker` that appends its arguments to `calls` and acts as `mode` says.
    fn fake_docker(dir: &Path) -> PathBuf {
        let script = r#"#!/bin/sh
here=$(dirname "$0")
echo "$*" >> "$here/calls"
mode=$(cat "$here/mode" 2>/dev/null)
case "$1" in
  ps) cat "$here/ps" 2>/dev/null; exit 0;;
  kill|rm) exit 0;;
esac
case "$mode" in
  hang) sleep 30;;
  exit3) echo partial; echo oops >&2; exit 3;;
  big) head -c 100000 /dev/zero | tr '\0' x;;
  env) env | cut -d= -f1 | sort;;
  *) echo hello; echo warn >&2;;
esac
"#;
        let path = dir.join("docker");
        std::fs::write(&path, script).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    fn setup(mode: &str) -> (tempfile::TempDir, PathBuf, tempfile::TempDir) {
        let bin = tempfile::tempdir().unwrap();
        let program = fake_docker(&pinned(bin.path()));
        std::fs::write(bin.path().join("mode"), mode).unwrap();
        (bin, program, tempfile::tempdir().unwrap())
    }

    fn calls(bin: &Path) -> Vec<String> {
        std::fs::read_to_string(bin.join("calls")).unwrap_or_default().lines().map(String::from).collect()
    }

    fn request(root: &Path) -> ExecRequest {
        ExecRequest { root: root.to_path_buf(), argv: argv(&["echo", "hi"]) }
    }

    #[test]
    fn a_normal_run_returns_the_output_and_starts_exactly_one_container() {
        let (bin, program, work) = setup("ok");
        let out = DockerBackend::new(config(&program)).unwrap().run(&request(work.path())).unwrap();
        assert_eq!(String::from_utf8_lossy(&out.stdout), "hello\n");
        assert_eq!(String::from_utf8_lossy(&out.stderr), "warn\n");
        assert_eq!((out.exit_code, out.timed_out, out.truncated), (Some(0), false, false));
        let seen = calls(bin.path());
        assert_eq!(seen.len(), 1, "{seen:?}");
        assert!(seen[0].starts_with("run --rm --init --name yana-") && seen[0].contains(DIGEST) && seen[0].ends_with("echo hi"), "{}", seen[0]);
    }

    #[test]
    fn a_failing_command_is_a_result_with_its_exit_code() {
        let (_bin, program, work) = setup("exit3");
        let out = DockerBackend::new(config(&program)).unwrap().run(&request(work.path())).unwrap();
        assert_eq!(out.exit_code, Some(3));
        assert!(String::from_utf8_lossy(&out.stdout).contains("partial") && String::from_utf8_lossy(&out.stderr).contains("oops"));
    }

    #[test]
    fn output_beyond_the_cap_is_dropped_while_reading_and_said_so() {
        let (_bin, program, work) = setup("big");
        let mut c = config(&program);
        c.limits.output_bytes = 2048;
        let out = DockerBackend::new(c).unwrap().run(&request(work.path())).unwrap();
        assert_eq!(out.stdout.len(), 2048);
        assert!(out.truncated);
    }

    #[test]
    fn a_run_that_outlasts_its_limit_is_killed_and_its_container_removed() {
        let (bin, program, work) = setup("hang");
        let mut c = config(&program);
        c.limits.wall = Duration::from_secs(1);
        let started = Instant::now();
        let out = DockerBackend::new(c).unwrap().run(&request(work.path())).unwrap();
        assert!(started.elapsed() < Duration::from_secs(10), "{:?}", started.elapsed());
        assert!(out.timed_out && out.exit_code.is_none());
        let seen = calls(bin.path());
        let name = seen[0].split_whitespace().nth(4).unwrap().to_string();
        assert_eq!(&seen[1..], [format!("kill {name}"), format!("rm -f {name}")], "{seen:?}");
    }

    #[test]
    fn the_client_gets_a_short_list_of_variables_not_this_whole_environment() {
        let (_bin, program, work) = setup("env");
        let out = DockerBackend::new(config(&program)).unwrap().run(&request(work.path())).unwrap();
        let names: Vec<String> = String::from_utf8_lossy(&out.stdout).lines().map(String::from).collect();
        let allowed = ["HOME", "DOCKER_HOST", "DOCKER_CONFIG", "DOCKER_CONTEXT", "DOCKER_CERT_PATH", "DOCKER_TLS_VERIFY", "XDG_RUNTIME_DIR", "TMPDIR", "PATH", "PWD", "SHLVL", "_", "OLDPWD"];
        let extra: Vec<&String> = names.iter().filter(|n| !allowed.contains(&n.as_str())).collect();
        assert!(extra.is_empty(), "unexpected variables reached the docker client: {extra:?}");
    }

    #[test]
    fn a_missing_docker_program_is_an_error_not_a_silent_local_run() {
        let work = tempfile::tempdir().unwrap();
        let error = DockerBackend::new(config(Path::new("/definitely/not/docker"))).unwrap().run(&request(work.path())).unwrap_err();
        assert!(matches!(error, crate::capability::CapabilityError::SpawnFailed { .. }), "{error:?}");
    }

    #[test]
    fn cleanup_removes_only_containers_of_yana_processes_that_are_gone() {
        let (bin, program, _work) = setup("ok");
        let me = std::process::id();
        std::fs::write(bin.path().join("ps"), format!("aaaa1111 1999999999\nbbbb2222 {me}\nnot-hex 1999999999\ncccc3333\n")).unwrap();
        let backend = DockerBackend::new(config(&program)).unwrap();
        backend.cleanup();
        backend.cleanup();
        let seen = calls(bin.path());
        let removed: Vec<&String> = seen.iter().filter(|c| c.starts_with("rm -f")).collect();
        assert_eq!(removed, ["rm -f aaaa1111", "rm -f aaaa1111"], "{seen:?}");
        assert!(seen[0].starts_with("ps -a --filter label=yana.run"), "{seen:?}");
    }

    #[test]
    fn nothing_is_started_when_the_request_is_invalid() {
        let (bin, program, work) = setup("ok");
        let backend = DockerBackend::new(config(&program)).unwrap();
        assert!(backend.run(&ExecRequest { root: work.path().to_path_buf(), argv: Vec::new() }).is_err());
        assert!(backend.run(&ExecRequest { root: work.path().join("missing"), argv: argv(&["true"]) }).is_err());
        assert!(calls(bin.path()).is_empty());
    }
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
