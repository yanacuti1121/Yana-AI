//! Explicit installation of the native per-user automatic sampler.
//!
//! Nothing is installed during package setup. A human runs `service install`
//! once; launchd, a systemd user timer, or Windows Task Scheduler then invokes
//! the one-shot Rust sampler. This avoids a custom always-resident daemon.

use anyhow::{bail, Context, Result};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const MINIMUM_INTERVAL_SECS: u64 = 30;

#[derive(Debug, Clone, Serialize)]
pub struct ServiceReport {
    pub platform: String,
    pub installed: bool,
    pub active: Option<bool>,
    pub project_root: String,
    pub definition_paths: Vec<String>,
    pub detail: String,
}

struct Definition {
    paths: Vec<PathBuf>,
    contents: Vec<String>,
    start: Vec<Invocation>,
    stop: Vec<Invocation>,
}

struct Invocation {
    program: String,
    args: Vec<String>,
    tolerate_failure: bool,
}

pub fn install(root: &Path, interval_secs: u64) -> Result<ServiceReport> {
    let minimum_interval = minimum_interval_secs();
    if interval_secs < minimum_interval {
        bail!("monitor interval must be at least {minimum_interval} seconds on this platform");
    }
    let binary = env::current_exe().context("resolving current yana-rt binary")?;
    let definition = definition(root, &binary, interval_secs)?;
    for (path, content) in definition.paths.iter().zip(&definition.contents) {
        write_definition(path, content)?;
    }
    for invocation in &definition.start {
        invoke(invocation)?;
    }
    Ok(ServiceReport {
        platform: env::consts::OS.into(),
        installed: true,
        active: active_state(root)?,
        project_root: root.display().to_string(),
        definition_paths: definition
            .paths
            .iter()
            .map(|path| path.display().to_string())
            .collect(),
        detail: format!("automatic sampling enabled every {interval_secs}s"),
    })
}

pub fn status(root: &Path) -> Result<ServiceReport> {
    let binary = env::current_exe().context("resolving current yana-rt binary")?;
    let definition = definition(root, &binary, 60)?;
    let installed = definition.paths.iter().all(|path| path.is_file());
    Ok(ServiceReport {
        platform: env::consts::OS.into(),
        installed,
        active: installed.then(|| active_state(root)).transpose()?.flatten(),
        project_root: root.display().to_string(),
        definition_paths: definition
            .paths
            .iter()
            .map(|path| path.display().to_string())
            .collect(),
        detail: if installed {
            "native sampler definition present".into()
        } else {
            "native sampler is not installed".into()
        },
    })
}

pub fn uninstall(root: &Path) -> Result<ServiceReport> {
    let binary = env::current_exe().context("resolving current yana-rt binary")?;
    let definition = definition(root, &binary, 60)?;
    for invocation in &definition.stop {
        invoke(invocation)?;
    }
    for path in &definition.paths {
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(error).with_context(|| format!("removing {}", path.display()))
            }
        }
    }
    refresh_after_remove()?;
    Ok(ServiceReport {
        platform: env::consts::OS.into(),
        installed: false,
        active: Some(false),
        project_root: root.display().to_string(),
        definition_paths: definition
            .paths
            .iter()
            .map(|path| path.display().to_string())
            .collect(),
        detail: "automatic sampling disabled and definitions removed".into(),
    })
}

pub fn print(report: &ServiceReport, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(report)?);
    } else {
        println!("Yana system monitor service");
        println!("  platform    {}", report.platform);
        println!("  installed   {}", report.installed);
        println!(
            "  active      {}",
            report
                .active
                .map_or("—", |value| if value { "yes" } else { "no" })
        );
        println!("  project     {}", report.project_root);
        println!("  detail      {}", report.detail);
        for path in &report.definition_paths {
            println!("  definition  {path}");
        }
    }
    Ok(())
}

fn project_id(root: &Path) -> String {
    let digest = Sha256::digest(root.to_string_lossy().as_bytes());
    digest
        .iter()
        .take(5)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn home() -> Result<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| {
            anyhow::anyhow!("HOME/USERPROFILE is required to install a per-user monitor")
        })
}

#[cfg(target_os = "macos")]
fn definition(root: &Path, binary: &Path, interval_secs: u64) -> Result<Definition> {
    let id = project_id(root);
    let label = format!("com.yana.system-health.{id}");
    let path = home()?
        .join("Library/LaunchAgents")
        .join(format!("{label}.plist"));
    let content = render_launchd(&label, binary, root, interval_secs);
    Ok(Definition {
        paths: vec![path.clone()],
        contents: vec![content],
        start: vec![
            Invocation {
                program: "launchctl".into(),
                args: vec!["unload".into(), path.display().to_string()],
                tolerate_failure: true,
            },
            Invocation {
                program: "launchctl".into(),
                args: vec!["load".into(), path.display().to_string()],
                tolerate_failure: false,
            },
        ],
        stop: vec![Invocation {
            program: "launchctl".into(),
            args: vec!["unload".into(), path.display().to_string()],
            tolerate_failure: true,
        }],
    })
}

#[cfg(target_os = "linux")]
fn definition(root: &Path, binary: &Path, interval_secs: u64) -> Result<Definition> {
    let id = project_id(root);
    let base = env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or(home()?.join(".config"))
        .join("systemd/user");
    let service_name = format!("yana-system-health-{id}.service");
    let timer_name = format!("yana-system-health-{id}.timer");
    let service_path = base.join(&service_name);
    let timer_path = base.join(&timer_name);
    let (service, timer) = render_systemd(binary, root, interval_secs);
    Ok(Definition {
        paths: vec![service_path, timer_path],
        contents: vec![service, timer],
        start: vec![
            Invocation {
                program: "systemctl".into(),
                args: vec!["--user".into(), "daemon-reload".into()],
                tolerate_failure: false,
            },
            Invocation {
                program: "systemctl".into(),
                args: vec![
                    "--user".into(),
                    "enable".into(),
                    "--now".into(),
                    timer_name.clone(),
                ],
                tolerate_failure: false,
            },
        ],
        stop: vec![Invocation {
            program: "systemctl".into(),
            args: vec![
                "--user".into(),
                "disable".into(),
                "--now".into(),
                timer_name,
            ],
            tolerate_failure: true,
        }],
    })
}

#[cfg(target_os = "windows")]
fn definition(root: &Path, binary: &Path, interval_secs: u64) -> Result<Definition> {
    let id = project_id(root);
    let task_name = format!("YanaSystemHealth-{id}");
    let base = env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or(home()?.join("AppData/Local"))
        .join("YanaAI/Monitor");
    let path = base.join(format!("{task_name}.xml"));
    let content = render_windows_task(binary, root, interval_secs);
    Ok(Definition {
        paths: vec![path.clone()],
        contents: vec![content],
        start: vec![Invocation {
            program: "schtasks.exe".into(),
            args: vec![
                "/Create".into(),
                "/F".into(),
                "/TN".into(),
                task_name.clone(),
                "/XML".into(),
                path.display().to_string(),
            ],
            tolerate_failure: false,
        }],
        stop: vec![Invocation {
            program: "schtasks.exe".into(),
            args: vec!["/Delete".into(), "/F".into(), "/TN".into(), task_name],
            tolerate_failure: true,
        }],
    })
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn definition(_root: &Path, _binary: &Path, _interval_secs: u64) -> Result<Definition> {
    bail!("automatic system monitoring is supported on macOS, Linux, and Windows")
}

fn invoke(invocation: &Invocation) -> Result<()> {
    let status = Command::new(&invocation.program)
        .args(&invocation.args)
        .status();
    match status {
        Ok(status) if status.success() || invocation.tolerate_failure => Ok(()),
        Ok(status) => bail!(
            "{} exited with {}",
            invocation.program,
            status.code().unwrap_or(-1)
        ),
        Err(_) if invocation.tolerate_failure => Ok(()),
        Err(error) => Err(error).with_context(|| format!("starting {}", invocation.program)),
    }
}

fn write_definition(path: &Path, content: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => bail!(
            "refusing to replace non-regular service definition: {}",
            path.display()
        ),
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error).with_context(|| format!("inspecting {}", path.display())),
    }
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = path.with_extension(format!("tmp.{}.{}", std::process::id(), nonce));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    let mut file = options.open(&temporary)?;
    file.write_all(content.as_bytes())?;
    file.sync_all()?;
    let result = (|| -> Result<()> {
        #[cfg(target_os = "windows")]
        if path.exists() {
            fs::remove_file(path)?;
        }
        fs::rename(&temporary, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(target_os = "linux")]
fn refresh_after_remove() -> Result<()> {
    invoke(&Invocation {
        program: "systemctl".into(),
        args: vec!["--user".into(), "daemon-reload".into()],
        tolerate_failure: true,
    })
}

#[cfg(not(target_os = "linux"))]
fn refresh_after_remove() -> Result<()> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn minimum_interval_secs() -> u64 {
    60
}

#[cfg(not(target_os = "windows"))]
fn minimum_interval_secs() -> u64 {
    MINIMUM_INTERVAL_SECS
}

#[cfg(target_os = "macos")]
fn active_state(root: &Path) -> Result<Option<bool>> {
    let label = format!("com.yana.system-health.{}", project_id(root));
    let output = Command::new("launchctl").args(["list", &label]).output();
    Ok(output.ok().map(|value| value.status.success()))
}

#[cfg(target_os = "linux")]
fn active_state(root: &Path) -> Result<Option<bool>> {
    let timer = format!("yana-system-health-{}.timer", project_id(root));
    let output = Command::new("systemctl")
        .args(["--user", "is-active", "--quiet", &timer])
        .output();
    Ok(output.ok().map(|value| value.status.success()))
}

#[cfg(target_os = "windows")]
fn active_state(root: &Path) -> Result<Option<bool>> {
    let task = format!("YanaSystemHealth-{}", project_id(root));
    let output = Command::new("schtasks.exe")
        .args(["/Query", "/TN", &task])
        .output();
    Ok(output.ok().map(|value| value.status.success()))
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn active_state(_root: &Path) -> Result<Option<bool>> {
    Ok(None)
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(any(test, target_os = "linux"))]
fn systemd_escape(value: &Path) -> String {
    format!(
        "\"{}\"",
        value
            .display()
            .to_string()
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
    )
}

fn render_launchd(label: &str, binary: &Path, root: &Path, interval_secs: u64) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>{}</string>
<key>ProgramArguments</key><array><string>{}</string><string>os</string><string>monitor</string><string>sample</string><string>--dir</string><string>{}</string><string>--json</string></array>
<key>WorkingDirectory</key><string>{}</string>
<key>RunAtLoad</key><true/><key>StartInterval</key><integer>{interval_secs}</integer>
<key>ProcessType</key><string>Background</string>
</dict></plist>
"#,
        xml_escape(label),
        xml_escape(&binary.display().to_string()),
        xml_escape(&root.display().to_string()),
        xml_escape(&root.display().to_string())
    )
}

#[cfg(any(test, target_os = "linux"))]
fn render_systemd(binary: &Path, root: &Path, interval_secs: u64) -> (String, String) {
    let service = format!("[Unit]\nDescription=Yana system health snapshot ({})\n\n[Service]\nType=oneshot\nWorkingDirectory={}\nExecStart={} os monitor sample --dir {} --json\nNoNewPrivileges=true\nPrivateTmp=true\n", root.display(), systemd_escape(root), systemd_escape(binary), systemd_escape(root));
    let timer = format!("[Unit]\nDescription=Schedule Yana system health snapshots\n\n[Timer]\nOnBootSec=10s\nOnUnitActiveSec={interval_secs}s\nAccuracySec=5s\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n");
    (service, timer)
}

#[cfg(any(test, target_os = "windows"))]
fn render_windows_task(binary: &Path, root: &Path, interval_secs: u64) -> String {
    let interval = format!("PT{}M", interval_secs.div_ceil(60));
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
<Triggers><TimeTrigger><Repetition><Interval>{interval}</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><StartBoundary>2020-01-01T00:00:00</StartBoundary><Enabled>true</Enabled></TimeTrigger></Triggers>
<Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT1M</ExecutionTimeLimit></Settings>
<Actions Context="Author"><Exec><Command>{}</Command><Arguments>os monitor sample --dir &quot;{}&quot; --json</Arguments><WorkingDirectory>{}</WorkingDirectory></Exec></Actions>
</Task>
"#,
        xml_escape(&binary.display().to_string()),
        xml_escape(&root.display().to_string()),
        xml_escape(&root.display().to_string())
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn service_identifiers_are_stable_and_project_specific() {
        assert_eq!(project_id(Path::new("/a")), project_id(Path::new("/a")));
        assert_ne!(project_id(Path::new("/a")), project_id(Path::new("/b")));
    }

    #[test]
    fn renderers_preserve_paths_and_do_not_use_shells() {
        let binary = Path::new("/Applications/Yana AI/yana-rt");
        let root = Path::new("/tmp/project & one");
        let launchd = render_launchd("com.yana.test", binary, root, 60);
        assert!(launchd.contains("/Applications/Yana AI/yana-rt"));
        assert!(launchd.contains("project &amp; one"));
        assert!(!launchd.contains("/bin/sh"));
        let (service, timer) = render_systemd(binary, root, 60);
        assert!(service.contains("ExecStart=\"/Applications/Yana AI/yana-rt\""));
        assert!(timer.contains("OnUnitActiveSec=60s"));
        let windows = render_windows_task(
            Path::new(r"C:\Program Files\Yana\yana-rt.exe"),
            Path::new(r"C:\Users\A B\Project"),
            61,
        );
        assert!(windows.contains("PT2M"));
        assert!(windows.contains("MultipleInstancesPolicy>IgnoreNew"));
    }

    #[test]
    fn minimum_interval_prevents_runaway_sampling() {
        assert!(10 < minimum_interval_secs());
    }
}
