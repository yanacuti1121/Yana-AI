//! macOS launchd definition for a resident (KeepAlive) always-on service —
//! extracted from `os::service::launchd` (Phase 4 of the host-native-os
//! program) with zero behavior change. Unlike `os::monitor_service`'s
//! `StartInterval`-based periodic tick, this plist asks launchd to keep
//! the program continuously running and to restart it if it exits — the
//! actual "always-on" behavior this module exists for.
//!
//! `service::manager::ServiceManager` keeps owning atomic writes, symlink
//! refusal, and cross-platform orchestration; this file only builds the
//! plan (definition path/content, start/stop/remove `Invocation`s) and
//! inspects live launchd state — it does not decide whether installing a
//! service was authorized.

#[cfg(any(test, target_os = "macos"))]
use crate::os::service::manager::{
    home, identity, xml_escape, Invocation, PlatformPlan, RuntimeInspection, ServiceDefinition,
};
#[cfg(any(test, target_os = "macos"))]
use anyhow::Result;
#[cfg(target_os = "macos")]
use std::process::Command;

#[cfg(target_os = "macos")]
pub(crate) fn plan(def: &ServiceDefinition) -> Result<PlatformPlan> {
    let label = format!("com.yana.service.{}", identity(def));
    let domain = format!("gui/{}", unsafe { libc::getuid() });
    let path = home()?
        .join("Library/LaunchAgents")
        .join(format!("{label}.plist"));
    let content = render_plist(&label, def);
    Ok(PlatformPlan {
        paths: vec![path.clone()],
        contents: vec![content],
        start: vec![
            Invocation {
                program: "launchctl".into(),
                args: vec!["bootout".into(), domain.clone(), path.display().to_string()],
                tolerate_failure: true,
            },
            Invocation {
                program: "launchctl".into(),
                args: vec![
                    "bootstrap".into(),
                    domain.clone(),
                    path.display().to_string(),
                ],
                tolerate_failure: false,
            },
            Invocation {
                program: "launchctl".into(),
                args: vec!["kickstart".into(), "-k".into(), format!("{domain}/{label}")],
                tolerate_failure: false,
            },
        ],
        stop: vec![Invocation {
            program: "launchctl".into(),
            args: vec!["bootout".into(), domain.clone(), path.display().to_string()],
            tolerate_failure: true,
        }],
        remove: vec![Invocation {
            program: "launchctl".into(),
            args: vec!["bootout".into(), domain, path.display().to_string()],
            tolerate_failure: true,
        }],
    })
}

#[cfg(target_os = "macos")]
pub(crate) fn inspect(label: &str) -> RuntimeInspection {
    let full_label = format!("com.yana.service.{label}");
    let domain = format!("gui/{}", unsafe { libc::getuid() });
    match Command::new("launchctl")
        .args(["print", &format!("{domain}/{full_label}")])
        .output()
    {
        Ok(output) if output.status.success() => {
            let text = String::from_utf8_lossy(&output.stdout);
            let running = text.lines().any(|line| line.trim() == "state = running");
            RuntimeInspection {
                registered: Some(true),
                running: Some(running),
                detail: if running {
                    "launchd job is registered and running"
                } else {
                    "launchd job is registered but not running"
                }
                .into(),
            }
        }
        Ok(_) => RuntimeInspection {
            registered: Some(false),
            running: Some(false),
            detail: "launchd job is not registered".into(),
        },
        Err(error) => RuntimeInspection {
            registered: None,
            running: None,
            detail: format!("launchctl status unavailable: {error}"),
        },
    }
}

#[cfg(any(test, target_os = "macos"))]
pub(crate) fn render_plist(label: &str, def: &ServiceDefinition) -> String {
    let mut argument_tags = format!(
        "<string>{}</string>",
        xml_escape(&def.program.display().to_string())
    );
    for arg in &def.args {
        argument_tags.push_str(&format!("<string>{}</string>", xml_escape(arg)));
    }
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>{label}</string>
<key>ProgramArguments</key><array>{argument_tags}</array>
<key>WorkingDirectory</key><string>{wd}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ProcessType</key><string>Background</string>
<key>ThrottleInterval</key><integer>10</integer>
</dict></plist>
"#,
        label = xml_escape(label),
        wd = xml_escape(&def.working_directory.display().to_string()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn definition() -> ServiceDefinition {
        ServiceDefinition {
            name: "yana-rt-service".into(),
            description: "Yana always-on service".into(),
            program: PathBuf::from("/Applications/Yana AI/yana-rt"),
            args: vec!["os".into(), "service".into(), "run".into()],
            working_directory: PathBuf::from("/tmp/project & one"),
        }
    }

    #[test]
    fn renders_a_keep_alive_plist_without_a_shell() {
        let plist = render_plist("com.yana.service.test", &definition());
        assert!(plist.contains("/Applications/Yana AI/yana-rt"));
        assert!(plist.contains("project &amp; one"));
        assert!(plist.contains("<key>KeepAlive</key><true/>"));
        assert!(plist.contains("<string>os</string><string>service</string><string>run</string>"));
        assert!(!plist.contains("/bin/sh"));
    }
}
