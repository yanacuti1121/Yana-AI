//! Linux systemd (per-user) definition for a resident always-on service.
//!
//! A plain `.service` unit with `Restart=always`, enabled and started
//! immediately — no `.timer` unit, unlike `os::monitor_service`'s
//! periodic-tick sampler; this one is meant to stay running.

#[cfg(target_os = "linux")]
use super::manager::{home, identity, Invocation, PlatformPlan, RuntimeInspection};
#[cfg(any(test, target_os = "linux"))]
use super::manager::{systemd_escape, ServiceDefinition};
#[cfg(target_os = "linux")]
use anyhow::Result;
#[cfg(target_os = "linux")]
use std::env;
#[cfg(any(test, target_os = "linux"))]
use std::path::PathBuf;
#[cfg(target_os = "linux")]
use std::process::Command;

#[cfg(target_os = "linux")]
pub(crate) fn plan(def: &ServiceDefinition) -> Result<PlatformPlan> {
    let unit_name = format!("yana-service-{}.service", identity(def));
    let path = user_unit_dir()?.join(&unit_name);
    let content = render_unit(def);
    Ok(PlatformPlan {
        paths: vec![path],
        contents: vec![content],
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
                    unit_name.clone(),
                ],
                tolerate_failure: false,
            },
        ],
        stop: vec![Invocation {
            program: "systemctl".into(),
            args: vec!["--user".into(), "stop".into(), unit_name.clone()],
            tolerate_failure: true,
        }],
        remove: vec![Invocation {
            program: "systemctl".into(),
            args: vec!["--user".into(), "disable".into(), "--now".into(), unit_name],
            tolerate_failure: true,
        }],
    })
}

#[cfg(target_os = "linux")]
fn user_unit_dir() -> Result<PathBuf> {
    Ok(env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or(home()?.join(".config"))
        .join("systemd/user"))
}

#[cfg(target_os = "linux")]
pub(crate) fn inspect(label: &str) -> RuntimeInspection {
    let unit_name = format!("yana-service-{label}.service");
    let registered = Command::new("systemctl")
        .args(["--user", "is-enabled", "--quiet", &unit_name])
        .output();
    let running = Command::new("systemctl")
        .args(["--user", "is-active", "--quiet", &unit_name])
        .output();
    match (registered, running) {
        (Ok(registered), Ok(running)) => {
            let registered = registered.status.success();
            let running = running.status.success();
            RuntimeInspection {
                registered: Some(registered),
                running: Some(running),
                detail: format!(
                    "systemd user unit registered={} running={}",
                    registered, running
                ),
            }
        }
        (registered, running) => RuntimeInspection {
            registered: registered.ok().map(|output| output.status.success()),
            running: running.ok().map(|output| output.status.success()),
            detail: "systemctl --user status is partially or fully unavailable".into(),
        },
    }
}

#[cfg(any(test, target_os = "linux"))]
pub(crate) fn render_unit(def: &ServiceDefinition) -> String {
    let mut command = systemd_escape(&def.program);
    for arg in &def.args {
        command.push(' ');
        command.push_str(&systemd_escape(&PathBuf::from(arg)));
    }
    format!(
        "[Unit]\nDescription={}\n\n[Service]\nType=simple\nWorkingDirectory={}\nExecStart={command}\nRestart=always\nRestartSec=5\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nProtectHome=read-only\nReadWritePaths={} {}\n\n[Install]\nWantedBy=default.target\n",
        def.description,
        systemd_escape(&def.working_directory),
        systemd_escape(&def.working_directory.join(".yana-ai/os")),
        systemd_escape(&def.working_directory.join(".claude/state")),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn definition() -> ServiceDefinition {
        ServiceDefinition {
            name: "yana-rt-service".into(),
            description: "Yana always-on service".into(),
            program: PathBuf::from("/usr/local/bin/yana-rt"),
            args: vec!["os".into(), "service".into(), "run".into()],
            working_directory: PathBuf::from("/home/user/project one"),
        }
    }

    #[test]
    fn renders_a_restart_always_unit_without_a_shell() {
        let unit = render_unit(&definition());
        assert!(unit.contains("Restart=always"));
        assert!(unit.contains("ProtectSystem=strict"));
        assert!(unit.contains("ReadWritePaths="));
        assert!(unit.contains("ExecStart=\"/usr/local/bin/yana-rt\" \"os\" \"service\" \"run\""));
        assert!(unit.contains("WantedBy=default.target"));
        assert!(!unit.contains("/bin/sh"));
    }
}
