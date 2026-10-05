//! SSH backend tests. No real ssh and no network: the `ssh` program is a small `sh` script that
//! records its arguments and runs the "remote" command locally, in a directory the test made.

use super::ssh::{cleanup_script, download_script, run_script, upload_script, SshBackend, SshConfig, SshLimits};
use super::staging::StagingLimits;
use super::{ExecBackend, ExecRequest};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const KEY: &str = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleExampleExampleExample0123";

struct Rig {
    _outer: tempfile::TempDir,
    bin: PathBuf,
    remote: PathBuf,
    key: PathBuf,
}

fn argv(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|p| p.to_string()).collect()
}

fn rig(mode: &str) -> Rig {
    let outer = tempfile::tempdir().unwrap();
    let base = outer.path().canonicalize().unwrap();
    let (bin, remote) = (base.join("bin"), base.join("remote/yana"));
    std::fs::create_dir_all(&bin).unwrap();
    std::fs::create_dir_all(&remote).unwrap();
    let script = r#"#!/bin/sh
here=$(dirname "$0")
echo "$*" >> "$here/calls"
for a in "$@"; do case "$a" in UserKnownHostsFile=*) kh=${a#UserKnownHostsFile=};; esac; last="$a"; done
if [ -n "$kh" ] && [ ! -f "$here/known_hosts_seen" ]; then cat "$kh" > "$here/known_hosts_seen"; fi
mode=$(cat "$here/mode" 2>/dev/null)
if [ "$mode" = fail255 ]; then echo "ssh: connect to host build.example port 22: Connection refused" >&2; exit 255; fi
exec sh -c "$last"
"#;
    std::fs::write(bin.join("ssh"), script).unwrap();
    std::fs::set_permissions(bin.join("ssh"), std::fs::Permissions::from_mode(0o755)).unwrap();
    std::fs::write(bin.join("mode"), mode).unwrap();
    let key = base.join("id_test");
    std::fs::write(&key, "not a real key").unwrap();
    std::fs::set_permissions(&key, std::fs::Permissions::from_mode(0o600)).unwrap();
    Rig { _outer: outer, bin, remote, key }
}

fn config(rig: &Rig) -> SshConfig {
    SshConfig {
        program: rig.bin.join("ssh"),
        host: "build.example".into(),
        port: 22,
        user: "me".into(),
        key_path: rig.key.clone(),
        host_key: KEY.into(),
        remote_base: rig.remote.display().to_string(),
        limits: SshLimits::default(),
        staging: StagingLimits::default(),
    }
}

fn project() -> tempfile::TempDir {
    let root = tempfile::tempdir().unwrap();
    for (name, text) in [("a.txt", "before"), ("b.txt", "bye"), (".env", "TOKEN=real"), (".git/config", "[core]"), ("src/main.rs", "fn main() {}")] {
        let path = root.path().join(name);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }
    root
}

fn calls(rig: &Rig) -> Vec<String> {
    std::fs::read_to_string(rig.bin.join("calls")).unwrap_or_default().lines().map(String::from).collect()
}

fn run(rig: &Rig, root: &Path, command: &[&str]) -> Result<super::ExecOutput, crate::capability::CapabilityError> {
    SshBackend::new(config(rig)).unwrap().run(&ExecRequest { root: root.to_path_buf(), argv: argv(command) })
}

fn text(root: &Path, name: &str) -> String {
    std::fs::read_to_string(root.join(name)).unwrap()
}

// ---- pure parts ----

#[test]
fn every_ssh_call_pins_the_host_and_turns_off_what_could_widen_access() {
    let r = rig("ok");
    let c = config(&r);
    let options = c.ssh_options(Path::new("/private/hosts/known_hosts")).join(" ");
    for needed in [
        "-F /dev/null", "-T", "-x", "-a", "BatchMode=yes", "PasswordAuthentication=no", "PreferredAuthentications=publickey", "IdentitiesOnly=yes", "IdentityAgent=none",
        "ForwardAgent=no", "ForwardX11=no", "ClearAllForwardings=yes", "StrictHostKeyChecking=yes", "GlobalKnownHostsFile=/dev/null", "UserKnownHostsFile=/private/hosts/known_hosts",
        "ProxyCommand=none", "ControlPath=none", "PermitLocalCommand=no", "RequestTTY=no", "VerifyHostKeyDNS=no", "-p 22",
    ] {
        assert!(options.contains(needed), "{needed}: {options}");
    }
    assert!(options.contains(&format!("-i {}", r.key.display())));
    for never in ["StrictHostKeyChecking=no", "accept-new", "StrictHostKeyChecking=ask", "ForwardAgent=yes", "PasswordAuthentication=yes", " -A", "-Y", " -X"] {
        assert!(!options.contains(never), "{never}: {options}");
    }
    assert_eq!(c.target(), "me@build.example");
}

#[test]
fn the_pinned_line_names_the_host_and_the_port() {
    let r = rig("ok");
    let mut c = config(&r);
    assert_eq!(c.known_hosts_line(), format!("build.example {KEY}\n"));
    c.port = 2222;
    assert_eq!(c.known_hosts_line(), format!("[build.example]:2222 {KEY}\n"));
}

#[test]
fn a_configuration_that_could_reach_further_than_intended_is_refused() {
    let r = rig("ok");
    let base = config(&r);
    assert!(base.validate().is_ok());
    let cases: Vec<(&str, SshConfig)> = vec![
        ("relative program", SshConfig { program: "ssh".into(), ..base.clone() }),
        ("host option", SshConfig { host: "-oProxyCommand=x".into(), ..base.clone() }),
        ("host with space", SshConfig { host: "a b".into(), ..base.clone() }),
        ("host with semicolon", SshConfig { host: "a;b".into(), ..base.clone() }),
        ("empty host", SshConfig { host: "".into(), ..base.clone() }),
        ("port 0", SshConfig { port: 0, ..base.clone() }),
        ("user with at", SshConfig { user: "me@evil".into(), ..base.clone() }),
        ("user option", SshConfig { user: "-l".into(), ..base.clone() }),
        ("relative key", SshConfig { key_path: "id_rsa".into(), ..base.clone() }),
        ("unknown key type", SshConfig { host_key: "ssh-dss AAAAB3NzaC1kc3MAAACBAExampleExample".into(), ..base.clone() }),
        ("key with a comment", SshConfig { host_key: format!("{KEY} me@laptop"), ..base.clone() }),
        ("short key", SshConfig { host_key: "ssh-ed25519 AAAA".into(), ..base.clone() }),
        ("key with a newline", SshConfig { host_key: format!("{KEY}\nevil ssh-rsa AAAA"), ..base.clone() }),
        ("root base", SshConfig { remote_base: "/".into(), ..base.clone() }),
        ("one level base", SshConfig { remote_base: "/home".into(), ..base.clone() }),
        ("relative base", SshConfig { remote_base: "work/yana".into(), ..base.clone() }),
        ("tilde base", SshConfig { remote_base: "~/yana".into(), ..base.clone() }),
        ("dotdot base", SshConfig { remote_base: "/home/me/../root".into(), ..base.clone() }),
        ("base with space", SshConfig { remote_base: "/home/me/a b".into(), ..base.clone() }),
        ("base with quote", SshConfig { remote_base: "/home/me/a'b".into(), ..base.clone() }),
        ("trailing slash", SshConfig { remote_base: "/home/me/yana/".into(), ..base.clone() }),
        ("no time limit", SshConfig { limits: SshLimits { wall: Duration::from_secs(0), ..SshLimits::default() }, ..base.clone() }),
        ("huge transfer time", SshConfig { limits: SshLimits { transfer_wall: Duration::from_secs(99_999), ..SshLimits::default() }, ..base.clone() }),
    ];
    for (label, config) in cases {
        assert!(config.validate().is_err(), "{label}");
        assert!(SshBackend::new(config).is_err(), "{label}");
    }
}

#[test]
fn the_remote_commands_quote_everything_the_model_chose() {
    let dir = "/home/me/yana/0123456789abcdef";
    assert_eq!(upload_script("/home/me/yana", dir), "umask 077 && mkdir -p /home/me/yana && mkdir /home/me/yana/0123456789abcdef && tar -xf - -C /home/me/yana/0123456789abcdef");
    assert_eq!(download_script(dir), "tar --format=ustar -C /home/me/yana/0123456789abcdef -cf - .");
    assert_eq!(cleanup_script(dir), "chmod -R u+rwX /home/me/yana/0123456789abcdef 2>/dev/null; rm -rf /home/me/yana/0123456789abcdef");
    let script = run_script(dir, 120, &argv(&["echo", "a b", "$(touch /tmp/x)", "it's", "; rm -rf ~"]));
    assert!(script.starts_with("cd /home/me/yana/0123456789abcdef && exec env 'YANA_AGENT_CHILD=1' sh -c "), "{script}");
    for quoted in ["'a b'", "'$(touch /tmp/x)'", "'; rm -rf ~'", "'it'\\''s'"] {
        assert!(script.contains(quoted), "{quoted}: {script}");
    }
    assert!(script.contains(" 120 echo "), "{script}");
}

#[test]
fn the_disclosure_says_where_what_is_pinned_and_what_is_sent() {
    let r = rig("ok");
    let text = SshBackend::new(config(&r)).unwrap().disclosure().notes.join("\n");
    for needle in ["build.example:22 as me", &r.key.display().to_string(), "host key is pinned", "ssh-ed25519", "private copy", "leaving out .git, .yana-ai", "remote shell must be POSIX", "never over a file that changed"] {
        assert!(text.contains(needle), "{needle}: {text}");
    }
}

// ---- with the fake ssh ----

#[test]
fn a_run_sends_a_copy_without_secrets_runs_there_and_copies_checked_changes_back() {
    let r = rig("ok");
    let root = project();
    let out = run(&r, root.path(), &["sh", "-c", "ls -A; echo changed > a.txt; echo made > out.txt; rm b.txt; echo done"]).unwrap();
    let said = String::from_utf8_lossy(&out.stdout).to_string();
    assert!(said.contains("a.txt") && said.contains("src") && said.ends_with("done\n"), "{said}");
    assert!(!said.contains(".env") && !said.contains(".git"), "the remote side must not get secrets or .git: {said}");
    assert_eq!((out.exit_code, out.timed_out), (Some(0), false));
    assert_eq!((text(root.path(), "a.txt").trim(), text(root.path(), "out.txt").trim()), ("changed", "made"));
    assert!(!root.path().join("b.txt").exists());
    assert_eq!(text(root.path(), ".env"), "TOKEN=real");
    assert_eq!(text(root.path(), ".git/config"), "[core]");
    let notes = out.notes.join(" | ");
    assert!(notes.contains("copied back: 2 written, 1 deleted") && notes.contains("written on this machine: a.txt, out.txt") && notes.contains(".env (secret-looking name)"), "{notes}");
    assert_eq!(std::fs::read_dir(&r.remote).unwrap().count(), 0, "the remote run directory is removed");
}

#[test]
fn every_call_carries_the_pinned_options_and_the_key_file_holds_only_the_pin() {
    let r = rig("ok");
    let root = project();
    run(&r, root.path(), &["true"]).unwrap();
    let seen = calls(&r);
    assert_eq!(seen.len(), 4, "send, run, receive, clean up: {seen:?}");
    for call in &seen {
        assert!(call.contains("StrictHostKeyChecking=yes") && call.contains("-F /dev/null") && call.contains("me@build.example"), "{call}");
    }
    assert_eq!(std::fs::read_to_string(r.bin.join("known_hosts_seen")).unwrap(), format!("build.example {KEY}\n"));
    let leftovers: Vec<String> = std::fs::read_dir(std::env::temp_dir()).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).filter(|n| n.starts_with("yana-ssh-")).collect();
    let known = std::fs::read_to_string(r.bin.join("calls")).unwrap();
    let kh = known.split("UserKnownHostsFile=").nth(1).unwrap().split(' ').next().unwrap().to_string();
    assert!(!Path::new(&kh).exists(), "the pinned-key file is removed: {kh} {leftovers:?}");
}

#[test]
fn a_command_that_plants_protected_or_secret_files_or_links_changes_nothing_on_this_machine() {
    let r = rig("ok");
    let root = project();
    let evil = "mkdir -p .git/hooks .yana-ai node_modules/x; echo evil > .git/hooks/pre-commit; echo evil > .git/config; echo x > .yana-ai/leases.json; echo x > .env.local; echo x > deploy.pem; echo x > node_modules/x/i.js; ln -s /etc/passwd passwd-link; ln a.txt hard-link";
    let out = run(&r, root.path(), &["sh", "-c", evil]).unwrap();
    assert_eq!(out.exit_code, Some(0));
    for planted in [".yana-ai", ".env.local", "deploy.pem", "node_modules", "passwd-link", ".git/hooks"] {
        assert!(!root.path().join(planted).exists(), "{planted} must not appear on this machine");
    }
    assert_eq!(text(root.path(), ".git/config"), "[core]");
    assert_eq!(text(root.path(), "a.txt"), "before");
    let notes = out.notes.join(" | ");
    assert!(notes.contains("entries from the remote side were ignored"), "{notes}");
}

#[test]
fn a_failing_command_is_a_result_but_an_ssh_failure_is_an_error_and_nothing_stays_behind() {
    let r = rig("ok");
    let root = project();
    let out = run(&r, root.path(), &["sh", "-c", "echo oops >&2; exit 3"]).unwrap();
    assert_eq!(out.exit_code, Some(3));
    assert!(String::from_utf8_lossy(&out.stderr).contains("oops"));
    let r = rig("fail255");
    let error = run(&r, root.path(), &["true"]).unwrap_err();
    assert!(error.to_string().contains("Connection refused"), "{error}");
    assert_eq!(text(root.path(), "a.txt"), "before");
}

#[test]
fn a_command_that_outlasts_its_limit_is_stopped_and_nothing_is_copied_back() {
    let r = rig("ok");
    let root = project();
    let mut c = config(&r);
    c.limits.wall = Duration::from_secs(2);
    let started = Instant::now();
    let out = SshBackend::new(c).unwrap().run(&ExecRequest { root: root.path().to_path_buf(), argv: argv(&["sh", "-c", "echo changed > a.txt; sleep 30"]) }).unwrap();
    assert!(started.elapsed() < Duration::from_secs(20), "{:?}", started.elapsed());
    assert!(out.timed_out && out.exit_code.is_none());
    assert_eq!(text(root.path(), "a.txt"), "before");
    assert!(out.notes.iter().any(|n| n.contains("not copied back")), "{:?}", out.notes);
    assert_eq!(std::fs::read_dir(&r.remote).unwrap().count(), 0, "the remote directory is removed even after a timeout");
}

#[test]
fn a_key_file_others_can_read_or_that_is_missing_stops_the_run_before_any_call() {
    let r = rig("ok");
    let root = project();
    std::fs::set_permissions(&r.key, std::fs::Permissions::from_mode(0o644)).unwrap();
    assert!(run(&r, root.path(), &["true"]).unwrap_err().to_string().contains("chmod 600"));
    std::fs::remove_file(&r.key).unwrap();
    assert!(run(&r, root.path(), &["true"]).unwrap_err().to_string().contains("does not exist"));
    assert!(calls(&r).is_empty());
}

#[test]
fn a_work_directory_that_is_the_machine_is_refused_before_any_call() {
    let r = rig("ok");
    assert!(run(&r, Path::new("/"), &["true"]).is_err());
    assert!(calls(&r).is_empty());
}

#[test]
fn bash_and_zsh_cannot_expand_what_the_model_wrote() {
    // Brace expansion, history marks, globs and carets are all quoted, so a real bash (not
    // only a plain sh) receives each word exactly as written.
    let words = ["{a,--output=/x}", "x{1..3}", "!!", "^a^b", "*.rs", "~root", "a=b", "tab\there", "ünï", "", "$HOME", "`id`"];
    let line: Vec<String> = words.iter().map(|w| super::ssh::quote(w)).collect();
    let script = format!("printf '%s\\n' {}", line.join(" "));
    let Ok(out) = std::process::Command::new("bash").arg("-c").arg(&script).output() else { return };
    let got: Vec<String> = String::from_utf8_lossy(&out.stdout).lines().map(String::from).collect();
    assert_eq!(got, words.iter().map(|w| w.to_string()).collect::<Vec<_>>(), "{script}");
}

#[test]
fn a_hostile_key_or_known_hosts_path_is_not_given_to_ssh() {
    let r = rig("ok");
    for bad in ["/tmp/my key", "/tmp/k%h", "/tmp/k'x", "/tmp/k\\x", "/tmp/k\"x"] {
        let c = SshConfig { key_path: bad.into(), ..config(&r) };
        assert!(c.validate().is_err(), "{bad}");
    }
}

#[test]
fn the_host_is_pinned_in_lower_case_and_a_run_directory_that_already_exists_is_refused() {
    let r = rig("ok");
    let mut c = config(&r);
    c.host = "Build.Example".into();
    assert!(c.known_hosts_line().starts_with("build.example "));
    // `mkdir DIR` (no -p) fails when the directory was prepared by someone else.
    let dir = r.remote.join("0123456789abcdef");
    std::fs::create_dir_all(&dir).unwrap();
    let script = upload_script(&r.remote.display().to_string(), &dir.display().to_string());
    let status = std::process::Command::new("sh").arg("-c").arg(&script).stdin(std::process::Stdio::null()).output().unwrap();
    assert!(!status.status.success(), "an existing run directory must stop the upload");
}

#[test]
fn a_remote_that_is_killed_by_a_signal_or_leaves_its_directory_is_not_taken_for_a_result() {
    // ssh killed by a signal: no exit code, not a timeout. Nothing is copied back.
    let r = rig("ok");
    let root = project();
    let mut c = config(&r);
    c.limits.wall = Duration::from_secs(5);
    let out = SshBackend::new(c).unwrap().run(&ExecRequest { root: root.path().to_path_buf(), argv: argv(&["sh", "-c", "echo changed > a.txt; kill -9 $PPID; sleep 5"]) });
    if let Ok(done) = &out {
        assert_eq!(text(root.path(), "a.txt"), "before", "{:?}", done.notes);
    }
}
