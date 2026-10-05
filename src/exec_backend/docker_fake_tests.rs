//! Docker backend tests with a fake `docker`: a small `sh` script that records what it
//! was asked and behaves as a control file says. Unix only (the script is `sh`).

use super::docker::DockerBackend;
use super::docker_tests::{argv, config, pinned, DIGEST};
use super::{ExecBackend, ExecRequest};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// A `docker` that appends its arguments to `calls` and acts as `mode` says.
fn fake_docker(dir: &Path) -> PathBuf {
    let script = r#"#!/bin/sh
here=$(dirname "$0")
echo "$*" >> "$here/calls"
mode=$(cat "$here/mode" 2>/dev/null)
case "$1" in
  ps) cat "$here/ps" 2>/dev/null; exit 0;;
  kill|rm) exit 0;;
  inspect) if [ "$mode" = alive ]; then echo "{}"; exit 0; fi; echo "Error: No such object: $2" >&2; exit 1;;
esac
case "$mode" in
  hang) sleep 30;;
  exit3) echo partial; echo oops >&2; exit 3;;
  exit125) echo "docker: Error response from daemon: boom" >&2; exit 125;;
  signal) kill -9 $$;;
  write)
    for a in "$@"; do case "$a" in type=bind,source=*) src=${a#type=bind,source=}; src=${src%%,target=*};; esac; done
    echo "$src" > "$here/staging_path"
    ls -A "$src" > "$here/staging_listing"
    echo changed > "$src/a.txt"; echo made > "$src/out.txt"; rm "$src/b.txt"
    mkdir -p "$src/.git"; echo evil > "$src/.git/config"; echo planted > "$src/.env"
    echo done;;
  writehang)
    for a in "$@"; do case "$a" in type=bind,source=*) src=${a#type=bind,source=}; src=${src%%,target=*};; esac; done
    echo "$src" > "$here/staging_path"; echo changed > "$src/a.txt"; sleep 30;;
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
    assert_eq!(seen.len(), 2, "{seen:?}");
    assert!(seen[1].starts_with("inspect yana-"), "the daemon is asked whether the container is gone: {seen:?}");
    assert!(seen[0].starts_with("run --rm --init --pull never --name yana-") && seen[0].contains(DIGEST) && seen[0].ends_with("echo hi"), "{}", seen[0]);
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
    c.limits.wall = Duration::from_secs(2);
    let started = Instant::now();
    let out = DockerBackend::new(c).unwrap().run(&request(work.path())).unwrap();
    assert!(started.elapsed() < Duration::from_secs(12), "{:?}", started.elapsed());
    assert!(out.timed_out && out.exit_code.is_none());
    let seen = calls(bin.path());
    let run = seen.iter().position(|c| c.starts_with("run ")).unwrap_or_else(|| panic!("the container was started: {seen:?}"));
    let name = seen[run].split_whitespace().nth(6).unwrap().to_string();
    assert!(name.starts_with("yana-"), "{name}");
    assert_eq!(&seen[run + 1..], [format!("kill {name}"), format!("rm -f {name}")], "{seen:?}");
}

#[test]
fn docker_failing_itself_or_dying_by_a_signal_is_an_error_not_a_command_result() {
    for (mode, needle) in [("exit125", "boom"), ("signal", "without an exit code")] {
        let (_bin, program, work) = setup(mode);
        let error = DockerBackend::new(config(&program)).unwrap().run(&request(work.path())).unwrap_err();
        assert!(error.to_string().contains(needle), "{mode}: {error}");
    }
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
fn cleanup_removes_only_containers_past_their_deadline_whoever_started_them() {
    let (bin, program, _work) = setup("ok");
    let now = 5_000_000u64;
    std::fs::write(
        bin.path().join("ps"),
        format!(
            "aaaa1111 yana-aaaa {}\nbbbb2222 yana-bbbb {}\nnot-hex yana-cc {}\ndddd4444 other-name {}\neeee5555 yana-ee\nffff6666 yana-ff soon\n",
            now - 1,
            now + 100,
            now - 1,
            now - 1
        ),
    )
    .unwrap();
    let c = config(&program);
    super::docker_run::reap_orphans_at(&c, now);
    let seen = calls(bin.path());
    assert!(seen[0].starts_with("ps -a --filter label=yana.run"), "{seen:?}");
    assert_eq!(&seen[1..], ["rm -f aaaa1111"], "only the expired Yana container: {seen:?}");
}

#[test]
fn only_a_local_docker_daemon_is_used() {
    use super::docker_run::check_daemon;
    for (host, context) in [(None, None), (Some(""), None), (Some("unix:///var/run/docker.sock"), None), (None, Some("default"))] {
        assert!(check_daemon(host, context).is_ok(), "{host:?} {context:?}");
    }
    for (host, context) in [(Some("tcp://build-host:2375"), None), (Some("ssh://me@host"), None), (None, Some("remote-ci"))] {
        let error = check_daemon(host, context).unwrap_err();
        assert!(error.to_string().contains("away from the local Docker daemon"), "{host:?} {context:?}: {error}");
    }
}

#[test]
fn nothing_is_started_when_the_request_is_invalid() {
    let (bin, program, work) = setup("ok");
    let backend = DockerBackend::new(config(&program)).unwrap();
    assert!(backend.run(&ExecRequest { root: work.path().to_path_buf(), argv: Vec::new() }).is_err());
    assert!(backend.run(&ExecRequest { root: work.path().join("missing"), argv: argv(&["true"]) }).is_err());
    assert!(calls(bin.path()).is_empty());
}

fn project_for_sync() -> tempfile::TempDir {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("a.txt"), "before").unwrap();
    std::fs::write(root.path().join("b.txt"), "bye").unwrap();
    std::fs::write(root.path().join(".env"), "TOKEN=real").unwrap();
    std::fs::create_dir_all(root.path().join(".git")).unwrap();
    std::fs::write(root.path().join(".git/config"), "[core]").unwrap();
    root
}

#[test]
fn a_run_works_on_a_copy_and_only_checked_changes_come_back() {
    let (bin, program, _unused) = setup("write");
    let work = project_for_sync();
    let out = DockerBackend::new(config(&program)).unwrap().run(&request(work.path())).unwrap();
    assert_eq!(String::from_utf8_lossy(&out.stdout), "done\n");
    // The container saw a copy without the secret or .git.
    let staging = std::fs::read_to_string(bin.path().join("staging_path")).unwrap().trim().to_string();
    assert!(!staging.starts_with(work.path().canonicalize().unwrap().to_str().unwrap()), "the copy is outside the project: {staging}");
    let listing = std::fs::read_to_string(bin.path().join("staging_listing")).unwrap();
    assert!(listing.contains("a.txt") && !listing.contains(".env") && !listing.contains(".git"), "{listing}");
    // On this machine: edits, new file and deletion came back; planted files did not.
    let read = |name: &str| std::fs::read_to_string(work.path().join(name)).unwrap();
    assert_eq!((read("a.txt").trim(), read("out.txt").trim()), ("changed", "made"));
    assert!(!work.path().join("b.txt").exists());
    assert_eq!(read(".env"), "TOKEN=real");
    assert_eq!(read(".git/config"), "[core]");
    let notes = out.notes.join(" | ");
    assert!(notes.contains("copied back: 2 written, 1 deleted") && notes.contains("written on this machine: a.txt, out.txt") && notes.contains(".git (protected folder)") && notes.contains(".env (secret-looking name)"), "{notes}");
    assert!(!Path::new(&staging).exists(), "the copy is removed after the run");
}

#[test]
fn a_run_that_times_out_copies_nothing_back_and_still_removes_its_copy() {
    let (bin, program, _unused) = setup("writehang");
    let work = project_for_sync();
    let mut c = config(&program);
    c.limits.wall = Duration::from_secs(2);
    let out = DockerBackend::new(c).unwrap().run(&request(work.path())).unwrap();
    assert!(out.timed_out);
    assert_eq!(std::fs::read_to_string(work.path().join("a.txt")).unwrap(), "before");
    assert!(out.notes.iter().any(|n| n.contains("not copied back")), "{:?}", out.notes);
    let staging = std::fs::read_to_string(bin.path().join("staging_path")).unwrap();
    assert!(!Path::new(staging.trim()).exists());
}

#[test]
fn a_docker_error_removes_the_copy_and_changes_nothing() {
    let (bin, program, _unused) = setup("exit125");
    let work = project_for_sync();
    assert!(DockerBackend::new(config(&program)).unwrap().run(&request(work.path())).is_err());
    assert_eq!(std::fs::read_to_string(work.path().join("a.txt")).unwrap(), "before");
    let _ = bin;
}

#[test]
fn nothing_is_copied_back_while_the_container_still_exists() {
    let (bin, program, _unused) = setup("alive");
    let work = project_for_sync();
    let out = DockerBackend::new(config(&program)).unwrap().run(&request(work.path())).unwrap();
    assert!(out.notes.iter().any(|n| n.contains("could not be confirmed to have stopped")), "{:?}", out.notes);
    assert_eq!(std::fs::read_to_string(work.path().join("a.txt")).unwrap(), "before");
    let seen = calls(bin.path());
    assert!(seen.iter().any(|c| c.starts_with("kill yana-")) && seen.iter().any(|c| c.starts_with("rm -f yana-")), "{seen:?}");
}
