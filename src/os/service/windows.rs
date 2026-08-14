//! Windows Task Scheduler definition for a resident always-on service.
//!
//! Same disclosed ceiling as `os::monitor_service` and the ZeroClaw
//! reference this design drew from: this is a Task Scheduler task with a
//! logon trigger and failure-restart settings, not a real Windows Service
//! (SCM) — that would need the `windows-service` crate, and adding a new
//! dependency is out of scope while `Cargo.toml` is frozen for this PR.

#[cfg(any(test, target_os = "windows"))]
use super::manager::{
    home, identity, xml_escape, Invocation, PlatformPlan, RuntimeInspection, ServiceDefinition,
};
#[cfg(any(test, target_os = "windows"))]
use anyhow::Result;
#[cfg(any(test, target_os = "windows"))]
use std::env;
#[cfg(any(test, target_os = "windows"))]
use std::path::PathBuf;
#[cfg(target_os = "windows")]
use std::process::Command;

/// Widened to `any(test, target_os = "windows")` (not `target_os =
/// "windows"` alone) specifically so the exact `Invocation` argument
/// lists below are unit-tested on every CI platform, not only a Windows
/// runner — the two bugs this plan's `start`/`stop` lists were fixed for
/// (task never actually starts until next logon; task never actually
/// gets deregistered on stop/uninstall) were both in code that had no
/// test coverage at all before this fix, only the pure `render_task_xml`
/// renderer did.
#[cfg(any(test, target_os = "windows"))]
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
        start: vec![
            Invocation {
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
            },
            // /Create alone only registers the task; without an explicit
            // /Run, a LogonTrigger task does not start until the next
            // login. This makes start()/install() actually begin running
            // now, matching launchd's `load` (RunAtLoad) and systemd's
            // `enable --now`.
            Invocation {
                program: "schtasks.exe".into(),
                args: vec!["/Run".into(), "/TN".into(), task_name.clone()],
                tolerate_failure: false,
            },
        ],
        stop: vec![Invocation {
            program: "schtasks.exe".into(),
            args: vec!["/End".into(), "/TN".into(), task_name.clone()],
            tolerate_failure: true,
        }],
        remove: vec![
            Invocation {
                program: "schtasks.exe".into(),
                args: vec!["/End".into(), "/TN".into(), task_name.clone()],
                tolerate_failure: true,
            },
            // /End only terminates a currently-running instance; it does
            // not deregister the task, so the LogonTrigger would still
            // fire again at next login. /Delete /F actually deregisters
            // it, matching launchd's `unload` and systemd's
            // `disable --now` — both of which fully deregister on stop,
            // not just halt the current run. uninstall() reuses this
            // same list, so this also fixes uninstall leaving the task
            // registered in Task Scheduler.
            Invocation {
                program: "schtasks.exe".into(),
                args: vec!["/Delete".into(), "/F".into(), "/TN".into(), task_name],
                tolerate_failure: true,
            },
        ],
    })
}

#[cfg(target_os = "windows")]
pub(crate) fn inspect(label: &str) -> RuntimeInspection {
    let task_name = format!("YanaService-{label}");
    match Command::new("schtasks.exe")
        .args(["/Query", "/TN", &task_name])
        .output()
    {
        Ok(output) if output.status.success() => RuntimeInspection {
            registered: Some(true),
            running: None,
            detail: "Task Scheduler task is registered; running state is UNKNOWN because localized schtasks output is not parsed".into(),
        },
        Ok(_) => RuntimeInspection {
            registered: Some(false),
            running: Some(false),
            detail: "Task Scheduler task is not registered".into(),
        },
        Err(error) => RuntimeInspection {
            registered: None,
            running: None,
            detail: format!("Task Scheduler status unavailable: {error}"),
        },
    }
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

    #[test]
    fn start_actually_runs_the_task_immediately_not_just_registers_it() {
        let plan = plan(&definition()).unwrap();
        // /Create alone only registers a LogonTrigger task for next login;
        // start() must also /Run it so install()/start() actually begin
        // running now, matching launchd load / systemd enable --now.
        assert!(plan
            .start
            .iter()
            .any(|invocation| invocation.args.first().map(String::as_str) == Some("/Create")));
        assert!(plan
            .start
            .iter()
            .any(|invocation| invocation.args.first().map(String::as_str) == Some("/Run")));
    }

    #[test]
    fn stop_preserves_registration_while_remove_deregisters_the_task() {
        let plan = plan(&definition()).unwrap();
        assert!(plan
            .stop
            .iter()
            .any(|invocation| invocation.args.first().map(String::as_str) == Some("/End")));
        assert!(!plan
            .stop
            .iter()
            .any(|invocation| invocation.args.first().map(String::as_str) == Some("/Delete")));
        let delete = plan
            .remove
            .iter()
            .find(|invocation| invocation.args.first().map(String::as_str) == Some("/Delete"))
            .expect("uninstall must include a /Delete invocation");
        assert!(delete.args.iter().any(|arg| arg == "/F"));
    }

    #[test]
    fn start_and_stop_invocations_target_the_same_task_name_as_the_definition_path() {
        let plan = plan(&definition()).unwrap();
        let task_name = plan.paths[0]
            .file_stem()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        for invocation in plan
            .start
            .iter()
            .chain(plan.stop.iter())
            .chain(plan.remove.iter())
        {
            assert!(
                invocation.args.iter().any(|arg| arg == &task_name),
                "invocation {:?} does not reference task name {task_name}",
                invocation.args
            );
        }
    }
}
