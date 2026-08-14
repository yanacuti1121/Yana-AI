//! Windows Task Scheduler definition for a resident always-on service.
//!
//! Same disclosed ceiling as `os::monitor_service` and the ZeroClaw
//! reference this design drew from: this is a Task Scheduler task with a
//! logon trigger and failure-restart settings, not a real Windows Service
//! (SCM) — that would need the `windows-service` crate, and adding a new
//! dependency is out of scope while `Cargo.toml` is frozen for this PR.

#[cfg(target_os = "windows")]
use super::manager::{home, identity, Invocation, PlatformPlan};
#[cfg(any(test, target_os = "windows"))]
use super::manager::{xml_escape, ServiceDefinition};
#[cfg(target_os = "windows")]
use anyhow::Result;
#[cfg(target_os = "windows")]
use std::env;
#[cfg(any(test, target_os = "windows"))]
use std::path::PathBuf;
#[cfg(target_os = "windows")]
use std::process::Command;

#[cfg(target_os = "windows")]
pub(crate) fn plan(def: &ServiceDefinition) -> Result<PlatformPlan> {
    let task_name = format!("YanaService-{}", identity(def));
    let base = env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or(home()?.join("AppData/Local"))
        .join("YanaAI/Service");
    let path = base.join(format!("{task_name}.xml"));
    let content = render_task_xml(def);
    Ok(PlatformPlan {
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
            args: vec!["/End".into(), "/TN".into(), task_name.clone()],
            tolerate_failure: true,
        }],
    })
}

#[cfg(target_os = "windows")]
pub(crate) fn is_active(label: &str) -> Option<bool> {
    let task_name = format!("YanaService-{label}");
    Command::new("schtasks.exe")
        .args(["/Query", "/TN", &task_name])
        .output()
        .ok()
        .map(|output| output.status.success())
}

#[cfg(any(test, target_os = "windows"))]
pub(crate) fn render_task_xml(def: &ServiceDefinition) -> String {
    let mut arguments = String::new();
    for arg in &def.args {
        if !arguments.is_empty() {
            arguments.push(' ');
        }
        arguments.push('"');
        arguments.push_str(&xml_escape(arg));
        arguments.push('"');
    }
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
<Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers>
<Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><StartWhenAvailable>true</StartWhenAvailable><RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure><ExecutionTimeLimit>PT0S</ExecutionTimeLimit></Settings>
<Actions Context="Author"><Exec><Command>{}</Command><Arguments>{}</Arguments><WorkingDirectory>{}</WorkingDirectory></Exec></Actions>
</Task>
"#,
        xml_escape(&def.program.display().to_string()),
        arguments,
        xml_escape(&def.working_directory.display().to_string())
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn definition() -> ServiceDefinition {
        ServiceDefinition {
            name: "yana-rt-service".into(),
            description: "Yana always-on service".into(),
            program: PathBuf::from(r"C:\Program Files\Yana\yana-rt.exe"),
            args: vec!["os".into(), "service".into(), "run".into()],
            working_directory: PathBuf::from(r"C:\Users\A B\Project"),
        }
    }

    #[test]
    fn renders_a_logon_triggered_restart_on_failure_task() {
        let xml = render_task_xml(&definition());
        assert!(xml.contains("<LogonTrigger><Enabled>true</Enabled></LogonTrigger>"));
        assert!(xml.contains("RestartOnFailure"));
        assert!(xml.contains(r"C:\Program Files\Yana\yana-rt.exe"));
        assert!(xml.contains(r#""os" "service" "run""#));
    }
}
